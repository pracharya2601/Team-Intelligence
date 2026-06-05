// Function: recall-webhook  (HTTP trigger, auth: none — Recall calls it directly)
//
// Receives Recall.ai webhooks for a meeting bot and drives the meeting lifecycle:
//   - bot status changes      → update meetings.status (joining/live/done/error)
//   - real-time transcript    → insert transcript_segments (realtime-broadcast to the console)
//   - bot.done / transcript.done → fetch signed media URLs, store meeting_artifacts,
//                                  generate Claude AI-notes, and trigger the recap email (Track B stub)
//
// Runs as SERVICE role (Recall provides no user JWT), so ctx.db.query bypasses RLS — correct for a
// webhook per CLAUDE.md (service bypass is allowed in webhooks/ingestion/background jobs).
//
// Hard rules honored:
//   - DEDUPE every event with ctx.idempotency.claim(id, { scope: 'recall' }) — Recall retries for
//     24h on any non-2xx, so we must ack fast and never double-apply side effects.
//   - VERIFY the request is really from Recall (HMAC over the raw body, standard-webhooks scheme)
//     using RECALL_WORKSPACE_VERIFICATION_SECRET before trusting anything.
//   - RESPOND within 15s; we keep handlers light (media fetch + one LLM call fit; if it grows,
//     move the heavy work behind a queue).
//
// Deploy with envVars: { RECALL_API_KEY, RECALL_REGION, RECALL_WORKSPACE_VERIFICATION_SECRET,
//   BUTTERBASE_API_KEY }.  (BUTTERBASE_API_URL / BUTTERBASE_APP_ID are auto-injected.)
//
// We correlate each event to our meeting via Recall bot metadata.meeting_id (set at createBot),
// falling back to a lookup by recall_bot_id.

import { getRecordingUrls, mapStatusToMeetingStatus, type RecallEnv } from "./_shared/recall.ts";
import { complete, type LlmEnv } from "./_shared/llm.ts";

interface FnCtx {
  env: Record<string, string>;
  idempotency: { claim: (key: string, opts?: { scope?: string; ttlSeconds?: number }) => Promise<boolean> };
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
}

export default async function handler(req: Request, ctx: FnCtx): Promise<Response> {
  // 1. Read the RAW body once (needed for signature verification — must be the exact bytes).
  const raw = await req.text();

  // 2. Verify the request came from Recall. Reject anything that doesn't pass.
  const secret = ctx.env.RECALL_WORKSPACE_VERIFICATION_SECRET;
  if (!secret) return json({ error: "Server misconfigured: verification secret missing" }, 500);
  const verified = await verifyRecallSignature(req.headers, raw, secret);
  if (!verified) return json({ error: "Invalid signature" }, 401);

  // 3. Parse the (now-trusted) payload.
  let evt: RecallEvent;
  try {
    evt = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // 4. Dedupe. Recall retries on non-2xx with the same delivery id (webhook-id header is the
  //    stable delivery id; fall back to a composite if absent).
  const deliveryId = req.headers.get("webhook-id") || req.headers.get("svix-id") || `${evt.event}:${botIdOf(evt)}`;
  if (!(await ctx.idempotency.claim(deliveryId, { scope: "recall", ttlSeconds: 60 * 60 * 24 * 7 }))) {
    return json({ status: "duplicate" }, 200); // already handled — ack the retry, no side effects
  }

  try {
    await route(evt, ctx);
  } catch (e) {
    // Returning 500 makes Recall retry; that's what we want for transient failures (DB blip,
    // media not ready yet). The idempotency claim above protects against double-applying on retry.
    console.error("recall-webhook error", evt.event, e instanceof Error ? e.message : e);
    return json({ error: String((e && (e as Error).message) || e) }, 500);
  }

  return json({ status: "ok" }, 200);
}

// ── Event routing ─────────────────────────────────────────────────────────────

async function route(evt: RecallEvent, ctx: FnCtx): Promise<void> {
  const botId = botIdOf(evt);
  if (!botId) return; // nothing to correlate

  const meetingId = await resolveMeetingId(evt, ctx, botId);
  if (!meetingId) {
    console.warn("recall-webhook: no meeting for bot", botId, evt.event);
    return;
  }

  const type = evt.event;

  // Real-time transcript events → append segments.
  if (type.startsWith("transcript.data") || type === "transcript.partial_data") {
    await insertTranscript(evt, ctx, meetingId);
    return;
  }

  // Artifact-ready events → finalize the meeting.
  if (type === "bot.done" || type === "transcript.done" || type === "recording.done") {
    await finalizeMeeting(ctx, meetingId, botId);
    // bot.done also implies the call is over.
    if (type === "bot.done") await setStatus(ctx, meetingId, "done");
    return;
  }

  if (type === "recording.failed" || type === "transcript.failed" || type === "bot.fatal") {
    await setStatus(ctx, meetingId, "error");
    return;
  }

  // Bot status-change events (bot.joining_call, bot.in_call_recording, bot.call_ended, …).
  if (type.startsWith("bot.")) {
    const code = type.slice("bot.".length); // e.g. "in_call_recording"
    const mapped = mapStatusToMeetingStatus(code);
    if (mapped) await setStatus(ctx, meetingId, mapped);
    return;
  }
}

// ── Handlers ───────────────────────────────────────────────────────────────────

async function setStatus(ctx: FnCtx, meetingId: string, status: string): Promise<void> {
  const stampCol = status === "live" ? "started_at" : status === "done" || status === "error" ? "ended_at" : null;
  if (stampCol) {
    await ctx.db.query(
      `UPDATE meetings SET status = $1, ${stampCol} = COALESCE(${stampCol}, now()) WHERE id = $2`,
      [status, meetingId],
    );
  } else {
    await ctx.db.query(`UPDATE meetings SET status = $1 WHERE id = $2`, [status, meetingId]);
  }
}

async function insertTranscript(evt: RecallEvent, ctx: FnCtx, meetingId: string): Promise<void> {
  // Recall real-time transcript payloads carry words/text + speaker + timing under data.data.
  const d: any = evt.data?.data ?? evt.data ?? {};
  const words: any[] = d.words ?? [];
  const text: string = (d.text as string) ?? words.map((w) => w?.text ?? "").join(" ").trim();
  if (!text) return;

  const speaker: string | null = d.participant?.name ?? d.speaker ?? null;
  const tsStart: number | null = words[0]?.start_timestamp?.relative ?? d.start_timestamp?.relative ?? null;
  const tsEnd: number | null =
    words[words.length - 1]?.end_timestamp?.relative ?? d.end_timestamp?.relative ?? null;
  const isFinal = evt.event === "transcript.data" || d.is_final === true;

  await ctx.db.query(
    `INSERT INTO transcript_segments (meeting_id, speaker, text, ts_start, ts_end, is_final)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [meetingId, speaker, text, tsStart, tsEnd, isFinal],
  );
}

async function finalizeMeeting(ctx: FnCtx, meetingId: string, botId: string): Promise<void> {
  const recallEnv: RecallEnv = { RECALL_API_KEY: ctx.env.RECALL_API_KEY, RECALL_REGION: ctx.env.RECALL_REGION };

  // Fetch fresh signed media URLs (they expire — don't reuse later).
  let media = { videoUrl: null as string | null, audioUrl: null as string | null, transcriptUrl: null as string | null };
  try {
    media = await getRecordingUrls(recallEnv, botId);
  } catch (e) {
    console.warn("recall-webhook: media not ready yet for", botId, e instanceof Error ? e.message : e);
    // Throw so Recall retries later when media is ready (idempotency protects us).
    throw e;
  }

  // Generate AI notes from the stored transcript (off the live path → Claude via gateway).
  let aiNotes: unknown = null;
  try {
    aiNotes = await generateAiNotes(ctx, meetingId);
  } catch (e) {
    console.warn("recall-webhook: AI notes failed (continuing)", e instanceof Error ? e.message : e);
  }

  const recapToken = crypto.randomUUID().replace(/-/g, "");

  // Upsert artifacts (meeting_id is the PK). ON CONFLICT keeps it idempotent across retries.
  await ctx.db.query(
    `INSERT INTO meeting_artifacts (meeting_id, video_url, audio_url, transcript_url, ai_notes, recap_token, recap_public)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, false)
     ON CONFLICT (meeting_id) DO UPDATE SET
       video_url = EXCLUDED.video_url,
       audio_url = EXCLUDED.audio_url,
       transcript_url = EXCLUDED.transcript_url,
       ai_notes = COALESCE(EXCLUDED.ai_notes, meeting_artifacts.ai_notes),
       recap_token = COALESCE(meeting_artifacts.recap_token, EXCLUDED.recap_token)`,
    [meetingId, media.videoUrl, media.audioUrl, media.transcriptUrl, aiNotes ? JSON.stringify(aiNotes) : null, recapToken],
  );

  // Notify admins (Track B owns recap-email; call its stub if deployed, fire-and-forget).
  await triggerRecapEmail(ctx, meetingId).catch((e) =>
    console.warn("recall-webhook: recap email trigger failed (non-fatal)", e instanceof Error ? e.message : e),
  );
}

async function generateAiNotes(ctx: FnCtx, meetingId: string): Promise<unknown> {
  const { rows } = await ctx.db.query(
    `SELECT speaker, text FROM transcript_segments
     WHERE meeting_id = $1 AND is_final = true ORDER BY ts_start NULLS LAST, created_at ASC`,
    [meetingId],
  );
  if (!rows.length) return null;

  const transcript = rows.map((r) => `${r.speaker ?? "Speaker"}: ${r.text}`).join("\n").slice(0, 60_000);

  const llmEnv: LlmEnv = {
    BUTTERBASE_API_URL: ctx.env.BUTTERBASE_API_URL,
    BUTTERBASE_APP_ID: ctx.env.BUTTERBASE_APP_ID,
    BUTTERBASE_API_KEY: ctx.env.BUTTERBASE_API_KEY,
    BORA_MODEL_CHAT: ctx.env.BORA_MODEL_CHAT,
    BORA_MODEL_MEETING: ctx.env.BORA_MODEL_MEETING,
  };

  const result = await complete(llmEnv, {
    surface: "notes", // off the live path → Claude 4.8
    maxTokens: 1500,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You write concise post-meeting notes. Return STRICT JSON with keys: " +
          '"summary" (string), "decisions" (string[]), "action_items" (array of {owner, task}), ' +
          '"risks" (string[]). No prose outside the JSON.',
      },
      { role: "user", content: `Meeting transcript:\n\n${transcript}` },
    ],
  });

  const content = result.message.content ?? "";
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/); // tolerate ```json fences
    return m ? JSON.parse(m[0]) : { summary: content };
  }
}

/** Best-effort call into Track B's recap-email function (stub today). Non-fatal if absent. */
async function triggerRecapEmail(ctx: FnCtx, meetingId: string): Promise<void> {
  const { rows } = await ctx.db.query(`SELECT org_id FROM meetings WHERE id = $1`, [meetingId]);
  const orgId = rows[0]?.org_id;
  if (!orgId) return;
  const url = `${ctx.env.BUTTERBASE_API_URL}/v1/${ctx.env.BUTTERBASE_APP_ID}/fn/recap-email`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.env.BUTTERBASE_API_KEY}` },
    body: JSON.stringify({ orgId, meetingId }),
  });
}

// ── Correlation: Recall bot → our meeting ──────────────────────────────────────

async function resolveMeetingId(evt: RecallEvent, ctx: FnCtx, botId: string): Promise<string | null> {
  // Prefer the meeting_id we stashed in bot.metadata at createBot.
  const metaId = (evt.data?.bot?.metadata as any)?.meeting_id;
  if (metaId) return String(metaId);
  // Fallback: look it up by the recall_bot_id we saved when creating the bot.
  const { rows } = await ctx.db.query(`SELECT id FROM meetings WHERE recall_bot_id = $1 LIMIT 1`, [botId]);
  return rows[0]?.id ?? null;
}

function botIdOf(evt: RecallEvent): string | null {
  return evt.data?.bot?.id ?? (evt.data as any)?.bot_id ?? null;
}

// ── Signature verification (standard-webhooks / Svix scheme, no library) ───────

async function verifyRecallSignature(headers: Headers, body: string, secret: string): Promise<boolean> {
  const id = headers.get("webhook-id") || headers.get("svix-id");
  const timestamp = headers.get("webhook-timestamp") || headers.get("svix-timestamp");
  const sigHeader = headers.get("webhook-signature") || headers.get("svix-signature");
  if (!id || !timestamp || !sigHeader) return false;

  // Decode the secret: strip the whsec_ prefix, base64-decode the rest → raw HMAC key bytes.
  const b64Secret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const keyBytes = base64ToBytes(b64Secret);

  const signedContent = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  // Pass ArrayBuffers (not Uint8Array views) so the Web Crypto BufferSource overload is unambiguous.
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(signedContent)));

  // Header is space-separated "v1,<base64sig>" entries; accept if any v1 matches (timing-safe).
  for (const part of sigHeader.split(" ")) {
    const [version, providedB64] = part.split(",");
    if (version !== "v1" || !providedB64) continue;
    const provided = base64ToBytes(providedB64);
    if (timingSafeEqual(mac, provided)) return true;
  }
  return false;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Copy into a standalone ArrayBuffer so Web Crypto's BufferSource overload resolves cleanly. */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── Types & helpers ─────────────────────────────────────────────────────────────

interface RecallEvent {
  event: string;
  data?: {
    bot?: { id?: string; metadata?: Record<string, unknown> };
    data?: any;
    [k: string]: unknown;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

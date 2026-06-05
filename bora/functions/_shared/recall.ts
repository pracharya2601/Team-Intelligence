/**
 * Recall.ai client (function runtime).
 *
 * The ONE place Bora talks to Recall.ai's REST API — dependency-free native `fetch`,
 * same shape as _shared/bb.ts and _shared/llm.ts.
 *
 * Recall is region-isolated: a key authenticates in exactly one region and all calls go to
 * `https://<region>.recall.ai/api/v1/...` with `Authorization: Token <key>`. Bora's key is in
 * `us-west-2` (verified via `npm run check:recall`). Supply RECALL_API_KEY + RECALL_REGION via
 * the function's envVars at deploy time.
 *
 * Phase 2 (passive bot) uses: createBot (send the bot in, point its camera at our bot page),
 * getBot (after the call, read media_shortcuts for video/transcript download URLs).
 *
 * Docs map (skills/recall-bots, skills/recall-setup):
 *   POST /api/v1/bot            → create/schedule a bot         (reference/bot_create)
 *   GET  /api/v1/bot/{id}       → retrieve bot + recordings     (reference/bot_retrieve)
 *   download_urls are signed S3 links that EXPIRE — fetch fresh from the API, never persist.
 */

export interface RecallEnv {
  RECALL_API_KEY: string;
  RECALL_REGION?: string; // us-west-2 | us-east-1 | eu-central-1 | ap-northeast-1
}

const DEFAULT_REGION = "us-west-2"; // Bora's key region; overridable via RECALL_REGION.

function baseUrl(env: RecallEnv): string {
  const region = (env.RECALL_REGION || DEFAULT_REGION).trim();
  return `https://${region}.recall.ai/api/v1`;
}

function authHeaders(env: RecallEnv): Record<string, string> {
  // Recall uses `Token <key>` — NOT Bearer. (Distinct from the Butterbase bb_sk Bearer.)
  return { Authorization: `Token ${env.RECALL_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (body && (body.detail || body.message)) || `${res.status} ${res.statusText}`;
    throw new Error(`Recall API ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(body)}`);
  }
  return body as T;
}

// ── Types (only the fields Bora reads; Recall returns much more) ──────────────

export interface RecallBot {
  id: string;
  meeting_url?: unknown;
  status_changes?: Array<{ code: string; sub_code?: string | null; created_at?: string }>;
  recordings?: RecallRecording[];
  metadata?: Record<string, unknown>;
}

export interface RecallRecording {
  id: string;
  media_shortcuts?: {
    video_mixed?: MediaShortcut;
    audio_mixed?: MediaShortcut;
    transcript?: MediaShortcut;
  };
}

interface MediaShortcut {
  status?: { code?: string };
  data?: { download_url?: string | null };
}

export interface CreateBotInput {
  meetingUrl: string;
  botName?: string;
  /** ISO 8601; schedule the bot to join later. Recall recommends scheduling ahead in production. */
  joinAt?: string;
  /** Public URL Recall renders as the bot's camera (our /bot/:meetingId page). */
  outputVideoUrl?: string;
  /** Custom key/values echoed back on webhooks — we stash our meeting_id here to correlate events. */
  metadata?: Record<string, string>;
}

// ── Create / schedule a bot ──────────────────────────────────────────────────

export async function createBot(env: RecallEnv, input: CreateBotInput): Promise<RecallBot> {
  const recording_config: Record<string, unknown> = {
    // Recall.ai's own streaming transcript provider → real-time transcript webhooks.
    transcript: { provider: { recallai_streaming: {} } },
    // Capture the full recording: mixed video AND mixed audio (so the recap has both).
    video_mixed: {},
    audio_mixed: {},
    // Participant events → drives the auto-leave-when-empty rule (recall-webhook maybeAutoLeave).
    participant_events: {},
  };

  // Point the bot's camera at our live status page (Output Media → webpage as video).
  // Recall renders the URL headlessly; it must be public (ngrok in dev) — never localhost.
  if (input.outputVideoUrl) {
    recording_config.output_media = { camera: { kind: "webpage", config: { url: input.outputVideoUrl } } };
  }

  const body: Record<string, unknown> = {
    meeting_url: input.meetingUrl,
    bot_name: input.botName ?? "Bora",
    recording_config,
  };
  if (input.joinAt) body.join_at = input.joinAt;
  if (input.metadata) body.metadata = input.metadata;

  const res = await fetch(`${baseUrl(env)}/bot`, { method: "POST", headers: authHeaders(env), body: JSON.stringify(body) });
  return asJson<RecallBot>(res);
}

// ── Retrieve a bot (after the call) ──────────────────────────────────────────

export async function getBot(env: RecallEnv, botId: string): Promise<RecallBot> {
  const res = await fetch(`${baseUrl(env)}/bot/${botId}`, { headers: authHeaders(env) });
  return asJson<RecallBot>(res);
}

/**
 * Pull the fresh, signed download URLs for a finished bot. Call AFTER bot.done / transcript.done.
 * Returns nulls for any media not ready. URLs expire — use immediately / re-fetch, don't store.
 */
export async function getRecordingUrls(
  env: RecallEnv,
  botId: string,
): Promise<{ videoUrl: string | null; audioUrl: string | null; transcriptUrl: string | null }> {
  const bot = await getBot(env, botId);
  const rec = bot.recordings?.[0];
  const s = rec?.media_shortcuts;
  return {
    videoUrl: s?.video_mixed?.data?.download_url ?? null,
    audioUrl: s?.audio_mixed?.data?.download_url ?? null,
    transcriptUrl: s?.transcript?.data?.download_url ?? null,
  };
}

/** Make the bot leave the call immediately. POST /bot/{id}/leave_call/ (no body). */
export async function leaveBot(env: RecallEnv, botId: string): Promise<void> {
  const res = await fetch(`${baseUrl(env)}/bot/${botId}/leave_call/`, { method: "POST", headers: authHeaders(env) });
  if (!res.ok && res.status !== 404) {
    // 404 = bot already gone; treat as success. Anything else, surface.
    const t = await res.text().catch(() => "");
    throw new Error(`Recall leave_call ${res.status}: ${t.slice(0, 140)}`);
  }
}

/** One parsed transcript line. */
export interface TranscriptLine {
  speaker: string | null;
  text: string;
  tsStart: number | null;
  tsEnd: number | null;
}

/**
 * Download + parse the diarized transcript JSON from a signed transcript_url.
 * Recall's schema: array of { participant:{name}, words:[{text,start_timestamp:{relative},end_timestamp:{relative}}] }.
 * Each array element becomes one line (speaker + concatenated words + span).
 */
export async function downloadTranscript(transcriptUrl: string): Promise<TranscriptLine[]> {
  const res = await fetch(transcriptUrl);
  if (!res.ok) throw new Error(`transcript download ${res.status}`);
  const data: any = await res.json();
  const segments: any[] = Array.isArray(data) ? data : data?.segments ?? [];
  const lines: TranscriptLine[] = [];
  for (const seg of segments) {
    const words: any[] = seg?.words ?? [];
    const text = words.map((w) => w?.text ?? "").join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push({
      speaker: seg?.participant?.name ?? seg?.speaker ?? null,
      text,
      tsStart: words[0]?.start_timestamp?.relative ?? null,
      tsEnd: words[words.length - 1]?.end_timestamp?.relative ?? null,
    });
  }
  return lines;
}

/** Map a Recall bot status code → our meetings.status enum. */
export function mapStatusToMeetingStatus(code: string): "joining" | "live" | "done" | "error" | null {
  switch (code) {
    case "joining_call":
    case "in_waiting_room":
    case "in_call_not_recording":
    case "recording_permission_allowed":
      return "joining";
    case "in_call_recording":
      return "live";
    case "call_ended":
    case "done":
      return "done";
    case "fatal":
    case "recording_permission_denied":
      return "error";
    default:
      return null; // unknown / breakout-room transitions — leave status unchanged
  }
}

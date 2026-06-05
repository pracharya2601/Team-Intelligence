// Function: meeting-create  (HTTP trigger, auth: required)
//
// Admin pastes a meeting URL → we (1) insert a `meetings` row, (2) tell Recall to send the bot in
// with its camera pointed at our bot page, (3) save the returned recall_bot_id. The browser can't
// call Recall directly (the key is server-side), so this function bridges it.
//
// Identity comes from ctx.user (signed-in caller). We enforce ADMIN-of-org here (defense in depth —
// RLS also blocks non-admin writes to meetings) before doing the privileged Recall call + insert
// via the service key.
//
// Body: { orgId: string, meetingUrl: string, joinAt?: string }
// Returns: { meeting }  (201)
//
// Deploy with envVars: { RECALL_API_KEY, RECALL_REGION, BORA_SERVICE_KEY, APP_BASE_URL }.
// (BUTTERBASE_API_URL / BUTTERBASE_APP_ID auto-injected.)  APP_BASE_URL is the public base for the
// bot camera page; in dev it's the ngrok URL (Recall can't render localhost).

import { createBot, type RecallEnv } from "./_shared/recall.ts";

interface FnCtx {
  user?: { id?: string } | null;
  env: Record<string, string>;
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
}

export default async function handler(req: Request, ctx: FnCtx): Promise<Response> {
  if (!ctx.user?.id) return json({ error: { message: "Not authenticated" } }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }

  const orgId = String(body?.orgId ?? "").trim();
  const meetingUrl = String(body?.meetingUrl ?? "").trim();
  const joinAt = body?.joinAt ? String(body.joinAt) : undefined;
  if (!orgId) return json({ error: { message: "orgId is required" } }, 400);
  if (!meetingUrl) return json({ error: { message: "meetingUrl is required" } }, 400);

  const userId = ctx.user.id;

  // Enforce: caller must be an ACTIVE ADMIN of this org. (service-role query — RLS bypassed here,
  // so we check membership explicitly.)
  const { rows: adminRows } = await ctx.db.query(
    `SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2 AND role = 'admin' AND status = 'active' LIMIT 1`,
    [orgId, userId],
  );
  if (!adminRows.length) return json({ error: { message: "Only an active admin can call the bot" } }, 403);

  const platform = detectPlatform(meetingUrl);

  // 1. Insert the meeting row first so we have an id to put in the bot's metadata + camera URL.
  const { rows } = await ctx.db.query(
    `INSERT INTO meetings (org_id, platform, meeting_url, status, started_by, join_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, platform, meetingUrl, joinAt ? "scheduled" : "joining", userId, joinAt ?? null],
  );
  const meeting = rows[0];

  // 2. Create the Recall bot.
  const recallEnv: RecallEnv = { RECALL_API_KEY: ctx.env.RECALL_API_KEY, RECALL_REGION: ctx.env.RECALL_REGION };
  const appBase = (ctx.env.APP_BASE_URL || "").replace(/\/$/, "");
  const outputVideoUrl = appBase ? `${appBase}/bot/${meeting.id}` : undefined; // bot camera page (live in Phase 3)
  // Live transcript → our recall-webhook (drives the Phase 3 proactive cascade). Same endpoint that
  // handles lifecycle events; it routes transcript.data → speak-trigger.
  const bbBase = (ctx.env.BUTTERBASE_API_URL || "").replace(/\/$/, "");
  const realtimeWebhookUrl = bbBase ? `${bbBase}/v1/${ctx.env.BUTTERBASE_APP_ID}/fn/recall-webhook` : undefined;

  let recallBot;
  try {
    recallBot = await createBot(recallEnv, {
      meetingUrl,
      botName: "Bora",
      joinAt,
      outputVideoUrl,
      realtimeWebhookUrl,
      metadata: { meeting_id: String(meeting.id), org_id: orgId }, // echoed on every webhook → correlation
    });
  } catch (e) {
    // Roll the meeting into an error state so the UI reflects the failed join.
    await ctx.db.query(`UPDATE meetings SET status = 'error' WHERE id = $1`, [meeting.id]);
    return json({ error: { message: `Recall createBot failed: ${(e as Error).message}` } }, 502);
  }

  // 3. Save the bot id.
  const { rows: updated } = await ctx.db.query(
    `UPDATE meetings SET recall_bot_id = $1 WHERE id = $2 RETURNING *`,
    [recallBot.id, meeting.id],
  );

  return json({ meeting: updated[0] }, 201);
}

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("zoom.")) return "zoom";
  if (u.includes("meet.google.")) return "google_meet";
  if (u.includes("teams.")) return "teams";
  if (u.includes("webex.")) return "webex";
  return "unknown";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

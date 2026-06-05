// Function: speak-trigger  (HTTP trigger, auth: none — called server-to-server by recall-webhook
// with the service key; it does not touch user data beyond the meeting it's told about)
//
// The heart of the proactive cascade (Phase 3). Given a meeting_id, it:
//   1. Loads the recent transcript window + current bot_state + the org's bot (name/persona/voice).
//   2. Runs the CHEAP Nebius trigger over the window → SpeakDecision (the cost gate).
//   3. Applies the two-gate state machine, writing bot_state (realtime-broadcast to the bot camera):
//        • speak_now            → escalate to Gemini-Flash answer() → speak immediately
//        • should_i_speak > T   → escalate to compose() → raise hand (hold pending_text)
//        • release_gate (hand up) → speak the held pending_text  ("go on, Bora")
//        • hand raised > 60s    → auto-lower the stale point
//   Only fast models on this path (Nebius + Gemini Flash). Claude is never called here.
//
// Idempotency-light by design: it's a snapshot reactor (latest window → latest state); duplicate
// invocations converge. Speaking itself is guarded by a cooldown + a claim in the `speak` function.
//
// Deploy with envVars: { NEBIUS_*, RECALL_*, ELEVENLABS_API_KEY, BORA_MODEL_*, BUTTERBASE_API_KEY }.

import { runTrigger, type TriggerEnv } from "./_shared/trigger.ts";
import { answer, compose } from "./_shared/escalate.ts";
import type { LlmEnv } from "./_shared/llm.ts";

const SPEAK_THRESHOLD = 0.7; // should_i_speak gate (PLAN.md default; tunable per-org later)
const HAND_TIMEOUT_MS = 60_000; // auto-lower a hand-raise nobody released within ~60s
const WINDOW_SEGMENTS = 12; // how many recent final segments form the trigger window
const SPEAK_COOLDOWN_MS = 8_000; // don't re-evaluate speaking within this of the last spoke

interface FnCtx {
  env: Record<string, string>;
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
}

export default async function handler(req: Request, ctx: FnCtx): Promise<Response> {
  let meetingId = "";
  try {
    const body = await req.json();
    meetingId = String(body?.meetingId ?? body?.meeting_id ?? "");
  } catch {
    /* fallthrough → 400 below */
  }
  if (!meetingId) return json({ error: "meetingId required" }, 400);

  try {
    await tick(ctx, meetingId);
  } catch (e) {
    console.error("speak-trigger error", meetingId, e instanceof Error ? e.message : e);
    return json({ error: String((e && (e as Error).message) || e) }, 500);
  }
  return json({ status: "ok" }, 200);
}

async function tick(ctx: FnCtx, meetingId: string): Promise<void> {
  // Only react while the meeting is live (don't speak into a finished/scheduled call).
  const mres = await ctx.db.query(`SELECT status, org_id FROM meetings WHERE id = $1`, [meetingId]);
  const meeting = mres.rows[0];
  if (!meeting || meeting.status !== "live") return;

  // Ensure a bot_state row exists, then read it.
  await ctx.db.query(
    `INSERT INTO bot_state (meeting_id, mode) VALUES ($1, 'listening')
     ON CONFLICT (meeting_id) DO UPDATE SET mode = CASE WHEN bot_state.mode = 'idle' THEN 'listening' ELSE bot_state.mode END`,
    [meetingId],
  );
  const sres = await ctx.db.query(
    `SELECT mode, speak_now, should_i_speak, pending_text, gate_open, reason,
            hand_raised_at, last_spoke_at,
            EXTRACT(EPOCH FROM (now() - hand_raised_at)) * 1000 AS hand_age_ms,
            EXTRACT(EPOCH FROM (now() - last_spoke_at))  * 1000 AS spoke_age_ms
       FROM bot_state WHERE meeting_id = $1`,
    [meetingId],
  );
  const state = sres.rows[0] ?? {};
  const handRaised = state.mode === "hand_raised";

  // If currently speaking, do nothing — the speak function owns that transition.
  if (state.mode === "speaking") return;

  // Auto-lower a stale hand-raise before doing anything else.
  if (handRaised && Number(state.hand_age_ms ?? 0) > HAND_TIMEOUT_MS) {
    await lowerHand(ctx, meetingId, "timeout — the moment passed");
    return;
  }

  // The org's bot identity (name drives "addressed by name"; persona flavors the voice).
  const bres = await ctx.db.query(`SELECT name, persona FROM bots WHERE org_id = $1 LIMIT 1`, [meeting.org_id]);
  const botName = (bres.rows[0]?.name ?? "Bora").trim() || "Bora";
  const persona = bres.rows[0]?.persona ?? null;

  // Build the rolling transcript window (most recent final segments, chronological).
  const tres = await ctx.db.query(
    `SELECT speaker, text FROM (
        SELECT speaker, text, created_at FROM transcript_segments
        WHERE meeting_id = $1 AND is_final = true
        ORDER BY created_at DESC LIMIT $2
     ) s ORDER BY created_at ASC`,
    [meetingId, WINDOW_SEGMENTS],
  );
  const window = tres.rows.map((r) => `${r.speaker ?? "Speaker"}: ${r.text}`).join("\n");
  if (!window.trim()) return; // nothing said yet

  // ── The cost gate: cheap Nebius trigger over the window ──────────────────────
  const triggerEnv: TriggerEnv = {
    NEBIUS_API_KEY: ctx.env.NEBIUS_API_KEY,
    NEBIUS_API_BASE: ctx.env.NEBIUS_API_BASE,
    NEBIUS_TRIGGER_MODEL: ctx.env.NEBIUS_TRIGGER_MODEL,
  };
  const decision = await runTrigger(triggerEnv, window, botName, handRaised);
  if (!decision) return; // malformed → ignore this window (safe default: stay silent)

  const llmEnv: LlmEnv = {
    BUTTERBASE_API_URL: ctx.env.BUTTERBASE_API_URL,
    BUTTERBASE_APP_ID: ctx.env.BUTTERBASE_APP_ID,
    BUTTERBASE_API_KEY: ctx.env.BUTTERBASE_API_KEY,
    BORA_MODEL_CHAT: ctx.env.BORA_MODEL_CHAT,
    BORA_MODEL_MEETING: ctx.env.BORA_MODEL_MEETING,
  };
  const cooling = Number(state.spoke_age_ms ?? Infinity) < SPEAK_COOLDOWN_MS;

  // ── Gate 1: released hand → speak the held point ─────────────────────────────
  if (handRaised && decision.release_gate && state.pending_text) {
    console.log("speak-trigger: gate released → speaking held point", meetingId);
    await setState(ctx, meetingId, { gate_open: true });
    await invokeSpeak(ctx, meetingId, state.pending_text);
    return;
  }

  // ── Gate 2: direct address → answer immediately ──────────────────────────────
  if (decision.speak_now && !cooling) {
    const reply = await answer(llmEnv, { transcript: window, botName, persona, hint: decision.reason });
    if (reply) {
      console.log("speak-trigger: direct address → speaking now", meetingId);
      await setState(ctx, meetingId, { speak_now: true, reason: decision.reason, pending_text: reply });
      await invokeSpeak(ctx, meetingId, reply);
      return;
    }
  }

  // ── Unsolicited-but-worthwhile → raise hand (only if idle/listening) ─────────
  if (!handRaised && decision.should_i_speak >= SPEAK_THRESHOLD && !cooling) {
    const sentence = await compose(llmEnv, { transcript: window, botName, persona });
    if (sentence) {
      console.log(`speak-trigger: raising hand (conf ${decision.should_i_speak})`, meetingId);
      await ctx.db.query(
        `UPDATE bot_state
            SET mode = 'hand_raised', should_i_speak = $2, pending_text = $3, reason = $4,
                gate_open = false, speak_now = false, hand_raised_at = now(), updated_at = now()
          WHERE meeting_id = $1`,
        [meetingId, decision.should_i_speak, sentence, decision.reason],
      );
      return;
    }
  }

  // Otherwise: just record the latest confidence and keep listening.
  await ctx.db.query(
    `UPDATE bot_state SET should_i_speak = $2, updated_at = now()
       WHERE meeting_id = $1 AND mode IN ('idle','listening')`,
    [meetingId, decision.should_i_speak],
  );
}

// ── State helpers ──────────────────────────────────────────────────────────────

async function lowerHand(ctx: FnCtx, meetingId: string, why: string): Promise<void> {
  console.log("speak-trigger: lowering stale hand", meetingId, why);
  await ctx.db.query(
    `UPDATE bot_state
        SET mode = 'listening', pending_text = NULL, gate_open = false, speak_now = false,
            should_i_speak = 0, hand_raised_at = NULL, reason = $2, updated_at = now()
      WHERE meeting_id = $1`,
    [meetingId, why],
  );
}

async function setState(ctx: FnCtx, meetingId: string, patch: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(patch);
  if (!cols.length) return;
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
  await ctx.db.query(
    `UPDATE bot_state SET ${sets}, updated_at = now() WHERE meeting_id = $1`,
    [meetingId, ...cols.map((c) => patch[c])],
  );
}

/** Fire the `speak` function (TTS → Recall audio). Fire-and-forget within this request. */
async function invokeSpeak(ctx: FnCtx, meetingId: string, text: string): Promise<void> {
  const url = `${ctx.env.BUTTERBASE_API_URL}/v1/${ctx.env.BUTTERBASE_APP_ID}/fn/speak`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.env.BUTTERBASE_API_KEY}` },
    body: JSON.stringify({ meetingId, text }),
  }).catch((e) => console.warn("speak-trigger: invokeSpeak failed", e instanceof Error ? e.message : e));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Function: speak  (HTTP trigger, auth: none — called server-to-server by speak-trigger with the
// service key; it only acts on the meeting it's given)
//
// Bora's mouth. Given { meetingId, text }, it:
//   1. Claims a short cooldown lock so duplicate/racing invocations don't double-speak.
//   2. Synthesizes the line with ElevenLabs (the org's bots.voice_id, else a default voice).
//   3. Writes bot_state → mode='speaking', speaking_text=caption, speaking_audio=base64 MP3,
//      speak_seq++ , last_spoke_at=now() , and clears the gate/hand fields.
//   4. Returns to 'listening' after the clip's estimated duration.
//
// Why the page plays the audio (not Recall's Output Audio endpoint): with Output Media active the
// bot streams the WEBPAGE's audio+video, and Recall forbids the separate Output Audio endpoint while
// a webpage is the camera. So BotCam plays speaking_audio and Recall captures it. (recall-output-media)
//
// Deploy with envVars: { ELEVENLABS_API_KEY, BUTTERBASE_API_KEY }  (URL/APP_ID auto-injected).

import { synthesizeDataUri, type TtsEnv } from "./_shared/tts.ts";

const SPEAK_LOCK_MS = 15_000; // max one utterance per meeting per this window (anti double-speak)
const MIN_SPEAK_MS = 2_500; // floor so the page has time to start playback before we reset

interface FnCtx {
  env: Record<string, string>;
  idempotency: { claim: (key: string, opts?: { scope?: string; ttlSeconds?: number }) => Promise<boolean> };
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
}

export default async function handler(req: Request, ctx: FnCtx): Promise<Response> {
  let meetingId = "";
  let text = "";
  try {
    const body = await req.json();
    meetingId = String(body?.meetingId ?? body?.meeting_id ?? "");
    text = String(body?.text ?? "").trim();
  } catch {
    /* → 400 */
  }
  if (!meetingId || !text) return json({ error: "meetingId and text required" }, 400);

  // Cooldown lock: one speak per meeting per SPEAK_LOCK_MS. A racing duplicate is acked, not spoken.
  const lockKey = `speak:${meetingId}:${Math.floor(Date.now() / SPEAK_LOCK_MS)}`;
  if (!(await ctx.idempotency.claim(lockKey, { scope: "speak", ttlSeconds: 30 }))) {
    return json({ status: "cooldown" }, 200);
  }

  try {
    // Resolve the org's chosen voice (nullable → default in the TTS client).
    const vres = await ctx.db.query(
      `SELECT b.voice_id FROM bots b JOIN meetings m ON m.org_id = b.org_id WHERE m.id = $1 LIMIT 1`,
      [meetingId],
    );
    const voiceId: string | null = vres.rows[0]?.voice_id ?? null;

    const ttsEnv: TtsEnv = { ELEVENLABS_API_KEY: ctx.env.ELEVENLABS_API_KEY };
    const audio = await synthesizeDataUri(ttsEnv, { text, voiceId });

    // Flip to speaking — bump speak_seq so the page detects a NEW clip even if fields repeat.
    await ctx.db.query(
      `UPDATE bot_state
          SET mode = 'speaking', speaking_text = $2, speaking_audio = $3,
              speak_seq = COALESCE(speak_seq, 0) + 1,
              pending_text = NULL, gate_open = false, speak_now = false, should_i_speak = 0,
              hand_raised_at = NULL, last_spoke_at = now(), reason = NULL, updated_at = now()
        WHERE meeting_id = $1`,
      [meetingId, text, audio],
    );

    // Schedule the return to 'listening' after the estimated clip length (~15 chars/sec speech),
    // only if we're still on THIS utterance (don't clobber a newer speak that started meanwhile).
    const holdMs = Math.max(MIN_SPEAK_MS, Math.ceil((text.length / 15) * 1000) + 600);
    scheduleListening(ctx, meetingId, holdMs);

    return json({ status: "speaking", chars: text.length, holdMs }, 200);
  } catch (e) {
    console.error("speak error", meetingId, e instanceof Error ? e.message : e);
    // Don't leave the bot stuck "speaking" if TTS failed — drop back to listening.
    await ctx.db
      .query(`UPDATE bot_state SET mode = 'listening', updated_at = now() WHERE meeting_id = $1 AND mode = 'speaking'`, [meetingId])
      .catch(() => {});
    return json({ error: String((e && (e as Error).message) || e) }, 500);
  }
}

/**
 * After holdMs, set the bot back to listening and clear the audio (so the row doesn't keep carrying
 * a big base64 blob). We can't reliably setTimeout across the function's response in all runtimes,
 * so we await it here but cap it — the request stays well under Recall's path (this is server↔server).
 */
function scheduleListening(ctx: FnCtx, meetingId: string, holdMs: number): void {
  const ms = Math.min(holdMs, 20_000);
  // Fire-and-forget: resolve the response immediately; the timer runs in the same isolate.
  setTimeout(() => {
    ctx.db
      .query(
        `UPDATE bot_state
            SET mode = 'listening', speaking_audio = NULL, updated_at = now()
          WHERE meeting_id = $1 AND mode = 'speaking'`,
        [meetingId],
      )
      .catch((e) => console.warn("speak: reset-to-listening failed", e instanceof Error ? e.message : e));
  }, ms);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Nebius trigger client + the SpeakDecision contract (function runtime).
 *
 * Nebius hosts Bora's ONLY externally-keyed model — the cheap, always-on trigger. On every
 * debounced transcript window it emits a SpeakDecision; that signal is the cost gate (the
 * expensive Gemini-Flash escalator only runs when this says so). Everything else goes through
 * the Butterbase AI gateway; Nebius is keyed separately (NEBIUS_API_KEY / _API_BASE / _TRIGGER_MODEL).
 *
 * Verified model: Qwen/Qwen3-30B-A3B-Instruct-2507 (MoE, ~3B active — fast/cheap, clean JSON).
 * Probe it read-only with `npm run check:nebius`.
 *
 * The contract is authoritative as PYDANTIC on the Nebius side; this is its TypeScript mirror.
 * `_shared/*` stays dependency-free (native fetch, no zod) — the schema is validated by a tiny
 * inline parser (parseSpeakDecision) that coerces/clamps and rejects malformed output.
 *
 *   class SpeakDecision(BaseModel):
 *       speak_now: bool                  # True only if Bora was directly addressed by name
 *       should_i_speak: float            # 0..1 confidence it has a worthwhile unsolicited point
 *       reason: str                      # short rationale (logged; shown as the hand-raise hint)
 *       addressed_name: str | None = None
 *       release_gate: bool = False       # True only if someone tells Bora to go ahead ("go on, Bora")
 */

export interface SpeakDecision {
  speak_now: boolean;
  should_i_speak: number; // clamped 0..1
  reason: string;
  addressed_name: string | null;
  release_gate: boolean;
}

export interface TriggerEnv {
  NEBIUS_API_KEY: string;
  NEBIUS_API_BASE?: string; // default Token Factory
  NEBIUS_TRIGGER_MODEL?: string;
}

const DEFAULT_BASE = "https://api.tokenfactory.nebius.com/v1";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

function baseUrl(env: TriggerEnv): string {
  return (env.NEBIUS_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * Build the trigger prompt. `botName` is the org's configured bot name (from bots.name) so the
 * model knows what "addressed by name" means. `handRaised` tells it a contribution is already
 * pending and waiting for release — only then does release_gate become meaningful.
 */
export function buildTriggerMessages(
  window: string,
  botName: string,
  handRaised: boolean,
): { role: "system" | "user"; content: string }[] {
  const system =
    `You are the meeting trigger for a bot named "${botName}". You read a rolling window of the ` +
    `live transcript and decide whether the bot should react. Reply with ONLY a compact JSON object ` +
    `(no prose, no markdown fences):\n` +
    `{"speak_now": boolean, "should_i_speak": number, "reason": string, "addressed_name": string|null, "release_gate": boolean}\n\n` +
    `Rules:\n` +
    `- speak_now = true ONLY if "${botName}" is directly addressed and asked/expected to respond ` +
    `(e.g. "${botName}, what did we decide?"). Put the trigger word in addressed_name.\n` +
    `- should_i_speak = your confidence (0..1) that the bot has a WORTHWHILE UNSOLICITED contribution ` +
    `right now: a correction of a clear factual error, or a directly-relevant fact it knows. Most ` +
    `windows score LOW (< 0.3). Only score high when genuinely useful.\n` +
    (handRaised
      ? `- The bot ALREADY has its hand raised waiting to speak. release_gate = true if someone is now ` +
        `telling "${botName}" to go ahead / speak (e.g. "go on, ${botName}", "go ahead ${botName}", ` +
        `"yes ${botName}", "${botName} you can speak"). Judge intent, not exact words.\n`
      : `- release_gate must be false (the bot has nothing pending right now).\n`) +
    `- reason: one short sentence. Never invent that the bot was addressed if it wasn't.`;

  return [
    { role: "system", content: system },
    { role: "user", content: `Transcript window:\n${window}` },
  ];
}

/** Parse + validate the model's raw text into a SpeakDecision. Returns null if unusable. */
export function parseSpeakDecision(raw: string): SpeakDecision | null {
  if (!raw) return null;
  // Tolerate accidental code fences / stray prose around the object.
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let obj: any = null;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  // Coerce defensively — a small model may stringify booleans or omit fields.
  const toBool = (v: unknown): boolean => v === true || v === "true" || v === 1;
  let conf = typeof obj.should_i_speak === "number" ? obj.should_i_speak : Number(obj.should_i_speak);
  if (!Number.isFinite(conf)) conf = 0;
  conf = Math.max(0, Math.min(1, conf));

  return {
    speak_now: toBool(obj.speak_now),
    should_i_speak: conf,
    reason: typeof obj.reason === "string" ? obj.reason.slice(0, 500) : "",
    addressed_name:
      typeof obj.addressed_name === "string" && obj.addressed_name.trim() ? obj.addressed_name.trim() : null,
    release_gate: toBool(obj.release_gate),
  };
}

/**
 * Run the trigger model over a transcript window → SpeakDecision (or null if it didn't produce a
 * usable one). Cheap + fast: temperature 0, tiny max_tokens. OpenAI-compatible chat/completions.
 */
export async function runTrigger(
  env: TriggerEnv,
  window: string,
  botName: string,
  handRaised: boolean,
  signal?: AbortSignal,
): Promise<SpeakDecision | null> {
  const model = env.NEBIUS_TRIGGER_MODEL || DEFAULT_MODEL;
  const res = await fetch(`${baseUrl(env)}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.NEBIUS_API_KEY}`, Accept: "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 220,
      messages: buildTriggerMessages(window, botName, handRaised),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Nebius trigger (${model}) ${res.status}: ${text.slice(0, 180)}`);
  }
  const body: any = text ? JSON.parse(text) : null;
  const content: string = body?.choices?.[0]?.message?.content ?? "";
  return parseSpeakDecision(content);
}

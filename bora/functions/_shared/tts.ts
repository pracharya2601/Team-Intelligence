/**
 * ElevenLabs TTS client (function runtime) — dependency-free native fetch.
 *
 * Bora's voice. Phase 3's `speak` function turns the chosen spoken line into MP3 bytes here, then
 * hands them to the bot camera page (as base64) to PLAY — because with Recall Output Media active,
 * the webpage IS the audio path (you cannot use Recall's separate Output Audio endpoint while a
 * webpage is streamed as the camera). So we synthesize server-side (key stays here) and the page
 * plays it; Recall captures the page's audio into the meeting.
 *
 * Auth: header `xi-api-key: <key>` (NOT Bearer). Voice is per-org (bots.voice_id); see the voice
 * list via `npm run check:elevenlabs`. Verified read-only there.
 */

export interface TtsEnv {
  ELEVENLABS_API_KEY: string;
}

/** A sensible default voice if the org hasn't picked one (River — calm, neutral; from the catalog). */
export const DEFAULT_VOICE_ID = "SAz9YHcvj6GT2YYXdXww";

const BASE = "https://api.elevenlabs.io";

export interface SynthesizeOptions {
  text: string;
  voiceId?: string | null;
  /** eleven_turbo_v2_5 is the low-latency model — right for the live meeting path. */
  modelId?: string;
  signal?: AbortSignal;
}

/** Synthesize speech → MP3 bytes. Throws on API error. */
export async function synthesize(env: TtsEnv, opts: SynthesizeOptions): Promise<Uint8Array> {
  const voice = (opts.voiceId && opts.voiceId.trim()) || DEFAULT_VOICE_ID;
  const model = opts.modelId ?? "eleven_turbo_v2_5";
  const res = await fetch(`${BASE}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    signal: opts.signal,
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: opts.text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS ${res.status}: ${t.slice(0, 180)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** Synthesize → a data: URI an <audio> element can play directly. */
export async function synthesizeDataUri(env: TtsEnv, opts: SynthesizeOptions): Promise<string> {
  const bytes = await synthesize(env, opts);
  return `data:audio/mpeg;base64,${bytesToBase64(bytes)}`;
}

/** Base64-encode bytes without Buffer (Deno/web runtime). Chunked to avoid arg-count limits. */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

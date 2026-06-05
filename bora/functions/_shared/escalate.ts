/**
 * Gemini-Flash escalator (function runtime) — the ONLY in-meeting speaking brain.
 *
 * Latency rule (CLAUDE.md): on the live meeting path only FAST models speak. The Nebius trigger
 * (cheap, always-on) decides IF the bot reacts; this composes WHAT it says, using Gemini Flash via
 * the Butterbase gateway (surface "meeting"). NEVER Claude here — that's off-path only (notes/chat).
 *
 * Two prompts behind one interface:
 *   - answer():  the bot was directly addressed (speak_now) → answer the question, spoken-style.
 *   - compose(): an unsolicited but worthwhile point (should_i_speak > threshold) → ONE brief
 *                sentence the bot would say, to be held as pending_text until a human says "go on".
 *
 * Context is the recent transcript + the bot's persona for now. Team memory (Xtrace) and context
 * RAG are Track B surfaces; this takes already-retrieved `context` text so wiring them later is a
 * one-line change at the call site, not here.
 */

import { complete, type LlmEnv } from "./llm.ts";

export interface EscalateInput {
  /** Recent transcript window (most recent last), already formatted "Speaker: text" per line. */
  transcript: string;
  /** The org's bot name (bots.name) — how it refers to itself. */
  botName: string;
  /** Optional persona/system flavor (bots.persona). */
  persona?: string | null;
  /** Optional already-retrieved context (RAG/Xtrace) — appended as reference material. */
  context?: string | null;
  /** For answer(): the trigger's rationale / the detected question, to focus the reply. */
  hint?: string | null;
}

const STYLE =
  "You are speaking OUT LOUD in a live meeting via text-to-speech, so: be brief and natural, one or " +
  "two sentences, no markdown, no lists, no emojis, no preamble like 'Sure' or 'As an AI'. Plain spoken English.";

function systemFor(botName: string, persona?: string | null): string {
  const base = `You are ${botName}, a teammate participating in a live meeting. ${STYLE}`;
  return persona && persona.trim() ? `${base}\nPersona: ${persona.trim()}` : base;
}

function withContext(transcript: string, context?: string | null): string {
  const ctx = context && context.trim() ? `\n\nReference material you may use (do not read it aloud verbatim):\n${context.trim()}` : "";
  return `Recent meeting transcript:\n${transcript}${ctx}`;
}

/**
 * Direct-address answer (speak_now path). Returns a short spoken answer, or "" if it has nothing
 * useful/grounded to say (better to stay silent than hallucinate live).
 */
export async function answer(env: LlmEnv, input: EscalateInput): Promise<string> {
  const focus = input.hint && input.hint.trim() ? `\n\nYou were just addressed. Focus: ${input.hint.trim()}` : "";
  const result = await complete(env, {
    surface: "meeting", // Gemini Flash — fast, live path
    maxTokens: 160,
    temperature: 0.3,
    messages: [
      { role: "system", content: systemFor(input.botName, input.persona) },
      {
        role: "user",
        content:
          `${withContext(input.transcript, input.context)}${focus}\n\n` +
          `Answer the question you were just asked, grounded in the transcript and reference material. ` +
          `If you genuinely don't have the information, say so in one short sentence rather than guessing.`,
      },
    ],
  });
  return cleanSpoken(result.message.content ?? "");
}

/**
 * Unsolicited contribution (should_i_speak path). Returns ONE brief sentence to hold as
 * pending_text, or "" if on reflection there's nothing worth interrupting for.
 */
export async function compose(env: LlmEnv, input: EscalateInput): Promise<string> {
  const result = await complete(env, {
    surface: "meeting",
    maxTokens: 120,
    temperature: 0.3,
    messages: [
      { role: "system", content: systemFor(input.botName, input.persona) },
      {
        role: "user",
        content:
          `${withContext(input.transcript, input.context)}\n\n` +
          `You may have something worth adding UNPROMPTED — a correction of a clear factual error, or a ` +
          `directly-relevant fact. If so, write the ONE sentence you would say out loud. If it isn't ` +
          `genuinely worth interrupting the meeting for, reply with exactly an empty string.`,
      },
    ],
  });
  return cleanSpoken(result.message.content ?? "");
}

/** Strip fences/quotes/boilerplate and collapse to a clean spoken line. */
function cleanSpoken(s: string): string {
  let t = s.replace(/^```[\s\S]*?\n|```$/g, "").trim();
  // Models sometimes wrap a single sentence in quotes.
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1).trim();
  // Treat an explicit empty-string / "no comment" style reply as silence.
  if (/^(|""|''|n\/a|none|no comment|nothing)$/i.test(t)) return "";
  return t;
}

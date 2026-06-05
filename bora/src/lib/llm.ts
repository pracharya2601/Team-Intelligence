/**
 * LLM gateway client.
 *
 * The ONE place Bora calls language models. Everything goes through Butterbase's
 * OpenAI-compatible AI gateway under a single bb_sk key — there are no Anthropic
 * or Gemini API keys in this project.
 *
 * Model policy (see PLAN.md):
 *   - MEETING (Gemini Flash)  → the live, in-meeting speaking brain. Latency-critical.
 *                               Used for BOTH the direct-address answer and the
 *                               unsolicited-correction wording. NEVER Claude here.
 *   - CHAT    (Claude 4.8)    → chat UI, post-meeting AI notes, Slack replies.
 *                               Off the live path, where latency is fine.
 *
 * Keep call sites honest by choosing the model via `pickModel()` rather than
 * hardcoding ids, so the "no Claude in meetings" rule is enforced in one spot.
 */

const APP_ID = process.env.BUTTERBASE_APP_ID!;
const API_BASE = process.env.BUTTERBASE_API_BASE ?? "https://api.butterbase.ai";
const KEY = process.env.BUTTERBASE_API_KEY!;

const MODEL_CHAT = process.env.BORA_MODEL_CHAT ?? "anthropic/claude-sonnet-4.6";
const MODEL_MEETING = process.env.BORA_MODEL_MEETING ?? "google/gemini-2.5-flash";

export type Surface = "chat" | "notes" | "slack" | "meeting";

/** Map a surface to a model id, enforcing: meetings = fast Gemini, everything else = Claude. */
export function pickModel(surface: Surface): string {
  return surface === "meeting" ? MODEL_MEETING : MODEL_CHAT;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  // OpenAI-style tool plumbing (optional; used by the agent loop):
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface CompletionOptions {
  surface: Surface;
  messages: ChatMessage[];
  tools?: any[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  message: ChatMessage;
  finishReason: string;
  raw: any;
}

/**
 * One OpenAI-compatible chat completion through the Butterbase gateway.
 * The agent loop (chat surface) layers tool-calling on top of this.
 */
export async function complete(opts: CompletionOptions): Promise<CompletionResult> {
  const model = pickModel(opts.surface);
  const res = await fetch(`${API_BASE}/v1/${APP_ID}/chat/completions`, {
    method: "POST",
    signal: opts.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      tools: opts.tools,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.4,
    }),
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`LLM gateway (${model}) failed: ${msg}`);
  }

  const choice = body.choices?.[0];
  return {
    message: choice?.message ?? { role: "assistant", content: "" },
    finishReason: choice?.finish_reason ?? "stop",
    raw: body,
  };
}

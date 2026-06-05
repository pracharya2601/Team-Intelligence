/**
 * LLM gateway client (function runtime).
 *
 * The ONE place Bora calls language models — Butterbase's OpenAI-compatible AI gateway.
 * No Anthropic/Gemini keys; one bb_sk key. Inside a Butterbase function the runtime
 * injects BUTTERBASE_APP_ID/BUTTERBASE_API_URL; you supply BUTTERBASE_API_KEY via envVars.
 *
 * Model policy (enforced by pickModel):
 *   - meeting → Gemini Flash (fast; the live in-meeting brain — BOTH direct-address answers
 *               and unsolicited corrections). NEVER Claude on the live path.
 *   - chat/notes/slack → Claude 4.8 (off the live path, latency fine).
 */

export type Surface = "chat" | "notes" | "slack" | "meeting";

export interface LlmEnv {
  BUTTERBASE_API_URL: string;
  BUTTERBASE_APP_ID: string;
  BUTTERBASE_API_KEY: string;
  BORA_MODEL_CHAT?: string;
  BORA_MODEL_MEETING?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export function pickModel(env: LlmEnv, surface: Surface): string {
  if (surface === "meeting") return env.BORA_MODEL_MEETING ?? "google/gemini-2.5-flash";
  return env.BORA_MODEL_CHAT ?? "anthropic/claude-opus-4.8";
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

/** One OpenAI-compatible chat completion through the Butterbase gateway. */
export async function complete(env: LlmEnv, opts: CompletionOptions): Promise<CompletionResult> {
  const model = pickModel(env, opts.surface);
  const res = await fetch(`${env.BUTTERBASE_API_URL}/v1/${env.BUTTERBASE_APP_ID}/chat/completions`, {
    method: "POST",
    signal: opts.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BUTTERBASE_API_KEY}` },
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

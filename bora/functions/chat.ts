/**
 * Function: chat  (HTTP trigger, auth: required)
 *
 * Private per-user chat with Bora. Persists chat_threads / chat_messages and answers with Claude
 * (off the live-meeting path — see model policy) through the Butterbase AI gateway.
 *
 * PRIVACY (the core guarantee):
 *  - chat_threads / chat_messages are `user_id = caller` ONLY (RLS, Phase 0). This function runs
 *    with the service key (RLS bypassed), so it ENFORCES that invariant in code: every read and
 *    write is scoped to `ctx.user.id`, and a thread is only usable if it belongs to the caller.
 *    The browser's direct reads (src/lib/api.ts `select`) stay RLS-enforced as a second layer.
 *  - The system prompt forbids revealing any other user's private chat.
 *
 * Identity: `ctx.user.id` (gateway-verified JWT), `x-user-id` header as fallback.
 * Env: BUTTERBASE_API_KEY (via envVars) + BUTTERBASE_API_URL/BUTTERBASE_APP_ID (injected).
 *      BORA_MODEL_CHAT optional (defaults to anthropic/claude-opus-4.8).
 * Deploy: node scripts/deploy-fn.mjs functions/chat.ts chat
 *
 * Body: { org_id, content, thread_id? }
 * Returns: { thread_id, title, reply }
 */

const CHAT_MODEL_DEFAULT = "anthropic/claude-opus-4.8";
const MAX_HISTORY = 20; // messages of context sent to the model

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

  const userId = ctx?.user?.id ?? req.headers.get("x-user-id");
  if (!userId) return json({ error: { message: "Not authenticated" } }, 401);

  const env = ctx.env || {};
  const API = `${env.BUTTERBASE_API_URL}/v1/${env.BUTTERBASE_APP_ID}`;
  const KEY = env.BUTTERBASE_API_KEY;
  const MODEL = env.BORA_MODEL_CHAT || CHAT_MODEL_DEFAULT;

  async function svc(path: string, init: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = { Authorization: `Bearer ${KEY}` };
    if (init.body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${API}${path}`, { ...init, headers });
    const t = await res.text();
    const b = t ? JSON.parse(t) : null;
    if (!res.ok) throw new Error(b?.error?.message || b?.message || `HTTP ${res.status}`);
    return b;
  }
  const one = (x: any) => (Array.isArray(x) ? x[0] : x);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const org_id = body.org_id;
  const content = String(body.content ?? "").trim();
  if (!org_id) return json({ error: { message: "org_id is required" } }, 400);
  if (!content) return json({ error: { message: "content is required" } }, 400);

  try {
    // Caller must be an active member of the org this chat belongs to.
    const membership: any[] = await svc(`/org_members?org_id=eq.${org_id}&user_id=eq.${userId}`);
    if (!membership.some((m) => m.status === "active")) {
      return json({ error: { message: "Not a member of this organization" } }, 403);
    }

    // Resolve the thread — existing (must be the caller's) or new.
    let thread: any;
    if (body.thread_id) {
      const rows: any[] = await svc(`/chat_threads?id=eq.${body.thread_id}`);
      thread = rows[0];
      if (!thread || thread.user_id !== userId) return json({ error: { message: "Thread not found" } }, 404);
    } else {
      const title = content.split(/\s+/).slice(0, 7).join(" ").slice(0, 80);
      thread = one(await svc(`/chat_threads`, {
        method: "POST",
        body: JSON.stringify({ org_id, user_id: userId, title }),
      }));
    }

    // Persist the user's message.
    await svc(`/chat_messages`, {
      method: "POST",
      body: JSON.stringify({ thread_id: thread.id, user_id: userId, role: "user", content }),
    });

    // Load recent history for this thread (caller-owned by construction).
    const history: any[] = await svc(
      `/chat_messages?thread_id=eq.${thread.id}&user_id=eq.${userId}&order=created_at.asc&limit=${MAX_HISTORY}`,
    );

    const system = [
      "You are Bora, a helpful team assistant inside a private 1:1 chat with one user.",
      "This conversation is private to this user. Never reveal, quote, or reference any other",
      "user's private chat, and never claim to have access to other people's private messages.",
      "You may use the organization's shared knowledge and meeting context. Be concise and direct.",
    ].join(" ");

    const messages = [
      { role: "system", content: system },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Off-path completion via the Butterbase AI gateway (Claude — not on the live meeting path).
    const gw = await svc(`/chat/completions`, {
      method: "POST",
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 1024 }),
    });
    const reply = String(gw?.choices?.[0]?.message?.content ?? "").trim() || "(no response)";

    // Persist the assistant's reply (owned by the same user so RLS lets them read it back).
    await svc(`/chat_messages`, {
      method: "POST",
      body: JSON.stringify({ thread_id: thread.id, user_id: userId, role: "assistant", content: reply }),
    });

    return json({ thread_id: thread.id, title: thread.title, reply });
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

/**
 * Function: chat-threads  (HTTP trigger, auth: required)
 *
 * Manage the caller's own chat threads: rename, AI auto-title, or delete (thread + its messages).
 *
 * PRIVACY: chat_threads / chat_messages are `user_id = caller` ONLY (RLS, Phase 0). This function
 * runs with the service key (RLS bypassed), so it ENFORCES that invariant in code — every action
 * first loads the thread and rejects unless `thread.user_id === caller`. A user can therefore only
 * ever rename or delete their OWN threads; another user's threads are invisible and untouchable.
 *
 * Identity: `ctx.user.id` (gateway-verified JWT), `x-user-id` header as fallback.
 * Env: BUTTERBASE_API_KEY (via envVars) + BUTTERBASE_API_URL/BUTTERBASE_APP_ID (injected).
 *      BORA_MODEL_CHAT optional (auto-title uses it; defaults to anthropic/claude-opus-4.8).
 * Deploy: node scripts/deploy-fn.mjs functions/chat-threads.ts chat-threads
 *
 * Body: { thread_id, action: "rename" | "autotitle" | "delete", title? }
 *   rename     → sets title to the provided `title` (trimmed, ≤80 chars)
 *   autotitle  → generates a concise ≤6-word title from the thread's messages via the gateway
 *   delete     → removes the thread's messages then the thread row
 * Returns: rename/autotitle → { thread_id, title } ; delete → { thread_id, deleted: true }
 */

const CHAT_MODEL_DEFAULT = "anthropic/claude-opus-4.8";

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
  const clean = (s: string) => s.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").slice(0, 80);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const thread_id = body.thread_id;
  const action = String(body.action ?? "").trim();
  if (!thread_id) return json({ error: { message: "thread_id is required" } }, 400);
  if (!["rename", "autotitle", "delete"].includes(action)) {
    return json({ error: { message: "action must be rename | autotitle | delete" } }, 400);
  }

  try {
    // Load + ownership check — the caller may only touch their own thread.
    const rows: any[] = await svc(`/chat_threads?id=eq.${thread_id}`);
    const thread = rows[0];
    if (!thread || thread.user_id !== userId) return json({ error: { message: "Thread not found" } }, 404);

    if (action === "delete") {
      // Remove messages first (no reliance on FK cascade), then the thread.
      const msgs: any[] = await svc(`/chat_messages?thread_id=eq.${thread_id}&user_id=eq.${userId}`);
      for (const m of msgs) await svc(`/chat_messages/${m.id}`, { method: "DELETE" });
      await svc(`/chat_threads/${thread_id}`, { method: "DELETE" });
      return json({ thread_id, deleted: true });
    }

    let title = "";
    if (action === "rename") {
      title = clean(String(body.title ?? ""));
      if (!title) return json({ error: { message: "title is required for rename" } }, 400);
    } else {
      // autotitle — summarize the thread into a short label via the off-path gateway model.
      const msgs: any[] = await svc(
        `/chat_messages?thread_id=eq.${thread_id}&user_id=eq.${userId}&order=created_at.asc&limit=6`,
      );
      const convo = msgs.map((m) => `${m.role}: ${m.content}`).join("\n").slice(0, 2000);
      if (!convo) return json({ error: { message: "Thread has no messages to title" } }, 400);
      try {
        const gw = await svc(`/chat/completions`, {
          method: "POST",
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 24,
            messages: [
              { role: "system", content: "Title this chat in 6 words or fewer. Reply with the title only — no quotes, no punctuation at the end." },
              { role: "user", content: convo },
            ],
          }),
        });
        title = clean(String(gw?.choices?.[0]?.message?.content ?? ""));
      } catch {
        /* model unavailable — fall through to the heuristic below */
      }
      if (!title) {
        const firstUser = msgs.find((m) => m.role === "user");
        title = clean(String(firstUser?.content ?? "Chat").split(/\s+/).slice(0, 6).join(" ")) || "Chat";
      }
    }

    const updated = await svc(`/chat_threads/${thread_id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    const row = Array.isArray(updated) ? updated[0] : updated;
    return json({ thread_id, title: row?.title ?? title });
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

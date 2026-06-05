/**
 * Function: chat  (HTTP trigger, auth: required)
 *
 * Private per-user chat with Bora. Persists chat_threads / chat_messages and answers with Claude
 * (off the live-meeting path — see model policy) through the Butterbase AI gateway.
 *
 * Agentic retrieval: the model runs a tool-calling loop over the Butterbase AI gateway and decides
 * when to call `search_context` (org private RAG → [n] snippets) and/or `search_meetings` (recent
 * meeting notes → [Mn] cards). Tool results are fed back until the model answers; only the final
 * reply is persisted (tool plumbing stays in-memory). Tools are best-effort — they return a status
 * string instead of throwing, so a missing RAG collection or no meetings never breaks a turn.
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

    // Bot identity + persona (admin-configured in Settings) shapes the assistant's voice.
    let botName = "Bora";
    let persona = "";
    try {
      const bots: any[] = await svc(`/bots?org_id=eq.${org_id}`);
      if (bots[0]?.name) botName = String(bots[0].name);
      if (bots[0]?.persona) persona = String(bots[0].persona);
    } catch {
      /* fall back to defaults */
    }

    // ── Retrieval tools the model can call on demand ─────────────────────────────────
    // Both are best-effort (return a plain status string instead of throwing) and read with the
    // service key — the membership check above already authorized this caller for this org.
    const orgColl = `org-${String(org_id).replace(/[^a-z0-9]/gi, "").toLowerCase()}`;

    async function runSearchContext(query: string): Promise<string> {
      try {
        const head = await fetch(`${API}/rag/collections/${orgColl}`, { headers: { Authorization: `Bearer ${KEY}` } });
        if (!head.ok) return "No team knowledge base has been set up yet.";
        const q = await svc(`/rag/collections/${orgColl}/query`, {
          method: "POST",
          body: JSON.stringify({ query, top_k: 5, threshold: 0.3 }),
        });
        const chunks: any[] = q?.chunks ?? [];
        if (!chunks.length) return "No matching team knowledge found.";
        return chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n");
      } catch {
        return "Team knowledge is unavailable right now.";
      }
    }

    async function runSearchMeetings(query: string): Promise<string> {
      try {
        const meets: any[] = await svc(`/meetings?org_id=eq.${org_id}&status=eq.done&order=ended_at.desc&limit=8`);
        const ids: string[] = meets.map((m) => m.id).filter(Boolean);
        if (!ids.length) return "No completed meetings yet.";
        const arts: any[] = await svc(`/meeting_artifacts?meeting_id=in.(${ids.join(",")})`);
        const notesByMeeting = new Map<string, any>(arts.map((a) => [a.meeting_id, a.ai_notes || {}]));
        const terms = query.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
        const asList = (a: any) => (Array.isArray(a) ? a.map((x) => String(x)) : []);
        const cards = meets
          .map((m) => {
            const n = notesByMeeting.get(m.id) || {};
            const summary = n.summary ? String(n.summary) : "";
            const decisions = asList(n.decisions);
            const actions = asList(n.action_items ?? n.actions);
            if (!summary && !decisions.length && !actions.length) return null;
            const when = m.ended_at ? String(m.ended_at).slice(0, 10) : "";
            const blob = [summary, decisions.join(" "), actions.join(" ")].join(" ").toLowerCase();
            const score = terms.reduce((s, t) => s + (blob.includes(t) ? 1 : 0), 0);
            const text = [
              `${when}${m.platform ? " " + m.platform : ""}: ${summary.slice(0, 400)}`.trim(),
              decisions.length ? `Decisions: ${decisions.join("; ")}` : "",
              actions.length ? `Action items: ${actions.join("; ")}` : "",
            ].filter(Boolean).join(" ");
            return { score, ended: String(m.ended_at || ""), text };
          })
          .filter(Boolean) as { score: number; ended: string; text: string }[];
        cards.sort((a, b) => b.score - a.score || b.ended.localeCompare(a.ended));
        const top = cards.slice(0, 6);
        if (!top.length) return "No meeting notes available yet.";
        return top.map((c, i) => `[M${i + 1}] ${c.text}`).join("\n");
      } catch {
        return "Meeting notes are unavailable right now.";
      }
    }

    const TOOLS = [
      { type: "function", function: {
        name: "search_context",
        description: "Search the team's private knowledge base (admin-added docs and context) for info relevant to the question. Returns numbered snippets [n].",
        parameters: { type: "object", properties: { query: { type: "string", description: "What to look up" } }, required: ["query"] },
      } },
      { type: "function", function: {
        name: "search_meetings",
        description: "Search recent completed team meetings for summaries, decisions, and action items relevant to the question. Returns numbered meeting cards [Mn].",
        parameters: { type: "object", properties: { query: { type: "string", description: "What to look up" } }, required: ["query"] },
      } },
    ];
    async function runTool(name: string, args: any): Promise<string> {
      const query = String(args?.query ?? "").trim() || content;
      if (name === "search_context") return runSearchContext(query);
      if (name === "search_meetings") return runSearchMeetings(query);
      return `Unknown tool: ${name}`;
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
      `You are ${botName}, a helpful team assistant inside a private 1:1 chat with one user.`,
      persona ? `Personality and behavior to embody: ${persona}` : "",
      "This conversation is private to this user. Never reveal, quote, or reference any other",
      "user's private chat, and never claim to have access to other people's private messages.",
      "When a question might be answered by team knowledge or past meetings, call the search_context",
      "and/or search_meetings tools before answering. Ground answers in the tool results and cite the",
      "sources you used — [n] for team knowledge, [Mn] for meetings. If the tools don't cover the",
      "question, say so rather than guessing. For small talk you don't need tools. Be concise and direct.",
    ].filter(Boolean).join(" ");

    const messages: any[] = [
      { role: "system", content: system },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Agent loop (off the live-meeting path — Claude): let the model call retrieval tools, feed the
    // results back, and repeat until it produces an answer. Tool plumbing stays in-memory — only the
    // final reply is persisted to the thread. The last round drops tools to force a text answer.
    const MAX_ROUNDS = 4;
    let reply = "";
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const lastRound = round === MAX_ROUNDS - 1;
      const gw = await svc(`/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          messages,
          ...(lastRound ? {} : { tools: TOOLS, tool_choice: "auto" }),
        }),
      });
      const msg = gw?.choices?.[0]?.message ?? {};
      const toolCalls: any[] = msg.tool_calls ?? [];
      if (toolCalls.length && !lastRound) {
        messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
        for (const tc of toolCalls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { args = {}; }
          const result = await runTool(tc.function?.name, args);
          messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        continue;
      }
      reply = String(msg.content ?? "").trim();
      break;
    }
    if (!reply) reply = "(no response)";

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

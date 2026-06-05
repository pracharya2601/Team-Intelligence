/**
 * Function: ingest-source  (HTTP trigger, auth: required)
 *
 * Admin-only org knowledge ingestion. Adds a source to the org's RAG collection (org-{id}) and
 * tracks it in context_sources so the chat's search_context can ground answers in it.
 *
 *  - action "add" with `text`  → ingest raw text directly (no external vendor). VERIFIED path.
 *  - action "add" with `url`   → fetch/parse via RocketRide, then ingest. GUARDED: requires
 *      ROCKETRIDE_APIKEY (currently unset) — returns 501 until configured + a pipeline exists.
 *  - action "remove"           → delete the source row and its RAG documents.
 *
 * RAG access is service-key and gated here by the active-admin check (writes to org tables are
 * admin-only). context_sources lifecycle: ingesting → ready (we briefly poll embedding) | error.
 *
 * Identity: ctx.user.id (x-user-id fallback). Env: BUTTERBASE_API_KEY + URL/APP_ID injected.
 * Deploy: node scripts/deploy-fn.mjs functions/ingest-source.ts ingest-source
 *
 * Body:
 *   { action:"add", org_id, text, title? }          // raw text
 *   { action:"add", org_id, url, type? }            // url (RocketRide — not yet configured)
 *   { action:"remove", org_id, source_id }
 */

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

  const userId = ctx?.user?.id ?? req.headers.get("x-user-id");
  if (!userId) return json({ error: { message: "Not authenticated" } }, 401);

  const env = ctx.env || {};
  const API = `${env.BUTTERBASE_API_URL}/v1/${env.BUTTERBASE_APP_ID}`;
  const KEY = env.BUTTERBASE_API_KEY;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  const { action = "add", org_id } = body;
  if (!org_id) return json({ error: { message: "org_id is required" } }, 400);

  try {
    // Caller must be an active ADMIN of the org (writes to org tables are admin-only).
    const members: any[] = await svc(`/org_members?org_id=eq.${org_id}&user_id=eq.${userId}`);
    const me = members.find((m) => m.status === "active");
    if (!me || me.role !== "admin") return json({ error: { message: "Admins only" } }, 403);

    const coll = `org-${String(org_id).replace(/[^a-z0-9]/gi, "").toLowerCase()}`;

    if (action === "remove") {
      const { source_id } = body;
      if (!source_id) return json({ error: { message: "source_id is required" } }, 400);
      const rows: any[] = await svc(`/context_sources?id=eq.${source_id}`);
      const src = rows[0];
      if (!src || src.org_id !== org_id) return json({ error: { message: "Source not found" } }, 404);
      // Best-effort delete of the underlying RAG documents, then the row.
      for (const docId of src.rag_doc_ids ?? []) {
        await fetch(`${API}/rag/collections/${coll}/documents/${docId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${KEY}` },
        }).catch(() => {});
      }
      await svc(`/context_sources/${source_id}`, { method: "PATCH", body: JSON.stringify({ status: "error" }) }).catch(() => {});
      await fetch(`${API}/context_sources/${source_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${KEY}` } }).catch(() => {});
      return json({ ok: true });
    }

    // action "add"
    const text = String(body.text ?? "").trim();
    const url = String(body.url ?? "").trim();

    if (!text && url) {
      // RocketRide fetch/parse path — not wired until ROCKETRIDE_APIKEY + a pipeline exist.
      return json(
        { error: { message: "URL ingestion needs RocketRide, which isn't configured yet. Paste the text directly for now." } },
        501,
      );
    }
    if (!text) return json({ error: { message: "Provide text to ingest" } }, 400);

    const title = String(body.title ?? "").trim() || "Untitled note";
    const type = "doc";

    // Ensure the per-org collection exists (idempotent).
    const head = await fetch(`${API}/rag/collections/${coll}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!head.ok) {
      await svc(`/rag/collections`, {
        method: "POST",
        body: JSON.stringify({ name: coll, access_mode: "private", description: `Org ${org_id} shared knowledge` }),
      }).catch(() => {});
    }

    // Create the tracking row first (status ingesting), so the UI shows it immediately.
    const src = one(await svc(`/context_sources`, {
      method: "POST",
      body: JSON.stringify({ org_id, type, url: title, status: "ingesting", added_by: userId }),
    }));

    // Ingest the text, then briefly poll for embedding to settle.
    const ing = await svc(`/rag/collections/${coll}/ingest`, {
      method: "POST",
      body: JSON.stringify({ text, filename: `${title}.txt`, metadata: { source_id: src.id, title } }),
    });
    const docId = ing.documentId;
    let status = "ingesting";
    for (let i = 0; i < 5; i++) {
      await sleep(2000);
      const doc = await svc(`/rag/collections/${coll}/documents/${docId}`).catch(() => null);
      if (doc?.status === "ready") { status = "ready"; break; }
      if (doc?.status === "failed") { status = "error"; break; }
    }

    const updated = one(await svc(`/context_sources/${src.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, rag_doc_ids: [docId] }),
    }));
    return json({ source: updated ?? { ...src, status, rag_doc_ids: [docId] } }, 201);
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

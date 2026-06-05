/**
 * Function: ingest-source  (HTTP trigger, auth: required)
 *
 * Admin-only org knowledge ingestion. Adds a source to the org's RAG collection (org-{id}) and
 * tracks it in context_sources so the chat's search_context can ground answers in it.
 *
 *  - action "add" with `text`        → ingest raw text directly (no external vendor). VERIFIED path.
 *  - action "add" with a github URL  → fetch the repo README via the Butterbase GitHub integration,
 *      then ingest. Requires an admin to have connected GitHub once (else 501 with guidance).
 *  - action "add" with any other url → fetch/parse via RocketRide. GUARDED: requires ROCKETRIDE_APIKEY
 *      (currently unset) — returns 501 until configured + a pipeline exists.
 *  - action "remove"                 → delete the source row and its RAG documents.
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
    let text = String(body.text ?? "").trim();
    const url = String(body.url ?? "").trim();
    let title = String(body.title ?? "").trim();
    let type = "doc";

    if (!text && url) {
      const gh = url.match(/github\.com\/([^/\s]+)\/([^/#?\s]+)/i);
      if (gh) {
        // GitHub repo ingestion via the Butterbase GitHub integration (an admin connects GitHub
        // once in Settings — see integration-connect). We pull the repo README and ingest it.
        const owner = gh[1];
        const repo = gh[2].replace(/\.git$/i, "");
        const conns: any[] = (await svc(`/integrations/connections`)).connections ?? [];
        const ghConn = conns.find((c) => c.toolkit_slug === "github" && /active/i.test(c.status));
        if (!ghConn) {
          return json({ error: { message: "Connect GitHub in Settings first (admin), then add the repository." } }, 501);
        }
        const res = await svc(`/integrations/execute`, {
          method: "POST",
          body: JSON.stringify({ toolName: "GITHUB_GET_A_REPOSITORY_README", userId: ghConn.app_user_id, params: { owner, repo } }),
        });
        if (!res?.successful) {
          const why = res?.error?.message || res?.error || "unknown error";
          return json({ error: { message: `Couldn't read ${owner}/${repo} from GitHub: ${why}` } }, 502);
        }
        text = extractReadme(res.data);
        if (!text) return json({ error: { message: `No README content found for ${owner}/${repo}.` } }, 422);
        title = title || `${owner}/${repo} (GitHub README)`;
        type = "github";
      } else {
        // Non-GitHub URL → RocketRide fetch/parse, not wired until ROCKETRIDE_APIKEY + a pipeline exist.
        return json(
          { error: { message: "URL ingestion needs RocketRide (not configured yet). Paste text directly, or use a github.com repo URL." } },
          501,
        );
      }
    }
    if (!text) return json({ error: { message: "Provide text or a github.com repo URL to ingest" } }, 400);

    title = title || "Untitled note";

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
    const safeName = title.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "note";
    const ing = await svc(`/rag/collections/${coll}/ingest`, {
      method: "POST",
      body: JSON.stringify({ text, filename: `${safeName}.${type === "github" ? "md" : "txt"}`, metadata: { source_id: src.id, title, type } }),
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

/**
 * Pull the README text out of the GitHub integration's response, which may arrive as raw text or
 * as a base64-encoded GitHub `contents` payload. Tries the common shapes and base64-decodes (UTF-8)
 * when needed; returns "" if nothing usable is present.
 */
function extractReadme(data: any): string {
  if (!data) return "";
  if (typeof data === "string") return data.trim();
  const direct = data.decoded_content || data.text || data.body || data.raw;
  if (direct && typeof direct === "string") return direct.trim();
  const content = data.content ?? data.response_data?.content;
  if (typeof content === "string") {
    const enc = String(data.encoding ?? data.response_data?.encoding ?? "").toLowerCase();
    const looksB64 = /^[A-Za-z0-9+/=\s]+$/.test(content) && content.replace(/\s/g, "").length % 4 === 0;
    if (enc === "base64" || looksB64) {
      try { return b64utf8(content).trim(); } catch { /* fall through to raw */ }
    }
    return content.trim();
  }
  return "";
}

function b64utf8(s: string): string {
  const bin = atob(s.replace(/\s/g, ""));
  try {
    return decodeURIComponent(
      Array.prototype.map.call(bin, (c: any) => "%" + ("00" + (c as string).charCodeAt(0).toString(16)).slice(-2)).join(""),
    );
  } catch {
    return bin;
  }
}


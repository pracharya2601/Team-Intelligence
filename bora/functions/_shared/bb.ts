/**
 * Butterbase data/RAG helpers for the FUNCTION runtime.
 *
 * Two ways to touch the DB inside a function:
 *   - ctx.db.query(...)            → direct SQL (service role; RLS bypassed)
 *   - ctx.db.asUser(userId, ...)   → SQL as a specific user (RLS enforced) — use to act on
 *                                    behalf of the caller while still honoring policies.
 * For HTTP-shaped calls (RAG, gateway) we hit the app API with the service key from ctx.env.
 *
 * The caller's identity inside an HTTP-triggered function is in the `x-user-id` header
 * (set when the SPA forwarded the end-user JWT). Read it with `callerId(req)`.
 */

export interface FnEnv {
  BUTTERBASE_API_URL: string;
  BUTTERBASE_APP_ID: string;
  BUTTERBASE_API_KEY: string;
}

/** The end-user id forwarded by the gateway when the SPA passed the user's JWT. */
export function callerId(req: Request): string | null {
  return req.headers.get("x-user-id");
}

function appUrl(env: FnEnv): string {
  return `${env.BUTTERBASE_API_URL}/v1/${env.BUTTERBASE_APP_ID}`;
}

async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`Butterbase API ${res.status}: ${msg}`);
  }
  return body as T;
}

// ── RAG (service key) ────────────────────────────────────────────────────────
// Routes (verified live — the path param is the collection NAME, ingest is `/ingest`):
//   POST   /v1/{app}/rag/collections                       create   { name, access_mode, ... }
//   GET    /v1/{app}/rag/collections                       list
//   GET    /v1/{app}/rag/collections/{name}                get one  (404 RESOURCE_NOT_FOUND if absent)
//   POST   /v1/{app}/rag/collections/{name}/ingest         ingest   -> 202 { documentId, status }
//   GET    /v1/{app}/rag/collections/{name}/documents[/id] list / status
//   POST   /v1/{app}/rag/collections/{name}/query          query    -> { chunks:[...], answer? }
// All RAG access is service-key here and MUST be membership-gated by the calling function:
// end users never hit /rag directly for org-shared collections.

function ragAuth(env: FnEnv): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${env.BUTTERBASE_API_KEY}` };
}

/** Create a RAG collection if it doesn't exist; returns the collection name. Idempotent. */
export async function ragEnsureCollection(
  env: FnEnv,
  name: string,
  opts: { access_mode?: "private" | "shared" | "custom"; description?: string } = {},
): Promise<string> {
  const head = await fetch(`${appUrl(env)}/rag/collections/${encodeURIComponent(name)}`, { headers: ragAuth(env) });
  if (head.ok) return name;
  const res = await fetch(`${appUrl(env)}/rag/collections`, {
    method: "POST",
    headers: ragAuth(env),
    body: JSON.stringify({ name, access_mode: opts.access_mode ?? "private", description: opts.description }),
  });
  if (res.status === 409) return name; // racing create — already exists
  await asJson(res);
  return name;
}

export async function ragIngest(
  env: FnEnv,
  collection: string,
  body: { text?: string; storage_object_id?: string; filename?: string; metadata?: Record<string, unknown> },
): Promise<{ documentId: string; status: string; collection: string }> {
  const res = await fetch(`${appUrl(env)}/rag/collections/${encodeURIComponent(collection)}/ingest`, {
    method: "POST",
    headers: ragAuth(env),
    body: JSON.stringify(body),
  });
  return asJson(res);
}

export interface RagChunk {
  id: string;
  content: string;
  score: number;
  document: { id: string; filename: string | null };
  metadata: Record<string, unknown>;
}

export async function ragQuery(
  env: FnEnv,
  collection: string,
  body: { query: string; top_k?: number; threshold?: number; synthesize?: boolean; model?: string; filter?: Record<string, unknown> },
): Promise<{ answer?: string; chunks: RagChunk[]; model?: string }> {
  const res = await fetch(`${appUrl(env)}/rag/collections/${encodeURIComponent(collection)}/query`, {
    method: "POST",
    headers: ragAuth(env),
    body: JSON.stringify(body),
  });
  return asJson(res);
}

/** Per-org shared RAG collection name. Lowercase alphanumeric + hyphens only. */
export function orgCollection(orgId: string): string {
  return `org-${orgId.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
}

/** Standard JSON Response helper for function handlers. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

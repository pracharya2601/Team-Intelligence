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
export async function ragIngest(
  env: FnEnv,
  collection: string,
  body: { text?: string; storage_object_id?: string; filename?: string; metadata?: Record<string, unknown> },
): Promise<{ document_id: string; status: string }> {
  const res = await fetch(`${appUrl(env)}/rag/${collection}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BUTTERBASE_API_KEY}` },
    body: JSON.stringify(body),
  });
  return asJson(res);
}

export async function ragQuery(
  env: FnEnv,
  collection: string,
  body: { query: string; top_k?: number; threshold?: number; synthesize?: boolean; filter?: Record<string, unknown> },
): Promise<{ answer?: string; chunks: Array<{ text: string; score: number; document_id: string }> }> {
  const res = await fetch(`${appUrl(env)}/rag/${collection}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BUTTERBASE_API_KEY}` },
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

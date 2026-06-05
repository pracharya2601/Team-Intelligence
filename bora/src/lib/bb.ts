/**
 * Butterbase client (server-side).
 *
 * A thin wrapper over the Butterbase HTTP API for the pieces Bora leans on:
 *   - the auto-generated data API (CRUD over our tables, RLS-aware)
 *   - the OpenAI-compatible AI gateway (Claude + Gemini Flash live here — see llm.ts)
 *   - RAG (context-source vectors + retrieval)
 *
 * Auth model: pass a per-request bearer token. For user-facing calls that should
 * respect RLS, pass the end-user's JWT. For service/background work (webhooks,
 * functions, ingestion) pass the bb_sk service key, which bypasses RLS.
 *
 * We deliberately keep this dependency-free (native fetch) — Butterbase's HTTP
 * surface is OpenAI/REST-shaped, so there's nothing to abstract heavily.
 */

const APP_ID = process.env.BUTTERBASE_APP_ID!;
const API_BASE = process.env.BUTTERBASE_API_BASE ?? "https://api.butterbase.ai";
const SERVICE_KEY = process.env.BUTTERBASE_API_KEY!;

/** Base URL for this app's data/gateway/RAG endpoints. */
export const appUrl = `${API_BASE}/v1/${APP_ID}`;

export interface BBOptions {
  /** Bearer token. Defaults to the service key (RLS bypassed). Pass a user JWT to enforce RLS. */
  token?: string;
  signal?: AbortSignal;
}

function authHeader(token?: string): Record<string, string> {
  return { Authorization: `Bearer ${token ?? SERVICE_KEY}` };
}

async function bbFetch(path: string, init: RequestInit, opts?: BBOptions): Promise<Response> {
  const res = await fetch(`${appUrl}${path}`, {
    ...init,
    signal: opts?.signal,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(opts?.token),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  return res;
}

async function bbJson<T>(path: string, init: RequestInit, opts?: BBOptions): Promise<T> {
  const res = await bbFetch(path, init, opts);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`Butterbase ${init.method ?? "GET"} ${path} failed: ${msg}`);
  }
  return body as T;
}

// ── Data API (CRUD) ────────────────────────────────────────────────────────
// Butterbase exposes /v1/{app_id}/{table} with filtering/sorting/pagination.
// These helpers cover the common cases; reach for `bbJson` directly for the rest.

export async function select<T = any>(
  table: string,
  query: Record<string, string | number | boolean> = {},
  opts?: BBOptions,
): Promise<T[]> {
  const qs = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString();
  return bbJson<T[]>(`/${table}${qs ? `?${qs}` : ""}`, { method: "GET" }, opts);
}

export async function insert<T = any>(
  table: string,
  row: Record<string, unknown>,
  opts?: BBOptions,
): Promise<T> {
  return bbJson<T>(`/${table}`, { method: "POST", body: JSON.stringify(row) }, opts);
}

export async function update<T = any>(
  table: string,
  id: string,
  patch: Record<string, unknown>,
  opts?: BBOptions,
): Promise<T> {
  return bbJson<T>(`/${table}/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, opts);
}

// ── RAG ─────────────────────────────────────────────────────────────────────
// Context-source chunks live in a per-org `shared` collection. Ingestion is async
// (returns a document id with "pending" status); query returns ranked chunks and,
// when synthesize=true, an answer.

export async function ragIngest(
  collection: string,
  body: { text?: string; storage_object_id?: string; filename?: string; metadata?: Record<string, unknown> },
  opts?: BBOptions,
): Promise<{ document_id: string; status: string }> {
  return bbJson(`/rag/${collection}/documents`, { method: "POST", body: JSON.stringify(body) }, opts);
}

export async function ragQuery(
  collection: string,
  body: { query: string; top_k?: number; threshold?: number; synthesize?: boolean; filter?: Record<string, unknown> },
  opts?: BBOptions,
): Promise<{ answer?: string; chunks: Array<{ text: string; score: number; document_id: string; metadata?: Record<string, unknown> }> }> {
  return bbJson(`/rag/${collection}/query`, { method: "POST", body: JSON.stringify(body) }, opts);
}

export { bbJson };

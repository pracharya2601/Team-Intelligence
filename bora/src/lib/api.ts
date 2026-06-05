/**
 * Browser API client for the SPA.
 *
 * Talks to Butterbase as the SIGNED-IN END USER (JWT in localStorage) — never the service
 * key (which only lives server-side in functions). Three surfaces:
 *   - auth      → /auth/{app_id}/...           (login, oauth, me, refresh)
 *   - data/RAG  → /v1/{app_id}/{table}, /rag    (RLS-enforced reads/writes)
 *   - functions → /v1/{app_id}/fn/{name}        (all server logic: org-create, agent, etc.)
 *
 * RLS does the heavy lifting: a user only ever sees their own chats and their orgs' rows.
 */

const APP_ID = import.meta.env.VITE_BUTTERBASE_APP_ID as string;
const API_BASE = (import.meta.env.VITE_BUTTERBASE_API_BASE as string) ?? "https://api.butterbase.ai";

const TOKEN_KEY = "bora.access_token";
const REFRESH_KEY = "bora.refresh_token";

export const appUrl = `${API_BASE}/v1/${APP_ID}`;
export const authUrl = `${API_BASE}/auth/${APP_ID}`;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setTokens(access: string, refresh?: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────
export async function login(email: string, password: string) {
  const res = await fetch(`${authUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await asJson<{ access_token: string; refresh_token: string; user: any }>(res);
  setTokens(data.access_token, data.refresh_token);
  return data.user;
}

export async function signup(email: string, password: string, display_name?: string) {
  const res = await fetch(`${authUrl}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name }),
  });
  return asJson(res);
}

/** Start Google OAuth — redirects the browser; tokens come back on the callback URL. */
export function googleLogin(redirectTo: string): void {
  window.location.href = `${authUrl}/oauth/google?redirect_to=${encodeURIComponent(redirectTo)}`;
}

export async function me() {
  const res = await fetch(`${authUrl}/me`, { headers: authHeaders() });
  return asJson<{ id: string; email: string; display_name?: string; avatar_url?: string }>(res);
}

export function logout(): void {
  clearTokens();
}

// ── Data API (RLS-enforced as the user) ─────────────────────────────────────
export async function select<T = any>(table: string, query: Record<string, string | number | boolean> = {}): Promise<T[]> {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  const res = await fetch(`${appUrl}/${table}${qs ? `?${qs}` : ""}`, { headers: authHeaders() });
  return asJson<T[]>(res);
}

/**
 * Direct RAG query as the user (only works for `shared`/public collections). Org knowledge is
 * `private` and queried server-side by the chat function (membership-gated), so the app rarely
 * calls this — kept for shared/public collections. Route param is the collection NAME.
 */
export async function ragQuery(collection: string, query: string, opts: { top_k?: number; synthesize?: boolean } = {}) {
  const res = await fetch(`${appUrl}/rag/collections/${encodeURIComponent(collection)}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ query, ...opts }),
  });
  return asJson<{ answer?: string; chunks: Array<{ content: string; score: number }> }>(res);
}

/**
 * Claim any org invitations pending for the signed-in user's email (status invited → active).
 * Called once after login so a freshly-invited teammate's orgs show up immediately. Best-effort:
 * the server derives the email from the verified JWT, not anything we send.
 */
export async function claimInvites(): Promise<{ claimed: number; orgs: string[] }> {
  return callFn<{ claimed: number; orgs: string[] }>("claim-invites");
}

// ── Chat thread management (caller's own threads only; enforced server-side) ──
/** Rename one of the caller's chat threads. */
export async function renameThread(threadId: string, title: string): Promise<{ thread_id: string; title: string }> {
  return callFn("chat-threads", { thread_id: threadId, action: "rename", title });
}
/** Generate a concise AI title for a thread from its messages. */
export async function autotitleThread(threadId: string): Promise<{ thread_id: string; title: string }> {
  return callFn("chat-threads", { thread_id: threadId, action: "autotitle" });
}
/** Delete one of the caller's chat threads and its messages. */
export async function deleteThread(threadId: string): Promise<{ thread_id: string; deleted: boolean }> {
  return callFn("chat-threads", { thread_id: threadId, action: "delete" });
}

// ── Integrations (Gmail connect, as the signed-in user) ─────────────────────
export interface IntegrationConnection {
  id: string;
  toolkit_slug: string;
  status: string;
  connected_at?: string;
}

/** The signed-in user's connected integration accounts. */
export async function integrationConnections(): Promise<IntegrationConnection[]> {
  const res = await fetch(`${appUrl}/integrations/connections`, { headers: authHeaders() });
  const body = await asJson<{ connections: IntegrationConnection[] }>(res);
  return body.connections ?? [];
}

/** Start an OAuth connect for a toolkit (e.g. "gmail"); returns the URL to redirect the user to. */
export async function integrationConnect(toolkit: string, redirectUrl: string): Promise<string> {
  const res = await fetch(`${appUrl}/integrations/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ toolkit, redirectUrl }),
  });
  const body = await asJson<{ authUrl: string; connectionRequestId: string }>(res);
  return body.authUrl;
}

export async function integrationDisconnect(connectionId: string): Promise<void> {
  const res = await fetch(`${appUrl}/integrations/connections/${connectionId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) await asJson(res);
}

// ── Functions (all server logic) ─────────────────────────────────────────────
export async function callFn<T = any>(name: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${appUrl}/fn/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return asJson<T>(res);
}

// ── Realtime WS (RLS-enforced; token as query param since browsers can't set WS headers) ──
export function realtimeUrl(): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  const t = getToken();
  return `${wsBase}/v1/${APP_ID}/realtime${t ? `?token=${t}` : ""}`;
}

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

export async function ragQuery(collection: string, query: string, opts: { top_k?: number; synthesize?: boolean } = {}) {
  const res = await fetch(`${appUrl}/rag/${collection}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ query, ...opts }),
  });
  return asJson<{ answer?: string; chunks: Array<{ text: string; score: number }> }>(res);
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

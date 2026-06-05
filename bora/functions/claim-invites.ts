/**
 * Function: claim-invites  (HTTP trigger, auth: required)
 *
 * Completes the invite loop. When a user signs in, the SPA calls this once. We look up every
 * `org_members` row pending for the caller's email (status='invited', user_id=null) and flip it
 * to status='active' + user_id=<caller>. After this, the new teammate's orgs show up on Home and
 * org-scoped RLS lets them in.
 *
 * SECURITY — the email is taken from the VERIFIED identity, never the request body:
 *   - `ctx.user.email` (gateway-verified JWT claim) is the source of truth.
 *   - Fallback: decode the email claim from the same Bearer JWT (auth:required already verified it,
 *     so trusting its email claim is safe). We never accept an email from the JSON body — otherwise
 *     a caller could claim someone else's invitation.
 *
 * Writes go via the SERVICE KEY over the data API (org_members writes are RLS admin-only; the
 * caller isn't an admin yet). Same pattern as org-create / org-members. Idempotent: with no
 * pending invites it no-ops, so it's safe to call on every login.
 *
 * Env: BUTTERBASE_API_KEY (via envVars) + BUTTERBASE_API_URL/BUTTERBASE_APP_ID (injected).
 * Deploy: node scripts/deploy-fn.mjs functions/claim-invites.ts claim-invites
 */

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

  function emailFromJwt(): string {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return "";
    const parts = m[1].split(".");
    if (parts.length < 2) return "";
    try {
      const seg = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = seg.length % 4 ? "=".repeat(4 - (seg.length % 4)) : "";
      const payload = JSON.parse(atob(seg + pad));
      return String(payload.email ?? payload.user_metadata?.email ?? "");
    } catch {
      return "";
    }
  }

  const userId = ctx?.user?.id ?? req.headers.get("x-user-id");
  if (!userId) return json({ error: { message: "Not authenticated" } }, 401);
  const email = String(ctx?.user?.email ?? emailFromJwt()).trim().toLowerCase();
  if (!email) return json({ error: { message: "No email on identity" } }, 400);

  const env = ctx.env || {};
  const API = `${env.BUTTERBASE_API_URL}/v1/${env.BUTTERBASE_APP_ID}`;
  const KEY = env.BUTTERBASE_API_KEY;
  async function svc(path: string, init: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = { Authorization: `Bearer ${KEY}` };
    if (init.body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${API}${path}`, { ...init, headers });
    const t = await res.text();
    const b = t ? JSON.parse(t) : null;
    if (!res.ok) throw new Error(b?.error?.message || b?.message || `HTTP ${res.status}`);
    return b;
  }

  try {
    const pending: any[] = await svc(
      `/org_members?invited_email=eq.${encodeURIComponent(email)}&status=eq.invited`,
    );
    const orgs: string[] = [];
    for (const inv of pending) {
      // If the caller is already an active member of this org, just consume the invite row.
      const mine: any[] = await svc(`/org_members?org_id=eq.${inv.org_id}&user_id=eq.${userId}`);
      const alreadyActive = mine.some((m) => m.status === "active");
      await svc(`/org_members/${inv.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active", user_id: userId }),
      });
      if (!alreadyActive) orgs.push(inv.org_id);
    }
    return json({ claimed: orgs.length, orgs });
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

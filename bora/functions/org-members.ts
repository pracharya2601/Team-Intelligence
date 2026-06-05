/**
 * Function: org-members  (HTTP trigger, auth: required)
 *
 * Admin-only management of org_members: invite by email, change role, remove (soft-delete).
 *
 * IDENTITY + RLS NOTES (learned the hard way — keep this self-contained):
 *  - Inside an auth:required function, `ctx.db` runs AS THE USER (RLS enforced), so a direct
 *    INSERT/UPDATE into org_members is rejected by the admin-write policy. We therefore do all
 *    reads/writes via the SERVICE KEY over the data API (RLS bypassed), and enforce the
 *    "caller is an active admin of this org" invariant in code — same pattern as org-create.
 *  - Identity comes from `ctx.user.id` (gateway-verified JWT); `x-user-id` header is a fallback.
 *  - `remove` is a SOFT delete (status='removed') via PATCH: a hard DELETE from inside a function
 *    triggers a gateway 502 even though it succeeds. PATCH relays cleanly and keeps an audit trail.
 *
 * Env: BUTTERBASE_API_KEY (supplied via envVars) + BUTTERBASE_API_URL/BUTTERBASE_APP_ID (injected).
 * Deploy with: node scripts/deploy-fn.mjs functions/org-members.ts org-members
 *
 * Body (one of):
 *   { action: "invite",   org_id, email, role? "member"|"admin" }
 *   { action: "set_role", org_id, member_id, role }
 *   { action: "remove",   org_id, member_id }
 */

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

  const userId = ctx?.user?.id ?? req.headers.get("x-user-id");
  if (!userId) return json({ error: { message: "Not authenticated" } }, 401);

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

  let body: any;
  try { body = await req.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const { action, org_id } = body;
  if (!org_id) return json({ error: { message: "org_id is required" } }, 400);

  try {
    const members: any[] = await svc(`/org_members?org_id=eq.${org_id}`);
    const me = members.find((m) => m.user_id === userId);
    if (!me || me.role !== "admin" || me.status !== "active") return json({ error: { message: "Admins only" } }, 403);
    const live = members.filter((m) => m.status !== "removed");

    if (action === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const role = body.role === "admin" ? "admin" : "member";
      if (!email) return json({ error: { message: "email is required" } }, 400);
      if (live.some((m) => (m.invited_email || "").toLowerCase() === email)) {
        return json({ error: { message: "That email is already invited" } }, 409);
      }
      const member = await svc(`/org_members`, {
        method: "POST",
        body: JSON.stringify({ org_id, invited_email: email, role, status: "invited" }),
      });
      return json({ member }, 201);
    }

    if (action === "set_role") {
      const { member_id } = body;
      const role = body.role;
      if (!member_id || (role !== "admin" && role !== "member")) {
        return json({ error: { message: "member_id and role (admin|member) are required" } }, 400);
      }
      if (!members.some((m) => m.id === member_id)) return json({ error: { message: "Member not found" } }, 404);
      const member = await svc(`/org_members/${member_id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      return json({ member });
    }

    if (action === "remove") {
      const { member_id } = body;
      if (!member_id) return json({ error: { message: "member_id is required" } }, 400);
      const target = members.find((m) => m.id === member_id);
      if (!target) return json({ error: { message: "Member not found" } }, 404);
      if (target.user_id === userId) return json({ error: { message: "You can't remove yourself" } }, 400);
      const member = await svc(`/org_members/${member_id}`, { method: "PATCH", body: JSON.stringify({ status: "removed" }) });
      return json({ ok: true, member });
    }

    return json({ error: { message: `Unknown action: ${action}` } }, 400);
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

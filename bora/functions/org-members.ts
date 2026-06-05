/**
 * Function: org-members  (HTTP trigger)
 *
 * Admin-only management of org_members: invite by email, change role, remove.
 * Runs as SERVICE (RLS bypassed) and enforces the "caller is an active admin of this org"
 * invariant in code — because writes to org_members are blocked for end users by RLS
 * (only the service role / org-create can write them).
 *
 * Caller identity: gateway sets `x-user-id` from the forwarded end-user JWT.
 *
 * Body (one of):
 *   { action: "invite",   org_id, email, role? "member"|"admin" }
 *   { action: "set_role", org_id, member_id, role }
 *   { action: "remove",   org_id, member_id }
 * Returns: { member } | { ok: true }
 */

import { callerId, json } from "./_shared/bb";

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const userId = callerId(req);
  if (!userId) return json({ error: { message: "Not authenticated" } }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }

  const { action, org_id } = body;
  if (!org_id) return json({ error: { message: "org_id is required" } }, 400);

  // Authorize: caller must be an ACTIVE ADMIN of this org.
  const me = (await ctx.db.query(
    `SELECT role, status FROM org_members WHERE org_id = $1 AND user_id = $2`,
    [org_id, userId],
  )).rows[0];
  if (!me || me.role !== "admin" || me.status !== "active") {
    return json({ error: { message: "Admins only" } }, 403);
  }

  if (action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = body.role === "admin" ? "admin" : "member";
    if (!email) return json({ error: { message: "email is required" } }, 400);

    // De-dupe: already a member (by user) or already invited (by email) in this org.
    const dup = (await ctx.db.query(
      `SELECT id FROM org_members WHERE org_id = $1 AND lower(invited_email) = $2`,
      [org_id, email],
    )).rows[0];
    if (dup) return json({ error: { message: "That email is already invited" } }, 409);

    const member = (await ctx.db.query(
      `INSERT INTO org_members (org_id, invited_email, role, status)
       VALUES ($1, $2, $3, 'invited') RETURNING *`,
      [org_id, email, role],
    )).rows[0];
    return json({ member }, 201);
  }

  if (action === "set_role") {
    const { member_id } = body;
    const role = body.role;
    if (!member_id || (role !== "admin" && role !== "member")) {
      return json({ error: { message: "member_id and role (admin|member) are required" } }, 400);
    }
    const member = (await ctx.db.query(
      `UPDATE org_members SET role = $1 WHERE id = $2 AND org_id = $3 RETURNING *`,
      [role, member_id, org_id],
    )).rows[0];
    if (!member) return json({ error: { message: "Member not found" } }, 404);
    return json({ member });
  }

  if (action === "remove") {
    const { member_id } = body;
    if (!member_id) return json({ error: { message: "member_id is required" } }, 400);
    const target = (await ctx.db.query(
      `SELECT user_id FROM org_members WHERE id = $1 AND org_id = $2`,
      [member_id, org_id],
    )).rows[0];
    if (!target) return json({ error: { message: "Member not found" } }, 404);
    if (target.user_id === userId) {
      return json({ error: { message: "You can't remove yourself" } }, 400);
    }
    await ctx.db.query(`DELETE FROM org_members WHERE id = $1 AND org_id = $2`, [member_id, org_id]);
    return json({ ok: true });
  }

  return json({ error: { message: `Unknown action: ${action}` } }, 400);
}

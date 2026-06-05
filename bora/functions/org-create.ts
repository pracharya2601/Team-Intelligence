/**
 * Function: org-create  (HTTP trigger)
 *
 * Bootstraps a new organization. Runs as SERVICE (RLS bypassed) on purpose: the very first
 * org_members row (the creator as admin) can't be written under the admin-write RLS policy
 * because no admin exists yet — so creation must happen server-side with invariants enforced
 * here, not by client RLS.
 *
 * Steps (atomic-ish; best-effort on the external side effects):
 *   1. org row
 *   2. creator → org_members (role=admin, status=active, user_id=caller)
 *   3. default bot ("Bora")
 *   4. per-org Butterbase RAG shared collection
 *   5. per-org Xtrace shared memory group
 *
 * Caller identity: the gateway sets `x-user-id` from the forwarded end-user JWT. We require it.
 *
 * Body: { name: string }
 * Returns: { org, member, bot }
 */

import { callerId, json, orgCollection, type FnEnv } from "./_shared/bb";
import { ensureOrgGroup, type XtraceEnv } from "./_shared/memory";

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const userId = callerId(req);
  if (!userId) return json({ error: { message: "Not authenticated" } }, 401);

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }
  const name = (body.name ?? "").trim();
  if (!name) return json({ error: { message: "Organization name is required" } }, 400);

  const env: FnEnv & XtraceEnv = ctx.env;

  // 1 + 2 + 3: DB writes as service role (RLS bypassed).
  const org = (await ctx.db.query(
    `INSERT INTO organizations (name, created_by) VALUES ($1, $2) RETURNING *`,
    [name, userId],
  )).rows[0];

  const member = (await ctx.db.query(
    `INSERT INTO org_members (org_id, user_id, role, status) VALUES ($1, $2, 'admin', 'active') RETURNING *`,
    [org.id, userId],
  )).rows[0];

  const bot = (await ctx.db.query(
    `INSERT INTO bots (org_id, name) VALUES ($1, 'Bora') RETURNING *`,
    [org.id],
  )).rows[0];

  // 4: per-org RAG collection (shared = all org members can query). Best-effort.
  try {
    await fetch(`${env.BUTTERBASE_API_URL}/v1/${env.BUTTERBASE_APP_ID}/rag/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BUTTERBASE_API_KEY}` },
      body: JSON.stringify({ name: orgCollection(org.id), access_mode: "shared" }),
    });
  } catch (e) {
    console.warn("RAG collection create failed (continuing):", e);
  }

  // 5: per-org Xtrace shared memory group. Best-effort.
  try {
    await ensureOrgGroup(env, org.id, name);
  } catch (e) {
    console.warn("Xtrace group create failed (continuing):", e);
  }

  return json({ org, member, bot }, 201);
}

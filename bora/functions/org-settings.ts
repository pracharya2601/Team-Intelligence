/**
 * Function: org-settings  (HTTP trigger, auth: required)
 *
 * Admin-only org configuration: rename the org, and set Bora's name + persona (the bots row).
 * The persona shapes how the bot speaks in meetings (Track A) and in chat. Org-table writes are
 * RLS admin-only, so we do them with the service key after an active-admin check (same pattern as
 * org-members / ingest-source). Reads of org + bot happen client-side via RLS-scoped select.
 *
 * Identity: ctx.user.id (x-user-id fallback). Env: BUTTERBASE_API_KEY + URL/APP_ID injected.
 * Deploy: node scripts/deploy-fn.mjs functions/org-settings.ts org-settings
 *
 * Body:
 *   { action:"update_org", org_id, name }
 *   { action:"update_bot", org_id, name?, persona? }
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
  const one = (x: any) => (Array.isArray(x) ? x[0] : x);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const { action, org_id } = body;
  if (!org_id) return json({ error: { message: "org_id is required" } }, 400);

  try {
    // Caller must be an active ADMIN of the org.
    const members: any[] = await svc(`/org_members?org_id=eq.${org_id}&user_id=eq.${userId}`);
    const me = members.find((m) => m.status === "active");
    if (!me || me.role !== "admin") return json({ error: { message: "Admins only" } }, 403);

    if (action === "update_org") {
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: { message: "name is required" } }, 400);
      const org = one(await svc(`/organizations/${org_id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
      return json({ organization: org });
    }

    if (action === "update_bot") {
      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string") patch.name = body.name.trim() || "Bora";
      if (typeof body.persona === "string") patch.persona = body.persona.trim() || null;
      if (Object.keys(patch).length === 0) return json({ error: { message: "Provide name and/or persona" } }, 400);

      const bots: any[] = await svc(`/bots?org_id=eq.${org_id}`);
      let bot = bots[0];
      // org-create normally makes the bot; create one if it's somehow missing.
      if (!bot) {
        bot = one(await svc(`/bots`, { method: "POST", body: JSON.stringify({ org_id, name: patch.name ?? "Bora", persona: patch.persona ?? null }) }));
        return json({ bot }, 201);
      }
      const updated = one(await svc(`/bots/${bot.id}`, { method: "PATCH", body: JSON.stringify(patch) }));
      return json({ bot: updated });
    }

    return json({ error: { message: `Unknown action: ${action}` } }, 400);
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

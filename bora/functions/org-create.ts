// Function: org-create  (HTTP trigger, auth: required)
//
// Bootstraps a new organization. Identity comes from ctx.user (the signed-in caller).
// The privileged writes go through the data API with the SERVICE key (RLS bypassed) —
// because seating the FIRST org_members row (creator as admin) and inserting the org can't
// pass user-role RLS from a cold start (no admin exists yet, and a function invoked with an
// end-user JWT runs as butterbase_user with RLS ENFORCED).
//
// Deploy with envVars: { BORA_SERVICE_KEY: "bb_sk_..." }.  (BUTTERBASE_API_URL / BUTTERBASE_APP_ID
// are auto-injected by the runtime.)
//
// Body: { name: string }   Returns: { org, member, bot }
//
// NOTE: This is the VERIFIED version currently live on app_91v2kzy0pe03 (Track B owns this file;
// PR'd so the owner can review). Per-org RAG collection + Xtrace group are created lazily in
// Phase 4 when first used, to avoid blocking org creation on external services.
export async function handler(req, ctx) {
  if (!ctx.user || !ctx.user.id) return json({ error: { message: "Not authenticated" } }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }
  const name = (body && body.name ? String(body.name) : "").trim();
  if (!name) return json({ error: { message: "Organization name is required" } }, 400);

  const userId = ctx.user.id;
  const API = ctx.env.BUTTERBASE_API_URL; // auto-injected
  const APP = ctx.env.BUTTERBASE_APP_ID; // auto-injected
  const KEY = ctx.env.BORA_SERVICE_KEY; // supplied via envVars (bb_sk)
  if (!KEY) return json({ error: { message: "Server misconfigured: BORA_SERVICE_KEY not set" } }, 500);

  const svc = (path, payload) =>
    fetch(`${API}/v1/${APP}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(payload),
    }).then(async (r) => {
      const t = await r.text();
      const j = t ? JSON.parse(t) : null;
      if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
      return j;
    });

  try {
    const org = await svc("organizations", { name, created_by: userId });
    const orgRow = Array.isArray(org) ? org[0] : org;
    const member = await svc("org_members", { org_id: orgRow.id, user_id: userId, role: "admin", status: "active" });
    const bot = await svc("bots", { org_id: orgRow.id, name: "Bora" });
    return json({ org: orgRow, member, bot }, 201);
  } catch (e) {
    return json({ error: { message: String((e && e.message) || e) } }, 500);
  }
}

function json(b, status) {
  return new Response(JSON.stringify(b), { status: status || 200, headers: { "Content-Type": "application/json" } });
}

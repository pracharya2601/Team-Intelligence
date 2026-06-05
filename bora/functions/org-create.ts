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
  // Either env name carries the bb_sk service key: BORA_SERVICE_KEY (original deploy) or
  // BUTTERBASE_API_KEY (injected by scripts/deploy-fn.mjs). Same key — accept whichever is set.
  const KEY = ctx.env.BORA_SERVICE_KEY || ctx.env.BUTTERBASE_API_KEY;
  if (!KEY) return json({ error: { message: "Server misconfigured: service key not set" } }, 500);

  // Creator's email from the VERIFIED identity (JWT claim), never the body. Stored on their admin
  // member row as invited_email so post-meeting recap emails (recap-email / daily-recap) can reach
  // the creator — org-create is the only path that seats a member without an invite, so it's the
  // one place that must fill this in. Empty string if absent (older tokens) → column stays null.
  const creatorEmail = String((ctx.user && ctx.user.email) || emailFromJwt(req)).trim().toLowerCase();

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
    const memberRow = { org_id: orgRow.id, user_id: userId, role: "admin", status: "active" };
    if (creatorEmail && creatorEmail.includes("@")) memberRow.invited_email = creatorEmail;
    const member = await svc("org_members", memberRow);
    const bot = await svc("bots", { org_id: orgRow.id, name: "Bora" });
    return json({ org: orgRow, member, bot }, 201);
  } catch (e) {
    return json({ error: { message: String((e && e.message) || e) } }, 500);
  }
}

function json(b, status) {
  return new Response(JSON.stringify(b), { status: status || 200, headers: { "Content-Type": "application/json" } });
}

// Decode the email claim from the verified Bearer JWT (auth:required already verified the token,
// so trusting its claims is safe). Same approach as claim-invites — never read email from the body.
function emailFromJwt(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return "";
  const parts = m[1].split(".");
  if (parts.length < 2) return "";
  try {
    const seg = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = seg.length % 4 ? "=".repeat(4 - (seg.length % 4)) : "";
    const payload = JSON.parse(atob(seg + pad));
    return String(payload.email || (payload.user_metadata && payload.user_metadata.email) || "");
  } catch {
    return "";
  }
}

/**
 * Function: integration-connect  (HTTP trigger, auth: required)
 *
 * Starts a Composio OAuth connect for the CALLER, enforcing Bora's connect policy:
 *   - gmail  → any ACTIVE MEMBER of the org may connect (recaps can send from any member's Gmail)
 *   - github → ADMIN only (feeds org-level knowledge ingestion)
 *   - slack  → ADMIN only (maps the org's Slack workspace)
 *
 * The browser routes here instead of calling the platform /integrations/connect directly, so the
 * role check actually runs server-side. We initiate the connect with the SERVICE key but bind it to
 * the caller (`userId: caller`) — the platform connect accepts a userId, so the resulting OAuth
 * attaches to the caller's own integration account, never the service account.
 *
 * NOTE: this gates the app's own connect path. The platform endpoint is still reachable with a raw
 * user JWT, so the gate is app-level, not bypass-proof (documented; acceptable for org-internal use).
 *
 * Identity: `ctx.user.id` (gateway-verified JWT), `x-user-id` header as fallback.
 * Env: BUTTERBASE_API_KEY (via envVars) + BUTTERBASE_API_URL/BUTTERBASE_APP_ID (injected).
 * Deploy: node scripts/deploy-fn.mjs functions/integration-connect.ts integration-connect
 *
 * Body: { org_id, toolkit: "gmail"|"github"|"slack", redirectUrl }
 * Returns: { authUrl, connectionRequestId }
 */

// Minimum role required to connect each toolkit. "member" = any active member; "admin" = active admin.
const CONNECT_POLICY: Record<string, "member" | "admin"> = {
  gmail: "member",
  github: "admin",
  slack: "admin",
};

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
  const org_id = body.org_id;
  const toolkit = String(body.toolkit ?? "").trim().toLowerCase();
  const redirectUrl = String(body.redirectUrl ?? "").trim();
  if (!org_id) return json({ error: { message: "org_id is required" } }, 400);
  if (!redirectUrl) return json({ error: { message: "redirectUrl is required" } }, 400);
  const required = CONNECT_POLICY[toolkit];
  if (!required) return json({ error: { message: `Unsupported toolkit "${toolkit}"` } }, 400);

  try {
    // The caller must be an active member; github/slack additionally require an active admin.
    const mem: any[] = await svc(`/org_members?org_id=eq.${org_id}&user_id=eq.${userId}`);
    const active = mem.filter((m) => m.status === "active");
    if (active.length === 0) return json({ error: { message: "Not a member of this organization" } }, 403);
    if (required === "admin" && !active.some((m) => m.role === "admin")) {
      return json({ error: { message: `Only an admin can connect ${toolkit}` } }, 403);
    }

    // Slack is a Photon Spectrum integration in Bora (7-vendor rule — NOT Composio Slack). The
    // admin-only gate above still applies; the actual connection lands once Photon is wired up.
    if (toolkit === "slack") {
      return json({ error: { message: "Slack connects via Photon Spectrum — not configured yet" } }, 501);
    }

    // gmail / github → Composio OAuth, bound to the caller's own integration account.
    const out = await svc(`/integrations/connect`, {
      method: "POST",
      body: JSON.stringify({ toolkit, redirectUrl, userId }),
    });
    return json({ authUrl: out?.authUrl, connectionRequestId: out?.connectionRequestId });
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

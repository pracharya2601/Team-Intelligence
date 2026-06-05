/**
 * Function: recap-email  (HTTP trigger, auth: required)
 *
 * Emails org admins a post-meeting recap (summary · decisions · action items · risks + a link).
 * Designed to be called by Track A's meeting-end handler with the service key, or directly.
 *
 * Sends through the Butterbase Gmail integration: POST /integrations/execute with
 * tool GMAIL_SEND_EMAIL, on behalf of a connected admin's Gmail account (an admin connects Gmail
 * once in Settings). If no Gmail is connected, this is a GRACEFUL no-op ({ sent:false, reason })
 * so a missing connection never fails the meeting-end flow.
 *
 * Env: BUTTERBASE_API_KEY + URL/APP_ID injected. Deploy:
 *   node scripts/deploy-fn.mjs functions/recap-email.ts recap-email
 *
 * Body: { org_id, meeting_id, to?: string[], app_base_url?: string }
 *   to?          explicit recipient list (else derived from org admins' emails)
 *   app_base_url base for the recap link (else omitted)
 * Returns: { sent, reason?, recipients, data? }
 */

export default async function handler(req: Request, ctx: any): Promise<Response> {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

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
  const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const list = (arr: any): string[] => (Array.isArray(arr) ? arr.map((x) => String(x)) : []);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: { message: "Invalid JSON body" } }, 400); }
  const { org_id, meeting_id } = body;
  if (!org_id || !meeting_id) return json({ error: { message: "org_id and meeting_id are required" } }, 400);

  try {
    // If a user invoked this (not a service/cron call), require they belong to the org — so a
    // signed-in user can't trigger recaps to arbitrary orgs. Service-role calls (ctx.user null,
    // e.g. the meeting-end webhook or a cron) are allowed through.
    const callerId = ctx?.user?.id;
    if (callerId) {
      const mem: any[] = await svc(`/org_members?org_id=eq.${org_id}&user_id=eq.${callerId}`);
      if (!mem.some((m) => m.status === "active")) return json({ error: { message: "Not a member of this organization" } }, 403);
    }

    const meeting = (await svc(`/meetings?id=eq.${meeting_id}`))[0];
    if (!meeting || meeting.org_id !== org_id) return json({ error: { message: "Meeting not found" } }, 404);
    const artifacts = (await svc(`/meeting_artifacts?meeting_id=eq.${meeting_id}`))[0] ?? null;
    const notes = artifacts?.ai_notes ?? {};

    // Recipients: explicit `to`, else org admins' emails (invited_email captures the login email).
    let recipients: string[] = Array.isArray(body.to) ? body.to.map((x: any) => String(x)) : [];
    if (recipients.length === 0) {
      const members: any[] = await svc(`/org_members?org_id=eq.${org_id}`);
      recipients = members
        .filter((m) => m.role === "admin" && m.status === "active" && m.invited_email)
        .map((m) => String(m.invited_email));
    }
    recipients = [...new Set(recipients.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
    if (recipients.length === 0) return json({ sent: false, reason: "no recipient emails", recipients });

    // Sender: a connected Gmail account (prefer an admin of this org).
    const conns: any[] = (await svc(`/integrations/connections`)).connections ?? [];
    const gmail = conns.filter((c) => c.toolkit_slug === "gmail" && (c.status === "active" || c.status === "ACTIVE"));
    if (gmail.length === 0) {
      return json({ sent: false, reason: "no Gmail connected — an admin can connect Gmail in Settings", recipients });
    }
    const sender = gmail[0];

    // Build the email.
    const title = meeting.platform ? `${meeting.platform} meeting` : "meeting";
    const link = body.app_base_url ? `${String(body.app_base_url).replace(/\/$/, "")}/org/${org_id}/meetings/${meeting_id}` : "";
    const section = (h: string, items: string[]) =>
      items.length ? `<h3>${esc(h)}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
    const summary = notes.summary ? `<p>${esc(String(notes.summary))}</p>` : "<p>No summary available.</p>";
    const html =
      `<div style="font-family:system-ui,sans-serif;max-width:640px">` +
      `<h2>Recap — ${esc(title)}</h2>` +
      summary +
      section("Decisions", list(notes.decisions)) +
      section("Action items", list(notes.action_items ?? notes.actions)) +
      section("Risks", list(notes.risks)) +
      (link ? `<p><a href="${esc(link)}">View the full recap →</a></p>` : "") +
      `<hr><p style="color:#888;font-size:12px">Sent by Bora.</p></div>`;

    const result = await svc(`/integrations/execute`, {
      method: "POST",
      body: JSON.stringify({
        toolName: "GMAIL_SEND_EMAIL",
        userId: sender.app_user_id,
        params: {
          recipient_email: recipients[0],
          extra_recipients: recipients.slice(1),
          subject: `Recap: ${title}`,
          body: html,
          is_html: true,
        },
      }),
    });

    return json({ sent: !!result?.successful, recipients, data: result?.data, error: result?.error });
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

/**
 * Function: daily-recap  (CRON trigger — runs as butterbase_service, ctx.user === null)
 *
 * Once a day, email each org's admins a single digest of the meetings that completed in the
 * trailing window (default 24h): per meeting a summary + decisions + action items, with a link.
 * One email per org, sent from a connected Gmail account (Butterbase Gmail integration).
 *
 * This is the batch sibling of `recap-email` (which sends ONE meeting's recap right when it ends).
 * Both gracefully no-op when no Gmail is connected — a missing connection never errors the cron.
 *
 * Deploy (cron, daily 16:00 UTC):
 *   node scripts/deploy-fn.mjs functions/daily-recap.ts daily-recap cron "0 16 * * *"
 *
 * Manual run / verification (service-role control-plane invoke):
 *   POST /v1/{app}/functions/daily-recap/invoke   body optional:
 *     { org_id?, since_hours?=24, app_base_url?, dry_run?=false, to?: string[] }
 *   dry_run (or no Gmail connected) assembles the digest without sending.
 *   to?  overrides the derived admin recipients (ops/testing) — applied to every org in scope.
 *
 * Env: BUTTERBASE_API_KEY + URL/APP_ID injected by deploy-fn.mjs.
 * Returns: { window_hours, orgs: [{ org_id, name, meetings, recipients, sent, reason?, subject }] }
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
  const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const list = (arr: any): string[] => (Array.isArray(arr) ? arr.map((x) => String(x)) : []);

  // Cron passes no body; manual invoke may pass options. Never throw on a missing/empty body.
  let opts: any = {};
  try { opts = (await req.json()) || {}; } catch { opts = {}; }
  const sinceHours = Number.isFinite(+opts.since_hours) && +opts.since_hours > 0 ? +opts.since_hours : 24;
  const dryRun = !!opts.dry_run;
  const onlyOrg: string | null = opts.org_id ? String(opts.org_id) : null;
  const toOverride: string[] | null = Array.isArray(opts.to)
    ? [...new Set(opts.to.map((x: any) => String(x).trim().toLowerCase()).filter((e: string) => e.includes("@")))]
    : null;
  const appBase = opts.app_base_url ? String(opts.app_base_url).replace(/\/$/, "") : (env.APP_BASE_URL || "").replace(/\/$/, "");

  try {
    const cutoffIso = new Date(Date.now() - sinceHours * 3600_000).toISOString();

    // Completed meetings that ended within the window. (Service role → all orgs.)
    let mq = `/meetings?status=eq.done&ended_at=gte.${encodeURIComponent(cutoffIso)}`;
    if (onlyOrg) mq += `&org_id=eq.${onlyOrg}`;
    const meetings: any[] = (await svc(mq)) || [];

    if (meetings.length === 0) {
      return json({ window_hours: sinceHours, dry_run: dryRun, orgs: [], note: "no completed meetings in window" });
    }

    // One connected Gmail account is the sender for every org's digest (matches recap-email).
    const conns: any[] = (await svc(`/integrations/connections`)).connections ?? [];
    const gmail = conns.filter((c) => c.toolkit_slug === "gmail" && /active/i.test(c.status));
    const sender = gmail[0] ?? null;

    // Group meetings by org, then assemble + send one digest per org.
    const byOrg = new Map<string, any[]>();
    for (const m of meetings) {
      if (!byOrg.has(m.org_id)) byOrg.set(m.org_id, []);
      byOrg.get(m.org_id)!.push(m);
    }

    const results: any[] = [];
    for (const [orgId, mtgs] of byOrg) {
      const org = (await svc(`/organizations?id=eq.${orgId}`))[0] ?? null;
      const orgName = org?.name ?? "your team";

      // Recipients: explicit `to` override (ops/testing), else active admins' login emails.
      const members: any[] = (await svc(`/org_members?org_id=eq.${orgId}`)) || [];
      const recipients = toOverride ?? [...new Set(
        members
          .filter((m) => m.role === "admin" && m.status === "active" && m.invited_email)
          .map((m) => String(m.invited_email).trim().toLowerCase())
          .filter((e) => e.includes("@")),
      )];

      // Pull notes for each meeting and render a section.
      const blocks: string[] = [];
      for (const m of mtgs.sort((a, b) => String(a.ended_at).localeCompare(String(b.ended_at)))) {
        const art = (await svc(`/meeting_artifacts?meeting_id=eq.${m.id}`))[0] ?? null;
        const notes: any = art?.ai_notes ?? {};
        const heading = `${m.platform ? m.platform + " meeting" : "Meeting"}${m.ended_at ? " — " + new Date(m.ended_at).toUTCString() : ""}`;
        const link = appBase ? `${appBase}/org/${orgId}/meetings/${m.id}` : "";
        const section = (h: string, items: string[]) =>
          items.length ? `<p style="margin:6px 0 2px"><strong>${esc(h)}</strong></p><ul style="margin:0 0 8px">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
        blocks.push(
          `<div style="padding:12px 0;border-top:1px solid #eee">` +
            `<h3 style="margin:0 0 4px">${esc(heading)}</h3>` +
            (notes.summary ? `<p style="margin:2px 0">${esc(notes.summary)}</p>` : `<p style="margin:2px 0;color:#888">No summary captured.</p>`) +
            section("Decisions", list(notes.decisions)) +
            section("Action items", list(notes.action_items ?? notes.actions)) +
            section("Risks", list(notes.risks)) +
            (link ? `<p style="margin:4px 0"><a href="${esc(link)}">View recap →</a></p>` : "") +
          `</div>`,
        );
      }

      const subject = `Daily recap — ${orgName} · ${mtgs.length} meeting${mtgs.length === 1 ? "" : "s"}`;
      const html =
        `<div style="font-family:system-ui,sans-serif;max-width:640px">` +
        `<h2 style="margin:0 0 4px">${esc(subject)}</h2>` +
        `<p style="color:#888;margin:0 0 8px">Meetings completed in the last ${sinceHours}h.</p>` +
        blocks.join("") +
        `<hr><p style="color:#888;font-size:12px">Sent by Bora.</p></div>`;

      const base = { org_id: orgId, name: orgName, meetings: mtgs.length, recipients: recipients.length, subject };

      if (recipients.length === 0) { results.push({ ...base, sent: false, reason: "no admin recipient emails" }); continue; }
      if (dryRun) { results.push({ ...base, sent: false, reason: "dry_run", html }); continue; }
      if (!sender) { results.push({ ...base, sent: false, reason: "no Gmail connected" }); continue; }

      try {
        const r = await svc(`/integrations/execute`, {
          method: "POST",
          body: JSON.stringify({
            toolName: "GMAIL_SEND_EMAIL",
            userId: sender.app_user_id,
            params: { recipient_email: recipients[0], extra_recipients: recipients.slice(1), subject, body: html, is_html: true },
          }),
        });
        results.push({ ...base, sent: !!r?.successful, reason: r?.successful ? undefined : (r?.error || "send failed") });
      } catch (e: any) {
        results.push({ ...base, sent: false, reason: e?.message ?? "send error" });
      }
    }

    return json({ window_hours: sinceHours, dry_run: dryRun, orgs: results });
  } catch (e: any) {
    return json({ error: { message: e?.message ?? "Server error" } }, 500);
  }
}

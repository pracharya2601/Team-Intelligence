import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { callFn, select } from "../lib/api";
import { OrgLayout } from "../components/OrgLayout";
import type { Meeting, Organization } from "../../shared/types";

/**
 * Meetings (org-scoped, route /org/:id/meetings). Uses the shared OrgLayout sidebar.
 * An admin pastes a Meet/Zoom/Teams URL and Bora joins (via the meeting-create function → Recall).
 * Lists the org's meetings (RLS-scoped to active members). Each row links to the recap.
 *
 * Calling the bot is admin-only — enforced in the function + RLS; here we surface the error.
 */
export function MeetingsPage() {
  const { id: orgId = "" } = useParams();
  const [org, setOrg] = useState<Organization | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [orgs, ms] = await Promise.all([
        select<Organization>("organizations", { id: `eq.${orgId}` }),
        select<Meeting>("meetings", { org_id: `eq.${orgId}`, order: "created_at.desc" }),
      ]);
      setOrg(orgs[0] ?? null);
      setMeetings(ms);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load meetings");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function callBot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await callFn("meeting-create", { orgId, meetingUrl: url.trim() });
      setUrl("");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to call the bot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrgLayout orgId={orgId} orgName={org?.name} title="Meetings">
      <form className="panel col" onSubmit={callBot}>
        <h3 style={{ margin: 0 }}>Call Bora into a meeting</h3>
        <div className="muted">Paste a Google Meet, Zoom, or Teams link. Admins only.</div>
        <div className="row">
          <input
            placeholder="https://meet.google.com/abc-defg-hij"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={busy || !orgId || !url.trim()}>{busy ? "Joining…" : "Send Bora"}</button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="panel col">
        <h3 style={{ margin: 0 }}>Recent meetings</h3>
        {meetings.length === 0 && <div className="muted">No meetings yet.</div>}
        {meetings.map((m) => (
          <Link
            key={m.id}
            to={`/org/${orgId}/meetings/${m.id}`}
            className="row"
            style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 12, color: "var(--text)" }}
          >
            <div className="col" style={{ gap: 2 }}>
              <span>{m.platform ?? "meeting"} · <StatusBadge status={m.status} /></span>
              <span className="muted" style={{ fontSize: 12, wordBreak: "break-all" }}>{m.meeting_url}</span>
            </div>
            <span className="muted">{new Date(m.created_at).toLocaleString()}</span>
          </Link>
        ))}
      </div>
    </OrgLayout>
  );
}

function StatusBadge({ status }: { status: Meeting["status"] }) {
  const color =
    status === "live" ? "#5cd6a0" : status === "done" ? "var(--muted)" : status === "error" ? "var(--danger)" : "var(--accent)";
  return <span style={{ color, fontWeight: 600 }}>{status}</span>;
}

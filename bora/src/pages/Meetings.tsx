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
interface VoiceOption {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string | null;
}

export function MeetingsPage() {
  const { id: orgId = "" } = useParams();
  const [org, setOrg] = useState<Organization | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Bora's voice (per-org). Loaded from ElevenLabs via the speak-voice function.
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voiceSaved, setVoiceSaved] = useState(false);

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

  async function loadVoices() {
    try {
      const res = await callFn<{ voices: VoiceOption[]; current: string | null }>("speak-voice", { action: "list", orgId });
      setVoices(res.voices ?? []);
      setVoiceId(res.current ?? "");
    } catch {
      /* voice picker is optional; if speak-voice isn't deployed yet, just hide it */
    }
  }

  async function saveVoice(next: string) {
    setVoiceId(next);
    setVoiceSaved(false);
    try {
      await callFn("speak-voice", { action: "set", orgId, voiceId: next });
      setVoiceSaved(true);
      setTimeout(() => setVoiceSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Failed to set voice");
    }
  }

  function previewVoice() {
    const v = voices.find((x) => x.voice_id === voiceId);
    if (v?.preview_url) void new Audio(v.preview_url).play().catch(() => {});
  }

  useEffect(() => {
    void load();
    void loadVoices();
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
    <OrgLayout
      orgId={orgId}
      orgName={org?.name}
      title="Meetings"
      subtitle="Send Bora to a call, then review the recap"
    >
      <form className="card col" onSubmit={callBot}>
        <div className="col" style={{ gap: 2 }}>
          <h3 style={{ margin: 0 }}>Call Bora into a meeting</h3>
          <span className="muted text-sm">Paste a Google Meet, Zoom, or Teams link. Admins only.</span>
        </div>
        <div className="row">
          <input
            className="grow"
            placeholder="https://meet.google.com/abc-defg-hij"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button type="submit" disabled={busy || !orgId || !url.trim()}>
            {busy && <span className="spinner" />}
            {busy ? "Joining…" : "Send Bora"}
          </button>
        </div>
        {error && <div className="notice error">{error}</div>}
      </form>

      {voices.length > 0 && (
        <section className="card col">
          <h3 style={{ margin: 0 }}>Bora's voice</h3>
          <div className="muted">The voice Bora speaks with in meetings (ElevenLabs). Admins only.</div>
          <div className="row">
            <select value={voiceId} onChange={(e) => saveVoice(e.target.value)} style={{ flex: 1 }}>
              <option value="">Default (River)</option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                  {v.labels?.gender ? ` · ${v.labels.gender}` : ""}
                  {v.labels?.accent ? ` · ${v.labels.accent}` : ""}
                </option>
              ))}
            </select>
            <button type="button" className="secondary" onClick={previewVoice} disabled={!voiceId}>▶ Preview</button>
          </div>
          {voiceSaved && <div className="muted" style={{ color: "#5cd6a0" }}>Saved ✓</div>}
        </section>
      )}

      <section className="card col">

        <h3 style={{ margin: 0 }}>Recent meetings</h3>
        {meetings.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">🎥</span>
            <span>No meetings yet</span>
            <span className="text-sm">Paste a link above to send Bora to its first call.</span>
          </div>
        ) : (
          <div className="list">
          {meetings.map((m) => (
            <Link
              key={m.id}
              to={`/org/${orgId}/meetings/${m.id}`}
              className="list-row"
              style={{ color: "var(--text)" }}
            >
              <div className="col" style={{ gap: 4, minWidth: 0 }}>
                <span className="row" style={{ gap: 8 }}>
                  <span style={{ textTransform: "capitalize" }}>{m.platform ?? "meeting"}</span>
                  <StatusBadge status={m.status} />
                </span>
                <span className="muted text-xs" style={{ wordBreak: "break-all" }}>{m.meeting_url}</span>
              </div>
              <span className="muted text-sm">{new Date(m.created_at).toLocaleString()}</span>
            </Link>
          ))}
          </div>
        )}
      </section>
    </OrgLayout>
  );
}

function StatusBadge({ status }: { status: Meeting["status"] }) {
  const cls =
    status === "live" ? "badge-active" : status === "error" ? "badge-error" : status === "done" ? "badge-member" : "badge-admin";
  return <span className={`badge ${cls}`}><i className="dot" />{status}</span>;
}

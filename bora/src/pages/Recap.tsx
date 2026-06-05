import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { select } from "../lib/api";
import { OrgLayout } from "../components/OrgLayout";
import type { MeetingArtifacts, Organization, TranscriptSegment } from "../../shared/types";

/**
 * Recap: the post-meeting page — embedded video + AI notes + full transcript.
 * Auth-gated to the org by RLS (we read meeting_artifacts / transcript_segments as the user).
 * A signed-public mode (by recap_token) is a Phase 6 add; for now it's the in-app, RLS-scoped view.
 *
 * Route: /org/:id/meetings/:meetingId.
 */
type AiNotes = {
  summary?: string;
  decisions?: string[];
  action_items?: Array<{ owner?: string; task?: string }>;
  risks?: string[];
};

export function RecapPage() {
  const { id: orgId = "", meetingId: id } = useParams<{ id: string; meetingId: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [artifacts, setArtifacts] = useState<MeetingArtifacts | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const [orgs, arts, segs] = await Promise.all([
          select<Organization>("organizations", { id: `eq.${orgId}` }),
          select<MeetingArtifacts>("meeting_artifacts", { meeting_id: `eq.${id}` }),
          select<TranscriptSegment>("transcript_segments", { meeting_id: `eq.${id}`, is_final: "is.true", order: "ts_start.asc" }),
        ]);
        setOrg(orgs[0] ?? null);
        setArtifacts(arts[0] ?? null);
        setSegments(segs);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load recap");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, orgId]);

  const notes = (artifacts?.ai_notes ?? null) as AiNotes | null;

  return (
    <OrgLayout
      orgId={orgId}
      orgName={org?.name}
      title="Meeting recap"
      actions={<Link to={`/org/${orgId}/meetings`} className="muted">← Meetings</Link>}
    >
      {loading && <div className="muted">Loading…</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !artifacts && <div className="muted">No recap yet — it appears after the meeting ends.</div>}

      {artifacts?.video_url && (
        <div className="panel">
          <video src={artifacts.video_url} controls style={{ width: "100%", borderRadius: 8 }} />
        </div>
      )}

      {artifacts?.audio_url && (
        <div className="panel col">
          <h3 style={{ margin: 0 }}>Audio</h3>
          <audio src={artifacts.audio_url} controls style={{ width: "100%" }} />
        </div>
      )}

      {notes && (
        <div className="panel col">
          <h3 style={{ margin: 0 }}>AI notes</h3>
          {notes.summary && <p style={{ margin: 0 }}>{notes.summary}</p>}
          {notes.decisions?.length ? (
            <Section title="Decisions" items={notes.decisions} />
          ) : null}
          {notes.action_items?.length ? (
            <div className="col" style={{ gap: 4 }}>
              <strong>Action items</strong>
              {notes.action_items.map((a, i) => (
                <div key={i} className="muted">• {a.owner ? `${a.owner}: ` : ""}{a.task}</div>
              ))}
            </div>
          ) : null}
          {notes.risks?.length ? <Section title="Risks" items={notes.risks} /> : null}
        </div>
      )}

      {segments.length > 0 && (
        <div className="panel col">
          <h3 style={{ margin: 0 }}>Transcript</h3>
          {segments.map((s) => (
            <div key={s.id}>
              {s.speaker && <strong>{s.speaker}: </strong>}
              <span className="muted">{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </OrgLayout>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <strong>{title}</strong>
      {items.map((it, i) => <div key={i} className="muted">• {it}</div>)}
    </div>
  );
}

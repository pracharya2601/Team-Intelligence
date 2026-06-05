import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { select } from "../lib/api";
import type { MeetingArtifacts, TranscriptSegment } from "../../shared/types";

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
  const { id: orgId, meetingId: id } = useParams<{ id: string; meetingId: string }>();
  const [artifacts, setArtifacts] = useState<MeetingArtifacts | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const [arts, segs] = await Promise.all([
          select<MeetingArtifacts>("meeting_artifacts", { meeting_id: id }),
          select<TranscriptSegment>("transcript_segments", { meeting_id: id, is_final: true, order: "ts_start.asc" }),
        ]);
        setArtifacts(arts[0] ?? null);
        setSegments(segs);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load recap");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const notes = (artifacts?.ai_notes ?? null) as AiNotes | null;

  return (
    <div className="container col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="brand" style={{ fontSize: 24 }}>Meeting recap</div>
        <Link to={`/org/${orgId}/meetings`} className="muted">← Meetings</Link>
      </div>

      {loading && <div className="muted">Loading…</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !artifacts && <div className="muted">No recap yet — it appears after the meeting ends.</div>}

      {artifacts?.video_url && (
        <div className="panel">
          <video src={artifacts.video_url} controls style={{ width: "100%", borderRadius: 8 }} />
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
    </div>
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

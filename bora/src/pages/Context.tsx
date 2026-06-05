import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { callFn, select } from "../lib/api";
import { useAuth } from "../lib/auth";
import { OrgLayout } from "../components/OrgLayout";
import { SkeletonList } from "../components/Skeleton";
import type { ContextSource, OrgMember, Organization } from "../../shared/types";

/**
 * Org knowledge (Phase 4). Admins add sources (pasted text for now; URL/RocketRide later) which
 * are ingested into the org's RAG collection and tracked in context_sources. The chat's
 * search_context grounds answers in these. Reads are RLS org-scoped; writes go through ingest-source.
 */
export function ContextPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [sources, setSources] = useState<ContextSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    try {
      const [orgs, src, mem] = await Promise.all([
        select<Organization>("organizations", { id: `eq.${id}` }),
        select<ContextSource>("context_sources", { org_id: `eq.${id}`, order: "created_at.desc" }),
        select<OrgMember>("org_members", { org_id: `eq.${id}`, user_id: `eq.${user?.id ?? ""}` }),
      ]);
      setOrg(orgs[0] ?? null);
      setSources(src);
      setIsAdmin(mem.some((m) => m.role === "admin" && m.status === "active"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load knowledge");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id, user?.id]);

  const ready = useMemo(() => sources.filter((s) => s.status === "ready").length, [sources]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callFn("ingest-source", { action: "add", org_id: id, title: title.trim() || undefined, text: t });
      setTitle("");
      setText("");
      setNotice("Added to the team knowledge base.");
      await load();
    } catch (err: any) {
      const msg = err?.message ?? "Failed to add";
      setError(/not found/i.test(msg) ? "The ingest-source function isn't deployed yet." : msg);
    } finally {
      setBusy(false);
    }
  }

  async function addRepo(e: React.FormEvent) {
    e.preventDefault();
    const u = repoUrl.trim();
    if (!u || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callFn("ingest-source", { action: "add", org_id: id, url: u });
      setRepoUrl("");
      setNotice("Repository README added to the team knowledge base.");
      await load();
    } catch (err: any) {
      const msg = err?.message ?? "Failed to add repository";
      // The function returns a clear guidance message when GitHub isn't connected yet.
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function remove(source_id: string) {
    setBusy(true);
    setError("");
    try {
      await callFn("ingest-source", { action: "remove", org_id: id, source_id });
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrgLayout
      orgId={id}
      orgName={org?.name}
      title="Knowledge"
      subtitle="Sources Bora draws on to answer in chat & meetings"
    >
      {!isAdmin && (
        <div className="notice info">You can see the team's knowledge sources. Only admins can add or remove them.</div>
      )}

      <section className="card col">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Sources</h3>
          {!loading && <span className="muted text-sm">{ready}/{sources.length} ready</span>}
        </div>
        {loading ? (
          <SkeletonList rows={3} />
        ) : sources.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">🗂️</span>
            <span>No knowledge yet</span>
            {isAdmin && <span className="text-sm">Add notes, docs, or facts below.</span>}
          </div>
        ) : (
          <div className="list">
          {sources.map((s) => (
            <div key={s.id} className="list-row">
              <div className="col" style={{ gap: 4, minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url || "Untitled"}</span>
                <span style={{ fontSize: 12 }}>
                  <span className={`badge badge-${s.type}`}>{s.type}</span>
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                </span>
              </div>
              {isAdmin && (
                <button className="secondary sm" disabled={busy} onClick={() => remove(s.id)}>Remove</button>
              )}
            </div>
          ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <form className="card col" onSubmit={add}>
          <div className="col" style={{ gap: 2 }}>
            <h3 style={{ margin: 0 }}>Add knowledge</h3>
            <span className="muted text-sm">Paste notes, docs, or facts about your team or projects. Bora will use them in chat.</span>
          </div>
          <input
            placeholder="Title (e.g. Q2 Roadmap)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="Paste text to add to the team knowledge base…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            required
            style={{ resize: "vertical" }}
          />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" disabled={busy || !text.trim()}>{busy ? "Adding…" : "Add to knowledge"}</button>
          </div>
        </form>
      )}

      {isAdmin && (
        <form className="card col" onSubmit={addRepo}>
          <div className="col" style={{ gap: 2 }}>
            <h3 style={{ margin: 0 }}>Add a GitHub repository</h3>
            <span className="muted text-sm">Paste a repo URL and Bora ingests its README into the knowledge base.
              Requires GitHub to be connected in Settings (admins).</span>
          </div>
          <div className="row">
            <input
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" disabled={busy || !repoUrl.trim()}>{busy ? "Adding…" : "Add repo"}</button>
          </div>
        </form>
      )}

      {notice && <div className="notice success">{notice}</div>}
      {error && <div className="notice error">{error}</div>}
    </OrgLayout>
  );
}

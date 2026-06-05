import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { callFn, select } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Organization } from "../../shared/types";

/**
 * Home: shows the signed-in user, lists the orgs they belong to (RLS-scoped), and lets
 * them create a new org (via the org-create function, which bootstraps admin/bot/RAG/Xtrace).
 * This is the seed of the Phase 1 org console.
 */
export function HomePage() {
  const { user, logout } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadOrgs() {
    try {
      setOrgs(await select<Organization>("organizations"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrgs();
  }, []);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await callFn("org-create", { name });
      setName("");
      await loadOrgs();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create organization");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container col" style={{ gap: 24 }}>
      {/* Top app bar */}
      <header className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark">B</span>
          <span className="brand" style={{ fontSize: 20 }}>Bora</span>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <span className="muted text-sm">{user?.email}</span>
          <button className="secondary sm" onClick={logout}>Log out</button>
        </div>
      </header>

      {/* Page header */}
      <div className="page-header">
        <div className="col" style={{ gap: 0 }}>
          <h1 className="page-title">Your organizations</h1>
          <p className="page-subtitle">Open a workspace or spin up a new one.</p>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}

      {/* Org grid / loading / empty */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 104, borderRadius: "var(--r-lg)" }} />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">🏢</span>
          <span>No organizations yet</span>
          <span className="text-sm">Create your first one below to get started.</span>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {orgs.map((o) => (
            <Link
              key={o.id}
              to={`/org/${o.id}`}
              className="card card-hover col"
              style={{ gap: 14, color: "var(--text)" }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="brand-mark">{(o.name?.trim()?.[0] ?? "O").toUpperCase()}</span>
                <span className="faint" aria-hidden>→</span>
              </div>
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.name}
                </span>
                <span className="muted text-xs">Created {new Date(o.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create org */}
      <form className="card col" onSubmit={createOrg} style={{ maxWidth: 520 }}>
        <div className="col" style={{ gap: 2 }}>
          <h3 style={{ margin: 0 }}>Create an organization</h3>
          <span className="muted text-sm">You'll be its admin. Invite teammates by Gmail next.</span>
        </div>
        <div className="row">
          <input
            className="grow"
            placeholder="Organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button type="submit" disabled={busy || !name.trim()}>
            {busy && <span className="spinner" />}
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

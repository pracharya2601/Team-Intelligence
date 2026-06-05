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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadOrgs() {
    try {
      setOrgs(await select<Organization>("organizations"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load organizations");
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
    <div className="container col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="brand" style={{ fontSize: 24 }}>Bora</div>
        <div className="row">
          <span className="muted">{user?.email}</span>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>

      <div className="panel col">
        <h3 style={{ margin: 0 }}>Your organizations</h3>
        {orgs.length === 0 && <div className="muted">No organizations yet — create one below.</div>}
        {orgs.map((o) => (
          <Link
            key={o.id}
            to={`/org/${o.id}`}
            className="row"
            style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 10, color: "var(--text)" }}
          >
            <span>{o.name} →</span>
            <span className="muted">{new Date(o.created_at).toLocaleDateString()}</span>
          </Link>
        ))}
      </div>

      <form className="panel col" onSubmit={createOrg}>
        <h3 style={{ margin: 0 }}>Create an organization</h3>
        <div className="muted">You'll be its admin. You can invite teammates by Gmail next.</div>
        <div className="row">
          <input
            placeholder="Organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={busy || !name.trim()}>{busy ? "…" : "Create"}</button>
        </div>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}

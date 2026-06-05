import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * Shared shell for the org surfaces (Members · Chat · Knowledge): a left sidebar with nav +
 * account, and the page content on the right. Replaces the per-page headers so the three pages
 * feel like one app. `title` is shown above the content; `actions` renders top-right.
 */
export function OrgLayout({
  orgId,
  orgName,
  title,
  actions,
  children,
}: {
  orgId: string;
  orgName?: string | null;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const base = `/org/${orgId}`;
  const nav = [
    { to: base, label: "Members", exact: true },
    { to: `${base}/chat`, label: "Chat" },
    { to: `${base}/context`, label: "Knowledge" },
    { to: `${base}/meetings`, label: "Meetings" },
    { to: `${base}/settings`, label: "Settings" },
  ];
  const isActive = (to: string, exact?: boolean) => (exact ? pathname === to : pathname.startsWith(to));

  return (
    <div className="app-shell">
      <aside className="sidebar col">
        <div className="col" style={{ gap: 4 }}>
          <Link to="/" className="muted" style={{ fontSize: 12 }}>← All orgs</Link>
          <span className="brand" style={{ fontSize: 18 }}>{orgName ?? "Organization"}</span>
        </div>
        <nav className="col" style={{ gap: 4, marginTop: 8 }}>
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className={`nav-link${isActive(n.to, n.exact) ? " nav-active" : ""}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="col" style={{ gap: 6, marginTop: "auto" }}>
          <span className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</span>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </aside>

      <main className="col" style={{ padding: 24, gap: 16, minWidth: 0 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="brand" style={{ fontSize: 22 }}>{title}</span>
          {actions && <div className="row">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}

import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * Shared shell for the org surfaces (Members · Chat · Knowledge · Meetings · Settings): a left
 * sidebar with a brand mark, grouped nav, and account footer, plus a page-header on the right.
 * Drives the "one app" enterprise feel. Props are backward-compatible; `subtitle` is optional.
 */
export function OrgLayout({
  orgId,
  orgName,
  title,
  subtitle,
  actions,
  children,
  fill = false,
}: {
  orgId: string;
  orgName?: string | null;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Full-height mode: content fills the viewport and scrolls internally (e.g. Chat). */
  fill?: boolean;
}) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const base = `/org/${orgId}`;

  // Grouped nav — each group renders a small section label above its links.
  const groups: { label: string; items: { to: string; label: string; exact?: boolean }[] }[] = [
    {
      label: "Project",
      items: [
        { to: base, label: "Members", exact: true },
        { to: `${base}/chat`, label: "Chat" },
        { to: `${base}/context`, label: "Knowledge" },
      ],
    },
    {
      label: "Meetings",
      items: [{ to: `${base}/meetings`, label: "Meetings" }],
    },
    {
      label: "Admin",
      items: [{ to: `${base}/settings`, label: "Settings" }],
    },
  ];
  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  const mark = (orgName ?? "Bora").trim().charAt(0).toUpperCase() || "B";

  return (
    <div className="app-shell">
      <aside className="sidebar col">
        <Link to="/" className="sidebar-brand" style={{ color: "var(--text)" }}>
          <span className="brand-mark">{mark}</span>
          <span className="col" style={{ gap: 0, minWidth: 0 }}>
            <span className="brand" style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {orgName ?? "Project"}
            </span>
            <span className="faint text-xs">All projects →</span>
          </span>
        </Link>

        <nav className="col" style={{ gap: 2, marginTop: 4 }}>
          {groups.map((g) => (
            <div key={g.label} className="col" style={{ gap: 2 }}>
              <span className="nav-section">{g.label}</span>
              {g.items.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`nav-link${isActive(n.to, n.exact) ? " nav-active" : ""}`}
                >
                  {n.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="col" style={{ gap: 8, marginTop: "auto" }}>
          <hr className="divider" />
          <span className="muted text-xs" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.email}
          </span>
          <button className="secondary sm" onClick={logout}>Log out</button>
        </div>
      </aside>

      <main
        className="col"
        style={{
          padding: fill ? "24px 28px 20px" : "28px 28px 48px",
          gap: fill ? 16 : 20,
          minWidth: 0,
          ...(fill ? { height: "100vh", overflow: "hidden" } : null),
        }}
      >
        <header className="page-header">
          <div className="col" style={{ gap: 0 }}>
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
        {fill ? (
          <div className="col" style={{ flex: 1, minHeight: 0, gap: 0 }}>{children}</div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

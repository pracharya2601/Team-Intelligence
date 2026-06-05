import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { callFn, select } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Organization, OrgMember } from "../../shared/types";

/**
 * Org console (Phase 1): members table + invite-by-email + role management.
 * Reads members via the data API (RLS-scoped to org members). Mutations go through the
 * `org-members` function (org_members writes are RLS-blocked for end users).
 */
export function OrgPage() {
  const { id = "" } = useParams();
  const { user, logout } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const myRole = useMemo(
    () => members.find((m) => m.user_id === user?.id)?.role,
    [members, user],
  );
  const isAdmin = myRole === "admin";

  async function load() {
    setError("");
    try {
      const [orgs, mem] = await Promise.all([
        select<Organization>("organizations", { id: `eq.${id}` }),
        select<OrgMember>("org_members", { org_id: `eq.${id}` }),
      ]);
      setOrg(orgs[0] ?? null);
      setMembers(mem.filter((m) => m.status !== "removed"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load organization");
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function act(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (okMsg) setNotice(okMsg);
      await load();
    } catch (e: any) {
      const msg = e?.message ?? "Action failed";
      setError(
        /not found/i.test(msg)
          ? "The org-members function isn't deployed yet — deploy it to manage members."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    void act(
      () => callFn("org-members", { action: "invite", org_id: id, email: addr, role }),
      `Invited ${addr}`,
    ).then(() => setEmail(""));
  }

  function label(m: OrgMember): string {
    if (m.user_id && m.user_id === user?.id) return `${user?.email ?? "you"} (you)`;
    if (m.invited_email) return m.invited_email;
    return m.user_id ? `user ${m.user_id.slice(0, 8)}…` : "—";
  }

  return (
    <div className="container col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <Link to="/" className="muted">← Orgs</Link>
          <span className="brand" style={{ fontSize: 22 }}>{org?.name ?? "Organization"}</span>
        </div>
        <div className="row">
          <Link to={`/org/${id}/meetings`} className="secondary" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
            Meetings
          </Link>
          <Link to={`/org/${id}/chat`} className="secondary" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
            Chat
          </Link>
          <span className="muted">{user?.email}</span>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>

      {!isAdmin && org && (
        <div className="muted">You're a member of this org. Only admins can invite or change roles.</div>
      )}

      <div className="panel col">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Members</h3>
          <span className="muted">{members.length}</span>
        </div>

        {members.map((m) => (
          <div key={m.id} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div className="col" style={{ gap: 2 }}>
              <span>{label(m)}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                <span className={`badge badge-${m.role}`}>{m.role}</span>
                <span className={`badge badge-${m.status}`}>{m.status}</span>
              </span>
            </div>
            {isAdmin && m.user_id !== user?.id && (
              <div className="row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        callFn("org-members", {
                          action: "set_role",
                          org_id: id,
                          member_id: m.id,
                          role: m.role === "admin" ? "member" : "admin",
                        }),
                      "Role updated",
                    )
                  }
                >
                  {m.role === "admin" ? "Make member" : "Make admin"}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => callFn("org-members", { action: "remove", org_id: id, member_id: m.id }),
                      "Member removed",
                    )
                  }
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <form className="panel col" onSubmit={invite}>
          <h3 style={{ margin: 0 }}>Invite a teammate</h3>
          <div className="muted">They join as a member (or admin) when they sign in with this email.</div>
          <div className="row">
            <input
              type="email"
              placeholder="teammate@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" disabled={busy || !email.trim()}>{busy ? "…" : "Invite"}</button>
          </div>
        </form>
      )}

      {notice && <div className="muted">{notice}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

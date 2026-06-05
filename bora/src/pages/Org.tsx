import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { callFn, select } from "../lib/api";
import { useAuth } from "../lib/auth";
import { OrgLayout } from "../components/OrgLayout";
import { SkeletonList } from "../components/Skeleton";
import type { Organization, OrgMember } from "../../shared/types";

/**
 * Org console (Phase 1): members table + invite-by-email + role management.
 * Reads members via the data API (RLS-scoped to org members). Mutations go through the
 * `org-members` function (org_members writes are RLS-blocked for end users).
 */
export function OrgPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
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
      setError(e?.message ?? "Failed to load project");
    } finally {
      setLoading(false);
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
    <OrgLayout
      orgId={id}
      orgName={org?.name}
      title="Members"
      subtitle="People with access to this project"
    >
      {!isAdmin && org && (
        <div className="notice info">You're a member of this project. Only admins can invite or change roles.</div>
      )}

      <section className="card col">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Members</h3>
          {!loading && <span className="muted text-sm">{members.length}</span>}
        </div>

        {loading ? (
          <SkeletonList rows={3} />
        ) : (
        <div className="list">
        {members.map((m) => (
          <div key={m.id} className="list-row">
            <div className="col" style={{ gap: 4 }}>
              <span>{label(m)}</span>
              <span style={{ fontSize: 12 }}>
                <span className={`badge badge-${m.role}`}>{m.role}</span>
                <span className={`badge badge-${m.status}`}>{m.status}</span>
              </span>
            </div>
            {isAdmin && m.user_id !== user?.id && (
              <div className="row">
                <button
                  className="secondary sm"
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
                  className="secondary sm"
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
        )}
      </section>

      {isAdmin && (
        <form className="card col" onSubmit={invite}>
          <div className="col" style={{ gap: 2 }}>
            <h3 style={{ margin: 0 }}>Invite a teammate</h3>
            <span className="muted text-sm">They join as a member (or admin) when they sign in with this email.</span>
          </div>
          <div className="row">
            <input
              className="grow"
              type="email"
              placeholder="teammate@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" disabled={busy || !email.trim()}>{busy ? "…" : "Invite"}</button>
          </div>
        </form>
      )}

      {notice && <div className="notice success">{notice}</div>}
      {error && <div className="notice error">{error}</div>}
    </OrgLayout>
  );
}

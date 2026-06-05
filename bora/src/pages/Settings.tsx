import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  callFn,
  integrationConnect,
  integrationConnections,
  integrationDisconnect,
  select,
  type IntegrationConnection,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { OrgLayout } from "../components/OrgLayout";
import { SkeletonCard } from "../components/Skeleton";
import type { Bot, OrgMember, Organization } from "../../shared/types";

/**
 * Org settings (Phase 1/4). Admins rename the org and configure Bora's name + persona (the bots
 * row) — the persona shapes how the bot speaks in meetings and chat. Reads are RLS org-scoped;
 * writes go through the org-settings function (org-table writes are admin-only).
 */
export function SettingsPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [bot, setBot] = useState<Bot | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [botName, setBotName] = useState("");
  const [persona, setPersona] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conns, setConns] = useState<IntegrationConnection[]>([]);

  // Connect policy (mirrors functions/integration-connect.ts): gmail = any active member,
  // github/slack = admin only. The server enforces it; this drives what the UI offers.
  const INTEGRATIONS: { toolkit: string; label: string; desc: string; adminOnly: boolean }[] = [
    { toolkit: "gmail", label: "Email (Gmail)", adminOnly: false,
      desc: "Connect a Gmail account so Bora can email a recap after each meeting. Any member can connect; recaps send from a connected account." },
    { toolkit: "github", label: "GitHub", adminOnly: true,
      desc: "Connect GitHub so admins can pull repository docs into the team's knowledge base." },
    { toolkit: "slack", label: "Slack", adminOnly: true,
      desc: "Connect Slack to bring Bora into your workspace for in-thread answers." },
  ];
  const connFor = (toolkit: string) =>
    conns.find((c) => c.toolkit_slug === toolkit && /active/i.test(c.status)) ?? null;

  async function load() {
    setError("");
    try {
      const [orgs, bots, mem, c] = await Promise.all([
        select<Organization>("organizations", { id: `eq.${id}` }),
        select<Bot>("bots", { org_id: `eq.${id}` }),
        select<OrgMember>("org_members", { org_id: `eq.${id}`, user_id: `eq.${user?.id ?? ""}` }),
        integrationConnections().catch(() => [] as IntegrationConnection[]),
      ]);
      const o = orgs[0] ?? null;
      const b = bots[0] ?? null;
      setOrg(o);
      setBot(b);
      setOrgName(o?.name ?? "");
      setBotName(b?.name ?? "Bora");
      setPersona(b?.persona ?? "");
      setIsAdmin(mem.some((m) => m.role === "admin" && m.status === "active"));
      setConns(c);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function connect(toolkit: string, label: string) {
    setBusy(toolkit);
    setError("");
    try {
      const authUrl = await integrationConnect(id, toolkit, `${window.location.origin}/org/${id}/settings`);
      window.location.href = authUrl; // returns here after OAuth; load() then shows "connected"
    } catch (err: any) {
      setError(err?.message ?? `Couldn't start the ${label} connection`);
      setBusy("");
    }
  }

  async function disconnect(toolkit: string) {
    const conn = connFor(toolkit);
    if (!conn) return;
    setBusy(toolkit);
    setError("");
    try {
      await integrationDisconnect(conn.id);
      setNotice("Disconnected.");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Couldn't disconnect");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void load();
  }, [id, user?.id]);

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    const name = orgName.trim();
    if (!name || busy) return;
    setBusy("org");
    setError("");
    setNotice("");
    try {
      await callFn("org-settings", { action: "update_org", org_id: id, name });
      setNotice("Project name saved.");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save");
    } finally {
      setBusy("");
    }
  }

  async function saveBot(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("bot");
    setError("");
    setNotice("");
    try {
      await callFn("org-settings", { action: "update_bot", org_id: id, name: botName.trim() || "Bora", persona });
      setNotice("Bora's settings saved.");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save");
    } finally {
      setBusy("");
    }
  }

  return (
    <OrgLayout
      orgId={id}
      orgName={org?.name}
      title="Settings"
      subtitle="Project & bot configuration"
    >
      {!isAdmin && <div className="notice info">Only admins can change settings.</div>}

      {loading ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </>
      ) : (
        <>
      <form className="card col" onSubmit={saveOrg}>
        <h3 style={{ margin: 0 }}>Project</h3>
        <label className="label">Name</label>
        <div className="row">
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!isAdmin} style={{ flex: 1 }} />
          {isAdmin && <button type="submit" disabled={busy !== "" || !orgName.trim()}>{busy === "org" ? "Saving…" : "Save"}</button>}
        </div>
      </form>

      <form className="card col" onSubmit={saveBot}>
        <h3 style={{ margin: 0 }}>Bot</h3>
        <div className="muted" style={{ fontSize: 13 }}>How Bora introduces itself and behaves in meetings and chat.</div>
        <label className="label">Name</label>
        <input value={botName} onChange={(e) => setBotName(e.target.value)} disabled={!isAdmin} placeholder="Bora" />
        <label className="label">Persona</label>
        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          disabled={!isAdmin}
          rows={5}
          placeholder="e.g. A concise, friendly teammate who only speaks up when it adds value, cites sources, and keeps notes crisp."
          style={{ resize: "vertical" }}
        />
        {isAdmin && (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" disabled={busy !== ""}>{busy === "bot" ? "Saving…" : "Save bot"}</button>
          </div>
        )}
      </form>

      {INTEGRATIONS.map((it) => {
        const conn = connFor(it.toolkit);
        const canConnect = it.adminOnly ? isAdmin : true;
        return (
          <div className="card col" key={it.toolkit}>
            <h3 style={{ margin: 0 }}>
              {it.label}
              {it.adminOnly && <span className="badge" style={{ marginLeft: 8 }}>admin only</span>}
            </h3>
            <div className="muted" style={{ fontSize: 13 }}>{it.desc}</div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>
                {conn ? (
                  <><span className="badge badge-active">connected</span> {it.label} is connected.</>
                ) : (
                  <span className="muted">Not connected.</span>
                )}
              </span>
              {canConnect ? (
                conn ? (
                  <button className="secondary" disabled={busy !== ""} onClick={() => disconnect(it.toolkit)}>
                    {busy === it.toolkit ? "…" : "Disconnect"}
                  </button>
                ) : (
                  <button disabled={busy !== ""} onClick={() => connect(it.toolkit, it.label)}>
                    {busy === it.toolkit ? "…" : `Connect ${it.label}`}
                  </button>
                )
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>Only an admin can connect this.</span>
              )}
            </div>
          </div>
        );
      })}
        </>
      )}

      {notice && <div className="notice success">{notice}</div>}
      {error && <div className="notice error">{error}</div>}
    </OrgLayout>
  );
}

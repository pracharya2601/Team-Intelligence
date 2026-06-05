import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { callFn, select } from "../lib/api";
import { useAuth } from "../lib/auth";
import { OrgLayout } from "../components/OrgLayout";
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
  const [orgName, setOrgName] = useState("");
  const [botName, setBotName] = useState("");
  const [persona, setPersona] = useState("");
  const [busy, setBusy] = useState<"" | "org" | "bot">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    try {
      const [orgs, bots, mem] = await Promise.all([
        select<Organization>("organizations", { id: `eq.${id}` }),
        select<Bot>("bots", { org_id: `eq.${id}` }),
        select<OrgMember>("org_members", { org_id: `eq.${id}`, user_id: `eq.${user?.id ?? ""}` }),
      ]);
      const o = orgs[0] ?? null;
      const b = bots[0] ?? null;
      setOrg(o);
      setBot(b);
      setOrgName(o?.name ?? "");
      setBotName(b?.name ?? "Bora");
      setPersona(b?.persona ?? "");
      setIsAdmin(mem.some((m) => m.role === "admin" && m.status === "active"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings");
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
      setNotice("Organization name saved.");
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
    <OrgLayout orgId={id} orgName={org?.name} title="Settings">
      {!isAdmin && <div className="muted">Only admins can change settings.</div>}

      <form className="panel col" onSubmit={saveOrg}>
        <h3 style={{ margin: 0 }}>Organization</h3>
        <label className="muted" style={{ fontSize: 13 }}>Name</label>
        <div className="row">
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!isAdmin} style={{ flex: 1 }} />
          {isAdmin && <button type="submit" disabled={busy !== "" || !orgName.trim()}>{busy === "org" ? "Saving…" : "Save"}</button>}
        </div>
      </form>

      <form className="panel col" onSubmit={saveBot}>
        <h3 style={{ margin: 0 }}>Bot</h3>
        <div className="muted" style={{ fontSize: 13 }}>How Bora introduces itself and behaves in meetings and chat.</div>
        <label className="muted" style={{ fontSize: 13 }}>Name</label>
        <input value={botName} onChange={(e) => setBotName(e.target.value)} disabled={!isAdmin} placeholder="Bora" />
        <label className="muted" style={{ fontSize: 13 }}>Persona</label>
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

      {notice && <div className="muted">{notice}</div>}
      {error && <div className="error">{error}</div>}
    </OrgLayout>
  );
}

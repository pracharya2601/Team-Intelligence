---
name: bora-ui-dashboard
description: Use when assembling a full Bora dashboard page — the OrgLayout app shell, page-header (title + subtitle + actions), toolbars, stat-grid overviews, data-table/list pages, the two-pane (chat) layout, and the mandatory loading/empty/error triad. Page-level composition patterns built from bora-ui-components. Read bora-ui first.
---

# Bora UI — Dashboard Patterns

Page-level composition. These are the repeatable skeletons every Bora org surface should follow so
the app feels like one product. Atoms come from **`bora-ui-components`**; tokens from **`bora-ui`**.

---

## 1. The app shell (`OrgLayout`)

All org-scoped pages render inside [`OrgLayout`](../../../bora/src/components/OrgLayout.tsx) — a
sticky left sidebar (brand mark + grouped nav + account footer) and a content column with a
page-header. **Don't re-implement a header per page**; pass it via props.

```tsx
<OrgLayout
  orgId={id}
  orgName={org?.name}
  title="Members"
  subtitle="People with access to this workspace"   // optional
  actions={<button>+ Invite</button>}               // optional, top-right
>
  {/* page body */}
</OrgLayout>
```
- Nav lives in `OrgLayout` (grouped: Workspace / Meetings / Admin). **Add a route?** add a `nav`
  entry there. The active link is derived from the URL (exact match for the index route).
- Non-org pages (Home, Login) use `.container` instead of the shell.

---

## 2. Page-header

Inside the shell it's automatic (title/subtitle/actions props). Standalone (e.g. Home), use the
class directly:

```tsx
<header className="page-header">
  <div className="col" style={{ gap: 0 }}>
    <h1 className="page-title">Your organizations</h1>
    <p className="page-subtitle">Create or open a workspace</p>
  </div>
  <button>+ New org</button>
</header>
```

---

## 3. Toolbar (search / filter / actions strip)

A row above a table or list. Search grows; controls sit right.

```tsx
<div className="toolbar">
  <input className="grow" placeholder="Search members…" value={q} onChange={e => setQ(e.target.value)} />
  <select value={filter} onChange={e => setFilter(e.target.value)}>
    <option value="all">All roles</option>
    <option value="admin">Admins</option>
  </select>
  <button className="secondary sm">Export</button>
</div>
```

---

## 4. Overview / KPI page

Stat grid on top, content cards below.

```tsx
<OrgLayout orgId={id} orgName={org?.name} title="Overview">
  <div className="stat-grid">
    <div className="stat"><div className="stat-label">Meetings</div><div className="stat-value">128</div></div>
    <div className="stat"><div className="stat-label">Members</div><div className="stat-value">24</div></div>
    <div className="stat"><div className="stat-label">Sources</div><div className="stat-value">57</div></div>
  </div>

  <section className="card col">
    <h3 style={{ margin: 0 }}>Recent activity</h3>
    <div className="list">{/* list-rows */}</div>
  </section>
</OrgLayout>
```

---

## 5. Data-table / list page (the workhorse)

The canonical CRUD screen: header action → toolbar → card-wrapped table/list → triad. Wrap the data
region in the **loading/empty/error triad** every time.

```tsx
<OrgLayout orgId={id} orgName={org?.name} title="Knowledge"
  actions={<button onClick={openAdd}>+ Add source</button>}>

  {error && <div className="notice error">{error}</div>}

  <section className="card col">
    <div className="toolbar">
      <input className="grow" placeholder="Search sources…" value={q} onChange={e => setQ(e.target.value)} />
      <span className="muted text-sm">{filtered.length} of {rows.length}</span>
    </div>

    {loading ? (
      <div className="row muted"><span className="spinner" /> Loading…</div>
    ) : filtered.length === 0 ? (
      <div className="empty">
        <span className="empty-icon">🗂️</span>
        <span>{q ? "No matches" : "No sources yet"}</span>
        {!q && <button className="sm" onClick={openAdd}>Add your first</button>}
      </div>
    ) : (
      <table className="table">
        <thead><tr><th>Source</th><th>Type</th><th>Status</th><th /></tr></thead>
        <tbody>
          {filtered.map(s => (
            <tr key={s.id}>
              <td>{s.title}</td>
              <td><span className={`badge badge-${s.kind}`}>{s.kind}</span></td>
              <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
              <td style={{ textAlign: "right" }}><button className="ghost sm">⋯</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
</OrgLayout>
```

---

## 6. Two-pane layout (chat / master-detail)

A fixed list rail + a flexible detail pane. Bora's Chat uses `.chat-layout` + `.thread-item` +
`.bubble`; reuse the same grid shape for any master-detail screen.

```tsx
<OrgLayout orgId={id} orgName={org?.name} title="Chat">
  <div className="chat-layout">
    <aside className="col" style={{ gap: 6 }}>
      {threads.map(t => (
        <button key={t.id}
          className={`thread-item${t.id === active ? " thread-active" : ""}`}
          onClick={() => setActive(t.id)}>{t.title}</button>
      ))}
    </aside>

    <section className="card col" style={{ minHeight: 480 }}>
      <div className="col grow" style={{ gap: 10, overflowY: "auto" }}>
        {messages.map(m => (
          <div key={m.id} className={`bubble bubble-${m.role === "user" ? "user" : "assistant"}`}>
            {m.content}
          </div>
        ))}
      </div>
      <div className="row">
        <input className="grow" placeholder="Message…" />
        <button>Send</button>
      </div>
    </section>
  </div>
</OrgLayout>
```

---

## 7. Form / settings page

Stacked labelled fields in a card; primary action bottom-right.

```tsx
<OrgLayout orgId={id} orgName={org?.name} title="Settings" subtitle="Workspace & bot configuration">
  <form className="card col" onSubmit={save} style={{ maxWidth: 560 }}>
    <h3 style={{ margin: 0 }}>General</h3>
    <label className="field">
      <span className="label">Organization name</span>
      <input value={name} onChange={e => setName(e.target.value)} />
    </label>
    <label className="field">
      <span className="label">Bot persona</span>
      <textarea value={persona} onChange={e => setPersona(e.target.value)} />
    </label>
    {error && <div className="notice error">{error}</div>}
    {saved && <div className="notice success">Saved</div>}
    <div className="row" style={{ justifyContent: "flex-end" }}>
      <button disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
    </div>
  </form>
</OrgLayout>
```

---

## The triad rule (non-negotiable)

Any region backed by an async fetch renders **three** branches, in this order of checks:
1. **loading** → `.spinner` row or `.skeleton` blocks
2. **error** → `<div className="notice error">`
3. **empty** → `.empty` block (offer the primary action when not filtered)
4. otherwise → the data

Skipping empty/error is the most common way Bora screens look unfinished. Don't.

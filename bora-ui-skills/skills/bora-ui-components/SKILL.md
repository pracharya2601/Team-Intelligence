---
name: bora-ui-components
description: Use when placing UI atoms on a Bora screen — buttons (primary/secondary/ghost/danger/sizes), inputs & form fields, badges/status pills, cards & panels, stat cards, list rows, tables, notice banners, spinners/skeletons, and empty states. Copy-paste className snippets that match bora/src/index.css exactly. Read bora-ui first for tokens.
---

# Bora UI — Component Primitives

The atoms. Every class here is defined in [`bora/src/index.css`](../../../bora/src/index.css).
Copy a snippet, swap the content. Prefer these classes over inline styles. Read **`bora-ui`** for
tokens and the golden rules first.

---

## Buttons

Base `<button>` is the **primary** action (indigo). Modifiers stack: `secondary`, `ghost`,
`danger`, `sm`, `block`.

```tsx
<button>Save changes</button>                      {/* primary */}
<button className="secondary">Cancel</button>       {/* bordered, neutral */}
<button className="ghost">Skip</button>             {/* borderless, quiet */}
<button className="danger">Delete</button>          {/* destructive */}
<button className="danger secondary">Remove</button>{/* low-emphasis destructive */}
<button className="sm">Compact</button>             {/* smaller */}
<button className="block">Full width</button>
<button disabled>{busy ? "…" : "Submit"}</button>  {/* disabled dims + blocks */}

{/* with a spinner while busy */}
<button disabled={busy}>{busy && <span className="spinner" />}Invite</button>
```
Rules: **one primary per view**; secondary/ghost for everything else; `danger` only for irreversible
actions. Buttons are flex with a 7px gap, so an icon/spinner + label "just works".

---

## Inputs & form fields

Inputs, `textarea`, and `select` share a style with a focus ring (`--ring`). Wrap each in a
`.field` with a `.label` for forms; use a `.row` for inline input+button.

```tsx
{/* labelled field */}
<label className="field">
  <span className="label">Organization name</span>
  <input placeholder="Acme Inc." value={name} onChange={e => setName(e.target.value)} />
</label>

{/* inline input + action (Home/Org invite pattern) */}
<div className="row">
  <input className="grow" placeholder="teammate@gmail.com" value={email}
         onChange={e => setEmail(e.target.value)} />
  <select value={role} onChange={e => setRole(e.target.value as any)}>
    <option value="member">Member</option>
    <option value="admin">Admin</option>
  </select>
  <button disabled={!email.trim()}>Invite</button>
</div>

<textarea placeholder="Notes…" />   {/* resizes vertically, min-height 80px */}
```

---

## Badges / status pills

`.badge` + a semantic modifier. Modifiers map to real Bora enum values (roles, member status,
source status) so `badge-${value}` works directly.

```tsx
<span className={`badge badge-${m.role}`}>{m.role}</span>     {/* admin | member */}
<span className={`badge badge-${m.status}`}>{m.status}</span> {/* active | invited | removed */}
<span className={`badge badge-${s.status}`}>{s.status}</span> {/* ready | ingesting | pending | error */}

{/* optional leading status dot */}
<span className="badge badge-active"><i className="dot" />Active</span>
```
Defined modifiers: `badge-admin`, `-active`, `-ready` (positive/accent); `-invited`, `-member`,
`-pending`, `-ingesting`, `-doc`, `-github`, `-website`, `-plan` (neutral); `-removed`, `-error`
(danger). Add new ones in `index.css` next to these — keep the tint/border/bg trio.

---

## Cards & panels

`.panel` and `.card` are identical (raised surface, 14px radius, subtle shadow). Compose with
`.col`/`.row`. Use `.card-sm` for tighter inner blocks, `.card-hover` for clickable cards.

```tsx
<section className="card col">
  <h3 style={{ margin: 0 }}>Section title</h3>
  <p className="muted text-sm">Supporting copy.</p>
  …
</section>

{/* clickable card (e.g. an org in a list) */}
<Link to={`/org/${o.id}`} className="card card-hover row"
      style={{ justifyContent: "space-between", color: "var(--text)" }}>
  <span>{o.name}</span>
  <span className="muted text-sm">{new Date(o.created_at).toLocaleDateString()}</span>
</Link>
```

---

## Stat cards (KPIs)

```tsx
<div className="stat-grid">
  <div className="stat">
    <div className="stat-label">Meetings</div>
    <div className="stat-value">128</div>
    <div className="stat-delta up">▲ 12% vs last week</div>
  </div>
  <div className="stat">
    <div className="stat-label">Members</div>
    <div className="stat-value">24</div>
  </div>
</div>
```
`.stat-grid` auto-fits (min 180px columns). `.stat-delta` takes `up` (green) / `down` (red).

---

## List rows

For records inside a card — auto hairline separators, first row has none.

```tsx
<div className="list">
  {members.map(m => (
    <div key={m.id} className="list-row">
      <div className="col" style={{ gap: 2 }}>
        <span>{m.email}</span>
        <span><span className={`badge badge-${m.role}`}>{m.role}</span></span>
      </div>
      <button className="secondary sm">Manage</button>
    </div>
  ))}
</div>
```

## Tables

For denser, columnar data. Rows hover-highlight.

```tsx
<table className="table">
  <thead><tr><th>Name</th><th>Role</th><th>Joined</th><th /></tr></thead>
  <tbody>
    {rows.map(r => (
      <tr key={r.id}>
        <td>{r.name}</td>
        <td><span className={`badge badge-${r.role}`}>{r.role}</span></td>
        <td className="muted">{r.joined}</td>
        <td style={{ textAlign: "right" }}><button className="ghost sm">⋯</button></td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## Notice banners

Replaces ad-hoc `.muted`/`.error` lines for messages that deserve a banner. Variants: `info`,
`success`, `warn`, `error`.

```tsx
{error  && <div className="notice error">{error}</div>}
{notice && <div className="notice success">{notice}</div>}
<div className="notice info">Only admins can invite or change roles.</div>
```
Inline (non-banner) text still uses `.error` / `.success-text` / `.muted`.

---

## Loading & empty states

Prefer **skeletons** that mirror the real layout over a bare spinner. Reusable components live in
`src/components/Skeleton.tsx` — import the one that matches the shape you're loading:

```tsx
import { Skeleton, SkeletonText, SkeletonRow, SkeletonList, SkeletonCard, SkeletonStat, SkeletonGrid }
  from "../components/Skeleton";

// base block — any size
<Skeleton w="40%" h={16} radius="var(--r)" />
<SkeletonText lines={3} />          // stacked text lines
<SkeletonList rows={3} />           // list-row placeholders (action chip optional: action={false})
<SkeletonCard lines={3} />          // card heading + body
<SkeletonStat />                    // KPI placeholder
<SkeletonGrid count={3} />          // responsive card grid (e.g. Home projects)
```

Wire it as the first branch of the triad, gated on an initial `loading` state (set `false` in the
fetch's `finally`; don't flip it back to `true` on background refetches, or it flashes):

```tsx
const [loading, setLoading] = useState(true);
// in load(): finally { setLoading(false); }

{loading ? <SkeletonList rows={3} />
  : rows.length === 0 ? <div className="empty">…</div>
  : <div className="list">{rows.map(...)}</div>}
```

Spinner is still right for *button-busy* and inline actions:
```tsx
{busy && <span className="spinner" />}
```

```tsx
{rows.length === 0 && (
  <div className="empty">
    <span className="empty-icon">📭</span>
    <span>No meetings yet</span>
    <button className="sm">Schedule one</button>
  </div>
)}
```

See **`bora-ui-dashboard`** for how these atoms assemble into full pages.

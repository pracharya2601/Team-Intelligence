---
name: bora-ui
description: Use FIRST when building or restyling any Bora frontend surface (pages in bora/src/pages, the OrgLayout shell, or shared components). The design foundation — refined "enterprise dark" tokens, type scale, spacing, elevation, and the golden rules that keep every screen consistent. Routes to bora-ui-components (atoms) and bora-ui-dashboard (page patterns).
---

# Bora UI — Design Foundation

Bora's frontend is a **Vite React SPA** styled with a **hand-rolled, className-driven design
system** in [`bora/src/index.css`](../../../bora/src/index.css). No Tailwind, no CSS-in-JS, no
component library. You compose **CSS variables + utility/component classes** + small inline
`style={{}}` tweaks. This skill is the source of truth for the look; the CSS file is the source of
truth for the tokens.

> **Theme:** refined enterprise dark (Linear-style) — deep charcoal canvas, soft slate panels,
> indigo accent, subtle elevation, tight typography. Font is **Inter** (loaded in `index.html`).

---

## Golden rules (do not break)

1. **Use tokens, never hex.** Reference `var(--accent)`, `var(--border)`, `var(--text)`, etc. — in
   both CSS and inline styles. A raw `#…` in a page is a bug; it won't track theme changes. (Pages
   already do this: `style={{ borderTop: "1px solid var(--border)" }}`.)
2. **Enhance shared classes, never rename them.** Pages reference `.panel`, `.badge`, `.nav-link`,
   `button`, etc. as a contract. Add new classes freely; don't rename existing ones.
3. **Class first, inline second.** Reach for a component class (`.card`, `.stat`, `.list-row`,
   `.page-header`). Use inline `style` only for one-off layout nudges (gap, flex, width).
4. **`index.css` is shared/foundation** (any lane may edit — keep changes small + announced).
   **Pages are lane-owned** (see `OWNERSHIP.md`): Track A owns `Meeting*`/`Bot*`/`Recap`, Track B
   owns `Login`/`Home`/`Org*`/`Chat`/`Context`. Restyle a page only in your lane; cross-cutting look
   changes belong in `index.css` so they lift every page without touching lane files.
5. **Every async surface ships the triad:** loading, empty, and error states — not just the happy
   path. See `bora-ui-dashboard`.

---

## Design tokens (defined in `:root`, `bora/src/index.css`)

**Surfaces** (canvas → raised → floating):
| Token | Use |
| --- | --- |
| `--bg` | app canvas (body) |
| `--bg-subtle` | inputs, insets |
| `--panel` | cards / panels / sidebar |
| `--panel-2` | nested fills, hover |
| `--elevated` | menus / popovers |

**Lines & focus:** `--border` (default), `--border-strong` (hover/emphasis), `--ring` (focus glow).

**Text:** `--text` (primary), `--muted` (secondary), `--faint` (tertiary/disabled).

**Brand:** `--accent`, `--accent-hover`, `--accent-700` (pressed/darker), `--accent-soft` (tinted
fill), `--accent-line` (tinted border).

**Semantic** (each has a `-soft` tinted-fill companion): `--success`, `--warning`, `--danger`.

**Radii:** `--r-sm` 7px · `--r` 10px · `--r-lg` 14px · `--r-full` pill.

**Elevation:** `--shadow-sm` (cards) · `--shadow` (raised) · `--shadow-lg` (modals/popovers).

**Type:** `--font` (Inter stack) · `--mono` (JetBrains Mono stack). Body is 14px / 1.5.

---

## Type & layout helpers

- Headings: `<h1 class="page-title">`, `<h3>` (15px). Sub-text: `.page-subtitle`.
- Text tone: `.muted`, `.faint`. Size: `.text-sm` (13px), `.text-xs` (12px). `.mono` for ids/code.
- Flex: `.row` (horizontal, centered, gap 12) · `.col` (vertical, gap 12) · `.wrap` · `.grow`
  (flex:1 + min-width:0) — combine with inline `style` for gap/justify nudges.
- `.container` centers a 960px column with padding (used by non-shell pages like Home/Login).
- `.divider` — a 1px hairline `<hr>`.

---

## Quick start — a well-formed page body

```tsx
import { OrgLayout } from "../components/OrgLayout";

<OrgLayout orgId={id} orgName={org?.name} title="Meetings" subtitle="Recordings & recaps"
  actions={<button>+ Schedule</button>}>
  {error && <div className="notice error">{error}</div>}

  <section className="card col">
    <div className="row" style={{ justifyContent: "space-between" }}>
      <h3 style={{ margin: 0 }}>Recent</h3>
      <span className="muted text-sm">{rows.length}</span>
    </div>
    {rows.length === 0
      ? <div className="empty"><span className="empty-icon">📭</span>No meetings yet</div>
      : <div className="list">{rows.map(r => <Row key={r.id} {...r} />)}</div>}
  </section>
</OrgLayout>
```

---

## Where to go next

| Need | Skill |
| --- | --- |
| Buttons, inputs, badges, cards, notices, spinners — the atoms + exact classes | **`bora-ui-components`** |
| Page layouts: shell, page-header, toolbar, stat grid, data-table page, two-pane, the loading/empty/error triad | **`bora-ui-dashboard`** |

Install (local scope):
```bash
claude plugin marketplace add ./bora-ui-skills
claude plugin install bora-ui-skills --scope local
```

# bora-ui-skills

A **local** Claude Code skills plugin for building **consistent, enterprise-grade dashboard UI** in
the Bora SPA. It documents the refined "enterprise dark" design system — tokens, component classes,
and dashboard layout patterns — that lives in [`bora/src/index.css`](../bora/src/index.css) and the
shared [`OrgLayout`](../bora/src/components/OrgLayout.tsx) shell.

Use it so any session/dev styles new screens the same way, without re-deriving the look or drifting.

## Skills

| Skill | What it covers |
|---|---|
| `bora-ui` | **Read first.** Design foundation: tokens (surfaces, text, accent, semantic, radii, elevation, type), the golden rules (use tokens not hex; enhance don't rename; shared-vs-lane-owned files), a quick-start page, and the router to the other two. |
| `bora-ui-components` | The atoms with exact classes + copy-paste JSX: buttons (primary/secondary/ghost/danger/sizes), inputs & fields, badges/status pills, cards, stat cards, list rows, tables, notice banners, spinners/skeletons, empty states. |
| `bora-ui-dashboard` | Page-level patterns: the `OrgLayout` shell, page-header, toolbar, KPI/overview page, the data-table/list workhorse, two-pane (chat) layout, settings form, and the mandatory loading/empty/error triad. |

## How it relates to the code

- **Source of truth for tokens & classes:** `bora/src/index.css` (shared/foundation — any lane may
  edit; keep changes small + announced per `OWNERSHIP.md`).
- **App shell:** `bora/src/components/OrgLayout.tsx`.
- **Pages** (`bora/src/pages/*`) are **lane-owned** — restyle only in your lane; push cross-cutting
  look changes into `index.css` so they lift every page without touching lane files.

## Install (local scope)

```bash
claude plugin marketplace add ./bora-ui-skills
claude plugin install bora-ui-skills --scope local
```

Then in a session: read `bora-ui` first, then reach for `bora-ui-components` (atoms) or
`bora-ui-dashboard` (page patterns) as needed.

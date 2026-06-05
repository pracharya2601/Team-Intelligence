# WORK-SPLIT.md — Bora, 2-person build

How we divide the 6 phases of [`PLAN.md`](PLAN.md) between two developers so we work in parallel
with **near-zero merge conflicts**, then merge cleanly. The split is by **file ownership** — each
track owns disjoint directories.

**Architecture (locked in Phase 0, see [`PHASE_0.md`](PHASE_0.md)):** Vite React **SPA**
(`bora/src/`) + Butterbase serverless **functions** (`bora/functions/`). Server logic is a function
called via `POST /v1/{app_id}/fn/{name}` — no Next.js, no SSR. Browser talks to Butterbase as the
**end-user JWT** (`src/lib/api.ts`); functions run as the **service key** (`functions/_shared/*`).

---

## Step 0 — Shared foundation (✅ MOSTLY DONE — on `main`)

The contracts both tracks build on are already committed (`129f389`). Done:

- [x] Vite SPA + functions scaffold (`index.html`, `vite.config.ts`, `src/{main,App}.tsx`, `src/index.css`)
- [x] `shared/types.ts` — typed mirror of the DB schema (the source of truth)
- [x] `src/lib/api.ts` (browser client) · `src/lib/auth.tsx` (auth context)
- [x] `functions/_shared/{bb,llm,memory}.ts` — function-runtime clients + `pickModel()` policy
- [x] **Butterbase backend live:** schema, RLS, realtime, AI gateway (`allowedModels`), Gmail+GitHub integrations, service key
- [x] `.env.example` documenting every key

**Remaining Step 0 (do before branching far):**
- [ ] Fix `scripts/check.ts` (imports deleted `src/lib/bb`/`llm`) + `.env.example` (`NEXT_PUBLIC_*`
      → `VITE_*`, port 5173) so `npm install && npm run check && npm run dev` is green
- [ ] **Google OAuth** — Google Cloud client_id/secret → `manage_oauth configure` → verify login
- [ ] Deploy `org-create` function + the SPA to Butterbase

Two cross-track **stub contracts** (so neither track blocks the other):
- `functions/recap-email.ts` (`sendRecapEmail`-shaped: takes `{ orgId, meetingId }`) — Track A's
  recap/`done` handler calls it; **Track B** implements it. Land a no-op stub early.
- `functions/chat.ts` + `functions/_shared/agent.ts` (`runChatAgent({ userId, orgId, messages })`) —
  **Track B** owns it; Slack (B) and chat (B) both call it. Track A does **not** depend on it.

---

## Track A — "Meetings & Voice" (the live-meeting spine)

Owns Recall, the proactive cascade, the bot camera page, the recap. Backend + realtime heavy.

**Phases:** 2 (passive bot) → 3 (proactive cascade) → share Phase 6 hardening.

**Owns these files (no one else touches them):**
- `functions/_shared/recall.ts` — Recall client (createBot / getBot / output media)
- `functions/_shared/escalate.ts` — Gemini Flash adjudicator/answerer (the only in-meeting brain)
- `functions/recall-webhook.ts` · `functions/speak-trigger.ts` — Butterbase functions
- Nebius trigger service (`functions/trigger.ts` inline, or a FastAPI sidecar on Nebius — decide in Phase 3)
- SPA pages: `src/pages/Meetings.tsx`, `src/pages/MeetingLive.tsx` (live console + "Go" gate)
- `src/pages/BotCam.tsx` — the public tokenized bot camera page (route `/bot/:meetingId`)
- `src/pages/Recap.tsx` — auth-gated recap page (route `/recap/:token`; video + AI notes + transcript)

**Key deliverables:**
- Recall Create Bot with `output_video` → `…/bot/{meetingId}`; webhook dedupes, streams
  `transcript_segments`, on `done` stores artifacts + generates Claude AI-notes.
- Two-gate state machine on `bot_state`: `speak_now` (immediate, Gemini answers) vs
  `should_i_speak > 0.7` (✋ raise hand → human "Go" → speak). Nebius runs every window; Gemini
  Flash only fires past the gate (prove the cost gate in logs).
- `speak-trigger`: ElevenLabs PCM → Recall Output Audio; cooldown via `last_spoke_at`.
- On meeting `done`, call `sendRecapEmail(orgId, meetingId)` (Track B's stub).

**Vendors:** Recall.ai, Nebius, ElevenLabs, Butterbase (functions/realtime/gateway-Gemini).
**Read first:** `recall-skills/`.

---

## Track B — "Org, Chat & Knowledge" (identity, agent, memory, Slack)

Owns auth/org UI, the private chat agent, two-tier memory, context ingestion, Slack, recap email.

**Phases:** 1 (org/admin + auth UI) → 4 (chat + memory + ingestion) → 5 (Slack + email) → share
Phase 6 hardening.

**Owns these files (no one else touches them):**
- SPA pages: `src/pages/{Login,AuthCallback,Home}.tsx` (exist), `src/pages/Org.tsx`,
  `src/pages/Members.tsx`, `src/pages/Chat.tsx`, `src/pages/Context.tsx`
- `src/lib/auth.tsx` — auth context (exists)
- `functions/org-create.ts` (exists) · `functions/org-invite.ts` · `functions/chat.ts` (agent endpoint)
  · `functions/ingest-source.ts` (RocketRide) · `functions/slack-event.ts` · `functions/recap-email.ts`
- `functions/_shared/agent.ts` — chat agent loop (gateway, Claude, tool-calling)
- `functions/_shared/memory.ts` — Xtrace two-tier (exists) · `functions/_shared/slack.ts`
- The SPA shell **nav** + router in `src/App.tsx` (Chat · Meetings · Context · Members · Settings) —
  Track A adds its routes; B owns the nav chrome + `App.tsx` route table.

**Key deliverables:**
- Multi-user flow: admin creates org, invites Gmail, member joins (`invited`→`active`), role gating
  in UI **and** at the API (RLS).
- Chat agent tools: `recall_team_memory`, `recall_my_memory` (scoped to `user_id`), `search_context`
  (`rag_query`), `search_meetings`. System prompt forbids leaking another user's chat.
- RocketRide `ingestion.pipe` (in-stack only) → chunks into the org's Butterbase RAG shared
  collection + key facts into shared Xtrace; mark source `ready`.
- Slack: when tagged, run the **same** `runChatAgent` with **shared** team memory (never private).
- `sendRecapEmail` implemented; cron `daily-recap` digest.

**Vendors:** Butterbase (auth/RLS/RAG/Gmail-GitHub integrations/gateway-Claude), Xtrace, RocketRide,
Photon.
**Read first:** `xtrace-skills/`, `rocketride-skills/`.

---

## Why this split has almost no conflicts

- **Disjoint files.** A owns its `src/pages/{Meetings,MeetingLive,BotCam,Recap}.tsx` + the
  `recall-webhook`/`speak-trigger`/`trigger` functions + `_shared/{recall,escalate}.ts`. B owns the
  auth/org/chat/context pages + `org-*`/`chat`/`ingest-source`/`slack-event`/`recap-email` functions
  + `_shared/{agent,memory,slack}.ts`. They never edit the same feature file.
- **`src/App.tsx` is the one shared-edit file** (the route table). Keep edits to it tiny and
  append-only (each track adds its own `<Route>` lines); if both touch it the conflict is a trivial
  2-line merge. Consider a `FEATURES` array so routes are data, not JSX both sides edit.
- **Foundation files are frozen.** `shared/types.ts`, `functions/_shared/{bb,llm}.ts`,
  `src/lib/api.ts`, `.env.example` are agreed. If one *must* change (e.g. a new column), do it as a
  tiny standalone PR to `main` and ping the other to rebase — never bundle it inside a feature PR.
- **The two cross-track calls are stubs** (`sendRecapEmail`, `runChatAgent`) with signatures fixed
  in Step 0, so each side codes against the interface, not the implementation.
- **The DB is the integration layer.** Both tracks read/write Butterbase tables (mostly different
  ones); Postgres + RLS is the contract, so wiring "just works" when branches merge.

## Branching & merge plan

1. Land Step 0 on `main`; tag `phase-0-foundation`. Both `git pull`.
2. Branch: **A** → `track/meetings`, **B** → `track/org-chat` (off `main`).
3. Work your phases. Commit small and often.
4. **Merge cadence:** open a PR per phase (e.g. `feat: phase 2 passive bot`). Merge to `main` when
   it builds + its PLAN.md "Verify" checklist passes. After any merge, the other person rebases
   their branch on `main` (cheap, since files are disjoint).
5. **Daily sync:** at least once a day, both rebase on `main` so drift stays small.
6. Schema/contract changes: separate PR to `main`, announced — never inside a feature PR.

## Phase 6 (hardening) — split when we get there

- **A:** Recall scheduling via `join_at`; cascade rate-limit/cost guard + threshold tuning;
  bot-speak audit logging; recap-link token expiry + regenerate/public toggle.
- **B:** idempotency-key cleanup cron; auth/audit-log review; Slack/email polish.

## Integration checkpoints (both present)

- **After Phase 1+2:** admin signs up → creates org → pastes a Meet link → bot joins → transcript
  streams → recap renders. (A's meeting flow on B's org/auth.)
- **After Phase 3+4:** direct-address speak + hand-raise/Go; private chat answers from memory +
  context; user A's private chat never shows for user B.
- **After Phase 5:** Slack tag replies in-thread; meeting end emails admins the recap link.
- **Final:** run the full end-to-end script in PLAN.md "End-to-end verification."

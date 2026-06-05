# WORK-SPLIT.md — Bora, 2-person build

How we divide the 6 phases of [`PLAN.md`](PLAN.md) between two developers so we work in parallel
with **near-zero merge conflicts**, then merge cleanly. The split is by **file ownership** — each
track owns disjoint directories. The only shared surface is the Phase 0 foundation, which we land
on `main` *first*.

---

## Step 0 — Land the shared foundation on `main` FIRST (do together, ~1 sitting)

Nothing parallel starts until these are on `main`. They're the contracts both tracks build on; if
they churn mid-flight, every branch conflicts.

- [ ] Next.js 15 app scaffold in `bora/` (`next.config`, `app/layout.tsx`, root shell, Tailwind)
- [ ] `src/lib/schema.ts` — finalize table/column types (already drafted)
- [ ] `src/lib/bb.ts` — Butterbase client (already drafted; agree the surface)
- [ ] `src/lib/llm.ts` — gateway client (already drafted; agree `chat()` signature)
- [ ] `.env.example` — every key documented (already drafted)
- [ ] **RLS policies** + **realtime config** + **auth/OAuth** + **RAG collection** + **Gmail/GitHub
      integrations** + **AI gateway `allowedModels`** — the rest of Phase 0 (PLAN.md §0.3–0.7)
- [ ] `scripts/check.ts` green (two-user RLS check + gateway + RAG round-trip)

> Pair on this or have one person land it and the other review. **Do not branch until `npm run
> check` passes on `main`.** Tag this commit `phase-0-foundation`.

Two cross-track **stub contracts** to agree on now (so neither track blocks the other later):
- `src/lib/email.ts` → `sendRecapEmail(orgId, meetingId)` — Track A's recap handler calls it;
  Track B implements it. Land an empty stub in Step 0.
- `src/lib/agent.ts` → `runChatAgent({ userId, orgId, messages })` — Track B owns it; Slack (B) and
  chat (B) both call it. Track A does **not** depend on it.

---

## Track A — "Meetings & Voice" (the live-meeting spine)

Owns Recall, the proactive cascade, the bot camera page, the recap. Backend + realtime heavy.

**Phases:** 2 (passive bot) → 3 (proactive cascade) → share Phase 6 hardening.

**Owns these files (no one else touches them):**
- `src/lib/recall.ts` — Recall client (createBot / getBot / output media)
- `src/lib/escalate.ts` — Gemini Flash adjudicator/answerer (the only in-meeting brain)
- `src/services/trigger/**` — Nebius trigger service (SpeakDecision; FastAPI sidecar or inline)
- Butterbase functions: `recall-webhook`, `speak-trigger`
- `src/app/meetings/**` — call-the-bot UI, live console (the "Go" gate)
- `src/app/bot/[meetingId]/**` — the public tokenized bot camera page
- `src/app/recap/[token]/**` — auth-gated recap page (video + AI notes + transcript)

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
- `src/app/(auth)/**` — login/signup, Google OAuth callback
- `src/app/org/**` — create org, invite by Gmail, role management, members
- `src/app/chat/**` + `src/app/api/chat/**` — private chat UI + API
- `src/lib/agent.ts` — chat agent loop (Butterbase gateway, Claude, tool-calling)
- `src/lib/memory.ts` — Xtrace two-tier (rememberUser / rememberTeam / recall) [drafted]
- `src/lib/email.ts` — recap email via Butterbase Gmail integration
- `src/integrations/slack.ts` — Photon Spectrum Slack presence
- Butterbase function: RocketRide context ingestion (`context_sources` → RAG + Xtrace)
- The app shell **nav** (Chat · Meetings · Context · Members · Settings) — Track A drops its pages
  into routes; B owns the nav chrome.

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

- **Disjoint directories.** A lives in `meetings/`, `bot/`, `recap/`, `recall.ts`, `escalate.ts`,
  `services/trigger/`. B lives in `(auth)/`, `org/`, `chat/`, `agent.ts`, `memory.ts`, `email.ts`,
  `integrations/`. They never edit the same file.
- **Shared files are frozen in Step 0.** `schema.ts`, `bb.ts`, `llm.ts`, `.env.example` are agreed
  up front. If one *must* change (e.g. a new column), do it as a tiny standalone PR to `main` and
  ping the other to rebase — never bundle a schema change inside a feature PR.
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

# TASKS.md — Bora build tracker

The **living checklist** for Bora, derived from [`PLAN.md`](PLAN.md) (the full design) and split per
[`WORK-SPLIT.md`](WORK-SPLIT.md). This is the single source of truth for *what's being worked on now*.

> **Update rule (both devs + Claude):** when you start a task, mark it `🔄`; when it's done +
> verified, flip it to `- [x]`. Add new tasks as they appear. Keep this file current in the **same
> commit** as the work. PLAN.md = design (stable); WORK-SPLIT.md = strategy; **TASKS.md = live state**.

**Legend** — `- [ ]` todo · `🔄` in progress · `- [x]` done & verified · ⛔ blocked (reason)
**Owners** — **[A]** Track A (Meetings & Voice) · **[B]** Track B (Org/Chat/Knowledge) · **[A+B]** both

---

## Phase 0 — Backend + scaffold  *(≈90% — see [`PHASE_0.md`](PHASE_0.md))*

**Done (live on `app_91v2kzy0pe03`, region us-east-1):**
- [x] Butterbase app created · 10-table schema applied (all tables reachable)
- [x] RLS configured — chat user-isolation, org-scoped reads, admin-only writes, service bypass
- [x] Realtime enabled on `transcript_segments`, `bot_state`
- [x] AI gateway `allowedModels` set (default `gemini-2.5-flash`, chat `claude-opus-4.8`) + service key minted
- [x] Integrations enabled: Gmail + GitHub
- [x] Vite SPA + functions scaffold committed (`129f389`)
- [x] CORS allows `http://localhost:5173`; email/password auth endpoint live
- [x] Gateway proven: both Claude + Gemini reply via `/chat/completions`

**Remaining — Lane 1: Local & Verify  [A+B, service key only]**
- [x] Fix `scripts/check.ts` — now standalone (loads `.env.local`), uses `functions/_shared/{bb,llm}`, soft-warns on RAG
- [x] Fix `.env.example` — `VITE_*` vars added, `NEXT_PUBLIC_*` dropped, port 5173, placeholders only (real keys → `.env.local`)
- [x] `npm install` → `.env.local` key set → `npm run check` green (data API + both models) → `npm run dev` boots (SPA serves 200)
- [x] **Auth round-trip verified**: signup → login returns a valid JWT (email/password; works pre-verification)
- [x] **org-create verified deployed + working**: creates org + admin member + bot (direct SQL)
- [x] **RLS org-scoping proven**: user A sees their org; non-member B sees nothing
- [ ] Finish two-user RLS proof: B can't read A's **chat** rows; non-admin can't insert `context_source`
- [x] RAG round-trip **resolved + verified** — `scripts/rag-smoke.mjs` (create→ingest→ready→query→
      synthesized answer→delete, all green). Correct routes encoded in `functions/_shared/bb.ts`.
- [ ] Smoke **Xtrace** connectivity once `XTRACE_API_KEY`/`XTRACE_ORG_ID` exist

> ✅ **RAG routes RESOLVED (Phase 4, [B]):** the working data-plane routes (service key) are
> `…/rag/collections` (create/list), `…/rag/collections/{NAME}` (get/delete),
> `…/rag/collections/{NAME}/ingest` (→202 `{documentId,status}`),
> `…/rag/collections/{NAME}/documents[/{id}]` (list/status), `…/rag/collections/{NAME}/query`
> (→`{chunks:[{content,score,document}],answer?}`). The old 404s were the wrong shape
> (`/rag/{c}/documents`, and using the collection *id* where the param is the *name*). Encoded in
> `functions/_shared/bb.ts` (`ragEnsureCollection`/`ragIngest`/`ragQuery`); proven by
> `scripts/rag-smoke.mjs`. **All RAG access is service-key, membership-gated by the function** —
> end users never hit `/rag` directly for org collections. `ingest-source` is now unblocked.
> *(Note: `org-create`'s collection step can now ensure-create `org-{id}`; or ingest does it lazily
> via `ragEnsureCollection`.)*

**Remaining — Lane 2: Backend deploy & Auth  [needs Butterbase account / MCP]**
- [ ] Deploy `org-create` function (creates per-org RAG `shared` collection + Xtrace group + bot + admin member)
- [ ] Deploy the SPA to Butterbase → live `*.butterbase.dev` URL
- [ ] Add deployed domain to CORS allowed origins
- [ ] ⛔ **Google OAuth**: Google Cloud client (redirect `…/auth/app_91v2kzy0pe03/oauth/google/callback`) → `manage_oauth configure` → test login *(blocked: needs Google creds)*
- [ ] Share missing vendor keys (Xtrace, etc.) into the team secret store

**Handoff:** Lane 2 `org-create` deploy → unblocks Lane 1 full e2e (signup → create org → RLS proof).

---

## Phase 1 — Org/Admin console + auth UI  **[B]**

- [x] Auth pages: login/signup via Butterbase (`Login.tsx`/`AuthCallback.tsx`) — verified working
- [ ] Google sign-in button → `/auth/{app}/oauth/google?redirect_to=…` *(wired in UI; needs OAuth creds #9 to work)*
- [x] Create-organization flow (creator → admin) — `org-create` deployed + verified
- [x] Org console UI built: `pages/Org.tsx` (`/org/:id`) — members table (RLS read) + invite + role + remove; Home links to it
- [x] `functions/org-members.ts` — admin-checked invite / set_role / remove (self-contained; service key over data API)
- [x] **Deployed `org-members`** via `scripts/deploy-fn.mjs` (HTTP + service key — no MCP needed) + **verified 5/5**:
      invite→201, duplicate→409, set_role→200, outsider→403, remove→200. `remove` is a **soft-delete**
      (`status='removed'`; a hard DELETE from a function 502s at the gateway though it succeeds).
- [x] Flip invited→active on first login matching `invited_email` — `functions/claim-invites.ts`
      (SPA calls it in `auth.tsx` `refresh()` after `/me`). Email comes from the **verified JWT**
      (never the body), writes via service key. Deployed + **verified 5/5**: claim→1, row flips to
      active+user_id, idempotent second call→0. *(Used a client-called claim instead of a provider
      post-auth trigger — reliable, idempotent, no special trigger type needed.)*
- [x] Role gating in UI (admin-only controls) + at the function (active-admin check)
- [x] App shell sidebar nav — `components/OrgLayout.tsx` (sidebar: Members · Chat · Knowledge ·
      Meetings · Settings + account/logout, active-route highlight). Members/Chat/Knowledge/Settings
      render inside it; Meetings is Track A's page reachable from the same nav.
- [x] Settings page — `pages/Settings.tsx` (`/org/:id/settings`) + `functions/org-settings.ts`
      (admin-only): rename org, set **Bora's name + persona** (the `bots` row; persona shapes the
      bot's voice in meetings + chat). **Verified live**: admin rename + persona persist; non-admin→403.
- [ ] **Verify (browser):** admin invites member → member joins → role gating holds. Function paths
      verified via smoke; "member joins" needs the `on-auth` flip + a real browser pass.

> 🛠 **Function deploy path (whole team):** the bb_sk service key has control-plane access over HTTP
> (`POST /v1/{app}/functions`). Use `node scripts/deploy-fn.mjs <file> <name>` to deploy any
> **self-contained** function (no `./_shared` imports — inline helpers) without MCP. Logs:
> `GET /v1/{app}/functions/<name>/logs`. (MCP `manage_*` only works once it's connected to this app's account.)

> ✅ **Build is green:** `npm run build` (`tsc -b && vite build`) passes — the earlier
> `_shared/memory.ts` / `@xtraceai/memory` type mismatch no longer trips `tsc`. (Runtime Xtrace is
> still unverified — `XTRACE_API_KEY`/`XTRACE_ORG_ID` are empty — but the types compile.)

---

## Phase 2 — Passive meeting bot (Recall capture → recap)  **[A]**

- [ ] `functions/_shared/recall.ts`: `createBot({ meetingUrl, joinAt, recordingConfig, realtimeTranscription, outputVideoUrl })`, `getBot(id)`
- [ ] "Call the bot" UI (admin, `pages/Meetings.tsx`): paste Meet/Zoom/Teams URL (+ optional `join_at`)
- [ ] Server path: insert `meetings` row + Recall Create Bot with `output_video` → `…/bot/{meetingId}`
- [ ] `functions/recall-webhook.ts` (http): **dedupe** `ctx.idempotency.claim(event.id, {scope:'recall'})`
- [ ] Webhook: status events → update `meetings.status`
- [ ] Webhook: real-time transcript events → insert `transcript_segments`
- [ ] Webhook: on **done** → Recall Retrieve → store video/audio/transcript urls in `meeting_artifacts` + `recap_token`
- [ ] On done → **AI-notes** (Claude): summary, decisions, action items, risks → `ai_notes`
- [ ] On done → call `sendRecapEmail({orgId, meetingId})` (B's stub)
- [ ] Recap page `pages/Recap.tsx` (`/recap/:token`): org-gated (RLS) + optional signed-public; embed video + notes + transcript
- [ ] **Verify:** real Meet link → bot joins → transcript streams → end → artifacts + notes → recap renders

---

## Phase 3 — Proactive cascade (Nebius → Gemini Flash) + two-gate state machine  **[A]**  *(highest risk)*

- [ ] Nebius trigger service (`functions/trigger.ts` inline **or** FastAPI sidecar on Nebius — decide on latency)
- [ ] `SpeakDecision` contract: Pydantic (authoritative, Nebius side) + **zod** mirror (Node side)
- [ ] Trigger: consume rolling transcript window (debounced per N segments / on silence) → emit `SpeakDecision`
- [ ] `functions/_shared/escalate.ts` (Gemini Flash): (a) `speak_now` answer via fast retrieval; (b) `should_i_speak>0.7` compose correction sentence
- [ ] Bot cam page `pages/BotCam.tsx` (`/bot/:meetingId`, public tokenized): WS subscribe `bot_state`; states idle→listening→✋hand_raised→speaking + caption
- [ ] Live console `pages/MeetingLive.tsx` (`/meetings/:id/live`): transcript WS, `pending_text`+`reason`, **"Go"** button → `gate_open=true`
- [ ] `functions/speak-trigger.ts`: fires when `speak_now` **or** (`should_i_speak>0.7` **and** `gate_open`); ElevenLabs PCM → Recall Output Audio; caption; reset gates; `last_spoke_at` cooldown
- [ ] **Verify:** "Bora, …?" → `speak_now` → Gemini answers immediately (no Claude in meeting)
- [ ] **Verify:** unsolicited contradiction → `should_i_speak>0.7` → ✋ preview → Go → speaks; gate closed → silent
- [ ] **Verify:** Nebius runs every window, Gemini only past 0.7 (check call counts — cost gate)

---

## Phase 4 — Private chat + Xtrace two-tier memory + RocketRide ingestion  **[B]**

- [ ] `functions/_shared/agent.ts`: agent loop on Butterbase gateway (Claude, OpenAI-compatible tool-calling)
- [~] Agent tools: **`search_context` done** — `chat.ts` retrieves top org-collection chunks
      (threshold 0.3) and injects them; Bora grounds + cites. **Verified live**: seeded an org fact,
      asked a question only answerable from it → correct answer with citation. *(Remaining tools:
      `recall_team_memory`/`recall_my_memory` (Xtrace), `search_meetings`, Gmail — and a formal
      tool-calling loop; current RAG is inline retrieval, which is enough until those land.)*
- [x] System prompt **forbids** revealing another user's private chat (in `functions/chat.ts`)
- [x] Chat UI `pages/Chat.tsx` + `functions/chat.ts`: persist `chat_threads`/`chat_messages` (RLS-private),
      reply via Claude (`claude-opus-4.8`, off-path) through the gateway. Deployed + **verified live**:
      send→reply persisted, author reads own thread (2 msgs), **RLS isolation proven** (member B sees
      0 of A's messages and A's thread is absent from B's list). Threads list + composer wired
      (`/org/:id/chat`, linked from the Org page). *(Agent tools/memory/RAG come next — basic chat first.)*
- [ ] After each turn → write to **Xtrace** per-user scope (never shared)
- [ ] `functions/_shared/memory.ts` two-tier helpers (exists) — wire into chat + meetings
- [~] Context ingestion: `functions/ingest-source.ts` (admin-only) — **text path done + verified**:
      paste text → ensure `org-{id}` collection → ingest → poll to `ready` → `context_sources` row
      (`rag_doc_ids` stored). `Context.tsx` (`/org/:id/context`, linked from Org) lists sources +
      add/remove. **Verified live**: admin add → member sees row (RLS) → chat grounds answer with
      citation; non-admin add→403; URL path guarded→501. *(RocketRide URL/GitHub fetch is the
      remaining branch — `ROCKETRIDE_APIKEY` is unset + needs a `.pipe` pipeline; guarded for now.)*
- [~] Ingestion → write chunks to org RAG collection (store `rag_doc_ids`) + mark source `ready` —
      **done for text**. Key-facts → shared **Xtrace** still pending (needs `XTRACE_*` keys).
- [ ] `check.ts` per RocketRide rules
- [ ] **Verify:** add GitHub URL + website → pending→ready → ask question only answerable from source → cited answer
- [ ] **Verify:** user A's private fact recalled for A but **never** for user B

---

## Phase 5 — Slack (Photon Spectrum) + recap email  **[B]**

- [ ] `functions/_shared/slack.ts` + `functions/slack-event.ts`: Spectrum Slack provider; on **tag** → run `runChatAgent` → `space.send(reply)` in thread
- [ ] Map Slack `team_id`/user → org/bot via `bots.slack_team_id`; Slack uses **shared** team memory (never private)
- [~] `functions/recap-email.ts` — reads meeting + `meeting_artifacts.ai_notes`, derives admin
      recipients (org admins' emails; `to` override), formats an HTML recap (summary · decisions ·
      actions · risks + link), sends via Gmail `GMAIL_SEND_EMAIL` (`/integrations/execute`) from a
      connected admin's account. **Verified live up to the send**: recipients derived, reaches send,
      **graceful no-op** when no Gmail connected; explicit `to` honored. ⛔ **live send pends a Gmail
      connection** (Settings → Connect Gmail). Caller check: service/cron allowed; a user must be an
      org member.
- [x] **Connect Gmail** UI — `Settings.tsx` Gmail panel + `api.ts` `integrationConnect/Connections/
      Disconnect`. Admin clicks Connect → `/integrations/connect` → Composio OAuth → back to Settings.
      **Verified**: connect returns a real OAuth `authUrl`. *(Completing OAuth is a one-time manual step.)*
- [x] Cron `daily-recap` function: batch digest of meetings completed in the trailing window (default
      24h), one email per org to active admins, sent via Gmail `GMAIL_SEND_EMAIL`. Deployed as a
      **cron trigger** (`0 16 * * *` UTC) via `deploy-fn.mjs` (now supports `cron "<schedule>"`).
      **Verified live**: against real data it grouped the org's 2 completed meetings, pulled each
      `ai_notes`, and rendered both summaries into the digest (empty Decisions/Actions correctly
      omitted); `to` override + `dry_run` + empty-window note all work. Graceful no-op when no Gmail
      connected. Same send gate as `recap-email` (needs a connected Gmail to actually deliver).
- [x] **Recap recipient fix (root cause):** `org-create` now stores the **creator's email** (decoded
      from the verified JWT, never the body) as `invited_email` on their admin row — the creator joins
      without an invite, so this was the one place it was missing. Without it, both `recap-email` and
      `daily-recap` derived **0** admin recipients. **Verified live**: throwaway signup → org-create →
      admin row carries `invited_email` → daily-recap derives that recipient (no override) → digest
      renders; all test data cleaned up. *(Pre-existing orgs created before this fix still lack the
      creator email — only new orgs are covered.)* `org-create` also now accepts the service key from
      `BORA_SERVICE_KEY` **or** `BUTTERBASE_API_KEY` so it deploys via the standard `deploy-fn.mjs`.
- [ ] **Verify:** tag Bora in Slack → in-thread project-aware reply
- [ ] **Verify:** end a meeting → admin inbox gets recap email *(needs a connected Gmail + Track A meeting-end calling recap-email — via `/functions/recap-email/invoke` with the service key, or a user JWT)*

---

## Phase 6 — Hardening & polish  **[A+B]**

- [ ] [A] Recall **scheduling** via `join_at` (don't join on-demand at scale)
- [ ] [A] Cascade rate-limit + cost guard; tune the 0.7 threshold + cooldown per org
- [ ] [A] Recap link token-expiry handling; "regenerate link" + public/private toggle
- [ ] [A] App-level logging for bot-speak actions
- [ ] [B] Webhook idempotency cleanup cron (`DELETE FROM _idempotency_keys WHERE expires_at < now()`)
- [ ] [B] Rely on Butterbase audit logs for auth events; review

---

## End-to-end verification (the whole system)  **[A+B]**

- [ ] 1. Admin signs up (Google) → creates org → invites teammate Gmail → teammate joins active
- [ ] 2. Admin adds GitHub repo + docs URL → both reach `ready` (RocketRide → RAG + shared Xtrace)
- [ ] 3. Admin pastes Meet link → Bora joins, shows status page as camera, streams transcript
- [ ] 4. "Bora, …?" → speak_now → Gemini answers + ElevenLabs immediately; unsolicited → ✋ → Go → speaks
- [ ] 5. Meeting ends → recap page (video + notes + transcript) → admins get recap email
- [ ] 6. Member private chat answers from shared + own private memory; another member can't see it
- [ ] 7. Tag Bora in Slack → in-thread reply from shared team knowledge

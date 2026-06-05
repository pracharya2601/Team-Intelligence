# Plan: "Bora" — Team Meeting Bot (Recall.ai + Slack + Gmail + Memory)

## Context

The user wants a multi-tenant **team meeting bot** ("Bora") that any organization can adopt. A user signs up, creates an organization (becoming admin), invites teammates by Gmail, and the whole team shares one bot. The bot:

- **Joins meetings** (Google Meet / Zoom / Teams) via **Recall.ai** when an admin pastes a meeting URL.
- Acts **passively** (records video/audio, live transcript, AI notes) and **proactively** — it renders a **live status page as its camera feed** in Meet, "raises its hand" (`should_speak = true` with prepared text) when it has something, and **speaks via ElevenLabs TTS** only after a human flips a go-ahead gate.
- Has a **private per-user chat interface** (one user's chat is never leaked to another).
- Lives in **Slack** (via Photon Spectrum) and replies when tagged.
- **Remembers** the team + project long-term via **Xtrace** (two-tier: private chat memory per user + shared team memory for meetings & context sources).
- Lets users add **context sources** (GitHub URLs, docs, plans, websites): **RocketRide** fetches/parses them and the chunks land in **Butterbase RAG** + key facts in shared Xtrace memory.
- **Emails an auto-recap** to admins after each meeting with a link to an auth-gated **recap page** (embedded video + AI notes + transcript).

**Existing foundation to reuse as reference** (in `c:\Agent_bora\gmail-agent`) — we lift *patterns/shape*, not the vendor wiring (auth + Gmail are now Butterbase-native):
- Claude tool-use **agentic loop shape** (the iterate-until-no-tool-calls structure): [src/lib/agent.ts](gmail-agent/src/lib/agent.ts) — re-pointed from the native Anthropic SDK to the **Butterbase AI gateway**.
- Chat API route + chat UI layout: [src/app/api/chat/route.ts](gmail-agent/src/app/api/chat/route.ts), [src/app/page.tsx](gmail-agent/src/app/page.tsx).
- The OAuth/token-refresh idea in [src/lib/auth.ts](gmail-agent/src/lib/auth.ts) is informative only — **Butterbase handles auth + Gmail OAuth** for us.

We create a **new app** `c:\Agent_bora\bora`, leaving `gmail-agent` untouched. **Deploy model: a static React + Vite SPA hosted on Butterbase (Cloudflare Pages) + all server logic as Butterbase serverless functions** — no Next.js SSR, no Vercel. **Butterbase** is the backend and absorbs as much as possible (DB, auth/RLS, storage, **functions**, realtime, AI gateway, RAG, Gmail/GitHub integrations). The other six vendors each do one job: **RocketRide** fetch/parse context · **Xtrace** memory · **ElevenLabs** TTS · **Photon Spectrum** Slack presence · **Nebius** trigger model · **Recall.ai** meetings.

> **Where code runs:** the SPA (browser) handles UI + auth + realtime WS + direct data/RAG reads. Everything server-side — Recall webhooks, the chat agent loop, the "should I speak" loop, `speak-trigger`, recap-token signing, recap email, RocketRide ingestion — is a **Butterbase function** (`http`/`cron`/`websocket` trigger), called from the SPA via `ANY /v1/{app_id}/fn/{name}`. The reusable libs in `bora/src/lib/` are bundled into those functions.

> ⚠️ This is a large system. The plan is sequenced into 6 phases so each leaves something runnable. Even though the user chose "everything at once," we build bottom-up (backend+auth → meetings → proactive → chat/memory → Slack → recaps) so integration risk is contained.

---

## Architecture at a glance

```
                 ┌──────────────── Next.js app (bora) ────────────────┐
   Browser ────► │  Auth (Butterbase) · Chat UI · Org/Admin console    │
                 │  Live Meeting console (transcript + "Go" gate)      │
                 │  Recap page (video + notes + transcript)            │
                 │  /bot/[meetingId]  ← rendered AS the bot's camera   │
                 └───────┬───────────────────────────┬─────────────────┘
                         │ REST + WS (realtime)       │ server actions / API routes
                         ▼                            ▼
        ┌──────────── Butterbase (do everything possible here) ─┐   ElevenLabs (TTS bytes)
        │ Postgres + RLS (orgs/teams/meetings)                  │   RocketRide (fetch/parse context)
        │ Storage (recap assets) · Realtime WS (transcript+state)│   Xtrace (two-tier memory)
        │ Functions: recall-webhook (http), speak-trigger, cron │   Nebius (self-hosted trigger model)
        │ AI gateway → Claude 4.8 (chat/notes/Slack) +          │   Photon Spectrum ──► Slack
        │   Gemini Flash (in-meeting)                           │
        │ RAG (context vectors + retrieval)                     │   ── 7-vendor stack ONLY: ──
        │ Integrations: Gmail (recap email), GitHub (repo fetch)│   Butterbase·Xtrace·Photon·Nebius
        └───────┬───────────────────────────────────────────────┘   ·RocketRide·Recall.ai·ElevenLabs
                │ webhooks / REST
                ▼
        Recall.ai  ◄──── output_video (bot page URL) + output_audio (TTS PCM)
         (Zoom / Google Meet / Teams)        Photon Spectrum ◄──► Slack

   ── Proactive cascade (per meeting, hot path — FAST MODELS ONLY, no Claude in-meeting) ──
   Recall real-time transcript ─► Nebius cheap always-on model (self-hosted)
        └─► Pydantic { speak_now: bool, should_i_speak: float, reason }
              • speak_now=true (addressed by name) ─► Gemini Flash answers (memory+context) ─► SPEAK now
              • should_i_speak>0.7 (unsolicited)   ─► Gemini Flash composes sentence ─► ✋ raise hand → human "Go" → SPEAK
   (Claude 4.8 is used ONLY off the live path: chat UI, post-meeting AI notes, Slack.)
```

> **STACK CONSTRAINT (hard rule):** the only external vendors are **Butterbase, Xtrace, Photon (Spectrum), Nebius, RocketRide, Recall.ai, ElevenLabs**. Do **everything else in Butterbase** — auth, DB, storage, realtime, functions, the **AI gateway** (Claude + Gemini), **RAG** (context retrieval), and **integrations** (Gmail send for recaps, GitHub fetch for repos). **No Qdrant, no Firecrawl, no Resend/SendGrid, no NextAuth/standalone OAuth, no svix.** Each non-Butterbase vendor maps to one job: Xtrace=memory, Photon=Slack presence, Nebius=trigger model, RocketRide=fetch/parse context, Recall.ai=meetings, ElevenLabs=TTS.

**Why these tool choices map cleanly (and stay inside the stack):**
- Butterbase **functions + idempotency** (`ctx.idempotency.claim`) are purpose-built for Recall/Slack **webhook** dedupe (providers retry on non-2xx) — and verify Recall's signature inline (no svix).
- Butterbase **realtime WS** broadcasts row changes with **RLS enforced** → perfect for live transcript fan-out and the `bot_state` flags, with per-meeting **subscription filters**.
- Butterbase **cron functions + Gmail integration** drive the post-meeting/daily recap email (no third-party email vendor).
- Butterbase **RAG** (`manage_rag_content` + `rag_query`, `shared` collections) stores context-source vectors → no separate vector DB.
- Butterbase **integrations** (`manage_integrations`) provide **GitHub** repo fetch and **Gmail** send via OAuth `execute_action` — no extra keys/vendors.
- Butterbase **AI gateway** serves both Claude (chat/notes/Slack) and Gemini Flash (in-meeting) under one key.
- Butterbase **auth** provides **Google OAuth natively** → satisfies "log in / invite Gmails" with no NextAuth.
- Butterbase **RLS** enforces "no chat leakage" + "only admins do X" at the database layer (not just UI).

---

## Phase 0 — Backend + project scaffold

1. **Create Butterbase app** (`init_app`), note `app_id` + API base URL. Pick region nearest the user.
2. **Schema** (`manage_schema` → preview → `manage_migrations`). Core tables:
   - `organizations` (id, name, created_by, created_at)
   - `org_members` (org_id, user_id, role `admin|member`, invited_email, status `invited|active`)
   - `bots` (org_id, name e.g. "Bora", persona/system-prompt overrides, slack_team_id, created_at) — one bot per org for v1
   - `context_sources` (org_id, type `github|doc|website|plan`, url/ref, status `pending|ingesting|ready|error`, added_by, rocketride_token, rag_doc_ids[], created_at) — chunks land in a per-org **Butterbase RAG** `shared` collection
   - `meetings` (id, org_id, platform, meeting_url, recall_bot_id, status `scheduled|joining|live|done|error`, started_by, join_at, started_at, ended_at)
   - `transcript_segments` (meeting_id, speaker, text, ts_start, ts_end, is_final) — realtime-enabled, filtered by `meeting_id`
   - `bot_state` (meeting_id PK, mode `idle|listening|hand_raised|speaking`, speak_now bool, should_i_speak float, pending_text, gate_open bool, last_spoke_at) — realtime-enabled; drives both the in-Meet bot page and the console. `speak_now` = direct-address immediate-speak; `should_i_speak` = unsolicited confidence (raises hand at >0.7); `gate_open` = human pressed "Go".
   - `meeting_artifacts` (meeting_id, video_url, audio_url, transcript_url, ai_notes jsonb, recap_token, recap_public bool)
   - `chat_threads` (id, org_id, user_id, title) and `chat_messages` (thread_id, role, content, created_at) — **per-user**
3. **RLS** (`manage_rls`) — the security spine:
   - `org_members`, `meetings`, `meeting_artifacts`, `context_sources`, `bots`: visible to **active members of that org**.
   - **Admin-only writes** on `context_sources`, `meetings` (join), `bots`, and `org_members` (invites/role changes) — enforce via RLS policy checking the caller's role in `org_members`.
   - `chat_threads` / `chat_messages`: **`user_id = caller`** only. This is what guarantees "never leak someone's chat."
4. **Auth** (`manage_auth_config` + `manage_oauth`): enable **Google OAuth** (matches the "log in, invite Gmails" requirement) and email/password as fallback. Configure CORS for the Next.js origin.
5. **Realtime** (`manage_realtime configure`) on `transcript_segments` and `bot_state`.
6. **AI gateway** (`manage_ai` / `PUT /v1/{app_id}/ai/config`): set `allowedModels` to the chosen Claude 4.8-class + Gemini Flash ids; mint a personal API key with the **`ai:gateway`** scope for server/function use. This is how **all** Claude + Gemini calls are made — **no Anthropic/Gemini keys**.
7. **RAG + Integrations** (Butterbase-native, keeps us in-stack): create a per-org **RAG** `shared` collection (`manage_rag_content create_collection`) for context vectors; **configure integrations** (`manage_integrations configure`) for **`gmail`** (scope `gmail.send`, used for recap email) and **`github`** (repo fetch for context). These replace Resend/SendGrid + Firecrawl + a separate vector DB.
8. **Scaffold Next.js app** at `c:\Agent_bora\bora` (mirror gmail-agent's structure). Add a Butterbase client lib (`src/lib/bb.ts`) wrapping auth + data API + WS + RAG, **and a shared LLM client (`src/lib/llm.ts`) that hits the Butterbase OpenAI-compatible `chat/completions`** (used by both the Gemini-Flash in-meeting path and the Claude chat/notes/Slack paths). Create `.env.example` documenting every key (see "Secrets" below).
9. **Verify:** sign up, create org, invite a second Gmail, confirm RLS (member B cannot read member A's chat rows; non-admin cannot insert a context source); make a test gateway call returning both a Claude and a Gemini Flash completion; confirm the RAG collection exists and a test ingest→query round-trips. `check.ts` script hits the data API as two users + the gateway + RAG.

---

## Phase 1 — Org/Admin console + auth UI

1. **Auth pages** (`src/app/(auth)/`): login/signup via Butterbase, Google button → `/auth/{app_id}/oauth/google?redirect_to=…/auth/callback`; callback page stores tokens (reuse the redirect-token pattern from Butterbase auth docs).
2. **Org flows** (`src/app/org/`):
   - Create organization (creator inserted into `org_members` as `admin`).
   - **Invite by Gmail** (admin only): insert `org_members` row `status=invited`; send invite email (Phase 5 email util). On the invitee's first Google login matching `invited_email`, flip to `active`.
   - **Promote to admin** / member management (admin only).
   - **Members can't** add context or call the bot — UI hides those controls, **and** RLS blocks the writes regardless.
3. **App shell / nav:** Chat · Meetings · Context Sources · Members · (admin) Settings.
4. **Verify:** full multi-user flow — admin creates org, invites member, member joins, role gating works in UI and at the API.

---

## Phase 2 — Passive meeting bot (Recall.ai capture → recap)

1. **Recall client** (`src/lib/recall.ts`): `createBot({ meetingUrl, joinAt, recordingConfig, realtimeTranscription, outputVideoUrl })`, `getBot(id)` for `media_shortcuts` after the call.
2. **"Call the bot" UI** (admin only, `src/app/meetings/new`): paste Meet/Zoom/Teams URL (+ optional `join_at`). Server action inserts a `meetings` row and calls Recall **Create Bot** with `output_video` pointing at our bot page `…/bot/{meetingId}` (Phase 3 builds the page; Phase 2 can ship a static placeholder).
3. **Recall webhook function** (Butterbase `recall-webhook`, http trigger):
   - **Dedupe** every event with `ctx.idempotency.claim(event.id, { scope: 'recall' })`.
   - On status events → update `meetings.status`.
   - On **real-time transcript** events → insert `transcript_segments` (realtime broadcasts to the console).
   - On **done** → call Recall Retrieve, store `video_url/audio_url/transcript_url` in `meeting_artifacts`, generate `recap_token`, **kick off AI-notes generation** (Claude summarizes the transcript into structured notes: summary, decisions, action items, risks) and store in `ai_notes`.
4. **Recap page** (`src/app/recap/[token]`): auth-gated to the org by default (RLS), with an optional signed-public mode. Embeds the Recall-hosted video, renders AI notes + full transcript. (User chose: Recall hosts media, we host the recap page.)
5. **Verify:** paste a real Meet link → bot joins → transcript rows stream in → end meeting → artifacts + AI notes populate → recap page renders video/notes/transcript.

---

## Phase 3 — Proactive bot: two-stage cascade (Nebius trigger → Gemini Flash) + two-gate state machine

Highest-risk phase. Safety comes from a **two-gate** design and a **cheap-trigger / fast-adjudicator cascade** so we never run a heavy model on every transcript chunk. **In-meeting, only fast models speak — Gemini Flash for the adjudicator/answer, Nebius for the trigger. Claude 4.8 is NOT on the live speaking path** (latency); it's reserved for chat, post-meeting AI notes, and Slack.

### The cascade (per meeting, hot path)

```
Recall.ai real-time transcript (rolling window)
        │
        ▼
Nebius self-hosted cheap model  ── always-on, every N segments / on silence ──►
        emits ONE Pydantic object:  { speak_now: bool, should_i_speak: float, reason: str }
        │
        ├─ speak_now == true        (bot was addressed by name, e.g. "Bora, can you …?")
        │       └─► GEMINI FLASH composes the answer (shared Xtrace + Butterbase RAG
        │             + meeting history via fast retrieval) ─► SPEAK IMMEDIATELY (no hand-raise, no Go)
        │
        └─ should_i_speak > 0.7      (unsolicited but worth saying)
                └─► escalate the transcript window to GEMINI FLASH:
                      final check + compose the exact sentence
                      └─► set bot_state.mode = hand_raised, pending_text = sentence  (✋)
                            └─► wait for human "Go" (gate_open) ─► SPEAK
```

**Two gates, distinct semantics** (both live on `bot_state`):
- **`speak_now`** = boolean, **immediate**. Set true only when the bot is **directly addressed**. → **Gemini Flash** composes the answer (fast retrieval over shared Xtrace + Butterbase RAG), speak right away, skip hand-raise. Fast model so a directly-asked question gets a snappy spoken answer.
- **`should_i_speak`** = confidence **float**. **> 0.7 → raise hand** (✋) and escalate to **Gemini Flash** for wording; a human presses **Go** before it voices anything. This is the unsolicited / fact-flag path.

> **Both speaking paths use Gemini Flash** (the only difference is the prompt: "answer this question" vs "compose a brief correction" + the hand-raise gate). Memory/context retrieval for the answer is done with fast vector + Xtrace lookups, not a Claude tool-loop.

### Shared Pydantic contract (the stage boundary)

The Nebius model is constrained to emit exactly this (validated with Pydantic; reject/ignore malformed output):

```python
class SpeakDecision(BaseModel):
    speak_now: bool          # True only if the bot was directly addressed by name
    should_i_speak: float    # 0..1 confidence it has a worthwhile unsolicited contribution
    reason: str              # short rationale (logged; shown as the hand-raise preview hint)
    addressed_name: str | None = None  # what triggered speak_now, if any
```

> If the app is TS-first, mirror this as a zod schema for the Node side; the **Pydantic** version is authoritative for the Nebius-side service (likely a small Python sidecar/FastAPI on Nebius, or a structured-output call to the Nebius-hosted model). Decide the sidecar-vs-inline split in this phase based on latency.

### Components

1. **Nebius trigger service** (`src/services/trigger/` or a Python sidecar on Nebius): hosts the **cheap always-on model**; consumes the rolling transcript window; returns `SpeakDecision`. Debounced (per N final segments or on a pause) to control cost/latency. Detects direct address (the bot's configured name from `bots.name`) → `speak_now`; otherwise scores `should_i_speak`. **Replaces** any heavy reasoning on the hot path.
2. **Gemini Flash adjudicator/answerer** (`src/lib/escalate.ts`): the **only in-meeting speaking brain**. Two prompts behind one fast interface: (a) when `speak_now` — answer the direct question using fast retrieval over shared Xtrace + context; (b) when `should_i_speak > 0.7` — final go/no-go + compose the **exact correction sentence**. Behind a small interface so the in-meeting model is swappable (but it stays a **fast** model — no Claude here).
3. **Bot camera page** (`src/app/bot/[meetingId]`): **public, tokenized** full-screen page Recall renders as the bot's video. Subscribes to `bot_state` over Butterbase **WS** (filter `meeting_id`). Visual states track `mode`: **idle → listening → ✋ hand_raised (shows `pending_text` preview) → speaking + live caption**. Secured by an unguessable per-meeting token (Recall's headless browser renders it; no login).
4. **Live meeting console** (`src/app/meetings/[id]/live`, authorized users): live transcript (WS on `transcript_segments`), the bot's `pending_text` + `reason`, and a **"Go" button** that flips `bot_state.gate_open = true`. (The `speak_now` path never shows a Go button — it's already speaking.)
5. **Speak path** (`speak-trigger`): fires when **either** `speak_now == true` **or** (`should_i_speak > 0.7` **and** `gate_open`). Sends the text to **ElevenLabs** (`text-to-speech/{voice}/stream`, PCM) → pipes bytes into **Recall Output Audio (real-time)** → captions the spoken text on the bot page → resets `speak_now`/`should_i_speak`/`gate_open`/`pending_text`, sets `mode=listening`, stamps `last_spoke_at`. Guard against double-speak with `last_spoke_at` + a short cooldown.

### Verify
- Say **"Bora, what did we decide about pricing?"** → `speak_now=true` → **Gemini Flash** answers from memory/context (fast retrieval) → bot speaks **immediately**, no hand-raise. (Confirm no Claude call happens during the meeting.)
- State something the context sources contradict (no name) → `should_i_speak>0.7` → ✋ + Gemini-composed preview → click **Go** → bot speaks it. With the gate closed, it stays silent.
- Confirm the **cheap Nebius model runs on every window but Gemini Flash only runs past 0.7** (check logs / call counts), proving the cost gate works.

---

## Phase 4 — Private chat + Xtrace two-tier memory + RocketRide context ingestion

1. **Chat agent** (`src/lib/agent.ts`, agent loop lifted from gmail-agent but **re-pointed at the Butterbase AI gateway** instead of the native Anthropic SDK — OpenAI-compatible `chat/completions`, tool-calling). Uses a **Claude 4.8-class** model (`anthropic/claude-sonnet-4.x`) — a **non-meeting** surface where latency is fine (the live meeting path is Gemini Flash only). Tools: `recall_team_memory` (shared Xtrace), `recall_my_memory` (private Xtrace, scoped to `user_id`), `search_context` (**Butterbase `rag_query`** over the org's shared collection), `search_meetings` (query transcripts/notes from Postgres), plus **Gmail via the Butterbase Gmail integration** for users who connect it. **System prompt** forbids revealing another user's private chat.
2. **Chat UI + API** (`src/app/chat`, `/api/chat`): persist to `chat_threads`/`chat_messages` (RLS-private). After each turn, **write to Xtrace**: the user's turns → **per-user** scope; nothing from private chat goes to the shared scope.
3. **Xtrace memory lib** (`src/lib/memory.ts`, `@xtraceai/memory`): helpers `rememberUser(userId, turns)`, `rememberTeam(orgId, turns)`, `recall(scope, query)`. **Two-tier**: meeting transcripts/notes + admin context sources → **team/group scope** (all members recall); private chats → **user scope**. The bot answers using **both**, but only ever surfaces shared facts to other people.
4. **Context ingestion: RocketRide fetch/parse → Butterbase RAG + Xtrace** (per `.claude/rules/rocketride.md` — read the docs first): create `ingestion.pipe` using **in-stack components only** — `tool_http_request` for websites/URLs (no Firecrawl), the **GitHub tool** for repos, `parse` for docs → `preprocessor` to chunk → `response_text`. When an admin adds a `context_sources` row, a Butterbase function calls the RocketRide TS SDK (`client.use({ filepath })` + `send`/`sendFiles`) to **fetch + parse + chunk**; the resulting text chunks are written into the org's **Butterbase RAG** shared collection (`manage_rag_content ingest`, store `rag_doc_ids`), and key facts are summarized into **shared Xtrace**. Mark the source `ready`. (Retrieval = Butterbase RAG; long-term facts = Xtrace. No Qdrant.) Add `check.ts` per RocketRide rules.
5. **Verify:** add a GitHub URL + a website as context → status goes pending→ready → ask the bot a question only answerable from that source → correct, cited answer. Confirm user A's private chat fact is recalled for A but **never** for user B.

---

## Phase 5 — Slack integration (Photon Spectrum) + recap email

1. **Spectrum Slack app** (`src/integrations/slack.ts`, `spectrum-ts`): configure the **Slack provider** in the `providers` array; iterate `app.messages` for `[space, message]`; when the bot is **tagged**, run the **same chat agent** and `space.send(reply)` into the **thread**. Map the Slack `team_id`/user to the org/bot via `bots.slack_team_id`. Respect privacy: a Slack reply uses **shared** team memory (a Slack channel is shared context), not anyone's private chat.
2. **Recap email via Butterbase Gmail integration** (`src/lib/email.ts` + Butterbase function): use `manage_integrations execute_action` `GMAIL_SEND_EMAIL` (the org connects a Gmail account once, scope `gmail.send`) to email **all org admins** when a meeting ends — subject "Recap: {meeting}", body = short brief (summary + decisions + action items, generated by **Claude** via the gateway) + **link to the recap page**. Trigger from the Recall `done` handler; a **cron** `daily-recap` function batches a "today's meetings" digest. **No third-party email vendor.**
3. **Verify:** tag the bot in Slack → it replies in-thread with project-aware context. End a meeting → admin inbox gets the recap email with a working link.

---

## Phase 6 — Hardening & polish

- Recall **scheduling** via `join_at` for production reliability (per Recall docs, don't join on-demand at scale).
- Webhook idempotency cleanup cron (`DELETE FROM _idempotency_keys WHERE expires_at < now()`).
- Token-expiry handling for recap links; "regenerate link" + public/private toggle.
- Rate-limit + cost guard on the proactive cascade: the Nebius trigger runs debounced (per N final segments / on silence), and **Gemini Flash only fires past the 0.7 gate** — verify call counts stay bounded under a busy meeting. Tune the 0.7 threshold + cooldown per org.
- Audit: rely on Butterbase audit logs for auth events; add app-level logging for bot-speak actions.

---

## Secrets (`bora/.env.example`)

```
# Claude (chat/notes/Slack) AND Gemini Flash (in-meeting) both go through the
# Butterbase AI gateway — NO separate Anthropic/Gemini keys needed.
# Server/functions call POST /v1/{app_id}/chat/completions with the bb_sk key below.
# (BUTTERBASE_APP_ID / BUTTERBASE_API_BASE are defined in the Butterbase block above;
#  inside Butterbase functions they're auto-injected — only BUTTERBASE_API_KEY is supplied via envVars.)
# Model ids use the gateway catalog form, e.g. anthropic/claude-sonnet-4.x and google/gemini-2.x-flash
# (pin exact ids at build time from GET /v1/public/models).
#
# Butterbase (DB · auth · storage · realtime · functions · AI gateway · RAG · integrations)
BUTTERBASE_APP_ID=
BUTTERBASE_API_BASE=
BUTTERBASE_API_KEY=              # bb_sk_... (ai:gateway + service); used for gateway, RAG, data, functions
NEXT_PUBLIC_BUTTERBASE_APP_ID=
NEXT_PUBLIC_BUTTERBASE_API_BASE=
# Claude (chat/notes/Slack) + Gemini Flash (in-meeting) both go through the gateway above — NO Anthropic/Gemini keys.
# Google OAuth + Gmail send + GitHub fetch are configured INSIDE Butterbase
#   (manage_oauth / manage_integrations) — credentials live in Butterbase, not here.
#
# Nebius (self-hosted cheap always-on trigger model — the only externally-hosted model)
NEBIUS_API_BASE=                 # OpenAI-compatible endpoint of your hosted model
NEBIUS_API_KEY=
NEBIUS_TRIGGER_MODEL=            # the small/fast model id you host for the SpeakDecision signal
# Recall.ai
RECALL_API_KEY=
RECALL_WEBHOOK_SECRET=           # verified inline in the webhook function (no svix)
RECALL_REGION=
# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
# Xtrace memory
XTRACE_API_KEY=
# Photon Spectrum (Slack presence)
PHOTON_PROJECT_ID=
PHOTON_PROJECT_SECRET=
SLACK_* (per Spectrum Slack provider)
# RocketRide (auto-managed by the VSCode extension into .env) — fetch/parse only, no Firecrawl key
ROCKETRIDE_URI=
ROCKETRIDE_APIKEY=
# App
APP_BASE_URL=                    # for bot page + recap links + OAuth redirect
```

> **No email-vendor, vector-DB, or scraper keys** — those jobs live in Butterbase (Gmail integration, RAG) and RocketRide (`tool_http_request`).

---

## Stack discipline — what we DON'T add, and what absorbs it

Everything that would normally be a separate vendor is folded into **Butterbase** to honor the 7-vendor constraint:

| Tempting external tool | ❌ Not used | ✅ In-stack replacement |
| --- | --- | --- |
| Resend / SendGrid (email) | dropped | **Butterbase Gmail integration** (`GMAIL_SEND_EMAIL`) |
| Qdrant / Pinecone (vector DB) | dropped | **Butterbase RAG** (`manage_rag_content` + `rag_query`) |
| Firecrawl (web scrape) | dropped | **RocketRide `tool_http_request`** |
| GitHub PAT/app for repo pull | dropped | **Butterbase GitHub integration** (or RocketRide GitHub tool) |
| NextAuth / standalone OAuth | dropped | **Butterbase auth** (native Google OAuth) |
| svix (webhook signatures) | dropped | inline signature check in the Butterbase function |
| Anthropic / Gemini API keys | dropped | **Butterbase AI gateway** (one `bb_sk`, `ai:gateway` scope) |

The only language-level helpers we still add (not vendors): **Pydantic** (Python) for the `SpeakDecision` contract on the Nebius side + a **zod** mirror on Node; likely a small **FastAPI sidecar on Nebius** hosting the cheap trigger model (decide inline-vs-sidecar in Phase 3).

### Model split (so it's explicit) — **no Claude on the live meeting path**
All Claude + Gemini calls go through the **Butterbase AI gateway** (`POST /v1/{app_id}/chat/completions`, OpenAI-compatible) — **one `bb_sk` key, no Anthropic/Gemini keys**. Only Nebius is hosted/keyed separately.

| Stage | Model (via Butterbase gateway, except Nebius) | When | Why |
| --- | --- | --- | --- |
| Always-on trigger | **Nebius self-hosted (cheap/fast)** — direct, not gateway | every debounced transcript window | emits `SpeakDecision` cheaply; the cost gate |
| In-meeting speaking brain (both gates) | **`google/gemini-*-flash`** | `speak_now` answer **and** `should_i_speak > 0.7` correction | **fast** spoken answers/corrections; low latency is mandatory live |
| Chat UI · post-meeting AI notes · Slack | **`anthropic/claude-sonnet-4.x`** (Claude 4.8 class) | NOT during meetings | full agent w/ memory + context + tools where latency is fine |

---

## Open implementation details to confirm during the build (not blockers)

- Exact Recall.ai endpoint paths/params for **Output Video** (bot page) and **Output Audio (real-time)** — confirm against current Recall docs at build time; the architecture above is provider-shaped and won't change if paths differ.
- Photon Spectrum **Slack provider** config specifics (the getting-started excerpt didn't include the Slack page) — confirm from `docs.photon.codes` / `github.com/photon-hq/spectrum-ts` when wiring Phase 5.
- Where the **Nebius trigger service** runs (FastAPI sidecar on Nebius vs an OpenAI-compatible structured-output call from a Node worker) and where the live loop lives (Next.js route vs Butterbase websocket-trigger function vs dedicated worker) — decide in Phase 3 based on measured latency.
- Exact **Nebius model id** for the cheap trigger and the **Gemini Flash** model id — pin at build time.
- How Recall delivers the real-time transcript that feeds the Nebius trigger (webhook vs websocket) — both are supported; pick lowest-latency for the hot path.

---

## End-to-end verification (the whole system)

1. Admin signs up via Google → creates "Acme" org → invites a teammate's Gmail → teammate logs in, becomes active member.
2. Admin adds a GitHub repo + a docs URL as context → both reach `ready` (RocketRide fetch/parse → Butterbase RAG + shared Xtrace).
3. Admin pastes a Google Meet link → **Bora** joins, shows its status page as its camera, streams a live transcript into the console.
4. **Direct address** — someone says "Bora, …?" → `speak_now` → **Gemini Flash** answers from memory/context (fast retrieval) + ElevenLabs, immediately (no hand-raise, no Claude in-meeting). **Unsolicited** — a participant says something the context contradicts → Nebius `should_i_speak>0.7` → Gemini Flash composes it → bot raises ✋ with a preview → an authorized user clicks **Go** → bot speaks via ElevenLabs.
5. Meeting ends → recap page has video + AI notes + transcript → admins receive the recap email with the link.
6. A member opens the **private chat**, asks about the project → answered from shared team memory + their own private memory; a *different* member cannot see the first member's private chat.
7. Someone **tags Bora in Slack** → it replies in-thread using shared team knowledge.

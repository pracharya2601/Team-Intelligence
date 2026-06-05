# CLAUDE.md — Bora

Guidance for Claude Code (and humans) working in this repo. **Read [`PLAN.md`](PLAN.md) for the
full design + 6-phase build plan.** This file is the always-on rules of the road.

> **The live project is Bora** (a multi-tenant team meeting bot), defined in `PLAN.md`.
> `BUILD-PLAN.md`, `SPONSORS.md`, `TECH-STACK.md` describe an **older, abandoned** fitness-coach
> idea — **ignore them.** They are gitignored and kept only for reference.

---

## What Bora is

A team meeting bot any org can adopt. It joins Google Meet / Zoom / Teams via **Recall.ai**,
records + transcribes, renders a **live status page as its camera feed**, **raises its hand and
speaks** (ElevenLabs TTS) only after a human opens a gate, has a **private per-user chat**, lives
in **Slack**, and **remembers** the team long-term. Admins get an emailed recap after each meeting.

The app lives in [`bora/`](bora/): a **Vite React SPA** (browser) + **Butterbase serverless
functions** (all server logic). No Next.js, no SSR. Backend is **Butterbase**. See
[`PHASE_0.md`](PHASE_0.md) for the deploy model and what Phase 0 already shipped.

## The 7-vendor hard rule (do not break)

The ONLY external vendors are: **Butterbase · Recall.ai · Xtrace · RocketRide · Photon (Spectrum) ·
Nebius · ElevenLabs**. Everything else is done **inside Butterbase**. Before adding any dependency
or service, check this table — if it's the left column, **don't**:

| ❌ Never add | ✅ Use instead |
| --- | --- |
| Resend / SendGrid / nodemailer | Butterbase **Gmail integration** (`GMAIL_SEND_EMAIL`) |
| Qdrant / Pinecone / pgvector-direct | Butterbase **RAG** (`manage_rag_content` + `rag_query`) |
| Firecrawl / Playwright scraping | **RocketRide** (`tool_http_request`, GitHub tool) |
| NextAuth / Auth.js / standalone OAuth | Butterbase **auth** (native Google OAuth) |
| svix / webhook-signature libs | inline signature check in the Butterbase function |
| Anthropic SDK / Google GenAI SDK / API keys | Butterbase **AI gateway** (one `bb_sk`, `ai:gateway` scope) |

Each non-Butterbase vendor maps to exactly one job: Xtrace=memory, Photon=Slack, Nebius=trigger
model, RocketRide=fetch/parse context, Recall.ai=meetings, ElevenLabs=TTS.

## Model policy (latency-driven — enforce it)

All Claude + Gemini calls go through the **Butterbase AI gateway** (`POST /v1/{app_id}/chat/completions`,
OpenAI-compatible). **No Anthropic/Gemini keys.** Only Nebius is hosted/keyed separately.

- **In a meeting, only fast models speak.** Nebius (cheap always-on trigger) → `SpeakDecision`;
  **Gemini Flash** composes/answers. **Never call Claude on the live meeting path** — latency.
- **Claude 4.8** (`anthropic/claude-opus-4.8`, the app's `BORA_MODEL_CHAT`) is for **off-path**
  surfaces only: chat UI, post-meeting AI notes, Slack replies. (`claude-opus-4.8-fast`,
  `claude-sonnet-4.6`, `claude-haiku-4.5` are also allowed on the gateway.)
- Pin exact model ids at build time from `GET /v1/public/models`.

## Security spine (Butterbase RLS — never bypass in user-facing paths)

- `chat_threads` / `chat_messages`: **`user_id = caller` only.** This guarantees "no chat ever
  leaks to another user." Never widen it. The chat agent's system prompt also forbids revealing
  another user's private chat.
- Org-scoped tables (`meetings`, `meeting_artifacts`, `context_sources`, `bots`, `org_members`):
  visible to **active members of that org**; **writes are admin-only**. Enforce in RLS, not just UI.
- `src/lib/bb.ts`: pass the **end-user JWT** for user-facing calls (RLS enforced). Use the
  `bb_sk` **service key** (RLS bypassed) **only** in webhooks / functions / ingestion / background jobs.

## Conventions

- **TypeScript everywhere.** The `SpeakDecision` contract is authoritative as **Pydantic** on the
  Nebius side; mirror it as a **zod** schema on the Node side.
- **`bora/shared/types.ts`** is the **typed source of truth** for table/column names. The live schema
  lives in Butterbase (`manage_schema` → `manage_migrations`). Keep them in sync; edit it whenever
  you migrate.
- **Server logic = Butterbase functions** in `bora/functions/`, called from the browser via
  `POST /v1/{app_id}/fn/{name}` (`callFn()` in `src/lib/api.ts`). There are NO Next.js API routes or
  server actions. Functions share `functions/_shared/{bb,llm,memory}.ts` and run as the service key;
  the browser (`src/lib/api.ts`) runs as the **end-user JWT** and never sees the service key.
- Webhooks (Recall, Slack) **must** dedupe with `ctx.idempotency.claim(event.id, { scope })` —
  providers retry on any non-2xx.
- Realtime tables: `transcript_segments`, `bot_state` — broadcast over Butterbase WS, filtered by
  `meeting_id`, RLS-aware. The bot camera page and live console subscribe to these.
- Keep the Butterbase clients dependency-free (native `fetch`): `src/lib/api.ts` (browser, JWT) and
  `functions/_shared/bb.ts` (function runtime, service key). Browser env vars are `VITE_*`
  (via `import.meta.env`), not `NEXT_PUBLIC_*`.
- In dev, the bot's in-meeting page needs a **public tunnel** (ngrok) — Recall's Output Media
  process blocks `localhost`. Set `APP_BASE_URL` accordingly.

## Local skills (read the relevant one before wiring its vendor)

- `recall-skills/` — Recall.ai (meetings, output media)
- `rocketride-skills/` — RocketRide (fetch/parse context → chunks)
- `xtrace-skills/` — Xtrace (two-tier memory)
- Butterbase has its own MCP tools + `butterbase-skills:*` skills (schema, RLS, functions, RAG,
  integrations, deploy). Use them instead of hand-rolling Butterbase calls.

## Working in this repo (2-person build)

- **[`TASKS.md`](TASKS.md) is the live task tracker** — the single source of truth for what's being
  worked on. **Update it in the same commit as the work:** mark a task `🔄` when you start, `- [x]`
  when it's done *and verified*, and add new tasks as they surface. PLAN.md = design, WORK-SPLIT.md =
  strategy, **TASKS.md = current state.**

- **Lane lock — run once per clone:** `bash scripts/setup-lane.sh A` (or `B`). This enables a
  pre-commit hook that **blocks you from committing the other lane's files**. Ownership map +
  the rule (claim your task, don't touch the other lane) live in [`OWNERSHIP.md`](OWNERSHIP.md).

We split the build across two tracks that own disjoint files. **See [`WORK-SPLIT.md`](WORK-SPLIT.md)
for who owns what and the merge plan.** The Phase 0 shared foundation (Vite SPA scaffold,
`shared/types.ts`, `functions/_shared/*`, `src/lib/api.ts`, `.env.example`, and the live Butterbase
backend) is already on `main` — both tracks build on those contracts.

## Status (keep current)

**Phase 0 ≈ 90% done** (see [`PHASE_0.md`](PHASE_0.md)). Live on Butterbase app `app_91v2kzy0pe03`
(region `us-east-1`): 10-table schema, **RLS** (chat isolation + org scoping + admin-only writes +
service bypass), **realtime** (`transcript_segments`, `bot_state`), **AI gateway** (`allowedModels`
set; default `gemini-2.5-flash`, chat `claude-opus-4.8`), **Gmail + GitHub integrations**, service
key minted. Vite SPA + functions scaffold committed.

**Carry-over (remaining Phase 0):** Google OAuth (needs a Google Cloud client_id/secret) → configure
+ verify login · run/verify the SPA locally · deploy the `org-create` function + SPA to Butterbase.
Note: `scripts/check.ts` and `.env.example` still reference the old Next.js paths/vars — fix when
touched.

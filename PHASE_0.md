# Phase 0 — What's been done

Backend foundation + app scaffold for **Bora**. This is the "everything below the product
features" layer: the Butterbase backend is live, the security model is enforced, the AI gateway
works, and the app is restructured to the final deploy model (static SPA + serverless functions).

See [PLAN.md](PLAN.md) for the full design and [MEMORY.md](MEMORY.md) for locked decisions.

## Deploy model (decided this phase)

**Static React + Vite SPA hosted on Butterbase (Cloudflare Pages) + ALL server logic as
Butterbase serverless functions.** No Next.js SSR, no Vercel. The SPA (browser) does UI + auth +
realtime + RLS-scoped reads; anything server-side (webhooks, the agent loop, the "should I speak"
loop, recap-token signing, recap email, RocketRide ingestion) is a Butterbase function called via
`POST /v1/{app_id}/fn/{name}`.

## Butterbase backend (live)

- **App:** `app_91v2kzy0pe03` · API base `https://api.butterbase.ai` · region `us-east-1`
- **Frontend URL (when deployed):** `https://bora-meeting-bot.butterbase.dev`

### Schema (migration 1) — 10 tables
`organizations`, `org_members`, `bots`, `context_sources`, `meetings`, `transcript_segments`,
`bot_state`, `meeting_artifacts`, `chat_threads`, `chat_messages`.

Key columns of note:
- `bot_state`: two gates — `speak_now` (bool, immediate/direct-address) + `should_i_speak`
  (float, unsolicited; raises hand >0.7) + `gate_open` (human pressed "Go") + `mode`.
- `context_sources.rag_doc_ids[]`: links a source to its chunks in the org's Butterbase RAG collection.

### RLS (the security spine)
- **Chat privacy:** `chat_threads` / `chat_messages` → user isolation (`user_id = current_user_id()`).
  A user can never read another user's chat. This is the "don't leak someone's chat" guarantee.
- **Org scoping:** `organizations`, `org_members`, `meetings`, `meeting_artifacts`,
  `context_sources`, `bots` → readable by **active members** of the org.
- **Admin-only writes:** `org_members` (invites/roles), `meetings` (calling the bot),
  `context_sources` (adding sources), `bots` → restricted to `role = 'admin'`.
- Platform auto-added `*_service_bypass` policies so functions (service key) can do background work.
- Note: policies cast `current_user_id()::uuid` (it returns text; our id columns are uuid).

### Realtime
Enabled on `transcript_segments` and `bot_state` (WS broadcast, filter by `meeting_id`, RLS-aware).
Drives the live meeting console and the in-Meet bot page.

### AI gateway (verified)
`allowedModels` set; both surfaces tested live through `POST /v1/{app_id}/chat/completions`:
- **In-meeting (fast):** `google/gemini-2.5-flash` — replied "ok", ~$0.0000046/call.
- **Chat / notes / Slack:** `anthropic/claude-opus-4.8` — replied "ok", ~$0.00019/call.
- The ~40× cost gap is exactly why Claude stays OFF the live meeting path.
- `defaultModel = google/gemini-2.5-flash`, `maxTokensPerRequest = 8000`.
- Also allowed: `claude-opus-4.8-fast`, `claude-sonnet-4.6`, `claude-haiku-4.5` (RAG synth),
  `gemini-3.5-flash`.

### Integrations (enabled)
- **Gmail** (`gmail`) — for the recap email (`GMAIL_SEND_EMAIL`); connected per-org at runtime.
- **GitHub** (`github`) — for fetching repo context.

### Service key
Generated `Bora server + functions` (`bb_sk_…`) for functions/server use. Stored only in
`bora/.env.local` (never committed).

## App scaffold (`bora/`)

Restructured from the initial Next.js sketch to **Vite SPA + functions**:

```
bora/
├── index.html, vite.config.ts, tsconfig.json, package.json
├── src/                      SPA (browser)
│   ├── main.tsx, App.tsx, index.css
│   ├── lib/api.ts            browser Butterbase client (user JWT; data/RAG/auth/fn/WS)
│   ├── lib/auth.tsx          auth context (/me, login/logout)
│   └── pages/                Login, AuthCallback, Home (skeleton org list + create)
├── functions/                Butterbase serverless functions
│   ├── _shared/bb.ts         data/RAG helpers + callerId + json (function runtime)
│   ├── _shared/llm.ts        AI gateway client; pickModel() enforces model policy
│   ├── _shared/memory.ts     Xtrace two-tier (private user + shared org pools)
│   └── org-create.ts         bootstraps org → admin member → bot → RAG collection → Xtrace group
├── shared/types.ts           typed mirror of the DB schema
├── scripts/check.ts          Phase 0 connectivity/gateway/RAG check
├── skills/                   recall / rocketride / xtrace skill docs (reference)
└── .env.example              every key documented (no Anthropic/Gemini keys — gateway)
```

## Not done in Phase 0 (carry-over)

- **Google login OAuth** (`manage_oauth configure`) — needs a Google Cloud **client_id +
  client_secret** with redirect URI `https://api.butterbase.ai/auth/app_91v2kzy0pe03/oauth/google/callback`.
  Until then, login can't be exercised end-to-end.
- **Frontend not yet deployed** to Butterbase; **not yet run/verified** locally.
- `org-create` function **written but not deployed** to Butterbase.

## To run / verify locally

```bash
cd bora
cp .env.example .env.local          # set BUTTERBASE_API_KEY (+ others as available)
npm install
npm run check                       # data API + gateway (both models) + RAG reachability
npm run dev                         # SPA on http://localhost:5173
```

> The in-meeting bot page (Phase 3) needs a public tunnel (ngrok) — Recall blocks `localhost`.

## Status

Phase 0 ≈ 90% complete. Remaining: Google login creds → configure + verify auth → deploy SPA +
`org-create` function. Then Phase 1 (org/admin console: invites, roles, nav, role-gating).

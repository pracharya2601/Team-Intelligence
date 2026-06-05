# Tests

## Automated — Phase 0 backend verification

```bash
cd bora
npm test          # runs tests/phase0.test.ts against the LIVE backend (app_91v2kzy0pe03)
```

Requires `bora/.env` with `BUTTERBASE_API_KEY` (the `bb_sk` service key).

**What it checks (16 assertions):**
- **Schema** — all 10 tables exist and are queryable.
- **AI gateway** — both `google/gemini-2.5-flash` (meetings) and `anthropic/claude-opus-4.8`
  (chat/notes/Slack) respond; and Gemini is cheaper than Claude (the reason Claude stays off
  the live meeting path — proven empirically each run).
- **RAG prerequisite** — `allowedModels` includes `openai/text-embedding-3-small` (+ both surface
  models). Without it, RAG ingestion fails — this suite caught exactly that on its first run.
- **Auth** — Google OAuth provider is configured + enabled with the right redirect URI; the
  email/password login endpoint is alive.

> **What it does NOT cover** (needs live third-party creds, exercised in later phases / manually):
> RLS-as-a-user (use the manual two-user flow below), Recall.ai, Xtrace recall, ElevenLabs,
> Nebius, Photon. RAG ingest→query was verified manually via the Butterbase MCP tools (a fact
> was ingested, embedded, and retrieved with a cited answer); RAG isn't a public REST route, so
> the automated suite asserts the embedding-model prerequisite instead.

## Manual — test it yourself in the browser

The SPA runs locally and talks to the live Butterbase backend.

```bash
cd bora
npm install
npm run dev        # http://localhost:5173
```

Make sure `bora/.env` has the **VITE_** vars (already set):
`VITE_BUTTERBASE_APP_ID`, `VITE_BUTTERBASE_API_BASE`. (Without them the login URL becomes
`/auth/undefined/...` → "App not found".) Restart `npm run dev` after editing `.env`.

### What you can test right now (Phase 0 surfaces)
1. **Email/password signup + login** — create an account, you land on Home.
2. **Google login** — "Continue with Google" → Google consent → back to the app.
   - You must be added as a **Test user** on the OAuth consent screen (project `bora-auth-87827`),
     or Google blocks the sign-in while the app is unverified.
3. **Home page** — shows your email + "Your organizations" (empty at first).
4. **Create organization** — this calls the `org-create` function. ⚠️ **Requires the function to
   be deployed first** (see below) — until then, "Create" returns a 404 from `/fn/org-create`.

### Deploy the org-create function (needed for create-org to work)
The function isn't deployed yet. Once deployed (via Butterbase `deploy_function`), creating an org
will bootstrap: org row → you as admin → a "Bora" bot → a per-org RAG collection → an Xtrace group.

### Two-user privacy check (verifies RLS)
1. Sign up as user A, create an org, (later) start a chat.
2. Sign up as user B in a different browser/profile.
3. Confirm B cannot see A's chats and that only admins can add context / call the bot.
   (This is enforced by RLS at the database layer, not just the UI.)

## Known follow-ups surfaced by testing
- `functions/_shared/bb.ts` and `src/lib/api.ts` reference `/rag/...` REST routes that don't exist
  — RAG runs via the Butterbase MCP tools / from inside functions. These helpers will be corrected
  to the real mechanism when Phase 4 wires context ingestion. (Does not affect Phase 0.)

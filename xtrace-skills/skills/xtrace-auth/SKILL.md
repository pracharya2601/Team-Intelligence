---
name: xtrace-auth
description: Use when setting up XTrace Memory credentials — the required Authorization (Bearer xtk_) and X-Org-Id headers, error codes, environment variables, the MemoryClient constructor, staging vs production base URL, and the browser/server key-safety rule.
---

# XTrace Memory — Authentication

Every Memory API request needs **two** pieces: an **API key** and an **org id**. The key alone is not enough — auth records are keyed by `(org_id, api_key_hash)`, so the org can't be reverse-looked-up from the key.

---

## 1. Get credentials
From the XTrace web app (`https://app.xtrace.ai`) → **Settings → API Keys**:
- **API key** — looks like `xtk_...` (treat like a password)
- **Org id** — looks like `org_...`

Keys are long-lived (no auto-expiry in v1). Store in env/secrets manager, never source control.

## 2. Headers (both required on every request)
```http
Authorization: Bearer xtk_...
X-Org-Id: org_...
```

| Error | Cause |
|---|---|
| `400 missing_org_id` | No `X-Org-Id` header |
| `401` | Missing or invalid API key |
| `403 org_mismatch` | `X-Org-Id` doesn't match the org the key belongs to |

## 3. Env vars
```bash
# .env  (gitignored)
XTRACE_API_KEY=xtk_...
XTRACE_ORG_ID=org_...
```

## 4. SDK client (builds both headers for you)
```ts
import 'dotenv/config';
import { MemoryClient } from '@xtraceai/memory';

const client = new MemoryClient({
  apiKey: process.env.XTRACE_API_KEY!,
  orgId:  process.env.XTRACE_ORG_ID!,
  // baseUrl defaults to https://api.production.xtrace.ai
  // baseUrl: 'https://api.staging.xtrace.ai',  // override for staging
});
```
Every method call carries the right headers. Full client reference → `xtrace-sdk`.

## 5. Staging vs production
- Production (default): `https://api.production.xtrace.ai`
- Staging: `https://api.staging.xtrace.ai` (set via `baseUrl`)

## 6. Browser vs server
The SDK runs in Node 18+ and modern browsers (native `fetch`), but **never ship the API key to a browser** — proxy Memory API calls through your own backend so the key stays server-side.

## 7. Rotating a leaked key
1. Issue a new key in the org admin tool.
2. Roll it into your environment/secrets manager.
3. Revoke the old key.

> x-vec uses the same `XTRACE_API_KEY` / `XTRACE_ORG_ID` but as a Python SDK with extra crypto setup — see `xtrace-xvec`.

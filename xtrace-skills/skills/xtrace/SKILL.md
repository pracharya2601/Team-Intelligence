---
name: xtrace
description: Use when building anything with XTrace — hosted memory for AI agents (send conversation turns, get back searchable facts/artifacts/episodes scoped by user or group) and x-vec, the end-to-end encrypted vector DB. Start here for concepts, the two products, and to route to the right sub-skill.
---

# XTrace

Reference + router for building with **XTrace**. Docs: https://docs.xtrace.ai · App/keys: https://app.xtrace.ai

XTrace ships **two products** under one account (shared API key + org id):

| Product | What it is | Skills |
|---|---|---|
| **XTrace Memory** | Hosted memory for AI agents — POST conversation messages, the server extracts **facts/artifacts/episodes**, embeds + stores them per-org, and you search them back with natural language scoped by user/group/agent/app. **This is the main product.** | `xtrace-auth`, `xtrace-ingest`, `xtrace-search`, `xtrace-groups`, `xtrace-api`, `xtrace-sdk` |
| **x-vec** | Low-level **end-to-end encrypted** vector DB (Python SDK + CLI). Content is AES-encrypted and vectors are homomorphically (Paillier) encrypted on your machine; the server searches over ciphertext and never sees plaintext. | `xtrace-xvec` |

> Choosing: want *managed agent memory* (turns in, facts out)? → Memory. Want *encrypted semantic search* where the server must never see your data? → x-vec.

---

## 1. XTrace Memory — concepts (30 seconds)

| Term | What it is |
|---|---|
| **Fact** | A single semantic claim from a turn (e.g. "User is vegetarian"). The default; most memory is facts. |
| **Artifact** | A structured object referenced in the conversation (doc, code snippet, summary). Server-extracted when warranted; carries `details.full_content`. |
| **Episode** | A session-scoped summary spanning a stretch of turns. |
| **Memory** | Umbrella — every Fact/Artifact/Episode is a Memory, distinguished by `type`. |
| **Group** | A shared tagging target — tag memories to a group at ingest so every member can search them (memory shared *across* users). |

You don't pre-classify on ingest — the server decides fact vs artifact vs episode.

### The loop
1. **Ingest** conversation messages → async job → extracted memories (`xtrace-ingest`).
2. **Search/list/recall** them back, scoped by what you pass (`xtrace-search`).
3. **Groups** share memory across users (`xtrace-groups`).
4. Corrections flow through **re-ingest** (supersede); there is no update — only ingest + hard delete.

---

## 2. Environments & auth (Memory API)

- **Production base URL:** `https://api.production.xtrace.ai` (SDK default)
- **Staging base URL:** `https://api.staging.xtrace.ai`
- Every request needs **both** headers: `Authorization: Bearer xtk_...` and `X-Org-Id: org_...`. Full detail → `xtrace-auth`.
- Primary client: **TypeScript SDK** `@xtraceai/memory`. (Python SDK on the roadmap.) → `xtrace-sdk`

---

## 3. Search scoping (the key mental model)
There is **no filter DSL**. Search is "scope by what you pass" — each axis **AND-narrows**, at least one is required (unscoped → `422`):

| Axis | Scopes to |
|---|---|
| `user_id` | one user's memories |
| `group_ids` | memories tagged to **any** of these groups (cross-user) |
| `agent_id` | one agent |
| `app_id` | one app |

`recall` is the exception — it ORs across *pools* to combine personal + shared in one prompt. See `xtrace-search`.

---

## 4. Which skill to use

| You want to… | Use skill |
|---|---|
| Set up credentials/headers, env vars, SDK client, staging vs prod | `xtrace-auth` |
| Write memories (ingest turns, async/sync, poll jobs, group tagging) | `xtrace-ingest` |
| Read memories (search/list/recall, scoping, retrieve vs compose) | `xtrace-search` |
| Share memory across users (register/tag/read groups) | `xtrace-groups` |
| Call the raw HTTP API (endpoints, methods, paths) | `xtrace-api` |
| Use the `@xtraceai/memory` TypeScript SDK (classes, methods, types, errors) | `xtrace-sdk` |
| Use x-vec encrypted vector DB (Python SDK + CLI, crypto, KMS) | `xtrace-xvec` |

---

## 5. Doc map

- Memory: `/introduction`, `/guides/quickstart`, `/guides/authentication`, `/guides/ingesting-memories`, `/guides/searching-memories`, `/guides/groups`, `/guides/typescript-sdk`
- API reference: `/api-reference/memories/*`, `/api-reference/groups/*`, `/api-reference/usage/get-usage`
- x-vec: `/x-vec/introduction`, `/x-vec/installation`, `/x-vec/quickstart`, `/x-vec/cli`, `/x-vec/configuration`, `/x-vec/managed-service`, `/x-vec/metadata-filtering`, `/x-vec/embedding-models`, `/x-vec/llm-inference`
- llms-full: `https://docs.xtrace.ai/llms-full.txt` · OpenAPI: `https://api.staging.xtrace.ai/openapi.public.json`

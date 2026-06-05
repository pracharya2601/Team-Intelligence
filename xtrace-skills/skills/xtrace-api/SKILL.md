---
name: xtrace-api
description: Use when calling the XTrace Memory HTTP API directly (no SDK) — base URLs, auth headers, and the full endpoint list for memories (ingest/list/get/delete/revisions/search/jobs), groups (CRUD/archive), and usage, with methods, paths, and behavior notes.
---

# XTrace Memory — HTTP API Reference

The raw REST API behind the SDK. Base URL `https://api.production.xtrace.ai` (or `https://api.staging.xtrace.ai`); all paths under `/v1`. Auth on every request: `Authorization: Bearer xtk_...` + `X-Org-Id: org_...` (`xtrace-auth`). OpenAPI: `https://api.staging.xtrace.ai/openapi.public.json`.

---

## Memories
| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/memories` | **Ingest.** Async by default → `202 + job_id`; extraction runs in background, poll the job. `?wait=true` holds up to ~30s and returns `200` with the terminal job inline, else falls back to `202 + pending`. Body: `messages`, `user_id`, `conv_id` (required) + `agent_id`/`app_id`/`group_ids`/`timestamp_format`/`extract_artifacts`. |
| `GET` | `/v1/memories` | **List** with flat-equality filters + cursor pagination. Filters: `user_id`, `agent_id`, `conv_id`, `app_id`, `group_id`, `type`. Paging: `cursor`, `limit` (1–100, default 50), `order` (`created_at_desc`/`asc`). `include=full_content` for artifact bodies. |
| `POST` | `/v1/memories/search` | **Agentic search.** Per-corpus vector retrieval → (`mode=compose` only) LLM context selection. Always returns `data: Memory[]`; `compose` also assembles `context: str` (markdown), `retrieve` leaves `context` null. Scope enforced server-side by the per-request store (`scope_user_id` / `scope_group_ids`); no caller filter DSL. |
| `GET` | `/v1/memories/{memory_id}` | **Get one** (fact/artifact/episode). Always full representation — artifacts include `details.full_content`. |
| `DELETE` | `/v1/memories/{memory_id}` | **Hard-delete** (removes the Qdrant point; no soft-delete/tombstone). Idempotent: first → `204`, subsequent → `404`. A deleted fact disappears from supersede chains. |
| `GET` | `/v1/memories/{memory_id}/revisions` | **Revision chain.** Facts → supersede chain (oldest→newest); artifacts → version chain (v1→vN); episodes → single-element. Full chain in one response; `has_more` always `false`. |
| `GET` | `/v1/memories/jobs/{job_id}` | **Poll ingest job.** Terminal states (`succeeded`/`failed`) stay queryable. `result.memories_created` / `result.memories_updated` carry thin refs `{id, type, text}` — fetch `GET /v1/memories/{id}` for the full row. Unknown/foreign id → `404 job_not_found`. |

## Groups
| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/groups` | **Create** a group on the org. Returns the persisted row incl. server-generated `id`. Body: `name`, `prompt`. |
| `GET` | `/v1/groups` | **List** groups for the calling org. Active-only by default. |
| `GET` | `/v1/groups/{group_id}` | **Get** one group. |
| `PATCH` | `/v1/groups/{group_id}` | **Update** `name`, `prompt`, and/or `status`. Changing `prompt` does **not** retroactively re-tag existing rows. |
| `DELETE` | `/v1/groups/{group_id}` | **Archive** (soft-delete): flips `status` → `archived`; rows tagged with the id remain searchable, but new ingests reject it with `422 group_archived`. Restore by `PATCH`ing `status` back to `active`. Idempotent. |

## Usage
| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/usage` | Aggregate the org's **monthly** rollup for the current calendar month (+ **daily** rows if requested) + an inline Qdrant storage snapshot. `operations` totals `messages_ingested` / `recalls` / `requests` across all keys; `quota.monthly` pairs totals vs plan caps (`limit: null` = uncapped/enterprise); `quota.rate_limit_req_per_min` is the per-key request ceiling across all memory endpoints. |

---

## Notes
- **No update endpoint for memories** — corrections flow through re-ingest (the corrected statement supersedes the old one); deletion is hard-delete only.
- Errors are JSON with stable `code` (e.g. `org_mismatch`, `memory_not_found`, `group_archived`) — see the SDK error hierarchy in `xtrace-sdk`.
- Rate limits return `429` (honor `Retry-After`).

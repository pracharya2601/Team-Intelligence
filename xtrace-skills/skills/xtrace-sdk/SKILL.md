---
name: xtrace-sdk
description: Use when writing code against the @xtraceai/memory TypeScript SDK — MemoryClient constructor options, memories methods (ingest/list/listPage/get/delete/search/retrieve/recall), jobs.pollUntilDone, groups methods, the typed error hierarchy, exported types, and retry/timeout behavior.
---

# XTrace Memory — TypeScript SDK (`@xtraceai/memory`)

The primary supported client — a hand-written wrapper over the HTTP API with idiomatic types, exponential-backoff polling, async-iterator pagination, and a typed error hierarchy. Zero runtime deps, Node 18+ (native `fetch`), browser-capable. Pair with `xtrace-auth`/`-ingest`/`-search`/`-groups`.

```bash
npm install @xtraceai/memory
```

---

## MemoryClient
```ts
import { MemoryClient } from '@xtraceai/memory';
const client = new MemoryClient({ apiKey: process.env.XTRACE_API_KEY!, orgId: process.env.XTRACE_ORG_ID! });
```

| Option | Type | Req | Default | Notes |
|---|---|---|---|---|
| `apiKey` | string | ✓ | — | `xtk_...` |
| `orgId` | string | ✓ | — | sent as `X-Org-Id` |
| `baseUrl` | string | — | `https://api.production.xtrace.ai` | override for staging/self-hosted |
| `fetch` | `typeof fetch` | — | `globalThis.fetch` | inject custom fetch |
| `maxRetries` | number | — | `2` | retries `5xx` (idempotent) + `429` (any), honors `Retry-After` |
| `requestIdFactory` | `() => string` | — | `req_<uuid>` | override `X-Request-Id` |

## client.memories
| Method | Returns | Notes |
|---|---|---|
| `ingest(body, options?)` | `IngestJob` | Body: `messages`, `user_id`, `conv_id` (req) + `agent_id`/`app_id`/`group_ids`/`timestamp_format`/`extract_artifacts`. Options: `wait?` (hold ≤30s, terminal inline), `signal?`, `requestId?`. |
| `list(query?)` | `AsyncIterable<Memory>` | Auto-paginating. Keys: `user_id`/`agent_id`/`conv_id`/`app_id`/`type`/`limit`/`order`/`include`. |
| `listPage(query?)` | `Promise<ListEnvelope<Memory>>` | Single page (`data`, `has_more`, `next_cursor`) — cursor control. |
| `get(id)` | `Promise<Memory>` | Full row incl. artifact `details.full_content`. 404 if missing. |
| `delete(id)` | `Promise<void>` | **Hard delete**; idempotent by absence (2nd → 404). No `update` — corrections via re-ingest. |
| `search(body)` | `Promise<SearchListEnvelope>` | Scope by `user_id`/`group_ids`/`agent_id`/`app_id` (AND, ≥1). `mode` default `compose`. `results.data` ranked rows; `results.context` assembled prompt when `compose`. |
| `retrieve(body)` | `Promise<SearchListEnvelope>` | Sugar forcing `mode: 'compose'`. |
| `recall(params, options?)` | `Promise<RecallResult>` | `params`: `query` (req), `pools` (≥1 `ScopePool` `{user_id?,group_ids?,agent_id?,app_id?}`), `mode` (default `compose`), `limit` (default 10). Axes AND within a pool; pools OR. Returns `{ prompt, memories, scopes }`. `options`: `template?`, `render?`, `signal?`, `requestId?`. |

`renderMemoriesPrompt(memories, opts?)` and `DEFAULT_PROMPT_TEMPLATE` are exported standalone for custom formatting.

## client.memories.jobs
| Method | Returns | Notes |
|---|---|---|
| `get(jobId)` | `Promise<IngestJob>` | Poll one job. |
| `pollUntilDone(jobId, options?)` | `Promise<IngestJob>` | Until `succeeded`/`failed`. Options: `timeoutMs?` (60_000), `initialIntervalMs?` (500), `maxIntervalMs?` (5_000), `backoffFactor?` (1.5), `signal?`. |

## client.groups
| Method | Returns | Notes |
|---|---|---|
| `create({ name, prompt })` | `Group` | `prompt` tells the ingest classifier what belongs. |
| `list()` | `Group[]` | all (active + archived) |
| `get(id)` | `Group` | |
| `update(id, { name?, prompt?, status? })` | `Group` | edit / re-prompt; `status:'archived'` archives |
| `archive(id)` | `Group` | soft-archive — drops from future ingest tagging |

## Error classes
Every failure subclasses `MemoryError`. Match the class for HTTP status, `.code` for stable server codes.
```ts
import { MemoryNotFound, RateLimited, MemoryError } from '@xtraceai/memory';
try { await client.memories.get('nope'); }
catch (err) {
  if (err instanceof MemoryNotFound) {/* 404 */}
  else if (err instanceof RateLimited) console.log('retry after', err.retryAfter);
  else if (err instanceof MemoryError) console.log(err.status, err.code, err.message);
}
```
`BadRequest` 400 · `Unauthorized` 401 · `Forbidden` 403 · `MemoryNotFound` 404 · `Conflict` 409 · `Unprocessable` 422 · `RateLimited` 429 (`.retryAfter`) · `ServerError` 5xx. Common fields: `status`, `code`, `errorType`, `requestId`, `details`.

## Types
`Memory` (discriminated union on `type`), `FactMemory`/`ArtifactMemory`/`EpisodeMemory`, `FactDetails`/`ArtifactDetails`/`EpisodeDetails`, `MemoryRef`/`MemoryType`/`MemoryStatus`; `Message`/`Role`/`IngestRequest`/`IngestJob`/`IngestJobResult`/`JobStatus`; `ListQuery`/`ListEnvelope`/`SearchRequest`/`SearchListEnvelope`/`SearchMode`; `RecallParams`/`RecallResult`/`RecallScopeStat`/`ScopePool`/`PromptTemplate`; `Group`/`GroupStatus`/`GroupCreateRequest`/`GroupUpdateRequest`/`GroupListEnvelope`; `ApiErrorBody`.

## Retries & request ids
Max retries 2 (override `maxRetries`); 5xx retried on `GET`/`HEAD` only; 429 always retried honoring `Retry-After`; backoff 250ms·500ms·1s… capped 5s with jitter; network errors on idempotent methods retry. Every request sends `X-Request-Id` (`req_<uuid>`); surfaced on errors as `err.requestId` — quote it in support tickets.

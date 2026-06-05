---
name: xtrace-ingest
description: Use when writing memories to XTrace — the ingest path (POST /v1/memories), async-by-default + sync wait:true, polling ingest jobs, required fields (messages/user_id/conv_id), what gets extracted (fact/artifact/episode), extract_artifacts, group tagging, and failure modes.
---

# XTrace Memory — Ingesting

Ingest is the **write path**. You send conversation messages; the server runs LLM extraction → facts (+ artifacts + episodes when relevant), embeds each, stores them in your org's vector index. Pair with `xtrace-search` and `xtrace-groups`.

---

## 1. Mental model
**Async by default.** Extraction is LLM-bound (~3–10s), so `POST /v1/memories` returns a **job immediately** (`202 + job_id`) and works in the background; you poll `GET /v1/memories/jobs/{job_id}`.

## 2. Required fields
- `messages` — array of `{ role, content }`. Empty → `400`.
- `user_id` — keys the per-user namespace. **Required on ingest** (optional on search).
- `conv_id` — anchors every extracted memory to a conversation (for replay, export, bulk retract).

Optional: `agent_id`, `app_id`, `group_ids` (tag to shared groups — see `xtrace-groups`), `timestamp_format` (strptime for dated turns on the batch path), `extract_artifacts` (default `true`; pass `false` to skip the artifact stage — the most expensive part).

## 3. Async ingest (default)
```ts
const job = await client.memories.ingest({
  messages: [
    { role: 'user', content: 'My favorite food is pad see ew.' },
    { role: 'assistant', content: 'Noted — Thai food.' },
  ],
  user_id: 'alice',
  conv_id: 'conv_2026_05_16',
});

// pollUntilDone: exp backoff 500ms→5s, 60s default timeout
const done = await client.memories.jobs.pollUntilDone(job.id);
if (done.status === 'failed') throw new Error(`Ingest failed: ${done.error?.message}`);
console.log('Created', done.result?.memories_created.length, 'memories');
```

## 4. Sync ingest (`wait: true`)
The server holds the connection **up to ~30s**. If extraction finishes, you get a terminal job inline (`succeeded`/`failed`); if the budget elapses, it falls back to a pending job and you poll as usual.
```ts
const job = await client.memories.ingest(
  { messages: [{ role: 'user', content: 'I am vegetarian.' }], user_id: 'alice', conv_id: 'conv_1' },
  { wait: true },
);
if (job.status === 'succeeded')      console.log(job.result?.memories_created);
else if (job.status === 'failed')    console.error(job.error);
else                                 /* poll job.id */;
```
> Use **sync** for demos/CLI/one-shots; **async** for production agent loops where you dispatch ingest and keep working.

## 5. What gets extracted
| Type | Triggered when |
|---|---|
| **Fact** | Default — a semantic claim ("User likes X"). |
| **Artifact** | Conversation references a structured object (doc/code/summary) worth storing standalone. Skip with `extract_artifacts: false`. |
| **Episode** | A stretch of turns summarized into a session memory. Server-driven; no client knob. |

`result.memories_created` holds thin refs `{id, type, text}`. For the full row call `client.memories.get(id)` (`xtrace-search`).

## 6. Group tagging
Pass `group_ids` to tag extracted memories to shared groups. At extraction a classifier reads each group's `prompt` and tags the **subset** that belongs. Unknown/archived ids are **soft-skipped** → `result.ignored_group_ids` (never fail ingest). **Max 20** group ids per ingest (more → `422`). Tagging is additive (never removes from the author's own scope). Details → `xtrace-groups`.

## 7. Failure modes
Job lands `status: "failed"` with `error.code` + `error.message`. No server-side auto-retry — resubmit the same body.
| Code | Meaning |
|---|---|
| `ingest_failed` | Generic extraction error; check `error.message` |
| `rate_limit_exceeded` | Org quota hit; wait and retry |

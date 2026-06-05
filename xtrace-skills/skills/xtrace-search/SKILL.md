---
name: xtrace-search
description: Use when reading memories from XTrace — the three read paths (search/list/recall), the AND-scoping model (user_id/group_ids/agent_id/app_id, ≥1 required), retrieve vs compose modes, cursor pagination, getting a single memory, and recall pools (AND within a pool, OR across pools).
---

# XTrace Memory — Searching

Once an ingest job reaches `succeeded`, its memories are queryable. Three read paths. Pair with `xtrace-ingest` and `xtrace-groups`.

| Path | Use when |
|---|---|
| **`search`** | You have a natural-language query → vector-ranked rows. |
| **`list`** | Browse by scope, no query ("all of Alice's memories"). |
| **`recall`** | Combine a user's own + a group's shared memories into one ready-to-inject prompt. |

---

## 1. Vector search
```ts
const results = await client.memories.search({
  query: 'what does the user like to eat?',
  user_id: 'alice',
  limit: 10,
});
for (const m of results.data) console.log(m.score?.toFixed(2), '·', m.text);
```
`query` required (non-empty). Server embeds + ranks by cosine; `data` is `Memory` rows with `.score`.

## 2. Scoping — "scope by what you pass" (no filter DSL)
Each axis **AND-narrows**; an omitted axis is unconstrained; **at least one required** (unscoped → `422`). `org` is always implicit from the key.

| Axis | Scopes to |
|---|---|
| `user_id` | one user's memories |
| `group_ids` | memories tagged to **any** of these groups (cross-user, any-of) |
| `agent_id` | one agent |
| `app_id` | one app |

```ts
await client.memories.search({ query, user_id: 'alice' });                       // Alice only
await client.memories.search({ query, user_id: 'alice', agent_id: 'planner' });  // AND
await client.memories.search({ query, group_ids: ['grp_tokyo2026'] });           // whole group (omit user_id)
await client.memories.search({ query, user_id: 'alice', group_ids: ['grp_x'] }); // INTERSECTION, not union
```
> `{ user_id, group_ids }` is an **intersection** (Alice's rows *also* tagged to the group). For "Alice's own **plus** the group's shared," use `recall`.

## 3. recall — personal + shared in one call
Runs personal and shared scopes in parallel, dedupes by id, returns one prompt sectioned by **Personal** + each group's name (shared lines attributed `you:` / `<user_id>:`).
```ts
const { prompt, memories, scopes } = await client.memories.recall({
  query: 'what should we plan for dinner on the trip?',
  pools: [
    { user_id: 'alice' },             // personal
    { group_ids: ['grp_tokyo2026'] }, // shared (any-of)
  ],
});
// inject `prompt`; `memories` = deduped score-ranked union; `scopes` = per-pool counts
```
**Axes AND *within* a pool; pools OR.** So `[{ user_id }, { app_id }]` = "alice's OR the app's"; `{ user_id, app_id }` in one pool = AND. Params: `query` (req), `pools` (≥1 `ScopePool`), `mode` (default `compose`), `limit` (default 10).

## 4. Modes: `retrieve` vs `compose`
| `mode` | `data` | `context` | Use when |
|---|---|---|---|
| `compose` *(default)* | agent-selected subset | assembled markdown block | want a ready-to-inject prompt |
| `retrieve` | raw vector-ranked rows | `null` | want raw results, cheaper, no LLM |

`client.memories.retrieve(body)` is sugar that forces `compose`.

## 5. List + cursor pagination
`search` and `list` return `has_more` + `next_cursor`. SDK `list` auto-paginates as an async iterator; `listPage` gives cursor control.
```ts
for await (const m of client.memories.list({ user_id: 'alice', limit: 50 })) { /* all pages */ }
const page = await client.memories.listPage({ user_id: 'alice', limit: 50, cursor });
```
`list` accepts the scope keys plus `type` (`fact`|`artifact`|`episode`), `order`, `include`. Cursors are tenant-scoped (`(org, key)`); not reusable across tenants. `limit` 1–100 (default 50); `order` `created_at_desc`/`asc`.

## 6. Get a single memory
```ts
const memory = await client.memories.get('5b0d0f7d-...');
```
Returns the full row including `details.full_content` for artifacts (search/list omit it by default — it can be large). 404 if missing/deleted.

## 7. include=full_content
On list/search, pass `include: 'full_content'` to get artifact bodies inline instead of fetching each with `get`.

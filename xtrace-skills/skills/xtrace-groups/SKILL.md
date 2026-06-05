---
name: xtrace-groups
description: Use when sharing XTrace memory across users — the group model (name + classifier prompt), registering a group, tagging memories at ingest via group_ids, reading shared memories back with search/recall, archiving, and best practices (group ids as access boundary, max 20 per ingest).
---

# XTrace Memory — Groups

By default a memory is scoped to the `user_id` that ingested it. **Groups** share memory *across users*: tag a memory to a group at ingest, and anyone who searches that group sees it. Pair with `xtrace-ingest` and `xtrace-search`.

> Motivating case: a travel-planning assistant where each trip is a group — every traveler's AI tags trip facts to the trip group, so the party shares one picture while personal memories stay private.

---

## 1. The model
- A **group** is a registry entry with a `name` and a `prompt`. The `prompt` describes *what belongs* — it's what the ingest classifier reads to decide which extracted memories to tag.
- Group ids are server-generated, unguessable handles (`grp_…`). **Knowing the id is the access boundary** — your app decides who belongs to which groups; the service does **not** track membership.
- Tagging is **additive**: tagging to a group never removes a memory from the author's own scope.

## 2. Register a group
```ts
const trip = await client.groups.create({
  name: 'Tokyo trip 2026',
  prompt: 'Facts about the Tokyo trip in May 2026: flights, hotels, restaurants, reservations, and dietary needs for this trip.',
});
console.log(trip.id); // "grp_4f14…"
```
Write the `prompt` like a brief to the classifier — concrete about what to include. Sharp prompt → precise tagging; vague → over/under-tags.

## 3. Tag at ingest
```ts
await client.memories.ingest({
  messages: [
    { role: 'user', content: "When I'm in Tokyo I always stay near Shibuya station." },
    { role: 'assistant', content: 'Noted.' },
  ],
  user_id: 'alice',
  conv_id: 'conv_1',
  group_ids: [trip.id],
});
```
- Each extracted memory is tagged with the **subset** of `group_ids` it belongs to (several / one / none). "Stays near Shibuya" → tagged; "I'm vegetarian" → likely untagged (general preference).
- Unknown/archived ids are **soft-skipped** → `result.ignored_group_ids` (never fail ingest).
- **Max 20** group ids per ingest (more → `422`).

## 4. Read shared memories
```ts
// Whole group, across every member — omit user_id:
const shared = await client.memories.search({ query: 'where is everyone staying?', group_ids: [trip.id] });

// A user's own + the group's shared, in one prompt — use recall:
const { prompt } = await client.memories.recall({
  query: 'what should we plan for dinner?',
  pools: [ { user_id: 'alice' }, { group_ids: [trip.id] } ],
});
```
`group_ids` matches **any-of** — pass `[tripA, tripB]` to search both at once. Remember `search({ user_id, group_ids })` is an **intersection**; use `recall` for the union (see `xtrace-search`).

## 5. Manage groups
```ts
await client.groups.list();                           // all (active + archived)
await client.groups.get(trip.id);
await client.groups.update(trip.id, { prompt: '…' }); // re-prompt the classifier
await client.groups.archive(trip.id);                 // soft-archive
```
Archiving is soft (`status: "archived"`): group stays readable but is **dropped from future ingest tagging** (a stale id just lands in `ignored_group_ids`). Re-activate via `update(id, { status: 'active' })`. Changing `prompt` does **not** retroactively re-tag existing rows.

## 6. Best practices
- **Model a real shared boundary** (a trip/project/channel) — not a single user (that's `user_id`), not a throwaway topic.
- **Write the `prompt` like a classifier brief** — name the subject so unrelated facts don't leak in.
- **Send only the groups the user is in** — your app owns membership; pass only this conversation's relevant ids. (Max 20.)
- **Keep personal personal** — untagged memories stay private; only tagged ones cross.
- **Pick the right read:** one user inside a group → `recall({ pools: [{user_id}, {group_ids}] })`; whole-group overview → `search({ group_ids })`.
- **Tagging is best-effort** (an LLM relevance call) — always read `result.ignored_group_ids`; don't build logic requiring a specific fact to be tagged.
- **Group ids are the access boundary** — don't expose an id to anyone who shouldn't read the group.
- **Archive finished groups** to stop new tagging while keeping history.

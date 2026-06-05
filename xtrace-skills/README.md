# xtrace-skills

A **local** Claude Code skills plugin for building with [XTrace](https://docs.xtrace.ai) — **hosted memory for AI agents** (send conversation turns, get back searchable facts/artifacts/episodes) and **x-vec**, the end-to-end encrypted vector DB.

All content is sourced from the official docs (`llms-full.txt` + the API reference / OpenAPI).

## Skills

| Skill | What it covers |
|---|---|
| `xtrace` | Overview + router: the two products, memory concepts (fact/artifact/episode/group), scoping model, doc map |
| `xtrace-auth` | `Bearer xtk_` + `X-Org-Id` headers, error codes, env vars, `MemoryClient`, staging vs prod, browser key safety |
| `xtrace-ingest` | Write path: async/sync (`wait:true`), job polling, required fields, what's extracted, `extract_artifacts`, group tagging, failure codes |
| `xtrace-search` | Read paths: `search`/`list`/`recall`, AND-scoping axes, `retrieve` vs `compose`, cursor pagination, `recall` pools (AND-within / OR-across) |
| `xtrace-groups` | Share memory across users: group model, classifier prompt, tag-at-ingest, archive, best practices |
| `xtrace-api` | Raw HTTP reference: every memories/groups/usage endpoint (method, path, behavior) |
| `xtrace-sdk` | `@xtraceai/memory` TS SDK: client opts, all methods, jobs, groups, typed errors, exported types, retries |
| `xtrace-xvec` | x-vec encrypted vector DB: Python SDK + CLI, 5 core objects, passphrase/KMS providers, security model, metadata filtering, inference |

## Install (local scope)

```bash
claude plugin marketplace add ./xtrace-skills
claude plugin install xtrace-skills --scope local
```

## Layout

```
xtrace-skills/
├── .claude-plugin/{plugin.json, marketplace.json}
└── skills/
    ├── xtrace/SKILL.md
    ├── xtrace-auth/SKILL.md
    ├── xtrace-ingest/SKILL.md
    ├── xtrace-search/SKILL.md
    ├── xtrace-groups/SKILL.md
    ├── xtrace-api/SKILL.md
    ├── xtrace-sdk/SKILL.md
    └── xtrace-xvec/SKILL.md
```

# rocketride-skills

A **local** Claude Code skills plugin for building with [RocketRide](https://docs.rocketride.org) — the open-source AI/ML data pipeline builder + C++ runtime.

## Skills

| Skill | Status | What it covers |
|---|---|---|
| `rocketride` | ✅ complete | Overview, core concepts (pipelines/`.pipe`, nodes, lanes, sources), router to the rest |
| `rocketride-nodes` | ✅ complete | Full node catalog (LLM, vector store, embedding, text, image, audio, video, data, agents, tools, database) with doc URLs |
| `rocketride-pipelines` | 🟡 partial | `.pipe` authoring concepts + common shapes; **exact JSON schema = TODO** (paste `/quickstart` or a node page) |
| `rocketride-sdk` | 🟡 stub | TS/Python SDK — **TODO** (paste `/sdk/node-sdk`, `/sdk/python-sdk`) |
| `rocketride-api` | 🟡 stub | HTTP API methods — **TODO** (paste the 5 `/api/*-method/` pages) |
| `rocketride-mcp` | 🟡 stub | RocketRide MCP server wiring — **TODO** (paste `/mcp_server/rocketride-mcp-server/`) |

The complete skills are grounded in the published docs overview + sitemap. The stubs need exact commands/config that the JS-rendered docs site doesn't expose to scraping — paste those pages to fill them.

## Install (local scope)

```bash
claude plugin marketplace add ./rocketride-skills
claude plugin install rocketride-skills --scope local
```

## Layout

```
rocketride-skills/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
└── skills/
    ├── rocketride/SKILL.md
    ├── rocketride-nodes/SKILL.md
    ├── rocketride-pipelines/SKILL.md
    ├── rocketride-sdk/SKILL.md
    ├── rocketride-api/SKILL.md
    └── rocketride-mcp/SKILL.md
```

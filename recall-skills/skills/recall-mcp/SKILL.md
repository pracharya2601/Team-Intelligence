---
name: recall-mcp
description: Use when connecting Recall.ai's managed (read-only) MCP server to an AI client — region MCP URLs, client config for Claude Code/Cursor/Windsurf/Codex/Claude Desktop, OAuth vs API-key auth, and the read-only tools (bots, recordings, calendars, logs, docs) it exposes.
---

# Recall.ai — MCP Server

Recall provides a **managed, read-only MCP server** giving AI clients access to your workspace (bots, recordings, calendars, logs) **and Recall's docs**. Great for building + debugging integrations. Doc: `/docs/docs-mcp`.

> This is Recall's **hosted** MCP (read-only). Not to be confused with building your own.

---

## 1. Region MCP URLs
Use the URL for your workspace's region. Server name: **`recall-ai`**.

| Region | MCP URL |
|---|---|
| US East | `https://us-east-1.recall.ai/mcp` |
| US West | `https://us-west-2.recall.ai/mcp` |
| Europe | `https://eu-central-1.recall.ai/mcp` |
| Asia Pacific | `https://ap-northeast-1.recall.ai/mcp` |

Remote-HTTP MCP clients connect directly and discover auth (OAuth) from the URL.

## 2. Client setup

**Claude Code:**
```sh
claude mcp add --transport http recall-ai https://us-east-1.recall.ai/mcp
```

**Claude Desktop:** Settings → Connectors → add custom connector → name `recall-ai`, URL `https://us-east-1.recall.ai/mcp` → complete OAuth.

**Cursor** (`~/.cursor/mcp.json`):
```json
{ "mcpServers": { "recall-ai": { "url": "https://us-east-1.recall.ai/mcp" } } }
```

**Windsurf** (`~/.codeium/mcp_config.json`):
```json
{ "mcpServers": { "recall-ai": { "serverUrl": "https://us-east-1.recall.ai/mcp" } } }
```

**Codex:**
```sh
codex mcp add recall-ai --url https://us-east-1.recall.ai/mcp
```

## 3. Autonomous agents (API-key auth)
Pass your API key as a bearer header instead of OAuth:
`Authorization: Bearer <API_TOKEN>`

Codex example (`~/.codex/config.toml`):
```toml
[mcp_servers.recall-ai]
url = "https://us-east-1.recall.ai/mcp"
http_headers = { "Authorization" = "Bearer <API_KEY>" }
```

## 4. Tools (read-only, workspace-scoped)
If you can access multiple workspaces, call `list_workspaces` first and pass `workspace_id`.

| Tool | Use |
|---|---|
| `get_info` | Active account/workspace/org + API version |
| `list_workspaces` | Workspaces for the account |
| `get_service_status` / `list_service_incidents` | Recall status / incidents |
| `list_rate_limits` | Workspace API rate limits (explain 429s) |
| `list_webhook_endpoints` / `list_webhook_deliveries` | Webhook config + delivery history |
| `list_bots` / `get_bot` | Find bots; full bot status, events, participants, chat, metadata |
| `list_recordings` / `get_recording_resource` | Find recordings; artifact/transcript details |
| `list_audio_mixed` | Mixed-audio artifacts |
| `list_calendars` / `get_calendar` | Calendar integrations |
| `list_calendar_events` / `get_calendar_event` / `get_bot_calendar_events` | Synced events; trace a bot to its invite |
| `get_bot_logs` / `get_workspace_logs` | Customer-visible runtime/workspace logs (debug joins, 500s) |
| `list_docs` / `search_docs` / `get_doc` | Browse/search/read Recall docs by slug |

## 5. Wire it into THIS project
To add it to the repo's `.mcp.json` (instead of user/global), confirm your region and auth (OAuth vs API key), then add:
```json
{ "mcpServers": { "recall-ai": { "url": "https://<region>.recall.ai/mcp" } } }
```
For autonomous/headless use, add the `Authorization: Bearer` header form. Ask me and I'll write it in.

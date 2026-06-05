---
name: rocketride-mcp
description: Use when wiring the RocketRide MCP server into an AI assistant (Claude Code/Desktop or other MCP client) so pipelines become callable tools — install/run command, config snippet, auth, and exposed tools.
---

# RocketRide MCP Server

RocketRide ships an **MCP server** that exposes pipelines as callable tools for AI assistants. This skill is for **wiring that server into an MCP client** (e.g. Claude Code's `.mcp.json`).

Docs: `/mcp_server/rocketride-mcp-server/`

> Not to be confused with the **MCP Client node** (`/tools/mcp-client`), which lets a *pipeline* call out to other MCP servers. That's a node — see `rocketride-nodes`.

---

## STATUS: stub — needs docs paste

The docs site is JS-rendered; the exact run command, config JSON, env vars/API key, and the list of exposed MCP tools could not be scraped. **Paste the `/mcp_server/rocketride-mcp-server/` page** and I'll fill the verified config below — and, if you want, write it straight into this project's `.mcp.json`.

### TODO to fill
- [ ] Launch command (npx / uvx / pip / docker) + package name
- [ ] Required env vars (API key name, base URL, pipeline id?)
- [ ] Exact MCP client config JSON (command + args + env)
- [ ] List of exposed MCP tools with descriptions
- [ ] Transport (stdio vs HTTP/SSE) and any remote URL

### Target config shape (to be confirmed)
```jsonc
// .mcp.json  (filled once the docs page is pasted)
{
  "mcpServers": {
    "rocketride": {
      "command": "<TODO>",
      "args": ["<TODO>"],
      "env": { "ROCKETRIDE_API_KEY": "<TODO>" }
    }
  }
}
```

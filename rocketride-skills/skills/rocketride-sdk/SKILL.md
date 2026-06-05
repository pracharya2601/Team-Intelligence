---
name: rocketride-sdk
description: Use when calling RocketRide pipelines from code — the TypeScript/Node SDK and the Python SDK. Install, authenticate, and run/stream a pipeline programmatically.
---

# RocketRide SDKs (TypeScript & Python)

Call RocketRide pipelines from your own code. RocketRide ships **TypeScript/Node**, **Python**, and **MCP** SDKs. (MCP → see `rocketride-mcp`.)

Docs: `/sdk/node-sdk`, `/sdk/python-sdk`

---

## STATUS: stub — needs docs paste

The docs site is JS-rendered and the exact install commands, auth setup, and API surface could not be scraped. **Paste the `/sdk/node-sdk` and `/sdk/python-sdk` pages** and I'll replace the sections below with verified content.

### TODO to fill (Node/TypeScript)
- [ ] Install command (npm/yarn package name)
- [ ] Client init + auth (API key / base URL / env var name)
- [ ] Run a pipeline (function/method, arguments, sync vs async)
- [ ] Streaming / task polling, if any
- [ ] Minimal working example

### TODO to fill (Python)
- [ ] Install command (`pip install …` package name)
- [ ] Client init + auth (API key / base URL / env var name)
- [ ] Run a pipeline (function/method signature)
- [ ] Streaming / task polling, if any
- [ ] Minimal working example

> Related: programmatic runs map onto the HTTP API methods (`send`, `use`, `validate`, `terminate`, `get-task-status`) — see `rocketride-api`.

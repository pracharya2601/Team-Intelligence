---
name: rocketride
description: Use when building anything with RocketRide — the open-source AI/ML data pipeline builder and C++ runtime. Start here for core concepts (pipelines as .pipe JSON, nodes, lanes, sources) and to route to the right sub-skill (nodes, pipelines, sdk, api, mcp).
---

# RocketRide

Reference + router for building with **RocketRide** — an open-source data pipeline builder and runtime for AI/ML workloads. Docs: https://docs.rocketride.org

---

## 1. What RocketRide is

RocketRide combines a **high-performance multithreaded C++ runtime** with a **visual pipeline builder in VS Code**. You build pipelines visually or as portable JSON, and run them on your own infrastructure (Docker, on-prem, or RocketRide Cloud).

Key capabilities:
- **C++ runtime** — native multithreading built for AI/data throughput.
- **Visual builder (VS Code)** — drag/connect/configure nodes; real-time observability of token usage, LLM calls, latency, execution.
- **50+ nodes** — 13 LLM providers, 8+ vector databases, OCR, NER, PII anonymization, and more.
- **Multi-agent workflows** — CrewAI and LangChain orchestration.
- **TypeScript, Python & MCP SDKs** — embed pipelines in apps, expose them as AI-assistant tools, or call them programmatically.
- **Managed dependencies** — Python envs, C++ toolchains, and node deps handled automatically.

---

## 2. Core concepts

### Pipelines
A **pipeline** is a directed graph of nodes that processes data from input to output. Pipelines are defined as **`.pipe` files (JSON)** and rendered/editable visually in the VS Code extension. You run, monitor, and debug them from the canvas.

### Nodes
**Nodes** are the building blocks. Each performs one operation — call an LLM, embed text, query a vector store, transform data, etc. Nodes are organized into categories (see the `rocketride-nodes` skill for the full catalog).

### Lanes
**Lanes** are the typed connections between nodes. Every node has typed **input lanes** and **output lanes**; you wire an output lane of one node to a compatible input lane of another. Some nodes (agents, LLMs) can also be invoked **as tools** by a parent node.

### Sources
Every pipeline begins with a **source node** that defines how data enters:
- **Webhook** — receives data via HTTP requests.
- **Chat** — interactive conversational interface.
- **Dropper / drag-and-drop** — file-based input.

---

## 3. Node categories (high level)

| Category | Purpose |
|---|---|
| Source | Where data enters (webhook, chat, dropper) |
| LLM | Language model providers (OpenAI, Anthropic, Google, …) |
| Store | Vector database integrations (Pinecone, Qdrant, Weaviate, …) |
| Text | Text analysis/transform (NER, PII, sentiment, …) |
| Agents | Agent framework orchestration (CrewAI, LangChain) |
| Embedding | Generate vector representations |
| Image | Image processing and OCR |
| Preprocessor | Chunking and code processing |
| Audio | Transcription and playback |
| Data | Document parsing |
| Memory | Persistent agent memory |
| Search | Web and semantic search |
| Tool | External integrations (HTTP, Python, GitHub, …) |
| Infrastructure | Output and export |
| Video | Frame extraction |
| Database | Direct database access |

Full per-node catalog → `rocketride-nodes`.

---

## 4. Which skill to use

| You want to… | Use skill |
|---|---|
| Understand a specific node and its config/lanes | `rocketride-nodes` |
| Author or edit a `.pipe` pipeline (JSON, wiring, sources) | `rocketride-pipelines` |
| Call pipelines from TypeScript or Python | `rocketride-sdk` |
| Call the RocketRide HTTP API (send/use/validate/terminate/task-status) | `rocketride-api` |
| Wire RocketRide's MCP server into an AI assistant | `rocketride-mcp` |

---

## 5. Doc map (https://docs.rocketride.org)

- Overview: `/`
- Quickstart: `/quickstart`
- Nodes overview: `/nodes-overview`
- SDK: `/sdk/node-sdk`, `/sdk/python-sdk`
- MCP server: `/mcp_server/rocketride-mcp-server/`
- API methods: `/api/send-method/`, `/api/use-method/`, `/api/validate-method/`, `/api/terminate-method/`, `/api/get-task-status-method/`
- VS Code extension: `/vscode-extension/overview`, `/vscode-extension/installation`, `/vscode-extension/usage`
- GitHub: https://github.com/rocketride-ai · Discord: https://discord.gg/9hr3tdZmEG

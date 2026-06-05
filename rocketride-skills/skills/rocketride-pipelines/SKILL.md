---
name: rocketride-pipelines
description: Use when authoring or editing a RocketRide .pipe pipeline file — wiring nodes via typed lanes, choosing a source node, invoking nodes as tools, and the .pipe JSON structure.
---

# RocketRide Pipelines (.pipe authoring)

How to author RocketRide pipelines as portable `.pipe` JSON files. Pair with `rocketride-nodes` for the node catalog.

---

## 1. Model

- A **pipeline** is a directed graph: **source node → … → output**.
- Saved as a **`.pipe` file (JSON)**; editable visually in the VS Code extension or as raw JSON.
- **Nodes** do the work; **lanes** are the typed connections. Wire an **output lane** of one node into a **compatible input lane** of another.
- Some nodes (agents, LLMs) can be invoked **as tools** by a parent node instead of (or in addition to) being wired in the main flow.

## 2. Start with a source
Every pipeline begins with exactly one **source** node:
- **Webhook** (`/source/web-hook/`) — HTTP-triggered.
- **Chat** (`/source/chat/`) — conversational.
- **Drag & Drop / Dropper** (`/source/drag-drop/`) — file input.

## 3. Typical shapes
- **RAG ingest:** Dropper/Webhook → Data parser (`/data/parser/`) → Preprocessor chunking (`/preprocessor/general-text/`) → Embedding (`/embedding/openai/`) → Vector Store (`/store/pinecone-vector-store/`).
- **RAG query:** Chat → Embedding → Vector Store (retrieve) → LLM (`/llm/anthropic/`) → Response (`/infrastructure/response/`).
- **Doc extraction:** Dropper → Image OCR (`/image/image-ocr/`) → NER (`/text/named-entity-recognition/`) → Components Data Extractor (`/text/components-data-extractor/`) → Response.
- **Agentic:** Source → Agent node (`/agents/crewai` or `/agents/langchain`) with LLM + Tool nodes attached as tools → Response.

---

## 4. `.pipe` JSON structure — TODO (needs docs paste)

> The exact `.pipe` JSON schema (top-level keys, how nodes/lanes/edges and per-node config are represented) is not yet captured here — the docs site is JS-rendered and could not be scraped.
>
> **To fill this in, paste one of:**
> - the **Quickstart** page (`/quickstart`), and/or
> - any single **node** page that shows a `.pipe`/JSON example (e.g. `/source/web-hook/`, `/llm/anthropic/`), and/or
> - an exported `.pipe` file from your VS Code project.
>
> Once pasted, replace this section with the real schema: top-level fields, the node object shape (id, type, config), the lane/edge representation, and a minimal end-to-end example.

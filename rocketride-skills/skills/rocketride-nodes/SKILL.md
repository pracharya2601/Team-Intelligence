---
name: rocketride-nodes
description: Use when choosing or configuring a RocketRide pipeline node — the full catalog of LLM, vector store, embedding, text, image, audio, video, data, agent, source, tool, and database nodes, with their doc URLs.
---

# RocketRide Node Catalog

Complete catalog of RocketRide pipeline nodes, grouped by category, with the canonical doc path for each. Base URL: `https://docs.rocketride.org`.

> This catalog is built from the published docs sitemap. For a node's exact config fields, input/output lanes, and required credentials, open its doc page (or paste it and I'll add a per-node config section to this skill).

---

## Source — where data enters
| Node | Doc |
|---|---|
| Chat | `/source/chat/` |
| Drag & Drop (Dropper) | `/source/drag-drop/` |
| Webhook | `/source/web-hook/` |

## LLM — language model providers
| Node | Doc |
|---|---|
| OpenAI | `/llm/openai/` |
| OpenAI API (compatible) | `/llm/openai-api/` |
| Anthropic | `/llm/anthropic/` |
| Google Gemini | `/llm/gemini/` |
| Amazon Bedrock | `/llm/amazon-bedrock/` |
| Vertex AI (Enterprise) | `/llm/vertexai-enterprise/` |
| Vertex AI (Personal) | `/llm/vertexai-personal/` |
| Mistral AI | `/llm/mistral-ai/` |
| DeepSeek | `/llm/deepseek/` |
| Perplexity | `/llm/perplexity/` |
| xAI (Grok) | `/llm/xai/` |
| Qwen | `/llm/qwen/` |
| MiniMax | `/llm/minimax/` |
| GMI Cloud | `/llm/gmi-cloud/` |
| Ollama (local) | `/llm/ollama/` |

## Store — vector databases
| Node | Doc |
|---|---|
| Pinecone | `/store/pinecone-vector-store/` |
| Qdrant | `/store/qdrant-vector-store/` |
| Weaviate | `/store/weaviate-vector-store/` |
| Milvus | `/store/milvus-vector-store/` |
| Chroma | `/store/chroma-vector-store/` |
| Astra DB | `/store/astra-db-vector-store/` |
| MongoDB Atlas Vector | `/store/atlas-vector-store/` |
| Postgres pgvector | `/store/postgres-pgvector/` |
| Elasticsearch | `/store/elasticsearch/` |
| OpenSearch | `/store/opensearch/` |

## Embedding — vector representations
| Node | Doc |
|---|---|
| OpenAI embeddings | `/embedding/openai/` |
| Transformer embeddings | `/embedding/transformer/` |
| Image embeddings | `/embedding/images/` |

## Text — analysis & transformation
| Node | Doc |
|---|---|
| Prompt | `/text/prompt/` |
| Question | `/text/question/` |
| Dictionary | `/text/dictionary/` |
| Named Entity Recognition (NER) | `/text/named-entity-recognition/` |
| Text Anonymization (PII) | `/text/text-anonymization/` |
| Text Summarization (LLM) | `/text/text-summarization-llm/` |
| Components Data Extractor | `/text/components-data-extractor/` |

## Image — processing & OCR
| Node | Doc |
|---|---|
| Image OCR | `/image/image-ocr/` |
| Image Cleanup | `/image/image-cleanup/` |
| Image Thumbnail | `/image/image-thumbnail/` |
| Accessibility Describe | `/image/accessibility-describe/` |
| Mistral Vision | `/image/mistral-vision/` |
| Ollama Vision | `/image/ollama-vision/` |

## Audio
| Node | Doc |
|---|---|
| Audio Transcribe | `/audio/audio-transcribe/` |

## Video
| Node | Doc |
|---|---|
| Video Frame Grabber | `/video/video-frame-grabber/` |
| TwelveLabs | `/video/twelvelabs/` |

## Data — document parsing
| Node | Doc |
|---|---|
| Parser | `/data/parser/` |
| Reducto | `/data/data-reducto/` |
| LlamaParse Docs | `/data/llamaparse-docs/` |
| Fingerprinter | `/data/fingerprinter/` |

## Preprocessor — chunking & code
| Node | Doc |
|---|---|
| General Text | `/preprocessor/general-text/` |
| Code | `/preprocessor/code/` |
| Preprocessor (LLM) | `/preprocessor/preprocessor-llm/` |

## Agents — multi-agent orchestration
| Node | Doc |
|---|---|
| CrewAI | `/agents/crewai` |
| LangChain | `/agents/langchain` |
| DeepAgent | `/agents/deepagent/` |
| RocketRide Wave | `/agents/rocketride-wave/` |

## Memory
| Node | Doc |
|---|---|
| Internal Memory | `/memory/memory-internal/` |

## Search
| Node | Doc |
|---|---|
| Exa Search | `/search/search-exa/` |

## Tool — external integrations
| Node | Doc |
|---|---|
| HTTP Request | `/tools/http-request/` |
| Python | `/tools/python/` |
| GitHub | `/tools/github/` |
| Firecrawl | `/tools/firecrawl/` |
| Chart.js | `/tools/chartjs/` |
| Bland AI | `/tools/bland-ai/` |
| MCP Client | `/tools/mcp-client` |

## Database — direct access
| Node | Doc |
|---|---|
| Postgres | `/database/postgres/` |
| MySQL | `/database/mysql/` |
| Neo4j | `/database/neo4j/` |

## Infrastructure — output/export
| Node | Doc |
|---|---|
| Response | `/infrastructure/response/` |

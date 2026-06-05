---
name: xtrace-xvec
description: Use when building with x-vec, XTrace's end-to-end encrypted vector DB (Python SDK + CLI) — install, the five core objects (ExecutionContext/Embedding/XTraceIntegration/DataLoader/Retriever), passphrase vs AWS KMS key providers, the security model, metadata filtering, embedding + LLM-inference providers, and the CLI.
---

# XTrace x-vec — Encrypted Vector DB

x-vec is the **low-level, end-to-end encrypted** vector database (distinct from XTrace Memory). Your document content is **AES-encrypted** and embedding vectors are **Paillier homomorphically encrypted** *before they leave your machine*; the server stores and searches over **ciphertext** (computes nearest-neighbor Hamming distances on encrypted vectors) and never sees plaintext. You decrypt results locally.

> Want managed agent memory (turns in, facts out)? Use **XTrace Memory** instead (`xtrace` + siblings). Use x-vec when the server must never see your data.

---

## 1. Install (Python 3.11+)
```bash
pip install xtrace-ai-sdk                  # base: SDK + Ollama/OpenAI embeddings
pip install "xtrace-ai-sdk[embedding]"     # + Sentence Transformers (local)
pip install "xtrace-ai-sdk[cli]"           # + xtrace CLI
pip install "xtrace-ai-sdk[embedding,cli]" # combined
```
Credentials: same `XTRACE_API_KEY` / `XTRACE_ORG_ID` from `app.xtrace.ai`. `XTRACE_API_URL` defaults to `https://api.production.xtrace.ai`.

## 2. Five core objects
- **ExecutionContext** — your private crypto state: a Paillier key pair (vectors) + an AES key (content), locked by a **key provider**. Create once, save it; losing it means losing the ability to decrypt. Has a unique `.id`.
- **Embedding** — text → binary vector. `embed_len` must match the ExecutionContext's `embedding_length`. Providers: Ollama (local), Sentence Transformers (local, `[embedding]` extra), OpenAI. Or convert existing floats with `Embedding.float_2_bin`.
- **XTraceIntegration** — async HTTP client to XTrace; authenticates with key+org, only ever transmits ciphertext.
- **DataLoader** — encrypts + uploads chunks to a knowledge base.
- **Retriever** — encrypts a query vector, asks XTrace for nearest neighbors over ciphertext, decrypts top-k locally.

A **knowledge base (KB)** is a namespace on XTrace for your encrypted chunks (`xtrace kb create` or the dashboard).

## 3. End-to-end (Python)
```python
from xtrace_sdk.x_vec.utils.execution_context import ExecutionContext
from xtrace_sdk.x_vec.crypto.key_provider import PassphraseKeyProvider
from xtrace_sdk.x_vec.inference.embedding import Embedding
from xtrace_sdk.integrations.xtrace import XTraceIntegration
from xtrace_sdk.x_vec.data_loaders.loader import DataLoader
from xtrace_sdk.x_vec.retrievers.retriever import Retriever

ctx = ExecutionContext.create(
    key_provider=PassphraseKeyProvider("your-secret-passphrase"),
    homomorphic_client_type="paillier_lookup",  # fastest CPU option
    embedding_length=512, key_len=1024,          # embed_len < key_len; key_len >= 1024
    path="data/exec_context",                    # saved immediately
)
embed  = Embedding("sentence_transformer", "mixedbread-ai/mxbai-embed-large-v1", 512)
xtrace = XTraceIntegration(org_id="your_org_id", api_key="your_api_key")

docs = [{"chunk_content": "…", "meta_data": {"tag1": "user_123", "tag2": "intro", "facets": ["security"]}}]
vectors = [embed.bin_embed(d["chunk_content"]) for d in docs]   # coroutines, awaited by loader
loader = DataLoader(ctx, xtrace)
index, db = await loader.load_data_from_memory(docs, vectors)
await loader.dump_db(db, index=index, kb_id="your_kb_id")

retriever = Retriever(ctx, xtrace)                              # parallel=True for big KBs
vec  = await embed.bin_embed("How does XTrace protect my data?")
ids  = await retriever.nn_search_for_ids(vec, k=3, kb_id="your_kb_id")
res  = await retriever.retrieve_and_decrypt(ids, kb_id="your_kb_id")
```
Reload a context later: `ExecutionContext.load_from_disk("passphrase", "data/exec_context")`, or back it up to XTrace with `await ctx.save_to_remote(xtrace)` / `await ExecutionContext.load_from_remote("passphrase", ctx_id, xtrace)`.

## 4. Key providers (crypto config)
- **PassphraseKeyProvider** — derives a 256-bit AES key from a passphrase via scrypt. Simple, no cloud.
- **AWSKMSKeyProvider** — envelope encryption via AWS KMS; the DEK is generated + wrapped by KMS, never persisted in plaintext (`AWSKMSKeyProvider.create(kms, "alias/xtrace")`; reload via `.from_wrapped(edek, ...)`).

HE schemes: `PaillierClient` (standard) and `PaillierLookupClient` (precomputed tables, faster — recommended for large collections); CPU by default, `DEVICE=gpu` for the (internal-testing) GPU backend. Goldwasser-Micali is experimental/research-only.

## 5. Security model — what XTrace can/can't see
**Cannot see:** chunk content (AES on client), embedding + query vectors (Paillier on client; search runs on ciphertext), the Paillier private key (never sent plaintext). **Can see:** metadata tags (`tag1`–`tag5`, `facets`, plaintext + indexed), the Paillier public key, collection structure (chunk counts, `kb_id`), and the encrypted blobs (can't decrypt).

## 6. Metadata filtering
Filter encrypted search by plaintext tags — during NN search (`meta_filter=`) or standalone (`xtrace.meta_search` / `meta_search_paginated`). Schema: `tag1` (high-cardinality id), `tag2` (collection/project), `tag3` (zero-padded number string), `tag4` (ISO-8601 date), `tag5` (source/namespace), `facets` (list). All compared as **strings** — zero-pad numbers, ISO-8601 UTC dates for correct ranges.
- Scalar ops: `$eq`/`$ne`/`$gt`/`$gte`/`$lt`/`$lte`/`$begins_with`/`$in`/`$nin`/`$contains`/`$exists`.
- `facets` ops: `$subset`/`$any`/`$none`/`$contains`/`$size`.
> ⚠️ Metadata is **plaintext** (the only part the server reads). If sensitive, store opaque/hashed values and stick to equality (`$eq`/`$in`) — range ops leak ordering.

## 7. LLM inference (RAG over retrieved context)
`InferenceClient(inference_provider=…, model_name=…, api_key=…)` — providers: `openai`, `claude` (Anthropic via OpenAI-compatible API, e.g. `claude-sonnet-4-6`), `redpill` (private TEE-GPU inference), `ollama` (local). `INFERENCE_API_KEY` read automatically.

## 8. CLI
```bash
pip install "xtrace-ai-sdk[cli]"
xtrace init                         # creds + execution context + embedding model → .env
xtrace kb create my-first-kb        # note the KB ID
xtrace xvec load ./my-docs/ <KB_ID>
xtrace xvec retrieve <KB_ID> "your query"
xtrace xvec retrieve <KB_ID> "your query" --inference openai --model gpt-4o
```
Groups: shared `init`/`version`/`shell`; `xtrace kb <create|delete|list|describe>` (needs `ADMIN_KEY`; `init --admin` to save it); `xtrace xvec <load|retrieve|query|head|fetch|upsert|upsert-file>`. `xtrace shell` for an interactive shell (omit the `xtrace` prefix inside). `x-mem` CLI commands are coming soon. Full reference: `/x-vec/cli-reference`.

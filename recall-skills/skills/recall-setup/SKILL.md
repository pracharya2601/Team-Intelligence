---
name: recall-setup
description: Use BEFORE writing any Recall.ai integration code — the prerequisites an agent and human must complete: pick a region, create API key + workspace verification secret, set up a stable ngrok PUBLIC_API_BASE_URL for local webhooks, and subscribe to the required webhook events.
---

# Recall.ai — Setup & Prerequisites

The required setup before building a Recall.ai integration. Mirrors the official "Build with AI Agents" prerequisites. Do this first; the rest of the build depends on it.

---

## 1. Environment variables to establish

| Var | What it is |
|---|---|
| `RECALL_REGION` | Exactly one of `us-west-2`, `us-east-1`, `eu-central-1`, `ap-northeast-1`. All API requests go to `https://$RECALL_REGION.recall.ai/api/...`. |
| `RECALL_API_KEY` | API key for that region. Auth header: `Authorization: Token $RECALL_API_KEY`. |
| `RECALL_WORKSPACE_VERIFICATION_SECRET` | Used to **verify requests Recall sends to you** (webhooks/websockets/callbacks). |
| `PUBLIC_API_BASE_URL` | Stable public base URL Recall uses to reach your app (e.g. webhook `https://$PUBLIC_API_BASE_URL/api/webhook/recall`). |

> Regions are separate deployments with separate credentials and region-local resources. Don't mix a key from one region with another region's base URL.

---

## 2. Human-required actions

1. **Choose `RECALL_REGION`** — one of the four above.
2. **Create `RECALL_API_KEY` + `RECALL_WORKSPACE_VERIFICATION_SECRET`** at
   `https://$RECALL_REGION.recall.ai/dashboard/developers/api-keys`
3. **Add a webhook** in the Webhooks dashboard at
   `https://$RECALL_REGION.recall.ai/dashboard/webhooks`
   - Endpoint must use `PUBLIC_API_BASE_URL`.
   - At minimum subscribe to: `bot.done`, `recording.done`, `recording.failed`, `transcript.done`, `transcript.failed`.

## 3. Agent-required action (local dev)

If developing locally, you **must** expose the local backend via a **static ngrok URL** so webhook/websocket URLs don't change on restart:

1. Follow the Local webhook development guide: `https://docs.recall.ai/docs/local-webhook-development`
2. Create a **static** ngrok URL forwarding to the local backend.
3. Confirm it's stable across tunnel restarts.
4. Save it as `PUBLIC_API_BASE_URL`.

Using a stable URL avoids 403 (CloudFront) failures and broken webhook delivery.

---

## 4. Before-starting checklist

Have all four ready before coding:
- [ ] `RECALL_REGION`
- [ ] `RECALL_API_KEY`
- [ ] `RECALL_WORKSPACE_VERIFICATION_SECRET`
- [ ] `PUBLIC_API_BASE_URL` (stable)

Then proceed to `recall-bots` to send your first bot, and `recall-webhooks` to handle events.

> Tip: connect the **Recall MCP** (`recall-mcp`) so the agent can read docs, inspect bots, and debug while building.

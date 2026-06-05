---
name: recall
description: Use when building anything with Recall.ai — the API for capturing and using meeting data (recordings, transcripts, metadata, real-time audio/video, and interactive in-meeting AI agents). Start here for products, core concepts, regions/auth, and to route to the right sub-skill.
---

# Recall.ai

Reference + router for building with **Recall.ai** — the API for capturing and using meeting data across Zoom, Google Meet, Microsoft Teams, Webex, and more. Docs: https://docs.recall.ai · Agent hub: https://docs.recall.ai/page/build-with-ai-agents

---

## 1. What Recall.ai is

Recall.ai captures meeting data — **recordings, transcripts, metadata, and real-time audio/video** — and lets your bot **interact** in the meeting (speak, show video, voice/avatar agents). You access data **in real time** during the call or **asynchronously** after it.

### Products (pick your capture path)
| Product | Use it for |
|---|---|
| **Meeting Bots** | Send a bot into an online meeting (Zoom/Meet/Teams/Webex) to capture A/V, transcripts, participant + meeting metadata — real-time or post-meeting. → `recall-bots` |
| **Desktop Recording SDK** | Capture meeting/in-person audio/video/transcripts locally on a computer, no bot in the call. |
| **Mobile Recording SDK** | (Coming soon) same, on mobile. |
| **Transcription** | Turn meeting audio into transcripts, real-time or post-meeting. → `recall-transcription` |
| **Calendar** | Sync user calendars to auto-schedule bots. |
| **Interactive live avatars / agents** | Real-time agents that listen and respond in the call (Output Media). → `recall-output-media` |
| **Meeting Direct Connect** | Native platform capture (Zoom RTMP, Google Meet Media API). |

---

## 2. Core concepts

- **Bot** — the fundamental entity for accessing a meeting. Single-use, mapped to one meeting; joins as a participant with full access to A/V, chat, screenshare, and meeting data. Whitelabel-able (name, image, audio/video output).
- **Recording** — the container that stores a bot's (or SDK's) conversation data; exposes real-time streams + async **Media** objects.
- **Media** — the typed data a recording produces: Transcript, Video (Mixed), Audio (Mixed), Participant Events, Meeting Metadata. Each has a `data` field with `download_url` once `done`. Shortcuts live in `media_shortcuts`.
- **Real-time vs Async** — get data live via **Real-Time Endpoints** (webhook/websocket; bot must be `in_call_recording`) or after the call via media `download_url`s. → `recall-realtime`
- **Webhooks** — bot status lifecycle + recording/transcript ready events (delivered via Svix). → `recall-webhooks`

---

## 3. Regions, base URLs & auth

Recall has **4 data-isolated regions** — separate deployments, separate credentials, region-local resources. Pick exactly one and use its base URL everywhere.

| Region | Base URL |
|---|---|
| US West (pay-as-you-go) | `https://us-west-2.recall.ai` |
| US East | `https://us-east-1.recall.ai` (`api.recall.ai` is equivalent) |
| EU (Frankfurt) | `https://eu-central-1.recall.ai` |
| Asia (Tokyo) | `https://ap-northeast-1.recall.ai` |

- **Auth:** `Authorization: Token <RECALL_API_KEY>` header on every API request.
- Create API keys in the dashboard: `https://<region>.recall.ai/dashboard/developers/api-keys`
- API path prefix: `/api/v1/...` (e.g. `POST https://us-west-2.recall.ai/api/v1/bot`).

Full setup (env vars, ngrok, webhook subscriptions) → `recall-setup`.

---

## 4. Which skill to use

| You want to… | Use skill |
|---|---|
| Set up creds, region, ngrok, webhook subscriptions before coding | `recall-setup` |
| Send/schedule a bot, configure recording, retrieve recording + transcript | `recall-bots` |
| Handle bot/recording/transcript webhooks (events, payloads, verification) | `recall-webhooks` |
| Receive live in-call data (websocket/webhook real-time endpoints) | `recall-realtime` |
| Generate transcripts (Recall.ai or 3rd-party providers, async/real-time) | `recall-transcription` |
| Make the bot speak / stream a webpage / build a voice/avatar agent | `recall-output-media` |
| Connect Recall's read-only MCP server to an AI client | `recall-mcp` |

---

## 5. Doc map (https://docs.recall.ai)

- Build with AI agents: `/page/build-with-ai-agents` · Agent guide + quickstarts: `/docs/agent-quickstarts`
- Getting started: `/docs/getting-started` · Quickstart (record a meeting): `/docs/quickstart`
- Bots: `/docs/bot-overview`, `/docs/creating-and-scheduling-bots`
- Webhooks: `/docs/bot-status-change-events`, `/reference/webhooks-overview`
- Real-time: `/docs/real-time-endpoints`, `/docs/real-time-event-payloads`
- Transcription: `/docs/transcription`
- Output media (agents): `/docs/stream-media`, `/docs/output-audio-in-meetings`
- Regions: `/docs/regions` · Verify requests: `/docs/authenticating-requests-from-recallai`
- MCP: `/docs/docs-mcp` · llms.txt: `https://docs.recall.ai/llms.txt`
- API reference: `/reference/bot_create`, `/reference/bot_retrieve`

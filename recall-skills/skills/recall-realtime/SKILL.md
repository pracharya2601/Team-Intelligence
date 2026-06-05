---
name: recall-realtime
description: Use when receiving live in-call data from a Recall.ai bot — real-time webhook vs websocket endpoints, the in_call_recording requirement, configuring realtime_endpoints on Create Bot, and the events (audio buffers, transcripts, participant events).
---

# Recall.ai — Real-Time Endpoints

Receive live in-meeting data (audio buffers, real-time transcripts, participant events) as the call happens. Pair with `recall-bots` (config) and `recall-transcription` (real-time providers).

---

## 1. What it is
A **real-time endpoint** is a publicly exposed URL that receives data from a **Recording** while the call is live. Two types:
- **Real-Time Webhook Endpoints** — Recall POSTs events to your URL. (`/docs/real-time-webhook-endpoints`)
- **Real-Time Websocket Endpoints** — a persistent socket; each configured websocket opens its own connection that stays open until you close it or the call ends. (`/docs/real-time-websocket-endpoints`)

All event payloads: `/docs/real-time-event-payloads`.

> Real-time endpoints are for **in-call data** (audio, transcripts, participant events). For **lifecycle status** use bot/recording webhooks instead (`recall-webhooks`).

## 2. Requirement
The bot must be in **`in_call_recording`** state to emit real-time events — a recording must be in progress to connect.

## 3. Configure
Add endpoints under `recording_config.realtime_endpoints` (or the documented config) in the **Create Bot** request, with your `PUBLIC_API_BASE_URL`-based URLs. Use real-time transcription providers for live transcripts (see `recall-transcription`).

## 4. Auth & networking
- **No static IPs/domains to allowlist.** Secure connections by **verifying requests came from Recall** (HMAC with `RECALL_WORKSPACE_VERIFICATION_SECRET`): `/docs/authenticating-requests-from-recallai`.
- Locally, expose your receiver via a stable ngrok `PUBLIC_API_BASE_URL` (`recall-setup`).

## 5. From an Output Media webpage
If you're streaming a webpage into the meeting (voice/avatar agent, see `recall-output-media`), you can also read live transcripts directly in the page via the bot websocket:
```js
const ws = new WebSocket('wss://meeting-data.bot.recall.ai/api/v1/transcript');
// messages match the `data` object shape from /docs/real-time-transcription#events
```

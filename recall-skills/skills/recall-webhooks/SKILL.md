---
name: recall-webhooks
description: Use when handling Recall.ai webhooks — bot status-change events (bot.joining_call … bot.done/bot.fatal) and recording/transcript ready events, their payload schema, handler requirements (2xx, retries, 15s timeout), and verifying requests came from Recall.
---

# Recall.ai — Webhooks

React to bot lifecycle and artifact-ready events asynchronously. Configured per environment in the Webhooks dashboard; delivered via **Svix**. Pair with `recall-setup` (subscriptions) and `recall-realtime` (in-call data).

---

## 1. Handler requirements (must follow)
- **Return HTTP `2xx`** — anything else is treated as failure.
- **Retries:** if no `2xx`, Recall retries for **24 hours** with increasing backoff.
- **Timeout:** **15 seconds** per event. Kick off long work **asynchronously** and respond fast.
- **Endpoint disabled** if all attempts fail for 5 days (clock starts after repeated failures within a 24h span). You can subscribe to email alerts for failing delivery.

## 2. Bot status-change events
Sent whenever a bot's status changes. Payload schema:

```json
{
  "event": "bot.in_call_recording",  // see list below
  "data": {
    "data": { "code": "string", "sub_code": "string | null", "updated_at": "string" },
    "bot":  { "id": "string", "metadata": {} }
  }
}
```

| Event | Meaning |
|---|---|
| `bot.joining_call` | Acknowledged join request, connecting. |
| `bot.in_waiting_room` | In the meeting's waiting room. |
| `bot.in_call_not_recording` | Joined but not recording (setting up / no permission / paused). |
| `bot.recording_permission_allowed` | Host allowed recording. |
| `bot.recording_permission_denied` | Host denied (see `data.sub_code`). |
| `bot.in_call_recording` | Actively recording A/V. (Required state for real-time endpoints.) |
| `bot.call_ended` | Bot left the call (`data.sub_code` = why). |
| `bot.done` | Bot shut down; if it recorded, media is uploaded & downloadable. |
| `bot.fatal` | Error shut the bot down (`data.sub_code` = why). May still emit `done` with partial media. |
| `bot.breakout_room_entered` / `_left` / `_opened` / `_closed` | Breakout room transitions. |

> Don't treat `code`/`sub_code` as a fixed enum — new values may be added without notice. `sub_code` reference: `/docs/sub-codes#fatal-sub-codes`.

## 3. Artifact / async events
Subscribe to these (at minimum, per setup): `recording.done`, `recording.failed`, `transcript.done`, `transcript.failed`, plus `bot.done`. Use them to know when to fetch download URLs (see `recall-bots` §3). Recording-specific webhooks: `/docs/recording-webhooks`.

## 4. Verify requests came from Recall
Verify webhook/websocket/callback authenticity (HMAC, using your `RECALL_WORKSPACE_VERIFICATION_SECRET`) per `/docs/authenticating-requests-from-recallai`. There's **no static IP/domain allowlist** — use verification instead.

## 5. Testing locally
Use a stable ngrok `PUBLIC_API_BASE_URL` (see `recall-setup`) and `/docs/testing-webhooks-locally`. Inspect delivery history on the bot page ("View Webhooks") in the dashboard.

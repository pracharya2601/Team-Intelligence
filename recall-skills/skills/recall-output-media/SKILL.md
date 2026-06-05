---
name: recall-output-media
description: Use when making a Recall.ai bot speak, play audio, or stream video INTO a meeting — building interactive voice/avatar AI agents via Output Media (webpage streaming), plus Output Audio and automatic_audio_output for short clips.
---

# Recall.ai — Output Media (interactive in-meeting agents)

Make the bot an active participant: speak, play audio, or stream video into the call. This is how you build **voice agents and live avatars**. Pair with `recall-bots`, `recall-realtime`, and `recall-transcription`.

> "Send AI Agents to Meetings" = the **Output Media API**. Doc: `/docs/stream-media`. Sample apps: voice-agent-demo, HeyGen live-avatar demo (github.com/recallai).

---

## 1. Pick the right output

| Need | Use |
|---|---|
| Back-and-forth conversation / voice agent / live avatar (longer, dynamic A/V) | **Output Media** (`reference/bot_output_media_create`) |
| Short, on-demand clip (greeting, disclaimer) triggered via API | **Output Audio** (`reference/bot_output_audio_create`) |
| Short clip auto-played on recording start (and optional replay on join) | **`automatic_audio_output`** config on Create Bot |

Platform support (Output Media & Output Audio): Zoom ✅, Google Meet ✅, Microsoft Teams ✅, Cisco Webex ✅, Slack Huddles ❌.

---

## 2. Output Media — stream a webpage you control
The bot **runs a webpage you control** and streams that page's audio+video into the meeting, as **camera** or **screenshare**. Whatever the page renders is what participants see/hear — so your agent UI (TTS audio, avatar video) lives in that page.

`output_media` params: `kind` (currently only `webpage`) + the webpage config (your `url`, presented via `camera` or `screenshare`).

**On Create Bot:**
```json
// POST /api/v1/bot/
{
  "meeting_url": "$MEETING_URL",
  "output_media": {
    "camera": { "kind": "webpage", "config": { "url": "https://your-agent-page.example.com" } }
  }
}
```

**Start mid-call** (same params):
```bash
curl -X POST https://$RECALL_REGION.recall.ai/api/v1/bot/{bot_id}/output_media/ \
  -H 'Authorization: Token $RECALL_API_KEY' -H 'Content-Type: application/json' \
  -d '{ "camera": { "kind": "webpage", "config": { "url": "https://your-agent-page.example.com" } } }'
```

**Stop:**
```bash
curl -X POST https://$RECALL_REGION.recall.ai/api/v1/bot/{bot_id}/output_media/ \
  -H 'Authorization: Token $RECALL_API_KEY' -H 'Content-Type: application/json' \
  -d '{ "camera": true }'   # stops camera/screenshare output
```

### Reading live transcripts inside the webpage
Your page can subscribe to live transcripts to drive the agent:
```js
const ws = new WebSocket('wss://meeting-data.bot.recall.ai/api/v1/transcript');
// messages match /docs/real-time-transcription#events
```

### Constraints
- Output Media **always** includes the webpage as the bot's video — you **cannot** output audio-only, and cannot turn the camera off while it's on.
- While Output Media is active, you **cannot** also use the separate Output Video / Output Audio endpoints.
- **Local dev:** expose your webpage (and any APIs it calls) via a public tunnel (ngrok). The bot's Output Media process blocks `localhost` calls.

---

## 3. Output Audio (short clips, MP3 base64)
Audio must be **MP3 encoded as a base64 string** (`kind: "mp3"`, `b64_data`).

**On-demand endpoint:**
```json
// POST https://$RECALL_REGION.recall.ai/api/v1/bot/{id}/output_audio/
{ "kind": "mp3", "b64_data": "..." }
```
> To use the Output Audio endpoint, the bot must have been created with an `automatic_audio_output` config. If you don't want auto-output, set a short **silent** mp3 as its `b64_data`.

## 4. automatic_audio_output (play on record start + replay on join)
```json
// POST /api/v1/bot/
{
  "automatic_audio_output": {
    "in_call_recording": {
      "data": { "kind": "mp3", "b64_data": "..." },
      "replay_on_participant_join": {
        "debounce_mode": "trailing",   // or "leading"
        "debounce_interval": 10,        // seconds to wait for more joins
        "disable_after": 60             // stop replaying after N seconds
      }
    }
  }
}
```
- `leading`: timer starts when the **first** new participant joins.
- `trailing`: timer starts when the **last** participant joins.
- `disable_after`: prevents interrupting the meeting for late joiners.

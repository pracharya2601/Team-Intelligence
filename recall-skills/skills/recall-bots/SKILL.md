---
name: recall-bots
description: Use when sending or scheduling a Recall.ai meeting bot — the Create Bot / Retrieve Bot endpoints, recording_config, bot lifecycle, supported platforms, customization, and how to pull the recording + transcript download URLs after the call.
---

# Recall.ai — Meeting Bots

Send a bot into a meeting to capture audio, video, transcripts, and metadata. Pair with `recall-setup` (creds), `recall-webhooks` (events), `recall-transcription`, and `recall-output-media`.

---

## 1. Send a bot — Create Bot

`POST https://$RECALL_REGION.recall.ai/api/v1/bot`

```bash
curl -X POST https://$RECALL_REGION.recall.ai/api/v1/bot \
  -H 'Authorization: Token $RECALL_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "meeting_url": "$MEETING_URL",
    "bot_name": "My Bot",
    "recording_config": { "transcript": { "provider": { "recallai_streaming": {} } } }
  }'
```

Response includes the **Bot ID** in `id` — save it. (`reference/bot_create`)

> 🚧 **Production:** schedule bots ahead with `join_at` (ISO 8601). Relying on last-minute creation causes `507` errors. See `/docs/creating-and-scheduling-bots`.

### Common Create Bot fields
- `meeting_url` — the meeting link (see `/docs/meeting-urls` for accepted formats).
- `bot_name` — display name (default "Meeting Notetaker").
- `join_at` — schedule the bot to join at a future time.
- `recording_config` — what to capture; e.g. `transcript.provider`, `video_mixed_layout` (`speaker_view`), `start_recording_on` (`participant_join`), `realtime_endpoints`, `include_bot_in_recording`, `automatic_audio_output`, `output_media`, `metadata`.
- `metadata` — custom key/values for your own tracking (filterable later).

## 2. Bot lifecycle (status changes)
`joining_call → in_waiting_room → in_call_not_recording → recording_permission_allowed → in_call_recording → call_ended → done` (or `fatal` on error). React to these via `recall-webhooks`.

## 3. Retrieve the recording — Retrieve Bot
`GET https://$RECALL_REGION.recall.ai/api/v1/bot/$BOT_ID` with `Authorization: Token $RECALL_API_KEY`. (`reference/bot_retrieve`)

- The `recordings` array holds the recording(s).
- **Video MP4:** `recordings[].media_shortcuts.video_mixed.data.download_url` (format `mp4`). Stream it directly as an HTML `<video src>` or download.
- **Transcript:** `recordings[].media_shortcuts.transcript.data.download_url` → JSON in the schema at `/docs/download-schemas#json-transcript-download-url`.
- Download URLs are signed S3 URLs that **expire** — fetch fresh from the API; don't persist them long-term.

Best practice: wait for the `bot.done` (and `transcript.done`) webhook before retrieving, rather than polling.

## 4. Supported platforms
| Platform | Supported | Setup required? |
|---|---|---|
| Zoom | ✅ | No |
| Google Meet | ✅ | No |
| Microsoft Teams | ✅ | No |
| Webex | ✅ | Yes (guest issuer creds) |
| Go-To Meeting (beta) | ✅ | No |
| Slack Huddles | ✅ | Yes |

## 5. Customizing the bot (whitelabel)
- `bot_name` — the display name.
- **Display image** — show an image via camera tile or screenshare (`/docs/output-video-in-meetings`).
- **Speak / play audio** — `automatic_audio_output`, Output Audio, or Output Media for full voice/avatar agents → `recall-output-media`.

## 6. Meeting data available
A/V (mixed async/real-time; separate per-participant async/real-time), transcripts (3 workflows), participants + participant events + speaker timeline, and meeting metadata (e.g. title). See `recall` §2 and the dedicated guides.

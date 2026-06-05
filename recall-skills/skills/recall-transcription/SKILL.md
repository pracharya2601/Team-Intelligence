---
name: recall-transcription
description: Use when generating meeting transcripts with Recall.ai — the three transcription workflows (Recall.ai native, meeting captions, third-party AI providers), enabling transcription via recording_config, real-time vs post-meeting, and provider options (AssemblyAI, AWS, Deepgram, ElevenLabs, Rev, Speechmatics).
---

# Recall.ai — Transcription

Turn meeting audio into transcripts, real-time or post-meeting. Pair with `recall-bots` and `recall-realtime`.

---

## 1. Three workflows
- **Recall.ai Transcription** — transcription directly through Recall (`recallai_streaming` for real-time; async option for post-meeting). (`reference/recallai-transcription`)
- **Meeting Caption Transcription** — uses the meeting platform's native closed captions, real-time. (`/docs/meeting-caption-transcription`)
- **AI / third-party Transcription** — bring a supported speech-to-text provider. (`/docs/ai-transcription`)

## 2. Enable on a bot
Set the transcript provider in `recording_config` on **Create Bot**:
```json
{
  "meeting_url": "$MEETING_URL",
  "recording_config": {
    "transcript": { "provider": { "recallai_streaming": {} } }
  }
}
```
The same shape applies to a Desktop SDK recording. Swap the provider key for a third-party provider per its guide.

## 3. Third-party provider guides
Each has a setup guide + post-meeting guide + real-time guide:

| Provider | Doc |
|---|---|
| AssemblyAI | `/docs/assemblyai` |
| AWS Transcribe | `/docs/aws-transcribe` |
| Deepgram | `/docs/deepgram` |
| ElevenLabs | `/docs/elevenlabs` |
| Rev | `/docs/rev` |
| Speechmatics | `/docs/speechmatics` |

## 4. Fetch the transcript
- **Post-meeting:** after `transcript.done`, read `media_shortcuts.transcript.data.download_url` from Retrieve Bot (see `recall-bots` §3). JSON schema: `/docs/download-schemas#json-transcript-download-url`.
- **Real-time:** receive transcript events over a real-time endpoint (`recall-realtime`).

## 5. Features that vary by provider/workflow
- **Diarization** (who said what) — `/docs/diarization`
- **Multilingual** transcription — `/docs/multilingual-transcription`
- **Provider data** (raw provider-specific fields) — `/docs/accessing-text-to-speech-provider-specific-fields`

Choose: real-time vs post-meeting, accuracy/cost, language needs, and whether you need diarization tied to known participants. Overview: `/docs/transcription`.

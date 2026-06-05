# Bora — Team Meeting Bot

A multi-tenant meeting bot any organization can adopt. Bora joins Google Meet / Zoom / Teams,
records and transcribes, can **raise its hand and speak** when a human gives the go-ahead,
chats privately with each teammate, lives in Slack, and **remembers** the team's project.

> Full design + phased build plan: see [`../PLAN.md`](../PLAN.md) at the repo root.

## Stack (7 vendors only)

| Vendor | Role |
| --- | --- |
| **Butterbase** | Backend: Postgres + RLS, auth, storage, realtime, serverless functions, **AI gateway** (Claude + Gemini Flash), **RAG**, integrations (Gmail/GitHub) |
| **Recall.ai** | Sends the bot into meetings; recording, real-time transcript, Output Media (bot page as camera + TTS audio) |
| **Xtrace** | Two-tier long-term memory (private per-user + shared per-team) |
| **RocketRide** | Fetch/parse context sources (websites, repos, docs) → chunks into Butterbase RAG |
| **Photon (Spectrum)** | Slack presence — replies when tagged |
| **Nebius** | Self-hosted cheap always-on "should I speak?" trigger model |
| **ElevenLabs** | Text-to-speech for the bot's voice |

**Model policy:** in meetings, only **Gemini Flash** speaks (latency). **Claude 4.8** is used off
the live path — chat, post-meeting AI notes, and Slack. Both go through the Butterbase AI gateway,
so there are **no Anthropic/Gemini API keys**.

## The proactive cascade (two gates)

```
live transcript ─► Nebius cheap model ─► SpeakDecision { speak_now, should_i_speak, reason }
   • speak_now=true  (addressed by name)  ─► Gemini Flash answers ─► SPEAK immediately
   • should_i_speak>0.7 (unsolicited)     ─► Gemini Flash composes ─► ✋ raise hand → human "Go" → SPEAK
```

## Status

Phase 0 (backend + scaffold) in progress:
- ✅ Butterbase app provisioned (`app_91v2kzy0pe03`)
- ✅ Database schema applied (orgs, members, bots, meetings, transcripts, bot_state, artifacts, chat — 10 tables)
- ✅ Core libs: [`src/lib/bb.ts`](src/lib/bb.ts) (data + RAG), [`src/lib/llm.ts`](src/lib/llm.ts) (gateway), [`src/lib/memory.ts`](src/lib/memory.ts) (Xtrace two-tier)
- ⏳ RLS policies, realtime config, auth/OAuth, RAG collection + integrations, Next.js UI

See `PLAN.md` for the full 6-phase roadmap.

## Setup

```bash
cp .env.example .env.local   # fill in keys (Recall, ElevenLabs, Xtrace, Nebius, Photon, RocketRide; Butterbase key)
npm install
npm run check                # verifies Butterbase connectivity, gateway, RAG round-trip
npm run dev
```

> In dev, the bot's in-meeting page must be reachable over a **public tunnel** (e.g. ngrok) —
> Recall's Output Media process blocks `localhost`. Set `APP_BASE_URL` accordingly.

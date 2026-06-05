# recall-skills

A **local** Claude Code skills plugin for building meeting-bot integrations with [Recall.ai](https://docs.recall.ai) — the API for capturing & using meeting data (recordings, transcripts, real-time A/V, and interactive in-meeting AI agents).

Anchored on the [Build with AI Agents](https://docs.recall.ai/page/build-with-ai-agents) guide; all content is sourced from the official docs (`llms.txt` / `.md` pages).

## Skills

| Skill | What it covers |
|---|---|
| `recall` | Overview + router: products, core concepts (bot/recording/media), regions, `Token` auth, doc map |
| `recall-setup` | Prerequisites: region, API key, workspace verification secret, stable ngrok `PUBLIC_API_BASE_URL`, required webhook subscriptions |
| `recall-bots` | Create/schedule bots, `recording_config`, lifecycle, supported platforms, retrieve recording + transcript download URLs |
| `recall-webhooks` | Bot status events + recording/transcript events, payload schema, handler rules (2xx / 24h retries / 15s timeout), Svix, verification |
| `recall-realtime` | Real-time webhook vs websocket endpoints, `in_call_recording` requirement, in-call audio/transcript/participant events |
| `recall-transcription` | 3 workflows (Recall.ai / captions / 3rd-party), provider guides (AssemblyAI, AWS, Deepgram, ElevenLabs, Rev, Speechmatics), async vs real-time |
| `recall-output-media` | Make the bot speak/stream: Output Media (webpage → voice/avatar agents), Output Audio, `automatic_audio_output` |
| `recall-mcp` | Connect Recall's hosted read-only MCP server (region URLs, client configs, tools, OAuth/API-key auth) |

## Install (local scope)

```bash
claude plugin marketplace add ./recall-skills
claude plugin install recall-skills --scope local
```

## Layout

```
recall-skills/
├── .claude-plugin/{plugin.json, marketplace.json}
└── skills/
    ├── recall/SKILL.md
    ├── recall-setup/SKILL.md
    ├── recall-bots/SKILL.md
    ├── recall-webhooks/SKILL.md
    ├── recall-realtime/SKILL.md
    ├── recall-transcription/SKILL.md
    ├── recall-output-media/SKILL.md
    └── recall-mcp/SKILL.md
```

## Related

Recall also ships a hosted **MCP server** (read-only access to your workspace + docs) — see the `recall-mcp` skill to connect it. That complements these skills: the skills teach Claude *how to build*, the MCP lets Claude *inspect your live workspace and search docs* while building.

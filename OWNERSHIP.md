# OWNERSHIP.md — lane lock (who may edit what)

To prevent two people stepping on the same work, **each file is owned by one lane**, and a
**pre-commit hook blocks you from committing the other lane's files**. This is the map of record;
the hook (`.githooks/pre-commit`) enforces it. Keep them in sync.

## Setup (each dev, once per clone)

```bash
bash scripts/setup-lane.sh A   # Track A — Meetings & Voice
bash scripts/setup-lane.sh B   # Track B — Org / Chat / Knowledge
```

This writes `.lane` (git-ignored, per machine) and sets `core.hooksPath=.githooks`. After that, a
commit touching the **other** lane's files is rejected. Emergency override (only with the owner's
OK): `git commit --no-verify`.

## The rule

1. **You only work your own tasks.** Claim a task in [`TASKS.md`](TASKS.md) (mark it `🔄` with your
   lane) before starting; never pick up a task owned by the other lane.
2. **You may edit:** your lane's files + **shared/foundation** files (below).
3. **You may NOT edit:** the other lane's files. The hook enforces this at commit time.
4. **Foundation/shared changes** (e.g. a new DB column in `shared/types.ts`) go in a **tiny
   standalone commit**, announced to the other person — never bundled inside feature work.

## Track A — Meetings & Voice
- `bora/functions/recall-*.ts`, `bora/functions/speak-*.ts`, `bora/functions/trigger.ts`
- `bora/functions/_shared/recall.ts`, `bora/functions/_shared/escalate.ts`
- `bora/src/pages/Meeting*.tsx`, `bora/src/pages/Bot*.tsx`, `bora/src/pages/Recap.tsx`

## Track B — Org / Chat / Knowledge
- `bora/functions/org-*.ts`, `bora/functions/claim-invites.ts`, `bora/functions/chat.ts`,
  `bora/functions/ingest-*.ts`, `bora/functions/slack-*.ts`, `bora/functions/recap-*.ts`,
  `bora/functions/daily-recap.ts`
- `bora/functions/_shared/agent.ts`, `bora/functions/_shared/memory.ts`, `bora/functions/_shared/slack.ts`
- `bora/src/lib/auth.tsx`
- `bora/src/pages/Login.tsx`, `AuthCallback.tsx`, `Home.tsx`, `Org*.tsx`, `Members.tsx`, `Chat.tsx`, `Context.tsx`

## Shared / foundation — anyone may edit (keep changes small + announced)
- `bora/src/App.tsx` (route table — append-only, see WORK-SPLIT.md), `src/main.tsx`, `src/index.css`, `index.html`
- `bora/shared/types.ts` (DB schema mirror — the contract)
- `bora/functions/_shared/bb.ts`, `bora/functions/_shared/llm.ts`
- `bora/src/lib/api.ts` (browser client)
- `bora/.env.example`, `bora/package.json`, `tsconfig.json`, `vite.config.ts`, `bora/scripts/*`
- Docs: `PLAN.md`, `WORK-SPLIT.md`, `TASKS.md`, `CLAUDE.md`, `PHASE_0.md`, `OWNERSHIP.md`
- `.githooks/*`, `scripts/*`, `.gitignore`, `.github/CODEOWNERS`

> A **new** file that matches neither lane's globs is treated as shared (allowed). When you add a
> file that should be lane-locked, add its glob here **and** in `.githooks/pre-commit`.

## GitHub backstop (optional, for PRs)
`.github/CODEOWNERS` requires the lane owner's review on PRs touching their files. It only bites if
you enable **branch protection → Require review from Code Owners** on the repo. Fill in real GitHub
handles there. The local hook is the primary lock; CODEOWNERS catches anything that reaches a PR.

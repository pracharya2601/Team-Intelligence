/**
 * Xtrace two-tier memory.
 *
 * Privacy model (see PLAN.md):
 *   - PRIVATE  → per-user scope. A user's 1:1 chat turns. Never shared.
 *   - SHARED   → a per-org group scope. Meeting transcripts/notes + admin-added
 *                context-source facts. Recallable by every org member.
 *
 * The bot answers a user from BOTH their private scope AND the org's shared scope,
 * but it must NEVER surface another user's private memory. We get that for free
 * from Xtrace's `pools` model: each pool ANDs its axes, and pools are OR'd —
 * so recalling with pools [{ user_id: me }, { group_ids: [orgGroup] }] returns
 * my-private ∪ org-shared, and nothing of anyone else's private memory.
 */

import { MemoryClient } from "@xtraceai/memory";
import type { Message } from "@xtraceai/memory";

const client = new MemoryClient({
  apiKey: process.env.XTRACE_API_KEY!,
  orgId: process.env.XTRACE_ORG_ID!,
});

/** Stable agent id so all of Bora's memories share an `agent_id` axis if we want it. */
const AGENT_ID = "bora";

/** Conventional group id for an org's shared memory. One Xtrace group per organization. */
export function orgGroupId(orgId: string): string {
  return `org:${orgId}`;
}

/**
 * Remember a user's private chat turns. Scoped to the user only — these turns are
 * tagged with `user_id` and NO group, so they can never leak to teammates.
 */
export async function rememberPrivate(userId: string, convId: string, messages: Message[]): Promise<void> {
  const job = await client.memories.ingest({
    messages,
    user_id: userId,
    conv_id: convId,
    agent_id: AGENT_ID,
  });
  // Best-effort: don't block the chat response on extraction finishing.
  void client.memories.jobs.pollUntilDone(job.id).catch(() => {});
}

/**
 * Remember shared team knowledge (meeting transcript/notes, ingested context facts).
 * Tagged with the org's group id so any member can recall it. `userId` is the actor
 * (e.g. the admin who added a source, or a synthetic meeting user).
 */
export async function rememberShared(
  orgId: string,
  userId: string,
  convId: string,
  messages: Message[],
): Promise<void> {
  const job = await client.memories.ingest({
    messages,
    user_id: userId,
    conv_id: convId,
    agent_id: AGENT_ID,
    group_ids: [orgGroupId(orgId)],
  });
  void client.memories.jobs.pollUntilDone(job.id).catch(() => {});
}

/**
 * Recall for a user inside their org: private ∪ shared, in one call.
 * Returns the composed prompt block (ready to drop into a system message) plus the
 * raw memories if a caller wants to render them differently.
 */
export async function recallForUser(
  userId: string,
  orgId: string,
  query: string,
  limit = 10,
): Promise<{ prompt: string; memories: unknown[] }> {
  const res = await client.memories.recall({
    query,
    pools: [{ user_id: userId }, { group_ids: [orgGroupId(orgId)] }],
    limit,
  });
  return { prompt: res.prompt ?? "", memories: res.memories ?? [] };
}

/**
 * Recall ONLY shared team memory (no private scope). Used by surfaces that are
 * inherently shared — Slack channels, the in-meeting bot — so we never pull a
 * person's private chat into a shared context.
 */
export async function recallShared(
  orgId: string,
  query: string,
  limit = 10,
): Promise<{ prompt: string; memories: unknown[] }> {
  const res = await client.memories.recall({
    query,
    pools: [{ group_ids: [orgGroupId(orgId)] }],
    limit,
  });
  return { prompt: res.prompt ?? "", memories: res.memories ?? [] };
}

/** Ensure an org's shared memory group exists (idempotent-ish; ignores "already exists"). */
export async function ensureOrgGroup(orgId: string, orgName: string): Promise<void> {
  try {
    await client.groups.create({
      name: orgGroupId(orgId),
      prompt: `Shared knowledge for the "${orgName}" team: meeting decisions, project facts, and context the team has added. Exclude anything from a single user's private 1:1 chat.`,
    });
  } catch {
    // Group likely already exists — fine.
  }
}

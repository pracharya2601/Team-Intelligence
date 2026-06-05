/**
 * Xtrace two-tier memory (function runtime).
 *
 * PRIVATE (per-user) vs SHARED (per-org group). The bot answers from BOTH a user's private
 * scope and the org's shared scope, but NEVER surfaces another user's private memory —
 * guaranteed by Xtrace's pools model (axes AND within a pool; pools OR'd).
 *
 * Note: @xtraceai/memory is Node-flavored (native fetch, Node 18+). If the Butterbase
 * function runtime can't bundle it, fall back to Xtrace's raw HTTP API with the same
 * shapes — the scoping logic below is identical either way.
 */

import { MemoryClient } from "@xtraceai/memory";
import type { Message } from "@xtraceai/memory";

export interface XtraceEnv {
  XTRACE_API_KEY: string;
  XTRACE_ORG_ID: string;
}

const AGENT_ID = "bora";

export function orgGroupId(orgId: string): string {
  return `org:${orgId}`;
}

function client(env: XtraceEnv): MemoryClient {
  return new MemoryClient({ apiKey: env.XTRACE_API_KEY, orgId: env.XTRACE_ORG_ID });
}

/** Private chat turns — scoped to the user only (no group). Never shared. */
export async function rememberPrivate(env: XtraceEnv, userId: string, convId: string, messages: Message[]): Promise<void> {
  const c = client(env);
  const job = await c.memories.ingest({ messages, user_id: userId, conv_id: convId, agent_id: AGENT_ID });
  void c.memories.jobs.pollUntilDone(job.id).catch(() => {});
}

/** Shared team knowledge (meetings, context facts) — tagged with the org group. */
export async function rememberShared(env: XtraceEnv, orgId: string, userId: string, convId: string, messages: Message[]): Promise<void> {
  const c = client(env);
  const job = await c.memories.ingest({
    messages, user_id: userId, conv_id: convId, agent_id: AGENT_ID, group_ids: [orgGroupId(orgId)],
  });
  void c.memories.jobs.pollUntilDone(job.id).catch(() => {});
}

/** Recall for a user inside their org: private ∪ shared in one call. */
export async function recallForUser(env: XtraceEnv, userId: string, orgId: string, query: string, limit = 10) {
  const res = await client(env).memories.recall({
    query, pools: [{ user_id: userId }, { group_ids: [orgGroupId(orgId)] }], limit,
  });
  return { prompt: res.prompt ?? "", memories: res.memories ?? [] };
}

/** Recall ONLY shared team memory (Slack, in-meeting bot). Never pulls a user's private chat. */
export async function recallShared(env: XtraceEnv, orgId: string, query: string, limit = 10) {
  const res = await client(env).memories.recall({
    query, pools: [{ group_ids: [orgGroupId(orgId)] }], limit,
  });
  return { prompt: res.prompt ?? "", memories: res.memories ?? [] };
}

/** Create an org's shared memory group (idempotent-ish). */
export async function ensureOrgGroup(env: XtraceEnv, orgId: string, orgName: string): Promise<void> {
  try {
    await client(env).groups.create({
      name: orgGroupId(orgId),
      prompt: `Shared knowledge for the "${orgName}" team: meeting decisions, project facts, and context the team added. Exclude anything from a single user's private 1:1 chat.`,
    });
  } catch {
    /* already exists — fine */
  }
}

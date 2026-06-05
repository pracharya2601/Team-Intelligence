/**
 * Reference copy of the Butterbase schema (applied via MCP `manage_schema`, migration 1).
 *
 * This file is documentation + a typed source of truth for table/column names used
 * across the app. The live schema lives in Butterbase; keep this in sync when you
 * evolve it. It is intentionally not executed at runtime.
 *
 * Security notes (enforced by RLS, see Phase 0):
 *   - chat_threads / chat_messages: user_id = caller ONLY → guarantees no chat leakage.
 *   - org-scoped tables: visible to active members of that org; writes to
 *     context_sources / meetings / bots / org_members are admin-only.
 *
 * Realtime-enabled tables: transcript_segments, bot_state (broadcast over WS,
 * filtered by meeting_id, RLS-aware).
 */

export type Role = "admin" | "member";
export type MemberStatus = "invited" | "active" | "removed";
export type MeetingStatus = "scheduled" | "joining" | "live" | "done" | "error";
export type BotMode = "idle" | "listening" | "hand_raised" | "speaking";
export type ContextStatus = "pending" | "ingesting" | "ready" | "error";
export type ContextType = "github" | "doc" | "website" | "plan";

export interface Organization {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string | null;
  role: Role;
  invited_email: string | null;
  status: MemberStatus;
  created_at: string;
}

export interface Bot {
  id: string;
  org_id: string;
  name: string;
  persona: string | null;
  /** ElevenLabs voice the bot speaks with in meetings (Phase 3). null → server default. */
  voice_id: string | null;
  slack_team_id: string | null;
  created_at: string;
}

export interface ContextSource {
  id: string;
  org_id: string;
  type: ContextType;
  url: string | null;
  status: ContextStatus;
  added_by: string | null;
  rocketride_token: string | null;
  rag_doc_ids: string[] | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  org_id: string;
  platform: string | null;
  meeting_url: string;
  recall_bot_id: string | null;
  status: MeetingStatus;
  started_by: string | null;
  join_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  speaker: string | null;
  text: string;
  ts_start: number | null;
  ts_end: number | null;
  is_final: boolean;
  created_at: string;
}

/** The proactive bot's live control state. Two gates: speak_now (immediate, direct-address)
 *  and should_i_speak (confidence; raises hand at >0.7). gate_open = released to speak the
 *  held pending_text — opened by a spoken "go on, Bora" (detected by the trigger), not a button.
 *  hand_raised_at stamps when the hand went up so a stale point auto-lowers after ~60s. */
export interface BotState {
  meeting_id: string;
  mode: BotMode;
  speak_now: boolean;
  should_i_speak: number;
  pending_text: string | null;
  gate_open: boolean;
  reason: string | null;
  hand_raised_at: string | null;
  /** While mode=speaking: the caption shown + the base64 MP3 the bot camera page plays
   *  (Recall captures the page's audio). speak_seq increments per utterance so the page
   *  reliably detects a NEW clip to play (Output Media has no separate audio endpoint —
   *  the webpage IS the audio path). */
  speaking_text: string | null;
  speaking_audio: string | null;
  speak_seq: number;
  last_spoke_at: string | null;
  updated_at: string;
}

export interface MeetingArtifacts {
  meeting_id: string;
  video_url: string | null;
  audio_url: string | null;
  transcript_url: string | null;
  ai_notes: Record<string, unknown> | null;
  recap_token: string | null;
  recap_public: boolean;
  created_at: string;
}

export interface ChatThread {
  id: string;
  org_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

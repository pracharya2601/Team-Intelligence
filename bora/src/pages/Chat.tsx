import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { callFn, select } from "../lib/api";
import { useAuth } from "../lib/auth";
import { OrgLayout } from "../components/OrgLayout";
import type { ChatMessageRow, ChatThread, Organization } from "../../shared/types";

/**
 * Private chat (Phase 4). Per-user threads + messages, RLS-scoped to the caller (a user only ever
 * sees their own chats). Reads go through the data API as the user (RLS-enforced); sending a turn
 * goes through the `chat` function, which persists both sides and answers with Claude.
 */
export function ChatPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const tmpId = useRef(0);

  async function loadThreads() {
    const [orgs, th] = await Promise.all([
      select<Organization>("organizations", { id: `eq.${id}` }),
      select<ChatThread>("chat_threads", { org_id: `eq.${id}`, order: "created_at.desc" }),
    ]);
    setOrg(orgs[0] ?? null);
    setThreads(th);
  }

  async function loadMessages(threadId: string) {
    const m = await select<ChatMessageRow>("chat_messages", {
      thread_id: `eq.${threadId}`,
      order: "created_at.asc",
    });
    setMessages(m);
  }

  useEffect(() => {
    void loadThreads().catch((e) => setError(e?.message ?? "Failed to load chats"));
  }, [id]);

  useEffect(() => {
    if (activeThread) void loadMessages(activeThread).catch(() => {});
    else setMessages([]);
  }, [activeThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function newChat() {
    setActiveThread(null);
    setMessages([]);
    setError("");
    setInput("");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    setError("");
    setInput("");
    // Optimistically show the user's message while the model thinks.
    const optimistic: ChatMessageRow = {
      id: `tmp-${tmpId.current++}`,
      thread_id: activeThread ?? "",
      user_id: user?.id ?? "",
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await callFn<{ thread_id: string; title: string | null; reply: string }>("chat", {
        org_id: id,
        content,
        thread_id: activeThread ?? undefined,
      });
      if (!activeThread) {
        setActiveThread(res.thread_id);
        await loadThreads();
      }
      await loadMessages(res.thread_id);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to send";
      setError(/not found/i.test(msg) ? "The chat function isn't deployed yet — deploy it to chat." : msg);
      // Drop the optimistic bubble by reloading the real state.
      if (activeThread) await loadMessages(activeThread).catch(() => {});
      else setMessages([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrgLayout orgId={id} orgName={org?.name} title="Chat">
      <div className="chat-layout">
        <div className="panel col" style={{ gap: 8, alignSelf: "start" }}>
          <button onClick={newChat} disabled={busy && !activeThread}>+ New chat</button>
          {threads.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No chats yet.</span>}
          {threads.map((t) => (
            <button
              key={t.id}
              className={`thread-item${t.id === activeThread ? " thread-active" : ""}`}
              onClick={() => setActiveThread(t.id)}
              title={t.title ?? "Untitled"}
            >
              {t.title || "Untitled chat"}
            </button>
          ))}
        </div>

        <div className="panel col" style={{ minHeight: 420 }}>
          <div className="col" style={{ flex: 1, gap: 10, overflowY: "auto", maxHeight: 540 }}>
            {messages.length === 0 && !busy && (
              <div className="muted" style={{ margin: "auto", textAlign: "center" }}>
                Ask Bora anything about your team, meetings, or projects.<br />
                This chat is private to you.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`bubble bubble-${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="bubble bubble-assistant muted">Bora is thinking…</div>}
            <div ref={endRef} />
          </div>

          <form className="row" onSubmit={send} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <input
              placeholder="Message Bora…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              style={{ flex: 1 }}
            />
            <button type="submit" disabled={busy || !input.trim()}>{busy ? "…" : "Send"}</button>
          </form>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </OrgLayout>
  );
}

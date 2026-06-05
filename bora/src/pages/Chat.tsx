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
  const taRef = useRef<HTMLTextAreaElement>(null);
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

  // Auto-grow the composer up to a max height as the user types.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function newChat() {
    setActiveThread(null);
    setMessages([]);
    setError("");
    setInput("");
  }

  async function send(e?: { preventDefault: () => void }) {
    e?.preventDefault();
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
    <OrgLayout orgId={id} orgName={org?.name} title="Chat" subtitle="Private to you" fill>
      <div className="chat-layout">
        <div className="card col" style={{ minHeight: 0, gap: 10 }}>
          <button className="block" onClick={newChat} disabled={busy && !activeThread}>+ New chat</button>
          <div className="col" style={{ gap: 6, overflowY: "auto", minHeight: 0 }}>
            {threads.length === 0 && <span className="muted text-sm">No chats yet.</span>}
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
        </div>

        <div className="card col" style={{ minHeight: 0 }}>
          <div className="col" style={{ flex: 1, gap: 10, overflowY: "auto", minHeight: 0 }}>
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

          <form onSubmit={send} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div className="composer">
              <textarea
                ref={taRef}
                rows={1}
                placeholder="Message Bora…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={busy}
              />
              <button
                type="submit"
                className="composer-send"
                aria-label="Send message"
                disabled={busy || !input.trim()}
              >
                {busy ? <span className="spinner" /> : "↑"}
              </button>
            </div>
            <div className="composer-hint">Enter to send · Shift+Enter for new line</div>
          </form>
          {error && <div className="notice error">{error}</div>}
        </div>
      </div>
    </OrgLayout>
  );
}

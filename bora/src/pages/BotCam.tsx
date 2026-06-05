import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { appUrl, realtimeUrl } from "../lib/api";
import type { BotState } from "../../shared/types";

/**
 * BotCam: the page Recall renders AS the bot's camera feed inside the meeting (Output Media).
 * PUBLIC + unauthenticated — Recall's headless browser loads it by URL (it can't log in), secured
 * only by the unguessable meeting id in the path. Whatever this page shows/plays is what everyone
 * in the meeting SEES and HEARS — with Output Media the webpage IS the audio path, so this page
 * PLAYS Bora's TTS (speaking_audio) and Recall captures it into the call.
 *
 * Live: subscribes to bot_state over the Butterbase realtime WS (anon — bot_state carries no
 * secrets, just what the bot displays/says publicly) and animates:
 *   idle / listening → ✋ hand_raised (shows pending_text + "say 'go on, Bora'") → speaking + caption.
 * A monotonic speak_seq tells us when a NEW utterance arrived so we (re)play the clip exactly once.
 *
 * Route: /bot/:meetingId  (mounted OUTSIDE RequireAuth).
 */
export function BotCamPage() {
  const { meetingId = "" } = useParams<{ meetingId: string }>();
  const [state, setState] = useState<Partial<BotState> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeq = useRef<number>(-1);

  // Initial state (anon read) + live subscription.
  useEffect(() => {
    if (!meetingId) return;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    async function loadInitial() {
      try {
        const res = await fetch(`${appUrl}/bot_state?meeting_id=eq.${meetingId}`);
        const rows = (await res.json()) as Partial<BotState>[];
        if (Array.isArray(rows) && rows[0]) applyState(rows[0]);
      } catch {
        /* the WS will fill it in */
      }
    }

    function connect() {
      if (closed) return;
      ws = new WebSocket(realtimeUrl());
      ws.onopen = () => ws?.send(JSON.stringify({ type: "subscribe", table: "bot_state" }));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === "change" && msg.table === "bot_state" && msg.record?.meeting_id === meetingId) {
            applyState(msg.record as Partial<BotState>);
          }
        } catch {
          /* ignore non-JSON frames */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500); // Recall keeps the page open for the call
      };
      ws.onerror = () => ws?.close();
    }

    void loadInitial();
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // Play a freshly-arrived clip exactly once (speak_seq is monotonic per utterance).
  function applyState(s: Partial<BotState>) {
    setState(s);
    const seq = typeof s.speak_seq === "number" ? s.speak_seq : -1;
    if (s.mode === "speaking" && s.speaking_audio && seq > lastSeq.current) {
      lastSeq.current = seq;
      const el = audioRef.current;
      if (el) {
        el.src = s.speaking_audio;
        el.play().catch(() => {/* autoplay constraints — Recall's headless browser allows it */});
      }
    }
  }

  const mode = state?.mode ?? "idle";

  return (
    <div style={shell}>
      {/* hidden audio element — Recall captures the page's audio into the meeting */}
      <audio ref={audioRef} autoPlay />

      {mode === "speaking" ? (
        <Speaking caption={state?.speaking_text ?? ""} />
      ) : mode === "hand_raised" ? (
        <HandRaised text={state?.pending_text ?? ""} />
      ) : (
        <Idle listening={mode === "listening"} />
      )}
    </div>
  );
}

function Idle({ listening }: { listening: boolean }) {
  return (
    <div style={center}>
      <Mark />
      <div style={{ marginTop: 14, fontSize: 22, color: "#9aa3b2", display: "flex", alignItems: "center", gap: 10 }}>
        {listening && <Pulse />}
        {listening ? "Listening…" : "Connecting…"}
      </div>
    </div>
  );
}

function HandRaised({ text }: { text: string }) {
  return (
    <div style={center}>
      <div style={{ fontSize: 96, lineHeight: 1, animation: "boraWave 1.4s ease-in-out infinite" }}>✋</div>
      <div style={{ marginTop: 8, fontSize: 26, fontWeight: 700, color: "#e6e8ee" }}>Bora has a thought</div>
      {text && (
        <div style={quote}>“{text}”</div>
      )}
      <div style={{ marginTop: 18, fontSize: 16, color: "#7d8696" }}>
        say <span style={{ color: "#5cd6a0", fontWeight: 700 }}>“go on, Bora”</span> to let it speak
      </div>
    </div>
  );
}

function Speaking({ caption }: { caption: string }) {
  return (
    <div style={center}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Mark small />
        <Waveform />
      </div>
      <div style={{ ...quote, marginTop: 22, color: "#e6e8ee" }}>{caption}</div>
    </div>
  );
}

// ── bits ──────────────────────────────────────────────────────────────────────

function Mark({ small }: { small?: boolean }) {
  return (
    <div style={{ fontSize: small ? 40 : 72, fontWeight: 800, letterSpacing: "-0.03em", color: "#e6e8ee" }}>
      Bora
    </div>
  );
}

function Pulse() {
  return <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#5cd6a0", animation: "boraPulse 1.2s ease-in-out infinite" }} />;
}

function Waveform() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, height: 40 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{ width: 6, borderRadius: 3, background: "#5cd6a0", animation: `boraBar 0.9s ease-in-out ${i * 0.12}s infinite` }}
        />
      ))}
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "radial-gradient(1200px 800px at 50% 30%, #1a2030, #0b0d12)",
  color: "#e6e8ee",
  fontFamily: "system-ui, sans-serif",
  padding: 40,
};
const center: React.CSSProperties = { textAlign: "center", maxWidth: 900 };
const quote: React.CSSProperties = {
  marginTop: 16,
  fontSize: 30,
  lineHeight: 1.3,
  color: "#c3c9d4",
  fontWeight: 500,
  maxWidth: 820,
};

// keyframes injected once (this is a standalone full-screen page)
const style = document.createElement("style");
style.textContent = `
@keyframes boraPulse { 0%,100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.1); } }
@keyframes boraWave { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(12deg); } }
@keyframes boraBar { 0%,100% { height: 10px; } 50% { height: 36px; } }
`;
if (typeof document !== "undefined" && !document.getElementById("bora-cam-kf")) {
  style.id = "bora-cam-kf";
  document.head.appendChild(style);
}

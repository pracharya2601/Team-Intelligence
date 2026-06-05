import { useParams } from "react-router-dom";

/**
 * BotCam: the page Recall renders AS the bot's camera feed inside the meeting.
 * PUBLIC + unauthenticated — Recall's headless browser loads it by URL (it can't log in),
 * secured only by the unguessable meeting id in the path.
 *
 * Phase 2: a static status card so the bot shows a clean "Bora" tile in-meeting.
 * Phase 3 subscribes this to bot_state over the realtime WS (filter meeting_id) and animates
 * idle → listening → ✋ hand_raised (shows pending_text) → speaking + live caption.
 *
 * Route: /bot/:meetingId  (mounted OUTSIDE RequireAuth).
 */
export function BotCamPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(1200px 800px at 50% 30%, #1a2030, #0b0d12)",
        color: "#e6e8ee",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: "-0.03em" }}>Bora</div>
        <div style={{ marginTop: 12, fontSize: 22, color: "#9aa3b2" }}>Listening…</div>
        <div style={{ marginTop: 24, fontSize: 12, color: "#4a5468" }}>meeting {meetingId}</div>
      </div>
    </div>
  );
}

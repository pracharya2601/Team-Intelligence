import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoginPage } from "./pages/Login";
import { AuthCallbackPage } from "./pages/AuthCallback";
import { HomePage } from "./pages/Home";
import { OrgPage } from "./pages/Org";
import { ChatPage } from "./pages/Chat";
import { ContextPage } from "./pages/Context";
import { SettingsPage } from "./pages/Settings";
// Track A — Meetings & Voice
import { MeetingsPage } from "./pages/Meetings";
import { RecapPage } from "./pages/Recap";
import { BotCamPage } from "./pages/BotCam";

/** Gate that requires a signed-in user; otherwise bounces to /login. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        {/* Bot camera page — PUBLIC (Recall's headless browser loads it; no login). */}
        <Route path="/bot/:meetingId" element={<BotCamPage />} />
        <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
        {/* Track B — Org / Chat / Knowledge */}
        <Route path="/org/:id" element={<RequireAuth><OrgPage /></RequireAuth>} />
        <Route path="/org/:id/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
        <Route path="/org/:id/context" element={<RequireAuth><ContextPage /></RequireAuth>} />
        <Route path="/org/:id/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        {/* Track A — Meetings & Voice (org-scoped, matching the Chat pattern) */}
        <Route path="/org/:id/meetings" element={<RequireAuth><MeetingsPage /></RequireAuth>} />
        <Route path="/org/:id/meetings/:meetingId" element={<RequireAuth><RecapPage /></RequireAuth>} />
        {/* /org/:id/meetings/:meetingId/live (live console + Go gate) lands in Phase 3. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

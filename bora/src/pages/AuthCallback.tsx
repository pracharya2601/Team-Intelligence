import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setTokens } from "../lib/api";
import { useAuth } from "../lib/auth";

/**
 * Google OAuth landing page. Butterbase redirects here with tokens in the query string:
 *   /auth/callback?access_token=...&refresh_token=...&expires_in=...&token_type=Bearer
 * We stash them, refresh the auth context, and go home.
 */
export function AuthCallbackPage() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get("access_token");
    const refreshTok = params.get("refresh_token") ?? undefined;
    const err = params.get("error");

    if (err) {
      setError(err);
      return;
    }
    if (!access) {
      setError("No access token returned from Google.");
      return;
    }
    setTokens(access, refreshTok);
    void refresh().then(() => nav("/", { replace: true }));
  }, []);

  return (
    <div className="center muted">
      {error ? <span className="error">Sign-in failed: {error}</span> : "Signing you in…"}
    </div>
  );
}

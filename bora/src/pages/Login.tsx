import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { googleLogin, login, signup } from "../lib/api";
import { useAuth } from "../lib/auth";

/** Login / signup. Google OAuth is the primary path (matches "log in, invite Gmails");
 *  email/password is the fallback. */
export function LoginPage() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        await signup(email, password, name || undefined);
        // Butterbase sends a verification email; for now, try logging in directly.
      }
      await login(email, password);
      await refresh();
      nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="panel col" style={{ width: 360 }}>
        <div className="brand" style={{ fontSize: 28 }}>Bora</div>
        <div className="muted">Your team's meeting bot.</div>

        <button onClick={() => googleLogin(`${window.location.origin}/auth/callback`)}>
          Continue with Google
        </button>

        <div className="muted" style={{ textAlign: "center" }}>or</div>

        <form className="col" onSubmit={submit}>
          {mode === "signup" && (
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        <button
          className="secondary"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

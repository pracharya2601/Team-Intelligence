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
      <div className="card col" style={{ width: 380, gap: 16 }}>
        <div className="col" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
          <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 11, fontSize: 20 }}>B</span>
          <div className="col" style={{ gap: 2 }}>
            <div className="brand" style={{ fontSize: 26 }}>Bora</div>
            <div className="muted text-sm">Your team's meeting bot.</div>
          </div>
        </div>

        <button className="block" onClick={() => googleLogin(`${window.location.origin}/auth/callback`)}>
          Continue with Google
        </button>

        <div className="row" style={{ gap: 10 }}>
          <hr className="divider grow" />
          <span className="faint text-xs">OR</span>
          <hr className="divider grow" />
        </div>

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
          {error && <div className="notice error">{error}</div>}
          <button className="block" type="submit" disabled={busy}>
            {busy && <span className="spinner" />}
            {busy ? "…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        <button
          className="ghost sm"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

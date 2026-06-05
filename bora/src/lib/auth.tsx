/**
 * Auth context for the SPA. Holds the signed-in user (from Butterbase /me) and exposes
 * login/logout. Tokens live in localStorage (see api.ts). On mount, if a token exists we
 * fetch /me to confirm it's still valid; on 401 we clear it.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { claimInvites, clearTokens, getToken, logout as apiLogout, me } from "./api";

export interface User {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const u = await me();
      // Complete any pending org invites for this email before the app renders (best-effort,
      // idempotent) so a freshly-invited teammate lands on their org without a manual reload.
      try {
        await claimInvites();
      } catch {
        /* non-fatal — they can still use the app; invites resolve on next login */
      }
      setUser(u);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function logout() {
    apiLogout();
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

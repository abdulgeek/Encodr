"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";
import { AUTH_LOGOUT_EVENT } from "@/lib/client/api";
import { clearTokens, getStoredUser, hydrateTokens } from "@/lib/client/token-store";

interface AuthContextValue {
  user: User | null;
  /** Hydration finished — safe to make auth decisions (avoids first-paint flicker). */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateTokens();
    setUser(getStoredUser<User>());
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    router.replace("/signin");
  }, [router]);

  // If apiFetch can't recover auth it dispatches AUTH_LOGOUT_EVENT — react globally.
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener(AUTH_LOGOUT_EVENT, handler);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handler);
  }, [logout]);

  const login = useCallback(async (_email: string, _password: string) => {
    // TODO(candidate): POST /api/auth/login, store the returned tokens + user
    // (see lib/client/token-store.ts), and set the user in state.
    throw new Error("Not implemented: login");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, login, logout }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

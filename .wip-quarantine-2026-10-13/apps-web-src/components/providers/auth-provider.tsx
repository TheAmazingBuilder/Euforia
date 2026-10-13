"use client";

import * as React from "react";
import type {
  AuthSession,
  AuthUser,
  LoginInput,
  PasswordChangeInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
} from "@cosmoz/shared";

import { apiErrorMessage, apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "@/lib/auth/session-storage";

/**
 * App-wide auth state. Bootstrap: the locally stored token (if any) is
 * validated against GET /auth/session once per page load — the provider
 * stays "loading" until that resolves, which lets the route gates render a
 * calm splash instead of flashing the wrong screen.
 *
 * All flows throw a display-ready Error (the server's message) so the forms
 * can surface it inline; field-level validation happens in the forms via
 * the shared zod schemas.
 */

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface ResetRequestResult {
  /** Mock mode only — the 6-digit code shown on screen instead of emailed. */
  devCode: string | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: (options?: { silent?: boolean }) => Promise<void>;
  requestPasswordReset: (input: PasswordResetRequestInput) => Promise<ResetRequestResult>;
  confirmPasswordReset: (input: PasswordResetConfirmInput) => Promise<AuthUser>;
  changePassword: (input: PasswordChangeInput) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

function authHeaders(token: string | null): Record<string, string> | undefined {
  return token === null ? undefined : { Authorization: `Bearer ${token}` };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("loading");
  const [user, setUser] = React.useState<AuthUser | null>(null);
  // Ref mirror so logout/refresh calls made before bootstrap resolves can
  // still present the token.
  const tokenRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const stored = readStoredSession();
    if (stored === null) {
      // Intentional synchronous bootstrap: the optimistic status from
      // localStorage must land before the first paint of the guarded tree
      // (offline-tolerant, bounded cascade) — not an unguarded render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("anonymous");
      return;
    }
    tokenRef.current = stored.token;
    setUser(stored.user);
    apiRequest<{ session: AuthSession | null }>(apiPaths.authSession, {
      headers: authHeaders(stored.token),
    })
      .then((body) => {
        if (cancelled) return;
        if (body.session !== null) {
          tokenRef.current = body.session.token;
          setUser(body.session.user);
          setStatus("authenticated");
        } else {
          clearStoredSession();
          tokenRef.current = null;
          setUser(null);
          setStatus("anonymous");
        }
      })
      .catch(() => {
        // Network/transport issue — keep the optimistic stored session so a
        // cold start offline does not lock the trader out of their journal.
        if (!cancelled) setStatus("authenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const adoptSession = React.useCallback((session: AuthSession) => {
    writeStoredSession({ token: session.token, user: session.user });
    tokenRef.current = session.token;
    setUser(session.user);
    setStatus("authenticated");
    return session.user;
  }, []);

  const login = React.useCallback(
    async (input: LoginInput) => {
      const session = await apiRequest<AuthSession>(apiPaths.authLogin, {
        method: "POST",
        body: input,
      });
      return adoptSession(session);
    },
    [adoptSession],
  );

  const register = React.useCallback(
    async (input: RegisterInput) => {
      const session = await apiRequest<AuthSession>(apiPaths.authRegister, {
        method: "POST",
        body: input,
      });
      return adoptSession(session);
    },
    [adoptSession],
  );

  const logout = React.useCallback(
    async (options?: { silent?: boolean }) => {
      const token = tokenRef.current;
      clearStoredSession();
      tokenRef.current = null;
      setUser(null);
      setStatus("anonymous");
      if (token !== null && options?.silent !== true) {
        // Best-effort revoke — the local session is already cleared, so a
        // transport failure here must not keep the user "signed in".
        await apiRequest(apiPaths.authLogout, {
          method: "POST",
          headers: authHeaders(token),
        }).catch(() => undefined);
      }
    },
    [],
  );

  const requestPasswordReset = React.useCallback(
    async (input: PasswordResetRequestInput) => {
      const body = await apiRequest<{ ok: boolean; devCode?: string }>(
        apiPaths.authPasswordResetRequest,
        { method: "POST", body: input },
      );
      return { devCode: body.devCode ?? null };
    },
    [],
  );

  const confirmPasswordReset = React.useCallback(
    async (input: PasswordResetConfirmInput) => {
      const session = await apiRequest<AuthSession>(apiPaths.authPasswordResetConfirm, {
        method: "POST",
        body: input,
      });
      return adoptSession(session);
    },
    [adoptSession],
  );

  const changePassword = React.useCallback(
    async (input: PasswordChangeInput) => {
      const token = tokenRef.current;
      if (token === null) throw new Error("You are signed out — sign in again to continue.");
      try {
        await apiRequest(apiPaths.authPasswordChange, {
          method: "POST",
          body: input,
          headers: authHeaders(token),
        });
      } catch (error) {
        throw new Error(apiErrorMessage(error, "Could not change the password"));
      }
    },
    [],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      register,
      logout,
      requestPasswordReset,
      confirmPasswordReset,
      changePassword,
    }),
    [status, user, login, register, logout, requestPasswordReset, confirmPasswordReset, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}

/** Display-ready message from any auth-flow error. */
export function authErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

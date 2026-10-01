"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthMeQuery, useLogoutMutation } from "@/lib/api/queries/auth";
import { queryKeys } from "@/lib/api/keys";
import type { AuthSession, AuthUser } from "@cosmoz/shared";
import { subscribeAuthEvents } from "@/lib/auth/auth-events";
import { clearAccessToken } from "@/lib/auth/token-store";
import { registerDevAuthHooks } from "@/lib/auth/dev-hooks";

/**
 * Centralized authentication state (spec §3, §8, §32) — the SINGLE source of
 * truth for "is the user authenticated, who are they, and what may they see".
 *
 * Explicit status machine: `initializing` is distinct from `unauthenticated`
 * — a null user during boot NEVER means logged out (§8). All other surfaces
 * consume this context; no page owns private auth state (§3).
 */

export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  session: AuthSession | null;
  /** Fold a successful login / MFA challenge into state. */
  setAuthenticated: (user: AuthUser, session: AuthSession | null) => void;
  /** Server-side logout + full local teardown (§21, §66). */
  logout: (options?: { reason?: "signed-out" | "session-expired" | "revoked" }) => Promise<void>;
  /** Local-only teardown when the backend already ended the session. */
  markUnauthenticated: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = React.useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return value;
}

/**
 * Roles + permissions for authorization-aware UI. Frontend authorization is
 * UX only — the backend remains the security boundary (§32).
 */
export function usePermissions() {
  const { user } = useAuth();
  return React.useMemo(
    () => ({
      permissions: user?.permissions ?? [],
      roles: user?.roles ?? [],
      has: (permission: string): boolean =>
        user?.permissions.includes(permission as never) ?? false,
      hasRole: (role: string): boolean =>
        user?.roles.includes(role as never) ?? false,
    }),
    [user],
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const meQuery = useAuthMeQuery();
  const logoutMutation = useLogoutMutation();

  // Dev/test affordances (mocked builds only — see dev-hooks.ts).
  React.useEffect(() => {
    registerDevAuthHooks({
      refetchGuarded: async () => {
        // Parallel guarded re-fetches → parallel 401s → the API layer must
        // answer with exactly ONE single-flight refresh (spec §13).
        await Promise.all([
          queryClient.refetchQueries({ queryKey: queryKeys.profile, type: "active" }),
          queryClient.refetchQueries({ queryKey: queryKeys.tradesRoot, type: "active" }),
        ]);
      },
    });
  }, [queryClient]);

  // Auth lifecycle events from the API layer (refresh success, expiry…).
  React.useEffect(() => {
    return subscribeAuthEvents((event) => {
      if (event.type === "SESSION_EXPIRED") {
        clearAccessToken();
        queryClient.clear();
        queryClient.setQueryData(queryKeys.authMe, null);
        toast.warning("Your session has expired", {
          description: "Please sign in again to continue.",
          duration: 8000,
        });
        const current = window.location.pathname + window.location.search;
        const returnTo = encodeURIComponent(current);
        router.replace(`/login?reason=session-expired&returnTo=${returnTo}`);
      }
    });
  }, [queryClient, router]);

  const setAuthenticated = React.useCallback(
    (user: AuthUser, session: AuthSession | null) => {
      // Fresh identity — drop any cached data from a previous session.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.authMe, { user, session });
    },
    [queryClient],
  );

  const markUnauthenticated = React.useCallback(() => {
    clearAccessToken();
    // Wipe ALL private application state (§66 — no private data after
    // logout): every module query belongs to the signed-out world now.
    queryClient.clear();
    queryClient.setQueryData(queryKeys.authMe, null);
  }, [queryClient]);

  const logout = React.useCallback(
    async (options?: {
      reason?: "signed-out" | "session-expired" | "revoked";
    }) => {
      const reason = options?.reason ?? "signed-out";
      // The backend revokes the refresh chain FIRST (§21 — never rely on
      // frontend state deletion alone); local teardown happens regardless.
      try {
        await logoutMutation.mutateAsync();
      } catch {
        // Logout API failures never block local teardown.
      }
      clearAccessToken();
      queryClient.clear();
      queryClient.setQueryData(queryKeys.authMe, null);
      router.replace(`/login?reason=${reason}`);
    },
    [logoutMutation, queryClient, router],
  );

  const value: AuthContextValue = React.useMemo(() => {
    // Boot resolution: pending → initializing; error → unauthenticated
    // (a 401 here is the EXPECTED clean outcome, not a crash); success → user.
    const status: AuthStatus = meQuery.isPending
      ? "initializing"
      : meQuery.isError
        ? "unauthenticated"
        : meQuery.data?.user
          ? "authenticated"
          : "unauthenticated";

    return {
      status,
      user: status === "authenticated" ? meQuery.data?.user ?? null : null,
      session: status === "authenticated" ? meQuery.data?.session ?? null : null,
      setAuthenticated,
      logout,
      markUnauthenticated,
    };
  }, [meQuery, setAuthenticated, logout, markUnauthenticated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import type { AuthUser } from "@cosmoz/shared";

/**
 * Local persistence of the auth session (localStorage "cosmoz:session").
 * The token rides every authenticated request via `Authorization: Bearer`;
 * the AuthProvider hydrates its state from here at bootstrap and validates
 * it against GET /auth/session.
 */

const STORAGE_KEY = "cosmoz:session";

export interface StoredSession {
  token: string;
  user: AuthUser;
}

export function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed.token !== "string" || typeof parsed.user !== "object" || parsed.user === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable — the session lives in memory for this page only.
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — already gone.
  }
}

/** Only ever redirect to internal, absolute-from-root paths. */
export function safeInternalNext(next: string | null | undefined): string {
  if (next !== undefined && next !== null && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/";
}

/**
 * Access-token store (spec §9, §11, §66).
 *
 * The access token is a short-lived application credential that lives in
 * MODULE MEMORY ONLY - never in localStorage, sessionStorage, IndexedDB,
 * cookies, URL parameters or React state. A full page reload intentionally
 * drops it; the centralized refresh flow restores the session via the
 * HttpOnly refresh cookie (see lib/auth/refresh.ts).
 *
 * This module is the ONLY place the access token exists client-side.
 */

let accessToken: string | null = null;
let accessTokenExpiresAt: number | null = null;

export function setAccessToken(token: string, expiresAtIso: string): void {
  accessToken = token;
  const parsed = Date.parse(expiresAtIso);
  accessTokenExpiresAt = Number.isNaN(parsed) ? null : parsed;
}

export function getAccessToken(): string | null {
  // Expired tokens are filtered but the RECORD stays - refresh failure
  // handling distinguishes "session died mid-use" (had a token) from
  // "boot restore without a session" (never had one).
  if (accessToken && accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now()) {
    return null;
  }
  return accessToken;
}

/** True while any token record exists (even expired) - session-lifecycle signal. */
export function hasTokenRecord(): boolean {
  return accessToken !== null;
}

export function clearAccessToken(): void {
  accessToken = null;
  accessTokenExpiresAt = null;
}

export function hasAccessToken(): boolean {
  return getAccessToken() !== null;
}


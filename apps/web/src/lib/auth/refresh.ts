import type { RefreshResponse } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { buildApiUrl } from "@/lib/api/urls";
import { emitAuthEvent } from "@/lib/auth/auth-events";
import {
  clearAccessToken,
  hasTokenRecord,
  setAccessToken,
} from "@/lib/auth/token-store";

/**
 * Single-flight refresh (spec §13, §66).
 *
 * When several requests fail simultaneously with 401, exactly ONE refresh
 * request is issued — every failed caller awaits the same in-flight promise
 * and then retries its original request once. This prevents refresh-token
 * race conditions and duplicate refresh storms.
 *
 * Failure semantics (spec §9, §37): a definitive refresh failure clears the
 * access token and — ONLY when a session was actually active (a token
 * record existed) — emits SESSION_EXPIRED so the AuthProvider can explain
 * what happened. A boot-time restore without any prior session fails
 * silently: "no session" is a normal state, not an expiration.
 */

let refreshInFlight: Promise<boolean> | null = null;

export function isRefreshInFlight(): boolean {
  return refreshInFlight !== null;
}

export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  // Decide BEFORE any state mutation — this is the "was a session active?"
  // signal that separates real expiry from a quiet boot restore.
  const hadSession = hasTokenRecord();
  try {
    // Raw fetch, deliberately NOT the authenticated client — no Authorization
    // header, no interceptor. Cookies ride along (same-origin credentials).
    // NO Content-Type header: the request carries NO body, and a JSON
    // content-type with an empty body is a hard 400 on the real API
    // (Fastify JSON parser) even though the MSW mock tolerated it.
    const response = await fetch(buildApiUrl(apiPaths.authRefresh), {
      method: "POST",
    });
    if (!response.ok) {
      clearAccessToken();
      if (hadSession) emitAuthEvent({ type: "SESSION_EXPIRED" });
      return false;
    }
    const data = (await response.json()) as RefreshResponse;
    setAccessToken(data.accessToken, data.accessTokenExpiresAt);
    emitAuthEvent({ type: "TOKEN_REFRESHED" });
    return true;
  } catch {
    clearAccessToken();
    if (hadSession) emitAuthEvent({ type: "SESSION_EXPIRED" });
    return false;
  }
}

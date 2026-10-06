import { forceExpireAccessTokenForTesting } from "@/lib/auth/token-store";
import { API_MOCKED } from "@/lib/api/mode";

/**
 * Dev/test-only window hooks (spec-compliant: no secrets exposed, mock
 * builds only). Registered by the AuthProvider on mount and used by the
 * Playwright harness to exercise the 401 → single-flight refresh → retry
 * path without waiting for the real 15-minute access-token TTL.
 *
 * Gated twice: mocked API builds AND non-production — production builds
 * never register anything, and no credential material passes through here.
 */
export function registerDevAuthHooks(hooks: {
  /** Re-fetch guarded queries (profile, trades) through the real queryClient. */
  refetchGuarded: () => void;
}): void {
  if (!API_MOCKED) return;
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;

  const host = window as unknown as {
    __cosmoz_auth?: {
      expireAccessToken: () => void;
      refetchGuarded: () => void;
    };
  };

  host.__cosmoz_auth = {
    expireAccessToken: forceExpireAccessTokenForTesting,
    refetchGuarded: hooks.refetchGuarded,
  };
}

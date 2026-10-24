/**
 * Single source of truth for API URL building - used by BOTH the fetch
 * client (lib/api/client.ts) and the MSW handlers (src/mocks/handlers) so
 * registered handler URLs always match requested URLs.
 */

import { API_MOCKED } from "./mode";

/**
 * Base URL of the COSMOZ API - DERIVED FROM THE CANONICAL MODE (lib/api/
 * mode.ts) so the URL and the active data source can never disagree:
 *
 * - Mocked (explicit NEXT_PUBLIC_API_MOCKED=true, or zero-env dev): the
 *   same-origin "/api" - MSW intercepts before the network.
 * - Real API (production zero-env, explicit false, or the former live
 *   bridge): same-origin "/api/v1" - the NestJS backend serves the
 *   versioned prefix and next.config.ts proxies /api/v1 to it, keeping
 *   every request first-party (cookies, no CORS).
 * - NEXT_PUBLIC_API_URL always wins when set (direct cross-origin pointing;
 *   include the version segment, e.g. http://localhost:4000/api/v1).
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || (API_MOCKED ? "/api" : "/api/v1");

export type ApiQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Resolve an endpoint path against the API base, appending any query
 * parameters (undefined/null values are skipped).
 */
export function buildApiUrl(path: string, query?: ApiQuery): string {
  const base = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
  const url = new URL(`${base}${path}`, "http://localhost");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  // Keep relative when the base is relative (same-origin mocked dev mode).
  if (API_BASE.startsWith("/")) {
    return `${url.pathname}${url.search}`;
  }
  return url.toString();
}

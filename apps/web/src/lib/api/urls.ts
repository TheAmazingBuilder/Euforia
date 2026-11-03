/**
 * Single source of truth for API URL building (fetch client: lib/api/client.ts).
 */

/**
 * Base URL of the Euforia API:
 * - Default: same-origin "/api/v1" - the NestJS backend serves the versioned
 *   prefix and next.config.ts proxies /api/v1 to it, keeping every request
 *   first-party (cookies, no CORS).
 * - NEXT_PUBLIC_API_URL always wins when set (direct cross-origin pointing;
 *   include the version segment, e.g. http://localhost:4000/api/v1).
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

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
  // Keep relative when the base is relative (same-origin deployment).
  if (API_BASE.startsWith("/")) {
    return `${url.pathname}${url.search}`;
  }
  return url.toString();
}

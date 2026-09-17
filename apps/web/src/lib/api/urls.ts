/**
 * Single source of truth for API URL building — used by BOTH the fetch
 * client (lib/api/client.ts) and the MSW handlers (src/mocks/handlers) so
 * registered handler URLs always match requested URLs.
 */

/** Base URL of the COSMOZ API. Same-origin "/api" in mocked dev mode. */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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

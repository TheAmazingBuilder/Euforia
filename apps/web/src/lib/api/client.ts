import { buildApiUrl, type ApiQuery } from "./urls";
import { recordApiTelemetry } from "./telemetry";
import { clearAccessToken, getAccessToken } from "@/lib/auth/token-store";
import { refreshAccessToken } from "@/lib/auth/refresh";

/**
 * Typed fetch wrapper — the ONLY place in the app that touches `fetch`.
 * Components never call it directly; they consume hooks from lib/api/queries.
 *
 * Authentication layer (spec §9, §12, §13): every request carries the
 * in-memory access token when present; a 401 triggers ONE single-flight
 * refresh and ONE retry of the original request — never a second refresh
 * (no infinite loops), never a parallel refresh storm.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * User-facing message from a thrown error — prefers the server's
 * `error` field (e.g. "This strategy has trades attached — pause or
 * retire it instead.") over the generic transport message.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (body !== null && typeof body === "object" && "error" in body) {
      const message = (body as { error?: unknown }).error;
      if (typeof message === "string" && message !== "") return message;
    }
    return error.message;
  }
  if (error instanceof Error && error.message !== "") return error.message;
  return fallback;
}

/** Machine-readable error code from the body, when the API provides one. */
export function apiErrorCode(error: unknown): string | null {
  if (error instanceof ApiError && error.body !== null && typeof error.body === "object") {
    const code = (error.body as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: ApiQuery;
  body?: unknown;
  signal?: AbortSignal;
  /** Internal: the request already survived one refresh-retry — do not loop. */
  _authRetried?: boolean;
}

/**
 * Auth endpoints manage their own error semantics (login/register/reset…)
 * — the 401 refresh interceptor must not interfere with them. /auth/me is
 * deliberately NOT exempt: its 401 is what triggers the cookie-based
 * refresh + retry on session restore (spec §9).
 */
const AUTH_INTERCEPT_EXEMPT = new Set<string>([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/mfa/challenge",
  "/auth/mfa/recover",
  "/auth/email/verify",
  "/auth/email/resend",
  "/auth/password/forgot",
  "/auth/password/reset",
]);

function isAuthExempt(path: string): boolean {
  return AUTH_INTERCEPT_EXEMPT.has(path);
}

async function execute<TResponse>(
  path: string,
  options: ApiRequestOptions,
): Promise<TResponse> {
  const { method = "GET", query, body, signal } = options;

  const startedAtMs = Date.now();
  const record = (status: number) =>
    recordApiTelemetry({
      method,
      path,
      status,
      durationMs: Date.now() - startedAtMs,
      at: startedAtMs,
    });

  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // Never log the token (§52) — attach silently, forget immediately.
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    record(0);
    throw new ApiError(0, null, `Network error calling ${path}: ${String(cause)}`);
  }

  record(response.status);

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const parsed: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(response.status, parsed, `API error ${response.status} on ${method} ${path}`);
  }
  return parsed as TResponse;
}

/**
 * JSON-in / JSON-out request. Throws {@link ApiError} for non-2xx responses
 * and for transport failures. Responses with an empty body resolve to
 * `undefined` (typed by the caller).
 *
 * 401 lifecycle: refresh (single-flight) → retry once → if still 401, STOP.
 */
export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const { _authRetried = false, ...rest } = options;

  try {
    return await execute<TResponse>(path, options);
  } catch (error) {
    const retryable =
      error instanceof ApiError &&
      error.status === 401 &&
      !_authRetried &&
      !isAuthExempt(path);

    if (!retryable) throw error;

    // One shared refresh for every concurrent 401 (§13).
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      // SESSION_EXPIRED was emitted — AuthProvider owns the UX from here.
      clearAccessToken();
      throw error;
    }
    return execute<TResponse>(path, { ...rest, _authRetried: true });
  }
}

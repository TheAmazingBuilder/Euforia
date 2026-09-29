import { buildApiUrl, type ApiQuery } from "./urls";
import { recordApiTelemetry } from "./telemetry";

/**
 * Typed fetch wrapper — the ONLY place in the app that touches `fetch`.
 * Components never call it directly; they consume hooks from lib/api/queries.
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

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: ApiQuery;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * JSON-in / JSON-out request. Throws {@link ApiError} for non-2xx responses
 * and for transport failures. Responses with an empty body resolve to
 * `undefined` (typed by the caller).
 */
export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
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

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, query), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
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

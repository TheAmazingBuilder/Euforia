import { ZodError, type ZodType } from "zod";
import { HttpResponse, delay } from "msw";

import { buildApiUrl } from "@/lib/api/urls";
import { MockError } from "@/mocks/store";
import { authEngine } from "@/mocks/auth-engine";

/** Small helpers shared by every MSW handler. */

/**
 * Guard private endpoints (spec §68 — "no unauthorized private route
 * access"): protected mock handlers call this BEFORE touching the store so
 * private data never leaves the mock backend without a valid Bearer access
 * token. The future NestJS backend enforces the same rule for real.
 */
export function requireAuth(request: Request): void {
  if (!authEngine.authenticate(request.headers.get("authorization"))) {
    throw new MockError(401, "Authentication required");
  }
}

/** Resolve an endpoint path to the exact URL form the fetch client produces. */
export const endpoint = (path: string): string => buildApiUrl(path);

/** Deterministic simulated latency so loading states are visible. */
export const latency = (): Promise<void> => delay(120);

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  if (body === null || body === undefined) {
    throw new MockError(400, "Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof MockError) {
    return HttpResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return HttpResponse.json(
      { error: "ValidationError", issues: error.issues },
      { status: 400 },
    );
  }
  console.error("[msw] unhandled error:", error);
  return HttpResponse.json({ error: "InternalServerError" }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** msw 2.15 types path params as `string | readonly string[]` — normalize. */
export function pathParam(params: object, key: string): string {
  const value = (params as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    throw new MockError(400, `Missing path parameter: ${key}`);
  }
  return value;
}

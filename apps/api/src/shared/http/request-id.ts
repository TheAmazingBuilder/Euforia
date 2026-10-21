/**
 * Request correlation (Foundation mandate §16).
 *
 * Every incoming request carries a request id that flows through:
 *   client → NestJS → application → infrastructure (logs, error payloads).
 *
 * A client-supplied `x-request-id` is reused ONLY when it matches a strict
 * safe format (8–64 chars of [A-Za-z0-9_-]); otherwise a fresh UUID is
 * generated — arbitrary values are never trusted blindly.
 */
import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

/** 8–64 chars, letters/digits/dash/underscore. Deliberately strict. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function resolveRequestId(
  incoming: unknown,
  generate: () => string = randomUUID,
): string {
  if (typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming)) {
    return incoming;
  }
  if (Array.isArray(incoming)) {
    // Multiple header values: only acceptable if every value is valid and
    // identical; otherwise regenerate.
    const first = incoming[0];
    if (
      typeof first === "string" &&
      incoming.length === 1 &&
      REQUEST_ID_PATTERN.test(first)
    ) {
      return first;
    }
  }
  return generate();
}

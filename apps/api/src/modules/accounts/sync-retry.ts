/**
 * Bounded segment retries (Phase 05, spec §15).
 *
 * TRANSIENT failures (network timeouts, provider outages, retryable server
 * errors, provider rate limiting) may be retried a BOUNDED number of times
 * with exponential backoff + jitter and documented Retry-After respect.
 * PERMANENT failures (invalid credentials, revoked authorization,
 * unsupported account, malformed response contract) are NEVER retried -
 * repeating them cannot succeed and hammers the provider (§15: "No repeated
 * retries for invalid credentials").
 *
 * Delay budget: capped at `maxDelayMs` (5 s) so a MANUAL synchronization -
 * whose HTTP request spans the whole run - stays within a sane request
 * budget even against a provider advertising a long Retry-After. The run
 * records the honest outcome when the budget is exhausted; the next run
 * (manual or scheduled) retries from scratch.
 *
 * Pure and injectable (sleep/jitter/random) so tests can run it under fake
 * timers deterministically.
 */
import { ProviderError } from "./provider.types";

/** Provider failure codes a retry can legitimately fix. */
export const TRANSIENT_PROVIDER_CODES: ReadonlySet<string> = new Set([
  "PROVIDER_UNAVAILABLE",
  "CONNECTION_TIMEOUT",
  "RATE_LIMITED",
]);

export interface SegmentRetryOptions {
  /** Additional attempts AFTER the initial one (0 = no retry). */
  maxRetries: number;
  baseDelayMs: number;
  /** Hard ceiling for any single wait (manual-path HTTP budget). */
  maxDelayMs: number;
  /** Injectable wall-clock waiter (tests: fake timers / no-op). */
  sleep: (ms: number) => Promise<void>;
  /** Injectable jitter source - ms 0..jitterMs added to each backoff. */
  jitterMs: number;
  random: () => number;
}

export const DEFAULT_SEGMENT_RETRY_OPTIONS: SegmentRetryOptions = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  jitterMs: 250,
  random: Math.random,
};

/** The wait before the given attempt (0-based): base·2^attempt + jitter, capped. */
export function segmentBackoffDelay(
  attempt: number,
  options: Pick<SegmentRetryOptions, "baseDelayMs" | "maxDelayMs" | "jitterMs" | "random">,
  retryAfterSeconds?: number,
): number {
  const exponential = options.baseDelayMs * 2 ** attempt;
  const jitter = Math.floor(options.random() * options.jitterMs);
  let delay = exponential + jitter;
  // §15: "Respect Retry-After or equivalent documented guidance" - the wait
  // is AT LEAST the provider-advertised delay (still capped by maxDelayMs:
  // an in-request wait longer than the budget ends the run honestly instead
  // of stalling the caller).
  if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    delay = Math.max(delay, retryAfterSeconds * 1_000);
  }
  return Math.min(delay, options.maxDelayMs);
}

/**
 * Run `operation`, retrying ONLY transient provider failures up to
 * `maxRetries` times. Any other error (or a retry budget exhausted) throws
 * the ORIGINAL error - the orchestrator's classification/normalization
 * stays the single source of truth.
 */
export async function withSegmentRetries<T>(
  operation: () => Promise<T>,
  options: SegmentRetryOptions,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      const retryable =
        error instanceof ProviderError && TRANSIENT_PROVIDER_CODES.has(error.code);
      if (!retryable || attempt >= options.maxRetries) {
        throw error;
      }
      const retryAfter =
        error instanceof ProviderError && error.code === "RATE_LIMITED"
          ? error.retryAfterSeconds
          : undefined;
      await options.sleep(segmentBackoffDelay(attempt, options, retryAfter));
      attempt += 1;
    }
  }
}

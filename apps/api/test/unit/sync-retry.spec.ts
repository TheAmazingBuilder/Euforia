/**
 * Unit tests - bounded segment retries (Phase 05, spec §15).
 *
 * Classification (transient vs permanent), bounded attempt count, exponential
 * backoff with jitter, Retry-After respect, and the in-request delay cap.
 * All timing is injected - deterministic, no fake timers needed.
 */
import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "../../src/modules/accounts/provider.types";
import {
  segmentBackoffDelay,
  withSegmentRetries,
  TRANSIENT_PROVIDER_CODES,
} from "../../src/modules/accounts/sync-retry";

function options(overrides: Partial<Parameters<typeof withSegmentRetries>[1]> = {}) {
  return {
    maxRetries: 2,
    baseDelayMs: 100,
    maxDelayMs: 5_000,
    sleep: vi.fn(async () => {}),
    jitterMs: 0,
    random: () => 0,
    ...overrides,
  };
}

describe("withSegmentRetries", () => {
  it("returns the first success without sleeping", async () => {
    const opts = options();
    const operation = vi.fn(async () => "ok");
    await expect(withSegmentRetries(operation, opts)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(opts.sleep).not.toHaveBeenCalled();
  });

  it("retries a transient failure and succeeds within the budget", async () => {
    const opts = options();
    let calls = 0;
    const operation = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new ProviderError("PROVIDER_UNAVAILABLE", "down");
      return "recovered";
    });
    await expect(withSegmentRetries(operation, opts)).resolves.toBe("recovered");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(opts.sleep).toHaveBeenCalledTimes(2); // 100 then 200 (0 jitter)
  });

  it("NEVER retries a permanent failure (invalid credentials)", async () => {
    const opts = options();
    const operation = vi.fn(async () => {
      throw new ProviderError("INVALID_CREDENTIALS", "rejected");
    });
    await expect(withSegmentRetries(operation, opts)).rejects.toBeInstanceOf(ProviderError);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(opts.sleep).not.toHaveBeenCalled();
  });

  it.each(["UNAUTHORIZED_PROVIDER_ACCESS", "UNSUPPORTED_ACCOUNT", "INVALID_PROVIDER_RESPONSE"] as const)(
    "does not retry %s",
    async (code) => {
      const opts = options();
      const operation = vi.fn(async () => {
        throw new ProviderError(code, "permanent");
      });
      await expect(withSegmentRetries(operation, opts)).rejects.toMatchObject({ code });
      expect(operation).toHaveBeenCalledTimes(1);
    },
  );

  it("exhausts the bounded budget and throws the ORIGINAL error", async () => {
    const opts = options({ maxRetries: 2 });
    const failure = new ProviderError("CONNECTION_TIMEOUT", "hung");
    const operation = vi.fn(async () => {
      throw failure;
    });
    await expect(withSegmentRetries(operation, opts)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(opts.sleep).toHaveBeenCalledTimes(2);
  });

  it("waits at least the provider-advertised Retry-After on RATE_LIMITED (capped)", async () => {
    const opts = options({ maxRetries: 1, maxDelayMs: 5_000 });
    const operation = vi.fn(async () => {
      throw new ProviderError("RATE_LIMITED", "slow down", { retryAfterSeconds: 30 });
    });
    await expect(withSegmentRetries(operation, opts)).rejects.toBeInstanceOf(ProviderError);
    // retryAfter 30s EXCEEDS the 5s in-request budget → the wait is capped at
    // 5s and the run ends honestly (no stalled HTTP caller, no fake success).
    expect(opts.sleep).toHaveBeenCalledWith(5_000);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("respects a small Retry-After over the exponential backoff", async () => {
    const delay = segmentBackoffDelay(
      0,
      { baseDelayMs: 100, maxDelayMs: 5_000, jitterMs: 0, random: () => 0 },
      2,
    );
    expect(delay).toBe(2_000);
  });

  it("caps the exponential backoff at maxDelayMs", async () => {
    const delay = segmentBackoffDelay(
      10,
      { baseDelayMs: 500, maxDelayMs: 5_000, jitterMs: 0, random: () => 0 },
      undefined,
    );
    expect(delay).toBe(5_000);
  });

  it("adds jitter within the configured amplitude", async () => {
    const zero = segmentBackoffDelay(0, { baseDelayMs: 100, maxDelayMs: 5_000, jitterMs: 250, random: () => 0 });
    const full = segmentBackoffDelay(0, { baseDelayMs: 100, maxDelayMs: 5_000, jitterMs: 250, random: () => 0.999 });
    expect(zero).toBe(100);
    expect(full).toBeGreaterThanOrEqual(100);
    expect(full).toBeLessThanOrEqual(100 + 250);
  });

  it("transient classification covers exactly the documented codes", () => {
    expect(TRANSIENT_PROVIDER_CODES.has("PROVIDER_UNAVAILABLE")).toBe(true);
    expect(TRANSIENT_PROVIDER_CODES.has("CONNECTION_TIMEOUT")).toBe(true);
    expect(TRANSIENT_PROVIDER_CODES.has("RATE_LIMITED")).toBe(true);
    expect(TRANSIENT_PROVIDER_CODES.has("INVALID_CREDENTIALS")).toBe(false);
    expect(TRANSIENT_PROVIDER_CODES.has("UNSUPPORTED_CAPABILITY")).toBe(false);
  });
});

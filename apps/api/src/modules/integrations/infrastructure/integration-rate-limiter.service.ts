/**
 * Provider-side rate limiter (Phase 14 §25) — in-process sliding window per
 * (user, provider), mirroring the mock's per-provider quota bookkeeping
 * (30/60 s default, 60/60 s market data, 3/10 s economic sample).
 *
 * WHY NOT the identity AuthRateLimiterService: that class hardcodes a single
 * 15-minute window for every vector, while provider quotas are per-provider
 * windows (10 s vs 60 s). The sliding-window ALGORITHM and the in-memory
 * single-instance assumption are reused (accounts precedent: "correct for
 * the single-instance monolith") with provider-shaped windows.
 *
 * Applied ONLY to the sync action (mock parity — connect/disconnect/test are
 * not provider-API calls in this phase).
 */

import { Injectable } from "@nestjs/common";

import type { ProviderCatalogEntry } from "../domain/provider-catalog";

interface WindowState {
  readonly timestamps: number[];
}

const MAX_TRACKED_KEYS = 5_000;

@Injectable()
export class IntegrationRateLimiterService {
  private readonly buckets = new Map<string, WindowState>();

  /**
   * Sliding-window check+consume. Returns the ms to wait when the provider
   * quota is exhausted (null when the call is allowed and counted).
   */
  check(
    provider: ProviderCatalogEntry,
    key: `${string}:${string}`,
    nowMs: number,
  ): { allowed: true } | { allowed: false; retryAfterMs: number } {
    if (this.buckets.size > MAX_TRACKED_KEYS) this.prune(nowMs);

    const window = provider.rateLimit;
    const state = this.buckets.get(key) ?? { timestamps: [] };
    const stillInWindow = state.timestamps.filter((ts) => nowMs - ts < window.windowMs);

    if (stillInWindow.length >= window.limitPerWindow) {
      const oldest = Math.min(...stillInWindow);
      this.buckets.set(key, { timestamps: stillInWindow });
      return { allowed: false, retryAfterMs: Math.max(0, oldest + window.windowMs - nowMs) };
    }

    stillInWindow.push(nowMs);
    this.buckets.set(key, { timestamps: stillInWindow });
    return { allowed: true };
  }

  /** Test helper — reset the in-memory window bookkeeping. */
  clear(): void {
    this.buckets.clear();
  }

  private prune(nowMs: number): void {
    // The widest provider window is 60 s (catalog) — anything older is dead.
    for (const [key, state] of this.buckets) {
      const alive = state.timestamps.filter((ts) => nowMs - ts < 60_000);
      if (alive.length === 0) this.buckets.delete(key);
      else this.buckets.set(key, { timestamps: alive });
    }
  }
}

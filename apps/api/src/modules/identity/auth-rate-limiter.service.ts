/**
 * Per-vector authentication rate limiting (Phase 2 mandate §36).
 *
 * Sliding-window counters keyed by `scope:email` - matching the mock
 * engine's vectors exactly (the frontend declares these limits in the
 * Security center and its error copy expects 429 + Retry-After):
 *
 *   login     5 / 15 min      mfa       5 / 15 min
 *   register  5 / 15 min      resend    3 / 15 min
 *   forgot    3 / 15 min      reauth    5 / 15 min (failures only)
 *
 * In-memory storage is correct for the single-instance monolith; a shared
 * store is required only if the API ever scales horizontally.
 */
import { Injectable } from "@nestjs/common";

export interface RateCheck {
  allowed: boolean;
  retryAfterSeconds: number;
}

const WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AuthRateLimiterService {
  /** scope → key (lowercased email) → hit timestamps (ascending). */
  private readonly buckets = new Map<string, Map<string, number[]>>();

  constructor(
    private readonly limits: Readonly<Record<string, number>>,
  ) {}

  /** Check without recording a hit. */
  check(scope: string, key: string): RateCheck {
    const limit = this.limits[scope];
    if (limit === undefined) return { allowed: true, retryAfterSeconds: 0 };
    const hits = this.hits(scope, key.toLowerCase());
    const now = Date.now();
    const oldest = hits[0];
    if (hits.length >= limit) {
      const retryAfterMs = Math.max(1000, (oldest ?? now) + WINDOW_MS - now);
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Record a hit. */
  hit(scope: string, key: string): void {
    if (this.limits[scope] === undefined) return;
    const bucket = this.bucket(scope);
    const k = key.toLowerCase();
    const hits = bucket.get(k) ?? [];
    const now = Date.now();
    hits.push(now);
    // Keep only hits inside the window.
    while (hits.length > 0 && (hits[0] ?? 0) + WINDOW_MS <= now) hits.shift();
    bucket.set(k, hits);
    this.pruneIfNeeded(bucket);
  }

  /** Successful authentication clears the vector for the key. */
  clear(scope: string, key: string): void {
    this.bucket(scope).delete(key.toLowerCase());
  }

  /** Current hit count inside the window (for copy like "N attempts left"). */
  count(scope: string, key: string): number {
    return this.hits(scope, key.toLowerCase()).length;
  }

  private hits(scope: string, key: string): number[] {
    const now = Date.now();
    const hits = (this.bucket(scope).get(key) ?? []).filter(
      (ts) => ts + WINDOW_MS > now,
    );
    return hits;
  }

  private bucket(scope: string): Map<string, number[]> {
    let bucket = this.buckets.get(scope);
    if (!bucket) {
      bucket = new Map();
      this.buckets.set(scope, bucket);
    }
    return bucket;
  }

  /** Bound memory: drop empties / oversize buckets opportunistically. */
  private pruneIfNeeded(bucket: Map<string, number[]>): void {
    if (bucket.size < 5_000) return;
    const now = Date.now();
    for (const [key, hits] of bucket) {
      const alive = hits.filter((ts) => ts + WINDOW_MS > now);
      if (alive.length === 0) bucket.delete(key);
      else bucket.set(key, alive);
    }
  }
}

/** The canonical auth vectors (mock-parity). */
export const AUTH_RATE_LIMITS: Record<string, number> = {
  login: 5,
  mfa: 5,
  mfa_email_send: 3,
  mfa_email_enroll: 3,
  register: 5,
  resend: 3,
  forgot: 3,
  reauth: 5,
};

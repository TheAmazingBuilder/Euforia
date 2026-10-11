import type { Candle } from "@cosmoz/shared";

/**
 * Oryon chart synchronization — pure time-alignment helpers (Phase 7 §8).
 *
 * These functions carry the honest-alignment rules the sync engine enforces
 * across charts whose candles may differ in interval, session coverage or
 * loaded span:
 *
 *  - visible-range comparison uses a small epsilon (same-second alignment,
 *    no float equality);
 *  - crosshair alignment is TIMESTAMP-based (never pixel positions) and
 *    snaps only onto a bar that actually CONTAINS the source time — a time
 *    falling in a session gap (weekend, holiday) or outside the loaded span
 *    returns null, so the target chart never fabricates a candle or implies
 *    an exact match.
 */

/** Visible time range in unix SECONDS (the engine's UTCTimestamp domain). */
export interface SyncRange {
  from: number;
  to: number;
}

/**
 * Range equality epsilon (seconds). Programmatic echoes and no-op updates
 * within one second of the applied range are ignored — cheap protection
 * against synchronization ping-pong without blocking real user pans.
 */
export const RANGE_EPSILON_SEC = 1;

export function rangesEqual(a: SyncRange, b: SyncRange): boolean {
  return (
    Math.abs(a.from - b.from) <= RANGE_EPSILON_SEC &&
    Math.abs(a.to - b.to) <= RANGE_EPSILON_SEC
  );
}

/**
 * Finds the candle that CONTAINS `timeSec` (a bar whose [t, t+interval)
 * bucket covers the time). Returns null when the time falls between bars
 * (session gap), before the first bar, or past the last bar's bucket —
 * the honest "this chart cannot represent that timestamp" answer.
 * `candles` MUST be sorted by `t` ascending (the engine's invariant).
 */
export function findBarContainingTime(
  candles: readonly Candle[],
  timeSec: number,
  intervalMs: number,
): Candle | null {
  if (!Number.isFinite(timeSec) || candles.length === 0 || intervalMs <= 0) return null;
  const ms = timeSec * 1000;
  const first = candles[0]!.t;
  if (ms < first) return null;

  // Binary search: greatest i with candles[i].t <= ms.
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid]!.t <= ms) lo = mid;
    else hi = mid - 1;
  }
  const bar = candles[lo]!;
  // Containment: the time must fall inside the bar's own bucket. A time
  // sitting in a multi-bar gap resolves to an earlier bar that does NOT
  // contain it — rejected (never snapped onto an unrelated candle).
  if (ms >= bar.t + intervalMs) return null;
  return bar;
}

/**
 * How long a programmatic apply's echo-suppression window stays valid.
 * Lightweight Charts fires change listeners synchronously inside apply
 * calls; the window exists only as a belt-and-braces guard against
 * unexpected async emission — short enough that a real user interaction
 * (≥ a frame later) always propagates.
 */
export const ECHO_SUPPRESSION_MS = 150;

export interface EchoGuard {
  /** Marks a programmatic apply of `value` (null clears the guard). */
  mark(value: unknown): void;
  /** True when `value` matches a recent programmatic apply. */
  matches(value: unknown): boolean;
}

/**
 * Echo suppression for programmatic applies: a value applied by the sync
 * engine must not re-broadcast as if the user had moved it. Guards match
 * within the suppression window and expire afterwards, so subsequent USER
 * input of the same value still propagates.
 */
export function createEchoGuard(): EchoGuard {
  let lastValue: unknown = undefined;
  let markedAt = 0;
  return {
    mark(value: unknown): void {
      lastValue = value;
      markedAt = Date.now();
    },
    matches(value: unknown): boolean {
      if (markedAt === 0 || Date.now() - markedAt > ECHO_SUPPRESSION_MS) return false;
      if (value === null || value === undefined) return lastValue === value;
      if (typeof value === "number") {
        return lastValue === value;
      }
      if (
        typeof value === "object" &&
        lastValue !== null &&
        typeof lastValue === "object"
      ) {
        return rangesEqual(value as SyncRange, lastValue as SyncRange);
      }
      return false;
    },
  };
}

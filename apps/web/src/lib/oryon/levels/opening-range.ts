import type { Candle } from "@cosmoz/shared";

import { normalizeCandles } from "@/lib/oryon/structure/pivots";
import { sessionIntervalsForUtcRange } from "@/lib/oryon/sessions/engine";
import type { OryonSessionDefinition } from "@/lib/oryon/sessions/definitions";

/**
 * Oryon opening-range engine (Phase 9 spec §5.3) - the high/low of the
 * FIRST `durationMinutes` of a configured market session.
 *
 * SESSION SOURCE: the Phase 8 session definitions and interval engine are
 * REUSED verbatim (spec §14: no duplicate session engine) - the session's
 * own IANA timezone and the Intl-based DST-correct wall-time conversion
 * are inherited, never reimplemented. The "indicative reference" honesty
 * of Phase 8 carries over verbatim (no verified holiday calendar exists).
 *
 * Semantics (spec §5.3, each rule implemented and tested):
 *  - The range window is [sessionStart, sessionStart + duration) - HALF-
 *    OPEN, computed in UTC ms from the session engine.
 *  - The range stays DEVELOPING until its window has fully passed relative
 *    to the loaded candles ("developing" is displayed while forming).
 *  - The most recent session interval the data can describe wins (older
 *    intervals are history; a future interval has no data yet).
 *  - Missing candles are never interpreted as zero prices: the range
 *    aggregates ONLY candles that actually exist inside the window; an
 *    empty window returns null (unavailable), a partial window inside a
 *    still-forming session stays "developing" with the candles it has.
 *  - The range NEVER extends beyond its window (§5.3) - the box overlay
 *    the chart draws spans exactly [start, end].
 *  - DST is handled by the session engine (IANA rules, no fixed offsets).
 *  - Intraday resolution only: the caller gates on the chart being intraday
 *    (a 1D chart cannot place an intraday window - Phase 8 precedent).
 */

export interface OryonOpeningRange {
  readonly sessionId: OryonSessionDefinition["id"];
  /** Range window (epoch ms): [startMs, endMs) - never extended. */
  readonly startMs: number;
  readonly endMs: number;
  /** High/low over the candles ACTUALLY present in the window. */
  readonly high: number;
  readonly low: number;
  /** "developing" while the window has not fully passed (spec §5.3). */
  readonly status: "complete" | "developing";
  /** Candles that contributed (honest coverage - holes are visible). */
  readonly candleCount: number;
}

export interface OpeningRangeInput {
  /** The chart's own candles (chronological; sanitized internally). */
  readonly candles: readonly Candle[];
  /** Bucket size of the candle series (ms). */
  readonly intervalMs: number;
  /** The configured session definition (Phase 8 code constants). */
  readonly session: OryonSessionDefinition;
  /** Opening-range length in minutes (validated by the shared schema). */
  readonly durationMinutes: number;
}

export function computeOpeningRange({
  candles,
  intervalMs,
  session,
  durationMinutes,
}: OpeningRangeInput): OryonOpeningRange | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const data = normalizeCandles(candles);
  if (data.length === 0) return null;

  const firstMs = data[0]!.t;
  const lastMs = data[data.length - 1]!.t;
  const spanEndMs = lastMs + intervalMs; // the forming bar's end

  const durationMs = durationMinutes * 60_000;
  // Candidate intervals across the loaded span - the span is extended by
  // the RANGE DURATION on the right so the engine's window clipping can
  // never truncate the true session end (the range window
  // [start, start+duration] always fits inside the requested span, because
  // start ≤ lastMs by the selection rule below).
  const intervals = sessionIntervalsForUtcRange(session, firstMs - durationMs, spanEndMs + durationMs);

  // Latest interval whose START the data reaches (an interval that starts
  // after the last bar has no candles yet - the range cannot exist).
  let chosen: { startMs: number; endMs: number } | null = null;
  for (let i = intervals.length - 1; i >= 0; i -= 1) {
    const interval = intervals[i]!;
    if (interval.startMs <= lastMs) {
      chosen = { startMs: interval.startMs, endMs: Math.min(interval.startMs + durationMs, interval.endMs) };
      break;
    }
  }
  if (chosen === null) return null;

  const windowEnd = Math.min(chosen.endMs, spanEndMs);
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let count = 0;
  for (const candle of data) {
    if (candle.t < chosen.startMs) continue;
    if (candle.t >= windowEnd) break;
    count += 1;
    if (candle.h > high) high = candle.h;
    if (candle.l < low) low = candle.l;
  }
  if (count === 0) return null; // no candles in the window - unavailable

  // The window has fully passed when the last loaded bar closes at/after
  // the range end - otherwise the range is still forming (§5.3).
  const status: OryonOpeningRange["status"] = lastMs + intervalMs >= chosen.endMs ? "complete" : "developing";

  return {
    sessionId: session.id,
    startMs: chosen.startMs,
    endMs: chosen.endMs,
    high,
    low,
    status,
    candleCount: count,
  };
}

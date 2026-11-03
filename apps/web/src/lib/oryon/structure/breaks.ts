import type { Candle } from "@cosmoz/shared";

import { normalizeCandles, type OryonPivot } from "./pivots";

/**
 * Oryon structure-break engine (Phase 9 spec §4.4) - BOS / CHoCH.
 *
 * EXACT ALGORITHM (defined BEFORE the visual layer, spec §4.4):
 *
 * 1. INPUT - CONFIRMED pivots only (provisional candidates never break
 *    anything) plus the candle window. Pivots must carry their candle
 *    index; the simulation walks CANDLE indexes, never timestamps, so
 *    session gaps cannot distort causality.
 *
 * 2. STATE - `trend: "bullish" | "bearish" | null` (starts null - no
 *    structure exists before the first break) and one ACTIVE level per
 *    kind: the most recent confirmed swing high / low whose confirmation
 *    bar has closed. When a newer pivot of the same kind confirms BEFORE
 *    the older one was broken, the newer level REPLACES it (the most
 *    recent swing is the relevant structure level; the replaced level is
 *    consumed and can never fire later - no stale breaks).
 *
 * 3. CAUSALITY - a pivot at index p becomes usable at candle j only when
 *    p + rightBars ≤ j (its confirmation window closed at or before j).
 *    No future candle leaks into any decision (spec §4.4).
 *
 * 4. BREAK RULE - strict comparison against the ACTIVE level:
 *      mode "close": close[j] > level (high) / close[j] < level (low)
 *      mode "wick":  high[j]  > level (high) / low[j]   < level (low)
 *    An EQUAL touch (high[j] === level) is NOT a break. A gap over the
 *    level IS a break (the same comparison catches it - no special case).
 *    For a confirmed swing high, no candle inside its own right window can
 *    break it (the pivot condition is strictly greater), so the earliest
 *    possible break is strictly after the confirmation bar.
 *
 * 5. EVENT - on a high break: the event is BOS when `trend` was already
 *    "bullish", CHoCH otherwise (including the very first break of a null
 *    trend - the character changes from "no structure" to bullish); trend
 *    becomes bullish. Low breaks mirror to bearish. The broken level is
 *    consumed immediately - the same level can NEVER fire twice (§4.4).
 *    If one candle breaks both the active high and the active low, the
 *    HIGH is evaluated first (deterministic tie-break; documented).
 *
 * 6. IDENTITY - `id = type + pivotId + break-bar open time`, derived from
 *    the source candles and the rule configuration; stable across
 *    recomputations of the same window (spec §4.4).
 *
 * Honest limits (spec §4.4): this classifies HISTORICAL structure breaks.
 * It predicts nothing, and a viewport/timeframe change can never mark a
 * level broken - only a candle can.
 */

export type OryonBreakMode = "close" | "wick";

export type OryonBreakType = "BOS" | "CHoCH";

export interface OryonBreakEvent {
  /** Stable identity: `<type>-<pivotId>-<breakOpenSec>`. */
  readonly id: string;
  readonly type: OryonBreakType;
  /** Structure direction AFTER the break. */
  readonly direction: "bullish" | "bearish";
  /** The swing whose level was broken. */
  readonly pivotId: string;
  /** The broken level (the pivot price). */
  readonly level: number;
  /** Break candle index + open time (unix seconds) - chart anchor. */
  readonly index: number;
  readonly timeSec: number;
}

export interface BreaksInput {
  readonly candles: readonly Candle[];
  /** CONFIRMED pivots (as produced by detectPivots). */
  readonly pivots: readonly OryonPivot[];
  readonly rightBars: number;
  readonly mode: OryonBreakMode;
}

export function detectStructureBreaks({ candles, pivots, rightBars, mode }: BreaksInput): OryonBreakEvent[] {
  if (rightBars < 1) return [];
  const data = normalizeCandles(candles);
  const n = data.length;
  if (n === 0) return [];

  const confirmed = pivots.filter((pivot) => !pivot.provisional);
  if (confirmed.length === 0) return [];

  const events: OryonBreakEvent[] = [];
  let trend: "bullish" | "bearish" | null = null;
  let activeHigh: OryonPivot | null = null;
  let activeLow: OryonPivot | null = null;

  const pivotQueue = [...confirmed].sort((a, b) => a.index - b.index || a.kind.localeCompare(b.kind));
  let queueHead = 0;

  for (let j = 0; j < n; j += 1) {
    // 1) Activate pivots whose confirmation closed at or before this bar.
    while (queueHead < pivotQueue.length) {
      const pivot = pivotQueue[queueHead]!;
      if (pivot.index + rightBars > j) break;
      if (pivot.kind === "high") activeHigh = pivot;
      else activeLow = pivot;
      queueHead += 1;
    }

    // 2) High level first (deterministic tie-break, §4.4 note 5).
    if (activeHigh !== null) {
      const level = activeHigh.price;
      const broke = mode === "close" ? data[j]!.c > level : data[j]!.h > level;
      if (broke) {
        events.push({
          id: `${trend === "bullish" ? "bos" : "choch"}-${activeHigh.id}-${data[j]!.t / 1000}`,
          type: trend === "bullish" ? "BOS" : "CHoCH",
          direction: "bullish",
          pivotId: activeHigh.id,
          level,
          index: j,
          timeSec: data[j]!.t / 1000,
        });
        trend = "bullish";
        activeHigh = null;
      }
    }

    // 3) Low level second.
    if (activeLow !== null) {
      const level = activeLow.price;
      const broke = mode === "close" ? data[j]!.c < level : data[j]!.l < level;
      if (broke) {
        events.push({
          id: `${trend === "bearish" ? "bos" : "choch"}-${activeLow.id}-${data[j]!.t / 1000}`,
          type: trend === "bearish" ? "BOS" : "CHoCH",
          direction: "bearish",
          pivotId: activeLow.id,
          level,
          index: j,
          timeSec: data[j]!.t / 1000,
        });
        trend = "bearish";
        activeLow = null;
      }
    }
  }

  return events;
}

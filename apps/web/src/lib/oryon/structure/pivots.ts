import type { Candle } from "@cosmoz/shared";

/**
 * Oryon market-structure engine — swing detection (Phase 9 spec §4.1/§4.2).
 *
 * PURE, framework-free, deterministic: the same candles + configuration
 * always produce the same pivots. No React, no chart engine, no timezones
 * (indexes and candle open times only — the chart layer snaps to the same
 * bars it renders).
 *
 * Definition implemented (spec §4.1, verbatim semantics):
 *   - A swing HIGH  is a candle whose HIGH is strictly greater than the
 *     highs of `leftBars` candles before it AND `rightBars` candles after.
 *   - A swing LOW   is a candle whose LOW  is strictly lower than the lows
 *     of the same neighborhoods.
 *   - STRICT comparisons: an equal high/low is NOT a pivot (equal highs and
 *     lows are explicitly handled — they simply do not qualify, spec §4.4).
 *
 * Confirmation policy (spec §4.2 — the repainting contract):
 *   - A pivot anchored at index i is CONFIRMED only when all `rightBars`
 *     candles after it exist in the data. Confirmation depends exclusively
 *     on candles ≤ i + rightBars, so once confirmed against a window, a
 *     pivot NEVER un-confirms when later candles arrive (a longer window
 *     re-derives the identical pivot — verified by tests).
 *   - Anchors near the right edge whose confirmation window is not fully
 *     loaded may be reported as PROVISIONAL candidates (opt-in display):
 *     they satisfy the condition on the bars available today and may be
 *     confirmed or may vanish as new candles arrive. They are a different
 *     STATE, never a relabeling of confirmed structure (§4.2), and the
 *     chart layer renders them differently (spec §6.1).
 *
 * Optional noise filters (both null-safe, applied against ACCEPTED pivots
 * of the same kind only — a rejected candidate never mutates history):
 *   - `minDistancePips` — the candidate's pivot price must sit at least
 *     this far (pips × pipSize) from the previous accepted SAME-KIND pivot.
 *   - `minSeparationBars` — at least this many bars since the previous
 *     accepted SAME-KIND pivot.
 *
 * Stable identity (spec §4.4): `id = kind letter + open time (sec)` —
 * derived from the source candles and the rule kind, nothing else.
 */

export interface OryonStructureDetectConfig {
  /** Required confirming candles on the LEFT (1..10). */
  readonly leftBars: number;
  /** Required confirming candles on the RIGHT (1..10). */
  readonly rightBars: number;
  /** Optional minimum swing distance in PIPS (converted with `pipSize`). */
  readonly minDistancePips: number | null;
  /** Optional minimum bar separation between accepted same-kind pivots. */
  readonly minSeparationBars: number | null;
}

export interface OryonPivot {
  /** Stable identity: `h-<openSec>` / `l-<openSec>` (spec §4.4). */
  readonly id: string;
  readonly kind: "high" | "low";
  /** Candle index in the analyzed window (the PIVOT bar, not a break). */
  readonly index: number;
  /** Open time of the pivot bar (unix seconds) — chart anchor. */
  readonly timeSec: number;
  /** The extreme price (high for a swing high, low for a swing low). */
  readonly price: number;
  /** False = confirmed by a complete right window (spec §4.2). */
  readonly provisional: boolean;
}

/** Structural label between consecutive same-kind CONFIRMED pivots (§4.3). */
export type OryonStructureLabel = "HH" | "LH" | "HL" | "LL";

/** A pivot with its (optional) chronological classification. */
export interface OryonClassifiedPivot extends OryonPivot {
  /** Present only when a comparable predecessor of the same kind exists. */
  readonly label?: OryonStructureLabel;
}

/** Rejects candles the engines must never aggregate (documented policy):
 *  non-finite fields or an inverted range. A zero price stays VALID —
 *  a missing value is an absent candle, never a zero (spec §5.4). */
export function isValidCandle(candle: Candle): boolean {
  return (
    Number.isFinite(candle.t) &&
    Number.isFinite(candle.o) &&
    Number.isFinite(candle.h) &&
    Number.isFinite(candle.l) &&
    Number.isFinite(candle.c) &&
    Number.isFinite(candle.v) &&
    candle.h >= candle.l
  );
}

/** Chronological order + documented duplicate policy: the FIRST candle for
 *  a timestamp wins, later duplicates are dropped (spec §5.4). */
export function normalizeCandles(candles: readonly Candle[]): Candle[] {
  const seen = new Set<number>();
  const result: Candle[] = [];
  for (const candle of candles) {
    if (!isValidCandle(candle) || seen.has(candle.t)) continue;
    seen.add(candle.t);
    result.push(candle);
  }
  return result.sort((a, b) => a.t - b.t);
}

interface DetectInput {
  readonly candles: readonly Candle[];
  readonly config: OryonStructureDetectConfig;
  /** Price of one pip (instrument contract) — needed only when
   *  `minDistancePips` is set. */
  readonly pipSize: number;
}

/**
 * Detects swing pivots over the window. Confirmed pivots are emitted in
 * chronological order; provisional candidates (tail anchors whose right
 * window is not loaded) follow in their own pass, flagged
 * `provisional: true`.
 */
export function detectPivots({ candles, config, pipSize }: DetectInput): OryonPivot[] {
  const left = Math.floor(config.leftBars);
  const right = Math.floor(config.rightBars);
  if (left < 1 || right < 1) return [];
  const data = normalizeCandles(candles);
  const n = data.length;
  if (n < left + right + 1) return []; // insufficient history (spec §12.1)

  const minDistance =
    config.minDistancePips !== null &&
    Number.isFinite(config.minDistancePips) &&
    config.minDistancePips > 0
      ? config.minDistancePips * pipSize
      : null;
  const minSeparation =
    config.minSeparationBars !== null &&
    Number.isFinite(config.minSeparationBars) &&
    config.minSeparationBars > 0
      ? Math.floor(config.minSeparationBars)
      : null;

  const highs: OryonPivot[] = [];
  const lows: OryonPivot[] = [];

  const farEnough = (kind: "high" | "low", index: number, price: number): boolean => {
    const accepted = kind === "high" ? highs : lows;
    const previous = accepted[accepted.length - 1];
    if (previous === undefined) return true;
    if (minDistance !== null && Math.abs(price - previous.price) < minDistance) return false;
    if (minSeparation !== null && index - previous.index < minSeparation) return false;
    return true;
  };

  /** Pivot-high predicate over the FULL window around `anchor`. */
  const isPivotHigh = (anchor: number): boolean => {
    const price = data[anchor]!.h;
    for (let j = anchor - left; j <= anchor + right; j += 1) {
      if (j === anchor) continue;
      if (data[j]!.h >= price) return false; // strict > required
    }
    return true;
  };

  const isPivotLow = (anchor: number): boolean => {
    const price = data[anchor]!.l;
    for (let j = anchor - left; j <= anchor + right; j += 1) {
      if (j === anchor) continue;
      if (data[j]!.l <= price) return false; // strict < required
    }
    return true;
  };

  // Forward pass: at bar i, the anchor i-right has just completed its right
  // confirmation window — confirmation causally depends on bars ≤ i only.
  for (let i = left + right; i < n; i += 1) {
    const anchor = i - right;
    if (isPivotHigh(anchor)) {
      const price = data[anchor]!.h;
      if (farEnough("high", anchor, price)) {
        highs.push({
          id: `h-${data[anchor]!.t / 1000}`,
          kind: "high",
          index: anchor,
          timeSec: data[anchor]!.t / 1000,
          price,
          provisional: false,
        });
      }
    }
    if (isPivotLow(anchor)) {
      const price = data[anchor]!.l;
      if (farEnough("low", anchor, price)) {
        lows.push({
          id: `l-${data[anchor]!.t / 1000}`,
          kind: "low",
          index: anchor,
          timeSec: data[anchor]!.t / 1000,
          price,
          provisional: false,
        });
      }
    }
  }

  // Provisional candidates: tail anchors whose right window extends past the
  // data. They compare against the left window (always available) and the
  // bars that DO exist on the right — never against future data.
  for (let anchor = Math.max(n - right, left); anchor < n; anchor += 1) {
    const price = data[anchor]!.h;
    let candidate = true;
    for (let j = anchor - left; j < n; j += 1) {
      if (j === anchor) continue;
      if (data[j]!.h >= price) {
        candidate = false;
        break;
      }
    }
    if (candidate && farEnough("high", anchor, price)) {
      highs.push({
        id: `h-${data[anchor]!.t / 1000}`,
        kind: "high",
        index: anchor,
        timeSec: data[anchor]!.t / 1000,
        price,
        provisional: true,
      });
    }

    const lowPrice = data[anchor]!.l;
    candidate = true;
    for (let j = anchor - left; j < n; j += 1) {
      if (j === anchor) continue;
      if (data[j]!.l <= lowPrice) {
        candidate = false;
        break;
      }
    }
    if (candidate && farEnough("low", anchor, lowPrice)) {
      lows.push({
        id: `l-${data[anchor]!.t / 1000}`,
        kind: "low",
        index: anchor,
        timeSec: data[anchor]!.t / 1000,
        price: lowPrice,
        provisional: true,
      });
    }
  }

  // Chronological merge (kind interleaving preserved for the consumers).
  return [...highs, ...lows].sort((a, b) => a.index - b.index || a.kind.localeCompare(b.kind));
}

/**
 * HH/LH/HL/LL classification (spec §4.3) — compares consecutive CONFIRMED
 * pivots of the SAME kind in chronological order. The first pivot of a kind
 * has no comparison point and receives NO label (§4.3: never classify an
 * isolated pivot). Provisional pivots are never classified and never serve
 * as comparison points — they are not structure yet.
 */
export function classifyPivots(pivots: readonly OryonPivot[]): OryonClassifiedPivot[] {
  const result: OryonClassifiedPivot[] = pivots.map((pivot) => ({ ...pivot }));

  for (const kind of ["high", "low"] as const) {
    const chain = result.filter((pivot) => !pivot.provisional && pivot.kind === kind);
    for (let i = 1; i < chain.length; i += 1) {
      const current = chain[i]!;
      const previous = chain[i - 1]!;
      if (current.kind === "high") {
        if (current.price > previous.price) {
          (current as { label?: OryonStructureLabel }).label = "HH";
        } else if (current.price < previous.price) {
          (current as { label?: OryonStructureLabel }).label = "LH";
        }
      } else if (current.price > previous.price) {
        (current as { label?: OryonStructureLabel }).label = "HL";
      } else if (current.price < previous.price) {
        (current as { label?: OryonStructureLabel }).label = "LL";
      }
    }
  }
  return result;
}

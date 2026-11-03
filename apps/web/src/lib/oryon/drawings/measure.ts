import type { OryonDrawingAnchor } from "@cosmoz/shared";
import { ORYON_POSITION_RR, oryonFormatRr, oryonPositionTargetPrice } from "@cosmoz/shared";

/**
 * Oryon measure readout - PURE computation (Phase 5 spec §4.1–§4.3).
 *
 * Extracted from the drawing primitive so the financial math is testable
 * without a chart: every value is derived from the ACTUAL anchors (chart
 * domain: unix seconds + raw price), never from pixel distances.
 *
 * Honesty contract (spec §4.3): the bar count is an INPUT (the chart's
 * logical pipeline computes it); the elapsed duration comes from the anchor
 * TIMESTAMP DELTA - ten candles on a gapped market are NOT ten continuous
 * clock intervals, so bars × interval is never used as a duration. When an
 * input is missing or invalid the corresponding readout is OMITTED (null),
 * never fabricated, and a fully invalid measurement yields no label at all.
 *
 * Percentage (spec §4.1): ((endPrice − startPrice) / startPrice) × 100.
 * A zero/invalid start price disables ONLY the percentage - the absolute
 * difference stays computable and honest.
 */

export interface MeasureReadoutInputs {
  /** Instrument display digits (price formatting). */
  digits: number;
  /** Price of one pip (instrument contract); non-positive → pips omitted. */
  pipSize: number;
  /** Bar distance from the chart's logical pipeline (null = unavailable). */
  bars: number | null;
}

export interface MeasureReadout {
  /** False when nothing honest can be displayed (non-finite anchors). */
  valid: boolean;
  direction: "up" | "down" | "flat" | null;
  startPrice: number | null;
  endPrice: number | null;
  /** Signed price difference (b.p − a.p); null when anchors are invalid. */
  delta: number | null;
  /** ((end − start) / start) × 100 - null when the start price is 0. */
  pct: number | null;
  /** Δ in pips - null when pipSize is not a positive finite number. */
  pips: number | null;
  bars: number | null;
  /** |Δt| in seconds from the ACTUAL anchor timestamps - null otherwise. */
  elapsedSec: number | null;
  /** Composed canvas label lines (empty when the readout is invalid). */
  lines: string[];
}

const DIRECTION_ARROWS = { up: "↑", down: "↓", flat: "→" } as const;

function signed(value: number, digits: number, unit = ""): string {
  // ASCII "-" (not U+2212) - canvas fonts render it reliably at 11px.
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(digits)}${unit}`;
}

/**
 * Compact elapsed duration from a SECONDS delta (actual timestamps only).
 * Two most significant units - "1d 4h", "3h 12m", "42m 10s", "8s".
 * Returns null for non-finite or negative inputs (never a guess).
 */
export function formatElapsedDuration(totalSeconds: number): string | null {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;
  const whole = Math.floor(totalSeconds);
  const days = Math.floor(whole / 86_400);
  const hours = Math.floor((whole % 86_400) / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const seconds = whole % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function computeMeasureReadout(
  a: OryonDrawingAnchor,
  b: OryonDrawingAnchor,
  inputs: MeasureReadoutInputs,
): MeasureReadout {
  const digits = Number.isFinite(inputs.digits) ? Math.max(0, inputs.digits) : 2;
  const startFinite = Number.isFinite(a.p);
  const endFinite = Number.isFinite(b.p);

  if (!startFinite || !endFinite) {
    return {
      valid: false,
      direction: null,
      startPrice: null,
      endPrice: null,
      delta: null,
      pct: null,
      pips: null,
      bars: null,
      elapsedSec: null,
      lines: [],
    };
  }

  const delta = b.p - a.p;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  // Spec §4.1 - validate the start price BEFORE the percentage: a zero (or
  // non-finite) start disables the percentage, never the absolute delta.
  const pct = a.p === 0 ? null : (delta / a.p) * 100;
  const pips =
    Number.isFinite(inputs.pipSize) && inputs.pipSize > 0 ? delta / inputs.pipSize : null;
  const bars =
    inputs.bars !== null && Number.isFinite(inputs.bars) ? Math.max(0, Math.round(inputs.bars)) : null;
  const elapsedSec =
    Number.isFinite(a.t) && Number.isFinite(b.t) ? Math.abs(b.t - a.t) : null;

  // ── composed canvas lines (2 rows, compact terminal style) ────────────────
  const arrow = DIRECTION_ARROWS[direction];
  const line1 = `${arrow} ${a.p.toFixed(digits)} → ${b.p.toFixed(digits)}`;

  const parts: string[] = [];
  if (pct !== null) {
    parts.push(`Δ ${signed(delta, digits)} (${signed(pct, 2, "%")})`);
  } else {
    parts.push(`Δ ${signed(delta, digits)}`);
  }
  if (pips !== null) parts.push(`${Math.abs(pips).toFixed(1)} pips`);
  if (bars !== null) parts.push(`${bars} bars`);
  const elapsed = elapsedSec !== null ? formatElapsedDuration(elapsedSec) : null;
  if (elapsed !== null) parts.push(elapsed);

  return {
    valid: true,
    direction,
    startPrice: a.p,
    endPrice: b.p,
    delta,
    pct,
    pips,
    bars,
    elapsedSec,
    lines: [line1, parts.join(" · ")],
  };
}

// ── Price range ruler (Drawing toolbar v2) ───────────────────────────────────

export interface PriceRangeReadout {
  valid: boolean;
  delta: number | null;
  pct: number | null;
  pips: number | null;
  /** Composed canvas label lines (empty when invalid). */
  lines: string[];
}

/**
 * Vertical price ruler: Δprice / Δ% / Δpips between the two anchor prices.
 * Same honesty rules as the measure readout: a zero start disables ONLY
 * the percentage; a non-positive pipSize disables ONLY the pips; invalid
 * inputs yield no label at all.
 */
export function computePriceRangeReadout(
  a: OryonDrawingAnchor,
  b: OryonDrawingAnchor,
  inputs: { digits: number; pipSize: number },
): PriceRangeReadout {
  const digits = Number.isFinite(inputs.digits) ? Math.max(0, inputs.digits) : 2;
  if (!Number.isFinite(a.p) || !Number.isFinite(b.p)) {
    return { valid: false, delta: null, pct: null, pips: null, lines: [] };
  }
  const delta = b.p - a.p;
  const pct = a.p === 0 ? null : (delta / a.p) * 100;
  const pips =
    Number.isFinite(inputs.pipSize) && inputs.pipSize > 0 ? delta / inputs.pipSize : null;
  const parts: string[] = [`Δ ${signed(delta, digits)}`];
  if (pct !== null) parts.push(signed(pct, 2, "%"));
  if (pips !== null) parts.push(`${Math.abs(pips).toFixed(1)} pips`);
  return { valid: true, delta, pct, pips, lines: [parts.join(" · ")] };
}

// ── Date range ruler (Drawing toolbar v2) ────────────────────────────────────

export interface DateRangeReadout {
  valid: boolean;
  /** |Δt| in seconds from the ACTUAL anchor timestamps. */
  elapsedSec: number | null;
  bars: number | null;
  lines: string[];
}

/**
 * Horizontal time ruler: elapsed duration from the ACTUAL anchor timestamp
 * delta (never bars × interval - gapped sessions are not continuous time,
 * same honesty contract as the measure tool) + the bar count when the
 * chart's logical pipeline provides it.
 */
export function computeDateRangeReadout(
  a: OryonDrawingAnchor,
  b: OryonDrawingAnchor,
  inputs: { bars: number | null },
): DateRangeReadout {
  if (!Number.isFinite(a.t) || !Number.isFinite(b.t)) {
    return { valid: false, elapsedSec: null, bars: null, lines: [] };
  }
  const elapsedSec = Math.abs(b.t - a.t);
  const bars =
    inputs.bars !== null && Number.isFinite(inputs.bars)
      ? Math.max(0, Math.round(inputs.bars))
      : null;
  const elapsed = formatElapsedDuration(elapsedSec);
  const lines: string[] = [];
  if (elapsed !== null) lines.push(elapsed);
  if (bars !== null) lines.push(`${bars} bars`);
  return { valid: elapsed !== null || bars !== null, elapsedSec, bars, lines };
}

// ── Position tool readout (Drawing toolbar v2) ──────────────────────────────

export interface PositionReadout {
  valid: boolean;
  entryPrice: number | null;
  stopPrice: number | null;
  /** Derived at ORYON_POSITION_RR (shared constant) - never persisted. */
  targetPrice: number | null;
  riskPips: number | null;
  /** Composed canvas label lines (empty when invalid). */
  lines: string[];
}

/**
 * Position tool labels: Entry / Stop / Target prices (target DERIVED via
 * the shared oryonPositionTargetPrice helper at the object's OWN rr - the
 * property editor's per-object risk:reward, defaulting to the documented
 * ORYON_POSITION_RR) + the risk in pips. Invalid inputs omit the label -
 * no fabricated levels.
 */
export function computePositionReadout(
  entry: OryonDrawingAnchor,
  stop: OryonDrawingAnchor,
  inputs: { digits: number; pipSize: number; rr?: number },
): PositionReadout {
  const digits = Number.isFinite(inputs.digits) ? Math.max(0, inputs.digits) : 2;
  const rr = Number.isFinite(inputs.rr) ? (inputs.rr as number) : ORYON_POSITION_RR;
  if (!Number.isFinite(entry.p) || !Number.isFinite(stop.p)) {
    return {
      valid: false,
      entryPrice: null,
      stopPrice: null,
      targetPrice: null,
      riskPips: null,
      lines: [],
    };
  }
  const targetPrice = oryonPositionTargetPrice(entry.p, stop.p, rr);
  const risk = Math.abs(entry.p - stop.p);
  const riskPips =
    Number.isFinite(inputs.pipSize) && inputs.pipSize > 0 ? risk / inputs.pipSize : null;
  const lines = [
    `Entry ${entry.p.toFixed(digits)}`,
    `Stop ${stop.p.toFixed(digits)}`,
    `Target ${targetPrice.toFixed(digits)} (1:${oryonFormatRr(rr)})`,
    riskPips !== null ? `Risk ${riskPips.toFixed(1)} pips` : "",
  ].filter((line) => line !== "");
  return {
    valid: true,
    entryPrice: entry.p,
    stopPrice: stop.p,
    targetPrice,
    riskPips,
    lines,
  };
}

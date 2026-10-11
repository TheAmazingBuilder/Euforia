import type { OryonDrawingAnchor } from "@cosmoz/shared";

/**
 * Oryon measure readout — PURE computation (Phase 5 spec §4.1–§4.3).
 *
 * Extracted from the drawing primitive so the financial math is testable
 * without a chart: every value is derived from the ACTUAL anchors (chart
 * domain: unix seconds + raw price), never from pixel distances.
 *
 * Honesty contract (spec §4.3): the bar count is an INPUT (the chart's
 * logical pipeline computes it); the elapsed duration comes from the anchor
 * TIMESTAMP DELTA — ten candles on a gapped market are NOT ten continuous
 * clock intervals, so bars × interval is never used as a duration. When an
 * input is missing or invalid the corresponding readout is OMITTED (null),
 * never fabricated, and a fully invalid measurement yields no label at all.
 *
 * Percentage (spec §4.1): ((endPrice − startPrice) / startPrice) × 100.
 * A zero/invalid start price disables ONLY the percentage — the absolute
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
  /** ((end − start) / start) × 100 — null when the start price is 0. */
  pct: number | null;
  /** Δ in pips — null when pipSize is not a positive finite number. */
  pips: number | null;
  bars: number | null;
  /** |Δt| in seconds from the ACTUAL anchor timestamps — null otherwise. */
  elapsedSec: number | null;
  /** Composed canvas label lines (empty when the readout is invalid). */
  lines: string[];
}

const DIRECTION_ARROWS = { up: "↑", down: "↓", flat: "→" } as const;

function signed(value: number, digits: number, unit = ""): string {
  // ASCII "-" (not U+2212) — canvas fonts render it reliably at 11px.
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(digits)}${unit}`;
}

/**
 * Compact elapsed duration from a SECONDS delta (actual timestamps only).
 * Two most significant units — "1d 4h", "3h 12m", "42m 10s", "8s".
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
  // Spec §4.1 — validate the start price BEFORE the percentage: a zero (or
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

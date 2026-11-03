import type { BrokerPosition } from "@cosmoz/shared";

/**
 * Position ↔ chart instrument matching (Phase 4 spec §8.5).
 *
 * Rule: EXACT canonical equality only - trim + uppercase, nothing else.
 * Substring matching is forbidden ("BTCUSD" must never claim "BTCUSDT":
 * they are different instruments on different venues), and no fuzzy
 * normalization (strip separators, collapse suffixes) is attempted without
 * a verified provider mapping. A position whose symbol does not match the
 * active chart instrument EXACTLY is listed in the panel but is never
 * drawn on the chart - an absent overlay is honest, a wrong overlay is not.
 */

/** Canonical comparison form of a symbol (trim + uppercase, no other edit). */
export function canonicalSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** True when both strings denote the SAME instrument symbol (exact match). */
export function sameInstrument(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return canonicalSymbol(a) === canonicalSymbol(b);
}

/**
 * Positions whose symbol matches the chart instrument exactly, in the
 * given order (input order is preserved; sorting is a separate concern).
 */
export function positionsForChart(
  positions: readonly BrokerPosition[],
  chartSymbol: string,
): BrokerPosition[] {
  if (chartSymbol.length === 0) return [];
  const target = canonicalSymbol(chartSymbol);
  return positions.filter((position) => canonicalSymbol(position.symbol) === target);
}

/**
 * Compact on-chart label for a position (price-line titles must stay short
 * - they are painted over the candles). Uses the trailing numeric segment
 * of the position id when present ("…-2" → "#2"), else the id tail.
 * Pure: no DOM, no chart API.
 */
export function positionShortLabel(positionId: string): string {
  const tail = positionId.slice(positionId.lastIndexOf("-") + 1);
  if (/^\d{1,4}$/.test(tail)) return `#${tail}`;
  return `#${positionId.slice(-4)}`;
}

/** Broker direction → user-facing side vocabulary (PRD FR-15). */
export function sideLabel(direction: BrokerPosition["direction"]): "LONG" | "SHORT" {
  return direction === "BUY" ? "LONG" : "SHORT";
}

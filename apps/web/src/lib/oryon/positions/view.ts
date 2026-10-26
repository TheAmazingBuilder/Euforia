import type { BrokerPosition } from "@cosmoz/shared";

/**
 * Position view-model helpers (Phase 4 spec §6–§7) - pure formatting and
 * aggregation over validated `BrokerPosition` records. No React, no chart
 * API, no broker calls. Money aggregation rule (spec §7.1): values from ONE
 * source are summed only when every value is available; the simulated book
 * is USD-denominated by its documented contract (quote USD, contract sizes
 * in USD terms), so summing WITHIN the book is safe - the UI says so.
 */

/**
 * Decimal digits implied by a decimal-string price ("1.08650" → 5).
 * Returns null for empty/malformed strings - callers decide the fallback
 * (never a silent default precision for a value we could not read).
 */
export function digitsFromDecimalString(value: string): number | null {
  if (value.length === 0) return null;
  const match = /^-?\d+(?:\.(\d+))?$/.exec(value);
  if (match === null) return null;
  return match[1]?.length ?? 0;
}

/** Display digits for a position's prices: the instrument's when known, else the record's own precision. */
export function positionPriceDigits(position: BrokerPosition, instrumentDigits: number | null): number {
  if (instrumentDigits !== null) return instrumentDigits;
  const fromEntry = digitsFromDecimalString(position.entryPrice);
  if (fromEntry !== null) return fromEntry;
  const fromCurrent = position.currentPrice !== null ? digitsFromDecimalString(position.currentPrice) : null;
  return fromCurrent ?? 2;
}

/**
 * Signed money string with fixed decimals ("+12.40", "-3.05", "+0.00").
 * Invalid/unparsable input → null (the caller renders the neutral N/A).
 */
export function formatSignedAmount(value: string, digits = 2): string | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Number(parsed.toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded).toFixed(digits)}`;
}

/** P&L tone for the semantic gain/loss colors (color never the only cue - the sign is text). */
export function pnlTone(value: string): "profit" | "loss" | "neutral" {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return "neutral";
  return parsed > 0 ? "profit" : "loss";
}

export interface PnlSummary {
  /** Sum of the AVAILABLE unrealized P&L values (2-decimal cents arithmetic). */
  total: string | null;
  /** How many positions contributed to the sum. */
  counted: number;
  /** How many positions carry a P&L value at all. */
  available: number;
}

/**
 * Aggregate unrealized P&L across ONE book. Cents-integer accumulation
 * avoids float drift across repeated mark-to-market updates. When no value
 * is available the total is null - an aggregate is never fabricated from a
 * partial book (the UI shows "counted/total" honestly instead).
 */
export function summarizePnl(positions: readonly BrokerPosition[]): PnlSummary {
  const withPnl = positions.filter((position) => position.unrealizedPnl !== null);
  let cents = 0;
  for (const position of withPnl) {
    const parsed = Number(position.unrealizedPnl);
    if (!Number.isFinite(parsed)) continue;
    cents += Math.round(parsed * 100);
  }
  return {
    total: withPnl.length > 0 ? (cents / 100).toFixed(2) : null,
    counted: withPnl.length,
    available: withPnl.length,
  };
}

/**
 * Stable table order: symbol ascending, then newest open first. Deterministic
 * across snapshots - a re-emitted book must not reshuffle rows.
 */
export function sortPositionsForTable(positions: readonly BrokerPosition[]): BrokerPosition[] {
  return [...positions].sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
    const ta = Date.parse(a.openedAt);
    const tb = Date.parse(b.openedAt);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Compact open-time label ("Oct 10, 14:32") - local time, no year (positions open < 1 book). */
export function formatOpenedAt(iso: string): string | null {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}

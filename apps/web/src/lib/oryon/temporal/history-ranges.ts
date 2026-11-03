import type { SyncRange } from "@/lib/oryon/sync/alignment";

/**
 * Historical visible-range presets (TradingView parity) - the "1D · 5D ·
 * 1M · 3M · 6M · YTD · 1Y · 5Y · All" strip in the chart footer.
 *
 * SEMANTICS (the user's explicit contract): these buttons set how much
 * HISTORY is visible - they never touch the bar timeframe (the interval).
 *
 * Math discipline: durations are computed on UTC calendar math over the
 * LAST loaded bar's open time (candle opens are UTC epochs - display-time
 * zones never move a range). The result is clamped to the actually loaded
 * span: a preset wider than the loaded history resolves to the full span
 * (honest - the chart cannot show data it does not have).
 */

export type OryonHistoryRangeId = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";

export const ORYON_HISTORY_RANGES: readonly OryonHistoryRangeId[] = [
  "1D",
  "5D",
  "1M",
  "3M",
  "6M",
  "YTD",
  "1Y",
  "5Y",
  "ALL",
];

/** The loaded data span, unix SECONDS (open of the first / last bar). */
export interface OryonDataSpan {
  first: number;
  last: number;
}

const DAY_SECONDS = 86_400;

/**
 * Visible range [from, to] for a preset over `span` - null when the span
 * is empty/invalid. `to` is the last bar (the time scale keeps its own
 * right margin); `from` never precedes the first loaded bar.
 */
export function historyRangeSpan(
  id: OryonHistoryRangeId,
  span: OryonDataSpan,
): SyncRange | null {
  if (!Number.isFinite(span.first) || !Number.isFinite(span.last) || span.last < span.first) {
    return null;
  }

  let from: number;
  switch (id) {
    case "1D":
      from = span.last - DAY_SECONDS;
      break;
    case "5D":
      from = span.last - 5 * DAY_SECONDS;
      break;
    case "1M":
    case "3M":
    case "6M":
    case "1Y":
    case "5Y": {
      const months = id === "1M" ? 1 : id === "3M" ? 3 : id === "6M" ? 6 : id === "1Y" ? 12 : 60;
      from = minusUtcMonths(span.last, months);
      break;
    }
    case "YTD": {
      const d = new Date(span.last * 1000);
      from = Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
      break;
    }
    case "ALL":
      from = span.first;
      break;
    default: {
      const exhaustive: never = id;
      void exhaustive;
      return null;
    }
  }

  return { from: Math.max(from, span.first), to: span.last };
}

/**
 * `dateMs` (any instant of the picked day) → visible range STARTING at that
 * day's UTC midnight, ending at the last bar - the calendar jump. Clamped
 * to the loaded span exactly like the presets.
 */
export function dateStartRange(dateMs: number, span: OryonDataSpan): SyncRange | null {
  if (!Number.isFinite(dateMs)) return null;
  const day = new Date(dateMs);
  const fromSec = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) / 1000;
  if (!Number.isFinite(fromSec)) return null;
  return { from: Math.max(fromSec, span.first), to: span.last };
}

/** Subtracts `months` from a unix-SECOND instant on the UTC calendar. */
function minusUtcMonths(seconds: number, months: number): number {
  const d = new Date(seconds * 1000);
  const target = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() - months,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
  return target / 1000;
}

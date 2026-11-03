/**
 * Session summary engine (Phase 10 §43) - pure, deterministic.
 *
 * "only metrics supported by real data; unavailable stays null/0-honest":
 *   - tradeCount counts journal trades OPENED in the session window;
 *   - netPnl sums realized P&L of trades CLOSED inside the window
 *     (pnlNet ?? pnlGross - the mock's canonical fallback order);
 *   - avgR averages rMultiple of those closed trades when computable;
 *   - violationsCount comes from the Discipline domain (in-window VIOLATION
 *     rows, auto-evaluated on trade.closed - wired in the service) and
 *     ecoEventsCount from the deterministic eco calendar generator; both are
 *     SERVICE-PROVIDED counters, passed through verbatim (0 stays 0-honest,
 *     never fabricated).
 */
export interface SummaryTradeRow {
  symbol: string;
  status: string;
  entryAt: Date;
  exitAt: Date | null;
  /** Decimal wire strings - null when never computed (never invented). */
  pnlNet: string | null;
  pnlGross: string | null;
  /** Decimal wire string - null when no computable risk amount. */
  rMultiple: string | null;
}

export interface SessionSummaryInput {
  startedAt: Date;
  endedAt: Date;
  primarySymbol: string;
  /** Trades opened within [startedAt, endedAt] (ownership pre-scoped). */
  windowTrades: SummaryTradeRow[];
  notesCount: number;
  analysesCount: number;
  /** Discipline VIOLATION rows inside the window (service-counted). */
  violationsCount: number;
  /** Eco events overlapping the window (deterministic calendar generator). */
  ecoEventsCount: number;
}

export interface SessionSummaryResult {
  durationMinutes: number;
  markets: string[];
  tradeCount: number;
  netPnl: number | null;
  avgR: number | null;
  violationsCount: number;
  ecoEventsCount: number;
  notesCount: number;
  analysesCount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeSessionSummary(input: SessionSummaryInput): SessionSummaryResult {
  const closed = input.windowTrades.filter(
    (trade) => trade.status === "CLOSED" && trade.exitAt !== null,
  );

  const pnls = closed
    .map((trade) => trade.pnlNet ?? trade.pnlGross)
    .filter((value): value is string => value !== null)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const rValues = closed
    .map((trade) => trade.rMultiple)
    .filter((value): value is string => value !== null)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  // Deterministic order (entryAt asc) - the mock's store order is
  // insertion-based; the backend must be reproducible across restarts.
  const markets = [
    ...new Set(
      [...input.windowTrades]
        .sort((a, b) => a.entryAt.getTime() - b.entryAt.getTime())
        .map((trade) => trade.symbol),
    ),
  ];
  if (markets.length === 0 && input.primarySymbol !== "-") markets.push(input.primarySymbol);

  return {
    durationMinutes: Math.max(
      0,
      Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 60_000),
    ),
    markets,
    tradeCount: input.windowTrades.length,
    netPnl: pnls.length > 0 ? round2(pnls.reduce((sum, value) => sum + value, 0)) : null,
    avgR: rValues.length > 0 ? round2(rValues.reduce((sum, value) => sum + value, 0) / rValues.length) : null,
    violationsCount: input.violationsCount,
    ecoEventsCount: input.ecoEventsCount,
    notesCount: input.notesCount,
    analysesCount: input.analysesCount,
  };
}

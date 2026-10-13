/**
 * Mapping from the app's data hooks to the PDF builder inputs.
 * Pure functions — no React, no DOM.
 */
import type { Currency, Instrument, Strategy, Trade } from "@cosmoz/shared";
import { formatPercent, formatSignedMoney } from "@cosmoz/shared";

import type { JournalPdfInput, JournalPdfSummaryItem, JournalPdfTrade } from "./journal-pdf";

// ── Row mapping ──────────────────────────────────────────────────────────────

export function symbolLookup(instruments: Instrument[]): (trade: Trade) => string {
  return (trade) =>
    instruments.find((instrument) => instrument.id === trade.instrumentId)?.symbol ?? "—";
}

export function strategyNameLookup(
  strategies: Strategy[],
): (strategyId: string | null) => string | null {
  return (strategyId) =>
    strategyId ? strategies.find((strategy) => strategy.id === strategyId)?.name ?? null : null;
}

export function toPdfTrade(
  trade: Trade,
  symbolOf: (trade: Trade) => string,
  strategyNameOf: (strategyId: string | null) => string | null,
): JournalPdfTrade {
  return {
    tradingDate: trade.tradingDate,
    symbol: symbolOf(trade),
    direction: trade.direction,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    quantity: trade.quantity,
    rMultiple: trade.rMultiple,
    pnlNet: trade.pnlNet,
    decisionGrade: trade.decisionGrade,
    status: trade.status,
    strategyName: strategyNameOf(trade.strategyId),
    notes: trade.notes,
    lessons: trade.lessons,
  };
}

// ── Aggregation (mirrors the dashboard's weekly report card) ─────────────────

export interface WeekStats {
  closed: number;
  netPnl: number;
  wins: number;
  totalR: number;
  planFollowedPct: number | null;
  bestSymbol: string | null;
  bestR: number | null;
  worstSymbol: string | null;
  worstR: number | null;
}

function utcDateKeyDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function computeWeekStats(
  trades: Trade[],
  fromKey: string,
  toKey: string,
  symbolOf: (trade: Trade) => string,
): WeekStats {
  let netPnl = 0;
  let wins = 0;
  let totalR = 0;
  let planTotal = 0;
  let planFollowed = 0;
  let bestSymbol: string | null = null;
  let bestR: number | null = null;
  let worstSymbol: string | null = null;
  let worstR: number | null = null;
  let closed = 0;

  for (const trade of trades) {
    if (trade.status !== "CLOSED") continue;
    if (trade.tradingDate < fromKey || trade.tradingDate > toKey) continue;
    closed += 1;
    const pnl = Number(trade.pnlNet ?? 0);
    netPnl += pnl;
    if (pnl >= 0) wins += 1;
    const r = trade.rMultiple === null ? 0 : Number(trade.rMultiple);
    totalR += r;
    if (bestR === null || r > bestR) {
      bestR = r;
      bestSymbol = symbolOf(trade);
    }
    if (worstR === null || r < worstR) {
      worstR = r;
      worstSymbol = symbolOf(trade);
    }
    if (trade.followedPlan !== null) {
      planTotal += 1;
      if (trade.followedPlan) planFollowed += 1;
    }
  }

  return {
    closed,
    netPnl,
    wins,
    totalR,
    planFollowedPct: planTotal > 0 ? planFollowed / planTotal : null,
    bestSymbol,
    bestR,
    worstSymbol,
    worstR,
  };
}

function formatWindow(fromKey: string, toKey: string): string {
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const keyParts = (key: string) => ({
    month: monthFmt.format(new Date(`${key}T00:00:00Z`)),
    day: Number(key.slice(8, 10)),
  });
  const from = keyParts(fromKey);
  const to = keyParts(toKey);
  return `${from.month} ${from.day} – ${to.month} ${to.day}`;
}

// ── Journal (full export) ────────────────────────────────────────────────────

export function buildJournalInput(options: {
  trades: Trade[];
  instruments: Instrument[];
  strategies: Strategy[];
  currency: Currency;
  logoDataUrl?: string;
}): JournalPdfInput {
  const { trades, instruments, strategies, currency, logoDataUrl } = options;
  const symbolOf = symbolLookup(instruments);
  const strategyNameOf = strategyNameLookup(strategies);

  const pdfTrades = trades
    .slice()
    .sort((a, b) => (a.tradingDate < b.tradingDate ? -1 : a.tradingDate > b.tradingDate ? 1 : 0))
    .map((trade) => toPdfTrade(trade, symbolOf, strategyNameOf));

  const closed = trades.filter((trade) => trade.status === "CLOSED");
  const wins = closed.filter((trade) => Number(trade.pnlNet ?? 0) >= 0).length;
  const netPnl = closed.reduce((sum, trade) => sum + Number(trade.pnlNet ?? 0), 0);
  const totalR = closed.reduce((sum, trade) => sum + Number(trade.rMultiple ?? 0), 0);
  const winRate = closed.length > 0 ? wins / closed.length : null;

  let best: Trade | null = null;
  let worst: Trade | null = null;
  for (const trade of closed) {
    if (trade.rMultiple === null) continue;
    if (best === null || Number(trade.rMultiple) > Number(best.rMultiple ?? 0)) best = trade;
    if (worst === null || Number(trade.rMultiple) < Number(worst.rMultiple ?? 0)) worst = trade;
  }

  const periodFrom = pdfTrades[0]?.tradingDate ?? "";
  const periodTo = pdfTrades[pdfTrades.length - 1]?.tradingDate ?? "";

  const summary: JournalPdfSummaryItem[] = [
    { label: "Net P&L", value: formatSignedMoney(netPnl, currency), tone: netPnl >= 0 ? "profit" : "loss" },
    { label: "Win rate", value: winRate === null ? "—" : formatPercent(winRate), tone: "neutral" },
    { label: "Trades logged", value: String(trades.length), tone: "neutral" },
    { label: "Closed", value: String(closed.length), tone: "neutral" },
    {
      label: "Total R",
      value: totalR === 0 ? "—" : `${totalR > 0 ? "+" : ""}${totalR.toFixed(2)}R`,
      tone: totalR > 0 ? "profit" : totalR < 0 ? "loss" : "neutral",
    },
    {
      label: "Best / Worst (R)",
      value:
        best && worst && best.rMultiple !== null && worst.rMultiple !== null
          ? `${symbolOf(best)} ${Number(best.rMultiple).toFixed(2)} / ${symbolOf(worst)} ${Number(worst.rMultiple).toFixed(2)}`
          : "—",
      tone: "neutral",
    },
  ];

  return {
    title: "Trading journal",
    subtitle: pdfTrades.length > 0 ? `${periodFrom} – ${periodTo} · ${trades.length} trades` : "No trades yet",
    currency,
    fileName: `cosmoz-journal-${new Date().toISOString().slice(0, 10)}`,
    logoDataUrl,
    summary,
    trades: pdfTrades,
    includeNotes: true,
  };
}

// ── Weekly report export ─────────────────────────────────────────────────────

export function buildWeeklyInput(options: {
  trades: Trade[];
  instruments: Instrument[];
  strategies: Strategy[];
  currency: Currency;
  logoDataUrl?: string;
}): JournalPdfInput {
  const { trades, instruments, strategies, currency, logoDataUrl } = options;
  const symbolOf = symbolLookup(instruments);
  const strategyNameOf = strategyNameLookup(strategies);

  const thisFrom = utcDateKeyDaysAgo(6);
  const thisTo = utcDateKeyDaysAgo(0);
  const prevFrom = utcDateKeyDaysAgo(13);
  const prevTo = utcDateKeyDaysAgo(7);

  const week = computeWeekStats(trades, thisFrom, thisTo, symbolOf);
  const previous = computeWeekStats(trades, prevFrom, prevTo, symbolOf);

  const weekTrades = trades
    .filter((trade) => trade.status === "CLOSED" && trade.tradingDate >= thisFrom && trade.tradingDate <= thisTo)
    .sort((a, b) => (a.tradingDate < b.tradingDate ? -1 : 1))
    .map((trade) => toPdfTrade(trade, symbolOf, strategyNameOf));

  const winRate = week.closed > 0 ? week.wins / week.closed : null;
  const pnlDelta = week.netPnl - previous.netPnl;

  const sentenceParts: string[] = [
    `You closed ${week.closed} trade${week.closed === 1 ? "" : "s"} this week for ${formatSignedMoney(week.netPnl, currency)}`,
    winRate !== null ? `with a win rate of ${formatPercent(winRate)}` : null,
    week.bestSymbol !== null && week.bestR !== null
      ? `best execution: ${week.bestSymbol} ${formatWeekR(week.bestR)}`
      : null,
    week.worstSymbol !== null && week.worstR !== null && week.worstR < 0
      ? `costliest: ${week.worstSymbol} ${formatWeekR(week.worstR)}`
      : null,
    week.planFollowedPct !== null
      ? `plan followed on ${formatPercent(week.planFollowedPct)} of entries`
      : null,
  ].filter((part): part is string => part !== null);

  const lead = `${sentenceParts.join(", ")}.`;
  const comparison =
    previous.closed > 0 || week.closed > 0
      ? `Previous week (${formatWindow(prevFrom, prevTo)}): ${previous.closed} trades, ${formatSignedMoney(previous.netPnl, currency)} net — this week ${pnlDelta >= 0 ? "up" : "down"} ${formatSignedMoney(Math.abs(pnlDelta), currency)}.`
      : null;

  const summary: JournalPdfSummaryItem[] = [
    { label: "Net P&L", value: formatSignedMoney(week.netPnl, currency), tone: week.netPnl >= 0 ? "profit" : "loss" },
    { label: "Win rate", value: winRate === null ? "—" : formatPercent(winRate), tone: "neutral" },
    { label: "Closed trades", value: String(week.closed), tone: "neutral" },
    { label: "Total R", value: `${week.totalR > 0 ? "+" : ""}${week.totalR.toFixed(2)}R`, tone: week.totalR >= 0 ? "profit" : "loss" },
  ];

  return {
    title: "Weekly report",
    subtitle: `${formatWindow(thisFrom, thisTo)} · auto-written from your trade log`,
    currency,
    fileName: `cosmoz-weekly-${thisFrom}-to-${thisTo}`,
    logoDataUrl,
    lead,
    summary,
    comparison,
    trades: weekTrades,
    includeNotes: false,
  };
}

// ── Reports page (filtered period view) ──────────────────────────────────────

/**
 * Builds the PDF input for the Reports page export. The trades arrive
 * ALREADY filtered (the page owns the filter state) and the summary items
 * arrive PRE-FORMATTED (the view owns the numbers); the filter note is
 * printed under the headline so a filtered PDF never masquerades as the
 * full period.
 */
export function buildReportPdfInput(options: {
  trades: JournalPdfTrade[];
  currency: Currency;
  /** "Weekly report" | "Monthly report" | "Quarterly report". */
  reportTitle: string;
  /** "Sep 15 – Sep 21, 2025" · "September 2025" · "Q3 2025 · Jul – Sep". */
  periodLabel: string;
  /** Human note about active filters, or null when the full period is shown. */
  filterNote: string | null;
  /** Pre-formatted comparison line, or null. */
  comparison: string | null;
  /** Pre-formatted key figures (summary band of the PDF). */
  summaryItems: JournalPdfSummaryItem[];
  logoDataUrl?: string;
}): JournalPdfInput {
  const { trades, currency, reportTitle, periodLabel, filterNote, comparison, summaryItems, logoDataUrl } = options;

  const subtitle = filterNote !== null
    ? `${periodLabel} · filtered: ${filterNote}`
    : `${periodLabel} · full period`;

  return {
    title: reportTitle,
    subtitle,
    currency,
    fileName: `cosmoz-${periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    logoDataUrl,
    summary: summaryItems,
    comparison,
    trades,
    includeNotes: true,
  };
}

function formatWeekR(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

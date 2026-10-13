/**
 * Reports exports — Markdown + CSV builders for the premium period report.
 * Pure functions (no DOM, no React) so the exact same text reaches the
 * download blob and any future server-side generation. The view passes
 * PRE-FORMATTED metric lines; the builders only assemble the document.
 * The PDF path reuses the pdfmake journal document (lib/pdf/journal-pdf.ts)
 * via export-inputs.
 */
import type { Currency } from "@cosmoz/shared";
import { formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";

import { csvCell } from "@/lib/csv";

// ── Shared input model ───────────────────────────────────────────────────────

export interface ReportExportTrade {
  tradingDate: string;
  symbol: string;
  direction: "BUY" | "SELL";
  strategyName: string | null;
  entryPrice: string | null;
  exitPrice: string | null;
  quantity: string | null;
  rMultiple: string | null;
  pnlNet: string | null;
  decisionGrade: string | null;
  notes: string | null;
}

export interface ReportExportSummary {
  tradesCount: number;
  netPnl: string;
  winRate: number | null;
  rEarned: number | null;
}

export interface ReportExportInput {
  currency: Currency;
  /** "Weekly report" | "Monthly report" | "Quarterly report". */
  reportTitle: string;
  /** "Sep 15 – Sep 21, 2025" · "September 2025" · "Q3 2025 · Jul – Sep". */
  periodLabel: string;
  /** "vs previous period: Sep 8 – Sep 14" — comparison context, or null. */
  comparisonNote: string | null;
  /** Human note about the active filters ("EURUSD · Wins only") or null. */
  filterNote: string | null;
  summary: ReportExportSummary;
  /** Pre-formatted pro metrics (profit factor, expectancy, drawdown…). */
  proMetrics: { label: string; value: string }[];
  /** Per-instrument rollup of the FILTERED subset. */
  byInstrument: { symbol: string; tradesCount: number; netPnl: number }[];
  /** Per-strategy rollup of the FILTERED subset. */
  byStrategy: { name: string; tradesCount: number; netPnl: number }[];
  /** Long / short split of the FILTERED subset. */
  longShort: { side: string; tradesCount: number; netPnl: number; winRate: number | null }[];
  /** Auto-insights (server-computed for the full period — labeled as such). */
  insights: string[];
  trades: ReportExportTrade[];
}

/** Trigger a text/plain download from the browser. */
export function downloadTextFile(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ── Markdown ─────────────────────────────────────────────────────────────────

function mdSummaryLine(input: ReportExportInput): string {
  const parts = [
    `**Net P&L:** ${input.summary.netPnl}`,
    `**Trades:** ${input.summary.tradesCount}`,
    `**Win rate:** ${input.summary.winRate === null ? "—" : formatPercent(input.summary.winRate)}`,
    `**R earned:** ${input.summary.rEarned === null ? "—" : formatR(input.summary.rEarned)}`,
  ];
  return parts.join(" · ");
}

function mdMetricTable(input: ReportExportInput): string {
  if (input.proMetrics.length === 0) return "_No pro metrics in this selection._";
  const lines = [
    "| Metric | Value |",
    "| --- | ---: |",
    ...input.proMetrics.map((metric) => `| ${metric.label} | ${metric.value} |`),
  ];
  return lines.join("\n");
}

function mdRollupTable(
  rows: { name: string; tradesCount: number; netPnl: number }[],
  header: string,
  emptyText: string,
  currency: Currency,
): string {
  if (rows.length === 0) return `_${emptyText}_`;
  const lines = [
    `| ${header} | Trades | Net P&L |`,
    "| --- | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${row.name} | ${row.tradesCount} | ${formatSignedMoney(row.netPnl, currency)} |`,
    ),
  ];
  return lines.join("\n");
}

function mdSideTable(input: ReportExportInput): string {
  if (input.longShort.length === 0) return "_No side data._";
  const lines = [
    "| Side | Trades | Win rate | Net P&L |",
    "| --- | ---: | ---: | ---: |",
    ...input.longShort.map(
      (row) =>
        `| ${row.side} | ${row.tradesCount} | ${row.winRate === null ? "—" : formatPercent(row.winRate)} | ${formatSignedMoney(row.netPnl, input.currency)} |`,
    ),
  ];
  return lines.join("\n");
}

function mdTradeTable(input: ReportExportInput): string {
  if (input.trades.length === 0) return "_No trade in this selection._";
  const lines = [
    "| Date | Instrument | Dir | Strategy | R | Net P&L | Grade |",
    "| --- | --- | --- | --- | ---: | ---: | --- |",
    ...input.trades.map((trade) => {
      const closed = trade.pnlNet !== null;
      return [
        trade.tradingDate,
        trade.symbol,
        trade.direction,
        trade.strategyName ?? "Out of playbook",
        closed && trade.rMultiple !== null ? formatR(trade.rMultiple) : "—",
        closed ? formatSignedMoney(trade.pnlNet, input.currency) : "open",
        trade.decisionGrade ?? "—",
      ].join("|");
    }),
  ];
  return lines.join("\n");
}

/** Builds the full Markdown report (mirrors the on-screen filtered view). */
export function buildReportMarkdown(input: ReportExportInput): string {
  const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date());
  const sections: string[] = [
    `# Cosmoz — ${input.reportTitle}`,
    ``,
    `**Period:** ${input.periodLabel}  `,
    `**Generated:** ${generated}${input.comparisonNote !== null ? `  \n**Comparison:** ${input.comparisonNote}` : ""}${input.filterNote !== null ? `  \n**Filtered view:** ${input.filterNote}` : ""}`,
    ``,
    `## Summary`,
    ``,
    mdSummaryLine(input),
    ``,
    `## Pro metrics`,
    ``,
    mdMetricTable(input),
    ``,
    `## By instrument`,
    ``,
    mdRollupTable(
      input.byInstrument.map((row) => ({ name: row.symbol, tradesCount: row.tradesCount, netPnl: row.netPnl })),
      "Instrument",
      "No instrument traded in this selection.",
      input.currency,
    ),
    ``,
    `## By strategy`,
    ``,
    mdRollupTable(input.byStrategy, "Strategy", "No strategy traded in this selection.", input.currency),
    ``,
    `## Long vs short`,
    ``,
    mdSideTable(input),
    ``,
    `## Trade log`,
    ``,
    mdTradeTable(input),
  ];
  if (input.insights.length > 0) {
    sections.push(
      ``,
      `## Insights`,
      ``,
      ...(input.filterNote !== null
        ? [`_Auto-generated from the full period (unfiltered)._`]
        : []),
      ...input.insights.map((insight) => `- ${insight}`),
    );
  }
  return `${sections.join("\n")}\n`;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const CSV_HEADER = [
  "Date",
  "Symbol",
  "Direction",
  "Strategy",
  "Entry",
  "Exit",
  "Quantity",
  "R multiple",
  "Net P&L",
  "Grade",
  "Notes",
];

/** Builds the CSV of the FILTERED trade log (Excel/Numbers friendly). */
export function buildReportCsv(input: ReportExportInput): string {
  const rows = input.trades.map((trade) => [
    trade.tradingDate,
    trade.symbol,
    trade.direction,
    trade.strategyName ?? "Out of playbook",
    trade.entryPrice ?? "",
    trade.exitPrice ?? "",
    trade.quantity ?? "",
    trade.rMultiple ?? "",
    trade.pnlNet ?? "",
    trade.decisionGrade ?? "",
    trade.notes ?? "",
  ]);
  return [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

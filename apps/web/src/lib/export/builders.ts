import { csvCell } from "@cosmoz/shared";
import type { AnalyticsSuiteResponse, PerformanceSnapshot } from "@cosmoz/shared";

/**
 * CSV export builders (Dashboard Customization Phase 08) - the ONE place
 * every export payload is serialized. Pure (string in → CSV string out),
 * deterministic, and safe by construction: every cell goes through the
 * shared csvCell (RFC 4180 structural escaping + OWASP formula-injection
 * guard - the Phase 12 fix, applied to every new dataset from day one).
 *
 * Documented conventions (spec §4A):
 *   - Stable, snake_case column headers; datasets are versionless documents.
 *   - Missing values render as an EMPTY cell (never "0", never "null").
 *   - Money columns carry the currency in a dedicated column; a suite
 *     spanning multiple currencies exports NO money values at all (same
 *     honesty as the UI: no misleading combined totals).
 *   - Numbers are exported as the server's decimal strings - no client-side
 *     rounding, no locale formatting. Every metric here is REALIZED; the
 *     suite excludes open positions (stated in the dedicated
 *     `open_trades_excluded` meta row).
 *   - Realized raw records (trades ledger export in components/trades/
 *     trades-table.tsx) vs derived aggregates (these builders) stay
 *     separate export types.
 */

type Suite = AnalyticsSuiteResponse;

/** RFC 4180 line ending (CRLF) - one constant so tests pin the format. */
export const CSV_EOL = "\r\n";

function row(cells: Array<string | number | null | undefined>): string {
  return cells.map((cell) => csvCell(cell)).join(",");
}

/**
 * Performance summary - the suite's KPI band + dataset meta. Explicit about
 * scope (descriptor, resolved window, currency) per spec §3.
 */
export function suiteSummaryCsv(suite: Suite): string {
  const money = suite.meta.singleCurrency;
  const header = [
    "metric",
    "value",
    "unit",
    "currency",
    "period_from",
    "period_to",
    "descriptor",
  ];
  const s = suite.summary;
  const currency = money ? suite.currency : "";
  const from = suite.meta.resolvedFrom;
  const to = suite.meta.resolvedTo;
  const lines = [
    row(header),
    row(["open_trades_excluded", suite.meta.openTradesExcluded, "count", "", "", "", "Open positions never leak into realized stats"]),
    row(["closed_trades", s.trades, "count", "", from, to, suite.meta.descriptor]),
    row(["winning_trades", s.winningTrades, "count", "", from, to, suite.meta.descriptor]),
    row(["losing_trades", s.losingTrades, "count", "", from, to, suite.meta.descriptor]),
    row(["breakeven_trades", s.breakevenTrades, "count", "", from, to, suite.meta.descriptor]),
    row(["net_pnl", money ? s.netPnl : null, "money", currency, from, to, suite.meta.descriptor]),
    row(["gross_profit", money ? s.grossProfit : null, "money", currency, from, to, suite.meta.descriptor]),
    row(["gross_loss", money ? s.grossLoss : null, "money", currency, from, to, suite.meta.descriptor]),
    row(["win_rate", s.winRate, "ratio_0_1", "", from, to, suite.meta.descriptor]),
    row(["loss_rate", s.lossRate, "ratio_0_1", "", from, to, suite.meta.descriptor]),
    row(["profit_factor", s.profitFactor, "ratio", "", from, to, suite.meta.descriptor]),
    row(["expectancy_r", s.expectancyR, "R", "", from, to, suite.meta.descriptor]),
    row(["expectancy_money", money ? s.expectancyMoney : null, "money", currency, from, to, suite.meta.descriptor]),
    row(["avg_r", s.avgR, "R", "", from, to, suite.meta.descriptor]),
    row(["median_r", s.medianR, "R", "", from, to, suite.meta.descriptor]),
    row(["best_r", s.bestR, "R", "", from, to, suite.meta.descriptor]),
    row(["worst_r", s.worstR, "R", "", from, to, suite.meta.descriptor]),
    row(["payoff_ratio", s.payoffRatio, "ratio", "", from, to, suite.meta.descriptor]),
    row(["max_drawdown_r", s.maxDrawdownR, "R", "", from, to, suite.meta.descriptor]),
    row(["max_drawdown_pct", s.maxDrawdownPct, "percent", "", from, to, suite.meta.descriptor]),
    row(["recovery_factor", s.recoveryFactor, "ratio", "", from, to, suite.meta.descriptor]),
    row(["sharpe", s.sharpe, "ratio", "", from, to, s.sharpeNote]),
    row(["sortino", s.sortino, "ratio", "", from, to, s.sortinoNote]),
    row(["sqn", s.sqn, "ratio", "", from, to, suite.meta.descriptor]),
    row(["avg_duration_min", s.avgDurationMin, "minutes", "", from, to, suite.meta.descriptor]),
  ];
  return lines.join(CSV_EOL) + CSV_EOL;
}

/** Strategy-level summary - the suite's per-strategy breakdown. */
export function suiteStrategiesCsv(suite: Suite): string {
  const money = suite.meta.singleCurrency;
  const header = [
    "strategy",
    "strategy_id",
    "trades",
    "win_rate",
    "profit_factor",
    "expectancy_r",
    ...(money ? ["net_pnl", "currency"] : []),
    "avg_win_r",
    "avg_loss_r",
    "max_drawdown_r",
    "followed_plan_pct",
    "avg_duration_min",
    "period_from",
    "period_to",
  ];
  const lines = [row(header)];
  for (const strategy of suite.strategies) {
    lines.push(
      row([
        strategy.name,
        strategy.strategyId,
        strategy.trades,
        strategy.winRate,
        strategy.profitFactor,
        strategy.expectancyR,
        ...(money ? [strategy.netPnl, suite.currency] : []),
        strategy.avgWinR,
        strategy.avgLossR,
        strategy.maxDrawdownR,
        strategy.followedPlanPct,
        strategy.avgDurationMin,
        suite.meta.resolvedFrom,
        suite.meta.resolvedTo,
      ]),
    );
  }
  return lines.join(CSV_EOL) + CSV_EOL;
}

/** Symbol-level summary - the suite's per-instrument breakdown. */
export function suiteSymbolsCsv(suite: Suite): string {
  const money = suite.meta.singleCurrency;
  const header = [
    "symbol",
    "asset_class",
    "trades",
    "win_rate",
    "profit_factor",
    ...(money ? ["net_pnl", "currency"] : []),
    "avg_r",
    "period_from",
    "period_to",
  ];
  const lines = [row(header)];
  for (const symbol of suite.symbols) {
    lines.push(
      row([
        symbol.symbol,
        symbol.assetClass,
        symbol.trades,
        symbol.winRate,
        symbol.profitFactor,
        ...(money ? [symbol.netPnl, suite.currency] : []),
        symbol.avgR,
        suite.meta.resolvedFrom,
        suite.meta.resolvedTo,
      ]),
    );
  }
  return lines.join(CSV_EOL) + CSV_EOL;
}

/** Report rollups (daily / weekly / monthly aggregates) - one file each. */
export function suiteReportsCsv(suite: Suite, bucket: "daily" | "weekly" | "monthly"): string {
  const money = suite.meta.singleCurrency;
  const header = [
    "bucket",
    "key",
    "trades",
    "net_pnl",
    ...(money ? ["currency"] : []),
    "sum_r",
    "win_rate",
  ];
  const lines = [row(header)];
  for (const point of suite.reports[bucket]) {
    lines.push(
      row([
        bucket,
        point.key,
        point.trades,
        money ? point.netPnl : null,
        ...(money ? [suite.currency] : []),
        point.r,
        point.winRate,
      ]),
    );
  }
  return lines.join(CSV_EOL) + CSV_EOL;
}

/** Account-level summary - balances are the provider-of-record values. */
export function accountsCsv(
  accounts: Array<{
    name: string;
    type: string;
    broker: string;
    currency: string;
    startingBalance: string;
    isDefault: boolean;
  }>,
): string {
  const lines = [
    row([
      "account",
      "type",
      "broker",
      "currency",
      "starting_balance",
      "is_default",
    ]),
  ];
  for (const account of accounts) {
    lines.push(
      row([
        account.name,
        account.type,
        account.broker,
        account.currency,
        account.startingBalance,
        account.isDefault ? "true" : "false",
      ]),
    );
  }
  return lines.join(CSV_EOL) + CSV_EOL;
}

/**
 * One snapshot as CSV - the frozen capture (its own export type: values are
 * historical facts, never recomputed). Includes the full context block
 * (capture timestamp, resolved window, scope descriptor, schema version).
 */
export function snapshotCsv(snapshot: PerformanceSnapshot): string {
  const money = snapshot.singleCurrency;
  const context = [
    row(["captured_at", snapshot.capturedAt]),
    row(["period_from", snapshot.periodFrom]),
    row(["period_to", snapshot.periodTo]),
    row(["period_preset", snapshot.period]),
    row(["scope", snapshot.descriptor]),
    row(["currency", money ? snapshot.currency : null]),
    row(["schema_version", snapshot.schemaVersion]),
    row(["notes", snapshot.notes || null]),
  ];
  const m = snapshot.metrics;
  const metrics = [
    row(["metric", "value", "unit", "currency"]),
    row(["net_pnl", money ? m.netPnl : null, "money", money ? snapshot.currency : ""]),
    row(["win_rate", m.winRate, "ratio_0_1", ""]),
    row(["profit_factor", m.profitFactor, "ratio", ""]),
    row(["trades", m.trades, "count", ""]),
    row(["avg_r", m.avgR, "R", ""]),
    row(["expectancy_r", m.expectancyR, "R", ""]),
    row(["max_drawdown_r", m.maxDrawdownR, "R", ""]),
    row(["max_drawdown_pct", m.maxDrawdownPct, "percent", ""]),
  ];
  return [...context, ...metrics].join(CSV_EOL) + CSV_EOL;
}

/** Browser download helper - safe filename + honest content type. */
export function downloadTextFile(filename: string, content: string, mime = "text/csv"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

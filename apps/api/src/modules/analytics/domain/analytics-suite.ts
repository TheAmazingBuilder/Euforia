/**
 * Analytics suite engine (Phase 8) — the PURE aggregation of the Analytics
 * module's single dataset definition (one filtered closed-trade set → every
 * tab of the module renders the SAME data; the client only formats).
 *
 * Contract: `analyticsSuiteResponseSchema` (packages/shared api.ts). Every
 * rule here mirrors that contract's documented semantics verbatim:
 *   - CLOSED trades only, filtered by tradingDate (user trading-day) + the
 *     global filter bag; chronological (tradingDate, exit/entry) ordering.
 *   - Honesty first: null (never 0) when a ratio cannot be supported;
 *     money aggregates null on multi-currency; anomaly messages are
 *     measured facts, never verdicts (no psychological diagnosis §49).
 *   - Reproducibility: fixed-seed Monte Carlo, deterministic orderings (§52).
 */
import {
  ANALYTIC_SESSIONS,
  ANALYTICS_HOUR_BUCKETS,
  ANALYTICS_WEEKDAYS,
  EMOTION_LABELS,
  type AnalyticsBucket,
  type AnalyticsFilters,
  type AnalyticsSuiteResponse,
  type Currency,
} from "../../../shared/contracts";
import type { AnalyticsAccountRow, AnalyticsTradeRow } from "./analytics-input";
import {
  dayDiff,
  isoWeekOf,
  ALL_FROM,
  ALL_TO,
  resolvePeriodRange,
  shiftDayKey,
} from "./analytics-clock";
import {
  mean,
  medianOf,
  moments,
  mulberry32,
  niceStep,
  percentileOf,
  round1,
  round2,
  stdOf,
} from "./analytics-math";

/** Fixed Monte Carlo seed — deterministic, documented (§52). */
const MONTE_CARLO_SEED = 20260930;
const ROLLING_WINDOW = 10;
const MAX_DRAWDOWN_PERIODS = 6;
const MAX_MC_BANDS = 80;
const MAX_SHARPE_DAYS = 400;
const MIN_STAT_DAYS = 10;
/** Below this sample size the engine refuses to raise anomalies (§30). */
const MIN_ANOMALY_SAMPLE = 10;

export interface SuiteCalendarEvent {
  /** Canonical Cosmoz event id. */
  id: string;
  /** ISO 4217 currency most affected (join key with instrument quote). */
  currency: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  /** UTC instant, pre-parsed to epoch ms. */
  scheduledAtMs: number;
}

export interface SuiteEnvironment {
  trades: AnalyticsTradeRow[];
  accounts: AnalyticsAccountRow[];
  strategyNames: Record<string, string>;
  todayKey: string;
  /** Global OPEN count (all user accounts) — open positions never leak into stats (§45). */
  openTradeCount: number;
  /** Canonical economic events (Phase 13 §21) — defaults to empty (no
   * calendar coverage: every trade honestly falls into "NONE"-excluded
   * buckets). */
  calendarEvents?: readonly SuiteCalendarEvent[];
}

type Decimal = string;

function dec(value: number): Decimal {
  return String(round2(value));
}

function bucketOf(key: string, label: string, group: AnalyticsTradeRow[]): AnalyticsBucket {
  const wins = group.filter((t) => t.pnlNet > 0);
  return {
    key,
    label,
    trades: group.length,
    wins: wins.length,
    avgR: group.length === 0 ? null : dec(mean(group.map((t) => t.rMultiple)) as number),
    winRate: group.length === 0 ? null : dec(round2(wins.length / group.length)),
  };
}

function symbolRowOf(
  instrument: { id: string; symbol: string; assetClass: string },
  group: AnalyticsTradeRow[],
  singleCurrency: boolean,
): AnalyticsSuiteResponse["symbols"][number] {
  const groupWins = group.filter((t) => t.pnlNet > 0);
  const groupLosses = group.filter((t) => t.pnlNet < 0);
  const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + t.pnlNet, 0) : null;
  const gl = singleCurrency ? Math.abs(groupLosses.reduce((sum, t) => sum + t.pnlNet, 0)) : null;
  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    assetClass: instrument.assetClass,
    trades: group.length,
    winRate: group.length > 0 ? dec(round2(groupWins.length / group.length)) : null,
    profitFactor: gp !== null && gl !== null && gl > 0 ? dec(round2(gp / gl)) : null,
    netPnl: singleCurrency ? dec(group.reduce((sum, t) => sum + t.pnlNet, 0)) : null,
    avgR: group.length > 0 ? dec(mean(group.map((t) => t.rMultiple)) as number) : null,
  };
}

export function computeAnalyticsSuite(
  environment: SuiteEnvironment,
  filters: AnalyticsFilters,
  sims: number,
): AnalyticsSuiteResponse {
  const { from, to } = resolvePeriodRange(filters, environment.todayKey);

  // ── The dataset ─────────────────────────────────────────────────────────
  let closed = environment.trades.filter((t) => t.tradingDate >= from && t.tradingDate <= to);
  const openTradesExcluded = environment.openTradeCount;
  if (filters.accountId) closed = closed.filter((t) => t.accountId === filters.accountId);
  if (filters.instrumentId) closed = closed.filter((t) => t.instrumentId === filters.instrumentId);
  if (filters.assetClass) closed = closed.filter((t) => t.assetClass === filters.assetClass);
  if (filters.strategyId === "none") closed = closed.filter((t) => t.strategyId === null);
  else if (filters.strategyId) closed = closed.filter((t) => t.strategyId === filters.strategyId);
  if (filters.direction) closed = closed.filter((t) => t.direction === filters.direction);
  if (filters.session) {
    const session = ANALYTIC_SESSIONS.find((s) => s.key === filters.session);
    const hourSet = new Set(session?.hours ?? []);
    closed = closed.filter((t) => hourSet.has(new Date(t.entryAtIso).getUTCHours()));
  }
  // NOTE: emotion/exitReason/tagId filters follow the shared contract. The
  // journal does not yet own emotion/tag data (honest seams) — an unknown
  // filter narrows the dataset the same way any unmatchable value would.
  if (filters.emotion) closed = closed.filter(() => false);
  if (filters.tagId) closed = closed.filter(() => false);
  if (filters.exitReason) closed = closed.filter((t) => t.exitReason === filters.exitReason);

  closed = [...closed].sort((a, b) =>
    (a.tradingDate + (a.exitAtIso ?? a.entryAtIso)).localeCompare(b.tradingDate + (b.exitAtIso ?? b.entryAtIso)),
  );

  // ── Dataset meta (§5: WHAT DATASET AM I LOOKING AT?) ────────────────────
  const accountIds = new Set(closed.map((t) => t.accountId));
  const scopedAccounts = environment.accounts.filter((a) => accountIds.has(a.id));
  const scopeCurrencies = new Set(scopedAccounts.map((a) => a.currency));
  const singleCurrency = scopeCurrencies.size <= 1;

  const descriptorParts: string[] = [];
  if (filters.accountId) {
    descriptorParts.push(environment.accounts.find((a) => a.id === filters.accountId)?.name ?? "account");
  }
  if (filters.instrumentId) {
    const instrument = closed.find((t) => t.instrumentId === filters.instrumentId);
    descriptorParts.push(instrument?.instrumentSymbol ?? "symbol");
  }
  if (filters.assetClass) descriptorParts.push(filters.assetClass);
  if (filters.strategyId === "none") descriptorParts.push("Out of playbook");
  else if (filters.strategyId) {
    descriptorParts.push(environment.strategyNames[filters.strategyId] ?? "strategy");
  }
  if (filters.direction) descriptorParts.push(filters.direction);
  if (filters.session) {
    descriptorParts.push(ANALYTIC_SESSIONS.find((s) => s.key === filters.session)?.label ?? filters.session);
  }
  if (filters.emotion) descriptorParts.push(EMOTION_LABELS[filters.emotion] ?? filters.emotion);
  if (filters.exitReason) descriptorParts.push(filters.exitReason);

  const warnings: string[] = [];
  if (closed.length === 0) warnings.push("No closed trades match the current filters.");
  else if (closed.length < MIN_ANOMALY_SAMPLE) {
    warnings.push("Small sample: rates and ratios below ~10 trades are statistically unreliable.");
  }
  if (!singleCurrency) warnings.push("Multi-currency dataset: money figures are raw sums, not converted.");

  // ── Core helpers ────────────────────────────────────────────────────────
  const winsOf = (group: AnalyticsTradeRow[]) => group.filter((t) => t.pnlNet > 0);
  const lossesOf = (group: AnalyticsTradeRow[]) => group.filter((t) => t.pnlNet < 0);
  const durationMinOf = (t: AnalyticsTradeRow): number | null =>
    t.exitAtMs === null ? null : Math.max(0, Math.round((t.exitAtMs - t.entryAtMs) / 60_000));

  // ── Summary (§6/§8) ─────────────────────────────────────────────────────
  const wins = winsOf(closed);
  const losses = lossesOf(closed);
  const breakeven = closed.length - wins.length - losses.length;
  const rValues = closed.map((t) => t.rMultiple);
  const pnlValues = singleCurrency ? closed.map((t) => t.pnlNet) : [];
  const grossProfit = singleCurrency ? wins.reduce((sum, t) => sum + t.pnlNet, 0) : null;
  const grossLoss = singleCurrency ? Math.abs(losses.reduce((sum, t) => sum + t.pnlNet, 0)) : null;
  const netPnl = singleCurrency ? closed.reduce((sum, t) => sum + t.pnlNet, 0) : null;
  const avgWinRMean = mean(wins.map((t) => t.rMultiple));
  const avgLossRMean = mean(losses.map((t) => t.rMultiple));
  const avgLossR = avgLossRMean === null ? null : Math.abs(avgLossRMean);
  const payoffRatio = avgWinRMean !== null && avgLossR !== null && avgLossR > 0 ? avgWinRMean / avgLossR : null;

  // Cumulative R → R drawdown; equity curve → % drawdown.
  let cumR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  const cumByTrade: { trade: AnalyticsTradeRow; cumR: number }[] = [];
  for (const trade of closed) {
    cumR += trade.rMultiple;
    if (cumR > peakR) peakR = cumR;
    maxDrawdownR = Math.min(maxDrawdownR, cumR - peakR);
    cumByTrade.push({ trade, cumR });
  }

  const baseBalance = singleCurrency
    ? scopedAccounts.reduce((sum, a) => sum + a.startingBalance, 0)
    : 0;
  let runningPeakEquity = baseBalance;
  let maxDrawdownPct = 0;
  const equity: AnalyticsSuiteResponse["equity"] = [];
  if (singleCurrency && closed.length > 0) {
    let equityNow = baseBalance;
    for (const { trade } of cumByTrade) {
      equityNow += trade.pnlNet;
      runningPeakEquity = Math.max(runningPeakEquity, equityNow);
      const ddPct = runningPeakEquity > 0 ? ((equityNow - runningPeakEquity) / runningPeakEquity) * 100 : 0;
      maxDrawdownPct = Math.min(maxDrawdownPct, ddPct);
      equity.push({
        date: trade.tradingDate,
        equity: dec(equityNow),
        drawdownPct: dec(ddPct),
      });
    }
  }

  const recoveryFactor = netPnl !== null && maxDrawdownR < 0 ? netPnl / Math.abs(maxDrawdownR) : null;

  // Sharpe / Sortino on DAILY R sums (calendar days from first to last trade,
  // zero-filled on no-trade days), annualized √252, risk-free 0 — the
  // methodology travels with the payload (§8).
  let sharpe: number | null = null;
  let sortino: number | null = null;
  if (closed.length > 0) {
    const dailyMap = new Map<string, number>();
    for (const t of closed) dailyMap.set(t.tradingDate, (dailyMap.get(t.tradingDate) ?? 0) + t.rMultiple);
    const firstDate = closed[0]!.tradingDate;
    const lastDate = closed[closed.length - 1]!.tradingDate;
    const series: number[] = [];
    for (let key = firstDate; key <= lastDate; key = shiftDayKey(key, 1)) {
      series.push(dailyMap.get(key) ?? 0);
      if (series.length > MAX_SHARPE_DAYS) break; // dataset window cap
    }
    const dailyMean = mean(series);
    const dailyStd = stdOf(series);
    if (dailyMean !== null && dailyStd !== null && dailyStd > 0 && series.length >= MIN_STAT_DAYS) {
      sharpe = (dailyMean / dailyStd) * Math.sqrt(252);
    }
    const downside = Math.sqrt(mean(series.map((v) => Math.min(v, 0) ** 2)) ?? 0);
    if (dailyMean !== null && downside > 0 && series.length >= MIN_STAT_DAYS) {
      sortino = (dailyMean / downside) * Math.sqrt(252);
    }
  }
  const rMean = mean(rValues);
  const rStd = stdOf(rValues);
  const sqn =
    rMean !== null && rStd !== null && rStd > 0 && closed.length >= MIN_STAT_DAYS
      ? (rMean / rStd) * Math.sqrt(closed.length)
      : null;

  const durations = closed.map(durationMinOf).filter((d): d is number => d !== null);

  const summary: AnalyticsSuiteResponse["summary"] = {
    netPnl: netPnl === null ? null : dec(netPnl),
    grossProfit: grossProfit === null ? null : dec(grossProfit),
    grossLoss: grossLoss === null ? null : dec(grossLoss),
    winRate: closed.length > 0 ? dec(round2(wins.length / closed.length)) : null,
    lossRate: closed.length > 0 ? dec(round2(losses.length / closed.length)) : null,
    profitFactor:
      grossLoss !== null && grossLoss > 0 && grossProfit !== null ? dec(round2(grossProfit / grossLoss)) : null,
    expectancyR: dec(rMean ?? 0),
    expectancyMoney: mean(pnlValues) === null ? null : dec(mean(pnlValues) as number),
    avgR: rMean === null ? null : dec(rMean),
    medianR: medianOf(rValues) === null ? null : dec(medianOf(rValues) as number),
    bestR: rValues.length === 0 ? null : dec(Math.max(...rValues)),
    worstR: rValues.length === 0 ? null : dec(Math.min(...rValues)),
    avgWinMoney: singleCurrency && wins.length > 0 ? dec(mean(wins.map((t) => t.pnlNet)) as number) : null,
    avgLossMoney: singleCurrency && losses.length > 0 ? dec(mean(losses.map((t) => t.pnlNet)) as number) : null,
    avgWinR: avgWinRMean === null ? null : dec(avgWinRMean),
    avgLossR: avgLossR === null ? null : dec(avgLossR),
    payoffRatio: payoffRatio === null ? null : dec(round2(payoffRatio)),
    maxDrawdownR: dec(maxDrawdownR),
    maxDrawdownPct: singleCurrency && closed.length > 0 ? dec(maxDrawdownPct) : null,
    recoveryFactor: recoveryFactor === null ? null : dec(round2(recoveryFactor)),
    sharpe: sharpe === null ? null : dec(round2(sharpe)),
    sortino: sortino === null ? null : dec(round2(sortino)),
    sqn: sqn === null ? null : dec(round2(sqn)),
    trades: closed.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: breakeven,
    avgDurationMin: durations.length > 0 ? Math.round(mean(durations) as number) : null,
    sharpeNote:
      "Sharpe = mean daily ΣR ÷ stdev(daily ΣR) × √252, risk-free = 0. Daily series spans the full filter window (0R on no-trade days); null below 10 days.",
    sortinoNote:
      "Sortino uses the same daily ΣR series with downside deviation (√mean(min(0,d)²)), annualized √252 — penalizes only negative volatility.",
  };

  // ── Cumulative R + rolling (window 10) (§7/§9) ──────────────────────────
  const cumulativeR: AnalyticsSuiteResponse["cumulativeR"] = cumByTrade.map(({ trade, cumR: value }, index) => ({
    index,
    date: trade.tradingDate,
    symbol: trade.instrumentSymbol ?? "?",
    r: dec(trade.rMultiple),
    cumR: dec(value),
  }));
  const rolling: AnalyticsSuiteResponse["rolling"] = cumByTrade.map((_point, index) => {
    const start = Math.max(0, index - ROLLING_WINDOW + 1);
    const window = closed.slice(start, index + 1);
    const windowWins = winsOf(window).length;
    return {
      index,
      winRate: window.length === 0 ? null : dec(round2(windowWins / window.length)),
      avgR: dec(mean(window.map((t) => t.rMultiple)) ?? 0),
    };
  });

  // ── Daily P&L (§7) ──────────────────────────────────────────────────────
  const dailyGroups = new Map<string, AnalyticsTradeRow[]>();
  for (const trade of closed) {
    const group = dailyGroups.get(trade.tradingDate) ?? [];
    group.push(trade);
    dailyGroups.set(trade.tradingDate, group);
  }
  const dailyPnl: AnalyticsSuiteResponse["dailyPnl"] = [...dailyGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => ({
      date,
      pnl: singleCurrency ? dec(group.reduce((sum, t) => sum + t.pnlNet, 0)) : null,
      r: dec(group.reduce((sum, t) => sum + t.rMultiple, 0)),
      trades: group.length,
      wins: winsOf(group).length,
    }));

  // ── Histograms (§7 distributions) ───────────────────────────────────────
  const rHistogram: AnalyticsSuiteResponse["rHistogram"] = [];
  for (let edge = -2; edge < 4; edge += 0.5) {
    const lo = edge;
    const hi = edge + 0.5;
    const label =
      edge <= -2
        ? "≤ -2R"
        : edge >= 3.5
          ? "> +3.5R"
          : `${lo > 0 ? "+" : ""}${round1(lo)}R … ${hi > 0 ? "+" : ""}${round1(hi)}R`;
    const count = rValues.filter((r) => (edge <= -2 ? r <= -2 : edge >= 3.5 ? r > 3.5 : r > lo && r <= hi)).length;
    rHistogram.push({ label, count, center: String(round1((lo + hi) / 2)) });
  }
  const pnlHistogram: AnalyticsSuiteResponse["pnlHistogram"] = [];
  if (singleCurrency && pnlValues.length > 0) {
    const min = Math.min(...pnlValues);
    const max = Math.max(...pnlValues);
    const span = Math.max(max - min, 1);
    const step = niceStep(span / 10);
    const firstBin = Math.floor(min / step) * step;
    for (let edge = firstBin; edge < max; edge += step) {
      const count = pnlValues.filter((v) => v > edge && v <= edge + step).length;
      if (count === 0 && edge > max) break;
      pnlHistogram.push({
        label: `${Math.round(edge)}…${Math.round(edge + step)}`,
        count,
        center: dec(edge + step / 2),
      });
    }
  }
  const durationBuckets: readonly { label: string; test: (minutes: number) => boolean }[] = [
    { label: "< 5 min", test: (m) => m < 5 },
    { label: "5–15 min", test: (m) => m >= 5 && m < 15 },
    { label: "15–60 min", test: (m) => m >= 15 && m < 60 },
    { label: "1–4 h", test: (m) => m >= 60 && m < 240 },
    { label: "4–12 h", test: (m) => m >= 240 && m < 720 },
    { label: "> 12 h", test: (m) => m >= 720 },
  ];
  const durationHistogram: AnalyticsSuiteResponse["durationHistogram"] = durationBuckets.map((bucket) => ({
    label: bucket.label,
    count: durations.filter(bucket.test).length,
    center: null,
  }));

  // ── Drawdown periods (§11) ─────────────────────────────────────────────
  const drawdowns: AnalyticsSuiteResponse["drawdowns"] = [];
  {
    let peak = baseBalance;
    let peakDate: string | null = null;
    let inDrawdown = false;
    let ddStart: string | null = null;
    let troughEquity = baseBalance;
    let troughDate: string | null = null;
    let troughCumR = 0;
    let peakRCum = 0;
    let tradeIndexAtPeak = 0;
    let diggers: { id: string; date: string; symbol: string; r: string }[] = [];
    let equityNow = baseBalance;
    const flush = (recoveredDate: string | null, recoveryDays: number | null, recoveryTrades: number | null) => {
      if (peakDate === null || troughDate === null || ddStart === null) return;
      const drawdownMoney = singleCurrency ? peak - troughEquity : null;
      const drawdownR = troughCumR - peakRCum;
      if (drawdownMoney === null || Math.abs(drawdownMoney) > 0.009 || Math.abs(drawdownR) > 0.009) {
        drawdowns.push({
          id: `dd-${drawdowns.length + 1}`,
          peakDate,
          bottomDate: troughDate,
          recoveredDate,
          peakEquity: dec(peak),
          bottomEquity: dec(troughEquity),
          drawdownMoney: drawdownMoney === null ? null : dec(-Math.abs(drawdownMoney)),
          drawdownR: dec(drawdownR),
          durationDays: Math.max(0, dayDiff(ddStart, troughDate)),
          recoveryDays,
          recoveryTrades,
          trades: diggers.slice(0, 12),
        });
      }
    };
    for (let index = 0; index < cumByTrade.length; index += 1) {
      const { trade, cumR: value } = cumByTrade[index]!;
      equityNow += trade.pnlNet;
      if (equityNow > peak) {
        if (inDrawdown) flush(trade.tradingDate, dayDiff(ddStart!, trade.tradingDate), index - tradeIndexAtPeak);
        inDrawdown = false;
        peak = equityNow;
        peakDate = trade.tradingDate;
        peakRCum = value;
        tradeIndexAtPeak = index;
        continue;
      }
      if (!inDrawdown) {
        inDrawdown = true;
        ddStart = trade.tradingDate;
        troughEquity = equityNow;
        troughDate = trade.tradingDate;
        troughCumR = value;
        diggers = [];
      }
      if (equityNow <= troughEquity) {
        troughEquity = equityNow;
        troughDate = trade.tradingDate;
        troughCumR = value;
      }
      diggers.push({
        id: trade.id,
        date: trade.tradingDate,
        symbol: trade.instrumentSymbol ?? "?",
        r: dec(trade.rMultiple),
      });
    }
    if (inDrawdown) flush(null, null, null); // still under water — honest nulls
    drawdowns.sort((a, b) => Number(a.drawdownR) - Number(b.drawdownR));
  }

  // ── Risk exposure (§10) ────────────────────────────────────────────────
  const riskValues = closed.map((t) => t.riskMoney).filter((v): v is number => v !== null);
  const riskMean = mean(riskValues);
  const riskStd = stdOf(riskValues);
  const dailyRisk = new Map<string, number>();
  for (const t of closed) {
    if (t.riskMoney === null) continue;
    dailyRisk.set(t.tradingDate, (dailyRisk.get(t.tradingDate) ?? 0) + t.riskMoney);
  }
  let maxConcurrent = 0;
  for (const trade of closed) {
    const open = trade.entryAtMs;
    const close = trade.exitAtMs === null ? Number.POSITIVE_INFINITY : trade.exitAtMs;
    let concurrent = 0;
    for (const other of closed) {
      const otherOpen = other.entryAtMs;
      const otherClose = other.exitAtMs === null ? Number.POSITIVE_INFINITY : other.exitAtMs;
      if (otherOpen <= close && otherClose >= open) concurrent += 1;
    }
    maxConcurrent = Math.max(maxConcurrent, concurrent);
  }
  const plannedBuckets: readonly { label: string; test: (planned: number) => boolean }[] = [
    { label: "≤ 1R planned", test: (p) => p <= 1 },
    { label: "1–2R planned", test: (p) => p > 1 && p <= 2 },
    { label: "2–3R planned", test: (p) => p > 2 && p <= 3 },
    { label: "> 3R planned", test: (p) => p > 3 },
  ];
  const plannedTrades = closed.filter((t) => t.plannedRR !== null);
  const noPlanTrades = closed.filter((t) => t.plannedRR === null);
  const plannedVsRealized: AnalyticsSuiteResponse["risk"]["plannedVsRealized"] = [
    ...plannedBuckets.map((bucket) => {
      const group = plannedTrades.filter((t) => bucket.test(t.plannedRR as number));
      return {
        bucket: bucket.label,
        trades: group.length,
        avgRealizedR: group.length === 0 ? null : dec(mean(group.map((t) => t.rMultiple)) as number),
      };
    }),
    {
      bucket: "No plan",
      trades: noPlanTrades.length,
      avgRealizedR:
        noPlanTrades.length === 0 ? null : dec(mean(noPlanTrades.map((t) => t.rMultiple)) as number),
    },
  ];

  // ── Strategy rows (§12) — factual comparisons, no ranking verdict ─────
  const strategyIds = [...new Set(closed.map((t) => t.strategyId))];
  const strategies: AnalyticsSuiteResponse["strategies"] = strategyIds.map((id) => {
    const group = closed.filter((t) => t.strategyId === id);
    const groupWins = winsOf(group);
    const groupLosses = lossesOf(group);
    const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + t.pnlNet, 0) : null;
    const gl = singleCurrency ? Math.abs(groupLosses.reduce((sum, t) => sum + t.pnlNet, 0)) : null;
    let gCum = 0;
    let gPeak = 0;
    let gMaxDd = 0;
    for (const t of group) {
      gCum += t.rMultiple;
      gPeak = Math.max(gPeak, gCum);
      gMaxDd = Math.min(gMaxDd, gCum - gPeak);
    }
    const judged = group.filter((t) => t.followedPlan !== null);
    const groupDurations = group.map(durationMinOf).filter((d): d is number => d !== null);
    return {
      strategyId: id,
      name:
        id === null
          ? "Out of playbook"
          : (environment.strategyNames[id] ?? "Unknown strategy"),
      trades: group.length,
      winRate: group.length > 0 ? dec(round2(groupWins.length / group.length)) : null,
      profitFactor: gp !== null && gl !== null && gl > 0 ? dec(round2(gp / gl)) : null,
      expectancyR: group.length > 0 ? dec(round2(mean(group.map((t) => t.rMultiple)) as number)) : null,
      netPnl: singleCurrency ? dec(group.reduce((sum, t) => sum + t.pnlNet, 0)) : null,
      avgWinR: groupWins.length === 0 ? null : dec(mean(groupWins.map((t) => t.rMultiple)) as number),
      avgLossR:
        groupLosses.length === 0
          ? null
          : dec(Math.abs(mean(groupLosses.map((t) => t.rMultiple)) as number)),
      maxDrawdownR: dec(gMaxDd),
      avgDurationMin: groupDurations.length === 0 ? null : Math.round(mean(groupDurations) as number),
      followedPlanPct:
        judged.length === 0
          ? null
          : dec(round2(group.filter((t) => t.followedPlan === true).length / judged.length)),
    };
  });

  // ── Symbol / asset-class rows (§13) ────────────────────────────────────
  const symbolsByInstrument = new Map<string, AnalyticsTradeRow[]>();
  for (const trade of closed) {
    const group = symbolsByInstrument.get(trade.instrumentId) ?? [];
    group.push(trade);
    symbolsByInstrument.set(trade.instrumentId, group);
  }
  const symbols: AnalyticsSuiteResponse["symbols"] = [...symbolsByInstrument.values()].map((group) =>
    symbolRowOf(
      { id: group[0]!.instrumentId, symbol: group[0]!.instrumentSymbol, assetClass: group[0]!.assetClass },
      group,
      singleCurrency,
    ),
  );
  const assetClassGroups = new Map<string, AnalyticsTradeRow[]>();
  for (const trade of closed) {
    const key = trade.assetClass ?? "?";
    const group = assetClassGroups.get(key) ?? [];
    group.push(trade);
    assetClassGroups.set(key, group);
  }
  const assetClasses: AnalyticsSuiteResponse["assetClasses"] = [...assetClassGroups.entries()].map(([key, group]) =>
    symbolRowOf(
      { id: group[0]!.instrumentId, symbol: group[0]!.instrumentSymbol, assetClass: key },
      group,
      singleCurrency,
    ),
  );

  // ── Direction rows (§15) ───────────────────────────────────────────────
  const directions: AnalyticsSuiteResponse["directions"] = (["BUY", "SELL"] as const).map((direction) => {
    const group = closed.filter((t) => t.direction === direction);
    const groupWins = winsOf(group);
    const groupLosses = lossesOf(group);
    const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + t.pnlNet, 0) : null;
    const gl = singleCurrency ? Math.abs(groupLosses.reduce((sum, t) => sum + t.pnlNet, 0)) : null;
    const groupDurations = group.map(durationMinOf).filter((d): d is number => d !== null);
    return {
      direction,
      trades: group.length,
      winRate: group.length > 0 ? dec(round2(groupWins.length / group.length)) : null,
      profitFactor: gp !== null && gl !== null && gl > 0 ? dec(round2(gp / gl)) : null,
      netPnl: singleCurrency ? dec(group.reduce((sum, t) => sum + t.pnlNet, 0)) : null,
      expectancyR: group.length > 0 ? dec(round2(mean(group.map((t) => t.rMultiple)) as number)) : null,
      avgDurationMin: groupDurations.length === 0 ? null : Math.round(mean(groupDurations) as number),
    };
  });

  // ── Time analytics (§14) — tradingDate weekday + entryAt UTC hours ─────
  const weekdayOf = (trade: AnalyticsTradeRow): number =>
    new Date(`${trade.tradingDate}T00:00:00Z`).getUTCDay();
  const hourBucketOf = (trade: AnalyticsTradeRow): number => {
    const hour = new Date(trade.entryAtIso).getUTCHours();
    const index = ANALYTICS_HOUR_BUCKETS.findIndex((bucket) => hour >= bucket.from && hour < bucket.to);
    return index === -1 ? ANALYTICS_HOUR_BUCKETS.length - 1 : index;
  };
  const heatmap: AnalyticsSuiteResponse["heatmap"] = [];
  for (const weekday of ANALYTICS_WEEKDAYS) {
    for (let bucket = 0; bucket < ANALYTICS_HOUR_BUCKETS.length; bucket += 1) {
      const cell = closed.filter((t) => weekdayOf(t) === weekday.index && hourBucketOf(t) === bucket);
      heatmap.push({
        weekday: weekday.index,
        hourBucket: bucket,
        trades: cell.length,
        wins: cell.filter((t) => t.pnlNet > 0).length,
        avgR: cell.length === 0 ? null : dec(cell.reduce((sum, t) => sum + t.rMultiple, 0) / cell.length),
      });
    }
  }
  const hours: AnalyticsBucket[] = ANALYTICS_HOUR_BUCKETS.map((bucket, index) =>
    bucketOf(String(index), bucket.label, closed.filter((t) => hourBucketOf(t) === index)),
  );
  const weekdays: AnalyticsBucket[] = ANALYTICS_WEEKDAYS.map((weekday) =>
    bucketOf(String(weekday.index), weekday.label, closed.filter((t) => weekdayOf(t) === weekday.index)),
  );
  const sessions: AnalyticsBucket[] = ANALYTIC_SESSIONS.map((session) => {
    const hourSet = new Set(session.hours);
    return bucketOf(
      session.key,
      session.label,
      closed.filter((t) => hourSet.has(new Date(t.entryAtIso).getUTCHours())),
    );
  });

  // ── Psychology (§19) ───────────────────────────────────────────────────
  // The journal does not yet own pre/post-trade emotion or confidence data
  // (honest seam): emotion buckets stay empty and confidence bands report
  // zero trades — the UI renders them with their n, never a fabricated rate.
  const emotionsBefore: AnalyticsBucket[] = [];
  const emotionsAfter: AnalyticsBucket[] = [];
  const confidenceBands: AnalyticsSuiteResponse["psychology"]["confidenceBands"] = (["1–2", "3", "4–5"] as const).map(
    (band) => ({ band, trades: 0, winRate: null, avgR: null }),
  );
  const tilt: AnalyticsSuiteResponse["psychology"]["tilt"] = [];
  {
    let lossStreak = 0;
    let previousRisk: number | null = null;
    for (const trade of closed) {
      const risk = trade.riskMoney ?? 0;
      const r = trade.rMultiple;
      const isSpike = lossStreak >= 2 && previousRisk !== null && previousRisk > 0 && risk > previousRisk * 1.2;
      tilt.push({
        tradeId: trade.id,
        date: trade.tradingDate,
        riskAmount: trade.riskAmountRaw ?? "0",
        rMultiple: trade.rMultipleRaw ?? "0",
        priorLossStreak: lossStreak,
        isSpike,
      });
      lossStreak = r < 0 ? lossStreak + 1 : 0;
      previousRisk = risk > 0 ? risk : previousRisk;
    }
  }

  // ── Trade quality + MAE/MFE (§16–§18) ──────────────────────────────────
  const planFollowed = {
    followed: closed.filter((t) => t.followedPlan === true).length,
    violated: closed.filter((t) => t.followedPlan === false).length,
    unknown: closed.filter((t) => t.followedPlan === null).length,
  };
  // Intratrade excursions (MFE/MAE) need high/low capture the journal does
  // not own yet (§34 honesty): unavailable — never fabricated.
  const excursionAvailable = false;
  const mfeHistogram: AnalyticsSuiteResponse["quality"]["mfeHistogram"] = [0, 0.5, 1, 1.5, 2, 3, 5].map(
    (edge, index, list) => {
      const next = list[index + 1];
      return {
        label: next === undefined ? "> +5R" : `+${edge}…+${next}R`,
        count: 0,
        center: null,
      };
    },
  );
  const maeHistogram: AnalyticsSuiteResponse["quality"]["maeHistogram"] = [0, 0.25, 0.5, 1, 1.5, 2].map(
    (edge, index, list) => {
      const next = list[index + 1];
      return {
        label: next === undefined ? "< -2R" : `-${edge}…-${next}R`,
        count: 0,
        center: null,
      };
    },
  );

  // ── Mistakes ledger (§20) — discipline domain not yet owned backend ────
  const mistakes: AnalyticsSuiteResponse["mistakes"] = { entries: [], violatingTrades: 0, totalR: dec(0) };

  // ── Economic-event context (§21) — canonical Calendar join (Phase 13) ──
  // Mock-parity correlation: impact ≠ LOW AND event currency === the
  // trade instrument's quote currency. Phase windows in minutes around
  // the release: DURING |Δ| ≤ 60, BEFORE −240 ≤ Δ < −60, AFTER
  // 60 < Δ ≤ 240 (Δ = entry − event); nearest event wins ties; trades
  // of uncataloged instruments or beyond ±4 h are unclassified.
  const calendarEvents = environment.calendarEvents ?? [];
  const eventDates = calendarEvents
    .map((event) => new Date(event.scheduledAtMs).toISOString().slice(0, 10))
    .sort();
  const calendarFrom = eventDates[0] ?? null;
  const calendarTo = eventDates[eventDates.length - 1] ?? null;

  const PHASES = [
    { key: "BEFORE", label: "Before event (4h→1h)" },
    { key: "DURING", label: "During release (±1h)" },
    { key: "AFTER", label: "After event (1h→4h)" },
    { key: "NONE", label: "No major event nearby" },
  ] as const;
  const phaseOf = (trade: AnalyticsTradeRow): string | null => {
    if (trade.quoteCurrency === null) return null;
    const entry = trade.entryAtMs;
    let best: { phase: string; distance: number } | null = null;
    for (const event of calendarEvents) {
      if (event.impact === "LOW") continue;
      if (event.currency !== trade.quoteCurrency) continue;
      const deltaMin = (entry - event.scheduledAtMs) / 60_000;
      const phase =
        Math.abs(deltaMin) <= 60
          ? "DURING"
          : deltaMin < -60 && deltaMin >= -240
            ? "BEFORE"
            : deltaMin > 60 && deltaMin <= 240
              ? "AFTER"
              : null;
      if (phase === null) continue;
      const distance = Math.abs(deltaMin);
      if (best === null || distance < best.distance) best = { phase, distance };
    }
    return best?.phase ?? "NONE";
  };
  // "Classified" = a non-NONE phase (§21 honesty).
  const classified = closed.filter((t) => {
    const phase = phaseOf(t);
    return phase !== null && phase !== "NONE";
  });
  const phases: AnalyticsBucket[] = PHASES.map((phase) =>
    bucketOf(phase.key, phase.label, closed.filter((t) => phaseOf(t) === phase.key)),
  );
  const byImpact: AnalyticsBucket[] = (["HIGH", "MEDIUM"] as const).map((impact) => {
    const impactEventIds = new Set(
      calendarEvents.filter((event) => event.impact === impact).map((event) => event.id),
    );
    // Trades within ±240 min of ANY event of this impact on their quote currency.
    const group = closed.filter((trade) => {
      if (trade.quoteCurrency === null) return false;
      const entry = trade.entryAtMs;
      return calendarEvents.some(
        (event) =>
          impactEventIds.has(event.id) &&
          event.currency === trade.quoteCurrency &&
          Math.abs(entry - event.scheduledAtMs) <= 240 * 60_000,
      );
    });
    return bucketOf(impact, `${impact} impact ±4h`, group);
  });

  // ── Advanced statistics (§24) ──────────────────────────────────────────
  const { skew, kurt } = moments(rValues);
  let longestWin = 0;
  let longestLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;
  const winStreaks: number[] = [];
  const lossStreaks: number[] = [];
  for (const trade of closed) {
    if (trade.pnlNet > 0) {
      currentWin += 1;
      if (currentLoss > 0) lossStreaks.push(currentLoss);
      currentLoss = 0;
      longestWin = Math.max(longestWin, currentWin);
    } else if (trade.pnlNet < 0) {
      currentLoss += 1;
      if (currentWin > 0) winStreaks.push(currentWin);
      currentWin = 0;
      longestLoss = Math.max(longestLoss, currentLoss);
    }
    // breakeven trades are transparent — they neither break nor extend a run.
  }
  if (currentWin > 0) winStreaks.push(currentWin);
  if (currentLoss > 0) lossStreaks.push(currentLoss);

  // ── Monte Carlo (§25) — seeded bootstrap of the filtered R list ────────
  const rng = mulberry32(MONTE_CARLO_SEED);
  const simulationCount = Math.max(100, Math.min(2000, sims));
  const finals: number[] = [];
  const maxDds: number[] = [];
  const paths: number[][] = Array.from({ length: Math.min(closed.length, MAX_MC_BANDS) }, () => []);
  for (let run = 0; run < simulationCount; run += 1) {
    let mcCum = 0;
    let mcPeak = 0;
    let mcDd = 0;
    for (let index = 0; index < closed.length; index += 1) {
      const sampled = rValues.length > 0 ? rValues[Math.floor(rng() * rValues.length)]! : 0;
      mcCum += sampled;
      mcPeak = Math.max(mcPeak, mcCum);
      mcDd = Math.min(mcDd, mcCum - mcPeak);
      if (index < paths.length) paths[index]!.push(mcCum);
    }
    finals.push(mcCum);
    maxDds.push(mcDd);
  }
  const bandAt = (values: number[]) => ({
    p05: dec(percentileOf(values, 5) ?? 0),
    p25: dec(percentileOf(values, 25) ?? 0),
    p50: dec(percentileOf(values, 50) ?? 0),
    p75: dec(percentileOf(values, 75) ?? 0),
    p95: dec(percentileOf(values, 95) ?? 0),
  });

  // ── Reports (§26) ──────────────────────────────────────────────────────
  const reportRow = (key: string, group: AnalyticsTradeRow[]): AnalyticsSuiteResponse["reports"]["daily"][number] => ({
    key,
    trades: group.length,
    netPnl: singleCurrency ? dec(group.reduce((sum, t) => sum + t.pnlNet, 0)) : null,
    r: dec(group.reduce((sum, t) => sum + t.rMultiple, 0)),
    winRate: group.length > 0 ? dec(round2(winsOf(group).length / group.length)) : null,
  });
  const dailyReports = [...dailyGroups.entries()].map(([key, group]) => reportRow(key, group));
  const weeklyGroups = new Map<string, AnalyticsTradeRow[]>();
  const monthlyGroups = new Map<string, AnalyticsTradeRow[]>();
  for (const trade of closed) {
    const weekKey = isoWeekOf(trade.tradingDate);
    weeklyGroups.set(weekKey, [...(weeklyGroups.get(weekKey) ?? []), trade]);
    const monthKey = trade.tradingDate.slice(0, 7);
    monthlyGroups.set(monthKey, [...(monthlyGroups.get(monthKey) ?? []), trade]);
  }

  // ── Server-detected anomalies (measured facts, never verdicts §49) ─────
  const anomalies: AnalyticsSuiteResponse["meta"]["anomalies"] = [];
  if (closed.length >= MIN_ANOMALY_SAMPLE) {
    // TAIL_LOSS — the worst 5 % of losing trades vs the total loss mass (R).
    const lossR = closed.map((t) => t.rMultiple).filter((r) => r < 0).sort((a, b) => a - b);
    const totalLossAbs = lossR.reduce((sum, r) => sum + Math.abs(r), 0);
    if (lossR.length >= 5 && totalLossAbs > 0) {
      const tailCount = Math.max(1, Math.round(lossR.length * 0.05));
      const tailAbs = lossR.slice(0, tailCount).reduce((sum, r) => sum + Math.abs(r), 0);
      const share = (tailAbs / totalLossAbs) * 100;
      if (share >= 40) {
        anomalies.push({
          code: "TAIL_LOSS",
          severity: share >= 55 ? "ALERT" : "WARN",
          message: `Tail loss: the ${tailCount} worst trades carry ${share.toFixed(0)} % of the total loss mass (${lossR.length} losers, Σ −${totalLossAbs.toFixed(1)} R).`,
          hint: "Open the Risk tab to see the drawdown those trades dug.",
        });
      }
    }

    // OVERTRADING — unusually busy days whose average daily R underperforms.
    const dayCounts = [...dailyGroups.values()].map((group) => group.length).sort((a, b) => a - b);
    if (dayCounts.length >= 8) {
      const medianCount = dayCounts[Math.floor(dayCounts.length / 2)]!;
      const busyThreshold = Math.max(3, medianCount * 2);
      const busyDays = [...dailyGroups.entries()].filter(([, group]) => group.length >= busyThreshold);
      const normalDays = [...dailyGroups.entries()].filter(([, group]) => group.length < busyThreshold);
      if (busyDays.length >= 1 && busyDays.length <= dayCounts.length * 0.3 && normalDays.length >= 2) {
        const avgRBusy = mean(busyDays.flatMap(([, group]) => group.map((t) => t.rMultiple)));
        const avgRNormal = mean(normalDays.flatMap(([, group]) => group.map((t) => t.rMultiple)));
        if (avgRBusy !== null && avgRNormal !== null && avgRBusy < 0 && avgRBusy < avgRNormal) {
          anomalies.push({
            code: "OVERTRADING",
            severity: "WARN",
            message: `Overtrading: ${busyDays.length} unusually busy days (≥ ${busyThreshold} trades vs median ${medianCount}) average ${avgRBusy.toFixed(2)} R, vs ${avgRNormal.toFixed(2)} R on normal days.`,
            hint: "Filter a busy day in the Time tab to inspect the sequence.",
          });
        }
      }
    }

    // LOSS_STREAK — longest consecutive losing run in chronological order.
    let streak = 0;
    let worstStreak = 0;
    for (const trade of closed) {
      if (trade.pnlNet < 0) {
        streak += 1;
        worstStreak = Math.max(worstStreak, streak);
      } else {
        streak = 0;
      }
    }
    if (worstStreak >= 5) {
      anomalies.push({
        code: "LOSS_STREAK",
        severity: worstStreak >= 8 ? "ALERT" : "INFO",
        message: `Loss streak: ${worstStreak} consecutive losing trades in the chronological sequence.`,
        hint: "Check the Psychology tab for the emotional state around the run.",
      });
    }
  }

  return {
    meta: {
      resolvedFrom: from === ALL_FROM ? (closed[0]?.tradingDate ?? from) : from,
      resolvedTo: to === ALL_TO ? (closed[closed.length - 1]?.tradingDate ?? to) : to,
      descriptor: descriptorParts.length === 0 ? "All accounts · all symbols" : descriptorParts.join(" · "),
      closedTrades: closed.length,
      openTradesExcluded,
      warnings,
      anomalies,
      singleCurrency,
    },
    // Account currencies are validated against the shared Currency enum at
    // creation — the DB string is cast, never re-validated here.
    currency: mainAccountCurrency(environment.accounts) as Currency,
    summary,
    equity,
    cumulativeR,
    rolling,
    dailyPnl,
    rHistogram,
    pnlHistogram,
    durationHistogram,
    drawdowns: drawdowns.slice(0, MAX_DRAWDOWN_PERIODS),
    risk: {
      tradesWithRisk: riskValues.length,
      avgRiskMoney: riskMean === null ? null : dec(riskMean),
      maxRiskMoney: riskValues.length === 0 ? null : dec(Math.max(...riskValues)),
      minRiskMoney: riskValues.length === 0 ? null : dec(Math.min(...riskValues)),
      riskDeviationPct:
        riskMean !== null && riskStd !== null && riskMean > 0
          ? dec(round2((riskStd / riskMean) * 100))
          : null,
      maxDailyRisk: dailyRisk.size === 0 ? null : dec(Math.max(...dailyRisk.values())),
      maxConcurrentPositions: maxConcurrent,
      plannedVsRealized,
    },
    strategies,
    symbols,
    assetClasses,
    directions,
    sessions,
    hours,
    weekdays,
    heatmap,
    psychology: { emotionsBefore, emotionsAfter, confidenceBands, tilt },
    quality: {
      planFollowed,
      excursionAvailable,
      mfe: { avgR: null, medianR: null, capturePct: null },
      mae: { avgR: null, medianR: null },
      scatter: closed.map((t) => ({
        id: t.id,
        symbol: t.instrumentSymbol ?? "?",
        mfeR: null,
        maeR: null,
        realizedR: dec(t.rMultiple),
      })),
      mfeHistogram,
      maeHistogram,
    },
    mistakes,
    events: {
      calendarCoverage: {
        from: calendarFrom,
        to: calendarTo,
        classifiedTrades: classified.length,
        unclassifiedTrades: closed.length - classified.length,
      },
      phases,
      byImpact,
    },
    advanced: {
      r: {
        mean: rMean === null ? null : dec(rMean),
        median: medianOf(rValues) === null ? null : dec(medianOf(rValues) as number),
        stddev: rStd === null ? null : dec(rStd),
        variance: rStd === null ? null : dec(rStd ** 2),
        skewness: skew === null ? null : dec(round2(skew)),
        kurtosis: kurt === null ? null : dec(round2(kurt)),
        p05: percentileOf(rValues, 5) === null ? null : dec(percentileOf(rValues, 5) as number),
        p25: percentileOf(rValues, 25) === null ? null : dec(percentileOf(rValues, 25) as number),
        p75: percentileOf(rValues, 75) === null ? null : dec(percentileOf(rValues, 75) as number),
        p95: percentileOf(rValues, 95) === null ? null : dec(percentileOf(rValues, 95) as number),
      },
      streaks: {
        longestWin,
        longestLoss,
        avgWin: winStreaks.length === 0 ? null : String(round1(mean(winStreaks) as number)),
        avgLoss: lossStreaks.length === 0 ? null : String(round1(mean(lossStreaks) as number)),
      },
    },
    monteCarlo: {
      simulations: simulationCount,
      tradesPerRun: closed.length,
      bands: paths.map((values, index) => ({ index, ...bandAt(values) })),
      finalR: bandAt(finals),
      maxDrawdownR: {
        p50: dec(percentileOf(maxDds, 50) ?? 0),
        p95: dec(percentileOf(maxDds, 95) ?? 0),
        worst: maxDds.length === 0 ? "0" : dec(Math.min(...maxDds)),
      },
      methodology:
        "Simulation, not a prediction: bootstrap resampling (with replacement) of the filtered trade R results, seeded and deterministic. Past sequence ≠ future sequence.",
    },
    reports: {
      daily: dailyReports,
      weekly: [...weeklyGroups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, group]) => reportRow(key, group)),
      monthly: [...monthlyGroups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, group]) => reportRow(key, group)),
    },
  };
}

/**
 * The suite's display currency: the DEFAULT account's currency (isDefault,
 * else the first account — the dashboard's "main account" convention).
 */
function mainAccountCurrency(accounts: AnalyticsAccountRow[]): string {
  const main = accounts.find((a) => a.isDefault) ?? accounts[0];
  return main?.currency ?? "USD";
}

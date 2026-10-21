/**
 * GET /stats/analytics-suite — the Analytics module's single dataset
 * definition, ported 1:1 from the mock store. Every tab renders the SAME
 * filtered closed-trade set; every aggregate is computed here so the client
 * only formats (product rule). Open positions are excluded from performance
 * stats and merely counted (real-time vs historical separation, §38).
 */
import { toDecimalString } from "../../shared/contracts";
import type {
  AnalyticsBucket,
  AnalyticsFilters,
  AnalyticsReportRow,
  AnalyticsSuiteResponse,
  HeatmapCell,
  TiltPoint,
} from "../../shared/contracts";
import {
  type InsightsEngineRow,
  computeDurations,
  computeStreakProfile,
  deriveInsights,
} from "../../shared/contracts";
import {
  bucketOf,
  dayDiff,
  hourBucketIndex,
  meanOf,
  medianOf,
  mulberry32,
  niceStep,
  num,
  percentileOf,
  resolvePeriodRange,
  round1,
  round2,
  shiftDayKey,
  stdOf,
  STATS_HOUR_BUCKETS,
  STATS_SESSIONS,
  STATS_WEEKDAYS,
  weekdayOf,
  emotionLabelOf,
  type StatsContext,
  type StatsTradeRow,
} from "./stats.helpers";

export function computeAnalyticsSuite(
  ctx: StatsContext,
  filters: AnalyticsFilters,
  sims: number,
): AnalyticsSuiteResponse {
  const { from, to } = resolvePeriodRange(filters, ctx.timezone);

  // ── The dataset ───────────────────────────────────────────────────────────
  const openTradesExcluded = ctx.trades.filter((t) => t.status === "OPEN").length;
  let closed = ctx.trades.filter(
    (t) => t.status === "CLOSED" && t.tradingDate >= from && t.tradingDate <= to,
  );

  if (filters.accountId) closed = closed.filter((t) => t.accountId === filters.accountId);
  if (filters.instrumentId) closed = closed.filter((t) => t.instrumentId === filters.instrumentId);
  if (filters.assetClass) {
    closed = closed.filter(
      (t) => ctx.instruments.get(t.instrumentId)?.assetClass === filters.assetClass,
    );
  }
  if (filters.strategyId === "none") closed = closed.filter((t) => t.strategyId === null);
  else if (filters.strategyId) closed = closed.filter((t) => t.strategyId === filters.strategyId);
  if (filters.direction) closed = closed.filter((t) => t.direction === filters.direction);
  if (filters.session) {
    const session = STATS_SESSIONS.find((s) => s.key === filters.session);
    const hourSet = new Set(session?.hours ?? []);
    closed = closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours()));
  }
  if (filters.emotion) closed = closed.filter((t) => t.emotionBefore === filters.emotion);
  if (filters.exitReason) closed = closed.filter((t) => t.exitReason === filters.exitReason);
  if (filters.tagId) {
    closed = closed.filter((t) => ctx.tradeTags.get(t.id)?.has(filters.tagId!) === true);
  }

  closed = [...closed].sort((a, b) =>
    (a.tradingDate + (a.exitAt ?? a.entryAt)).localeCompare(
      b.tradingDate + (b.exitAt ?? b.entryAt),
    ),
  );

  // ── Dataset meta (§5: WHAT DATASET AM I LOOKING AT?) ──────────────────────
  const accountIds = new Set(closed.map((t) => t.accountId));
  const scopeCurrencies = new Set(
    ctx.accounts.filter((a) => accountIds.has(a.id)).map((a) => a.currency),
  );
  const singleCurrency = scopeCurrencies.size <= 1;
  const descriptorParts: string[] = [];
  if (filters.accountId) {
    descriptorParts.push(ctx.accounts.find((a) => a.id === filters.accountId)?.name ?? "account");
  }
  if (filters.instrumentId) {
    descriptorParts.push(ctx.instruments.get(filters.instrumentId)?.symbol ?? "symbol");
  }
  if (filters.assetClass) descriptorParts.push(filters.assetClass);
  if (filters.strategyId === "none") descriptorParts.push("Out of playbook");
  else if (filters.strategyId) {
    descriptorParts.push(
      ctx.strategies.find((s) => s.id === filters.strategyId)?.name ?? "strategy",
    );
  }
  if (filters.direction) descriptorParts.push(filters.direction);
  if (filters.session) {
    descriptorParts.push(
      STATS_SESSIONS.find((s) => s.key === filters.session)?.label ?? filters.session,
    );
  }
  if (filters.emotion) descriptorParts.push(emotionLabelOf(filters.emotion));
  if (filters.exitReason) descriptorParts.push(filters.exitReason);
  const warnings: string[] = [];
  if (closed.length === 0) warnings.push("No closed trades match the current filters.");
  else if (closed.length < 10) {
    warnings.push("Small sample: rates and ratios below ~10 trades are statistically unreliable.");
  }
  if (!singleCurrency) {
    warnings.push("Multi-currency dataset: money figures are raw sums, not converted.");
  }

  // ── Metric helpers ────────────────────────────────────────────────────────
  const rOf = (t: StatsTradeRow): number => num(t.rMultiple);
  const pnlOf = (t: StatsTradeRow): number => num(t.pnlNet);
  const winsOf = (group: StatsTradeRow[]): StatsTradeRow[] => group.filter((t) => pnlOf(t) > 0);
  const lossesOf = (group: StatsTradeRow[]): StatsTradeRow[] => group.filter((t) => pnlOf(t) < 0);
  const durationMinOf = (t: StatsTradeRow): number | null => {
    if (t.exitAt === null) return null;
    return Math.max(
      0,
      Math.round((new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime()) / 60_000),
    );
  };

  // ── Summary (§6/§8) ───────────────────────────────────────────────────────
  const wins = winsOf(closed);
  const losses = lossesOf(closed);
  const breakeven = closed.length - wins.length - losses.length;
  const rValues = closed.map(rOf);
  const pnlValues = singleCurrency ? closed.map(pnlOf) : [];
  const grossProfit = singleCurrency ? wins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
  const grossLoss = singleCurrency ? Math.abs(losses.reduce((sum, t) => sum + pnlOf(t), 0)) : null;
  const netPnl = singleCurrency ? closed.reduce((sum, t) => sum + pnlOf(t), 0) : null;
  const avgWinR = meanOf(wins.map(rOf));
  const avgLossRMean = meanOf(losses.map(rOf));
  const avgLossR = avgLossRMean === null ? null : Math.abs(avgLossRMean);
  const payoffRatio = avgWinR !== null && avgLossR !== null && avgLossR > 0 ? avgWinR / avgLossR : null;

  // Cumulative R → R drawdown; equity curve → % drawdown.
  let cumR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  const cumByTrade: { trade: StatsTradeRow; cumR: number }[] = [];
  closed.forEach((trade) => {
    cumR += rOf(trade);
    if (cumR > peakR) peakR = cumR;
    maxDrawdownR = Math.min(maxDrawdownR, cumR - peakR);
    cumByTrade.push({ trade, cumR });
  });

  const baseBalance = singleCurrency
    ? ctx.accounts
        .filter((a) => accountIds.has(a.id))
        .reduce((sum, a) => sum + Number(a.startingBalance), 0)
    : 0;
  let runningPeakEquity = baseBalance;
  let maxDrawdownPct = 0;
  const equity: AnalyticsSuiteResponse["equity"] = [];
  if (singleCurrency && closed.length > 0) {
    let equityNow = baseBalance;
    for (const { trade } of cumByTrade) {
      equityNow += pnlOf(trade);
      runningPeakEquity = Math.max(runningPeakEquity, equityNow);
      const ddPct = runningPeakEquity > 0 ? ((equityNow - runningPeakEquity) / runningPeakEquity) * 100 : 0;
      maxDrawdownPct = Math.min(maxDrawdownPct, ddPct);
      equity.push({
        date: trade.tradingDate,
        equity: toDecimalString(round2(equityNow)),
        drawdownPct: toDecimalString(round2(ddPct)),
      });
    }
  }

  const recoveryFactor = netPnl !== null && maxDrawdownR < 0 ? netPnl / Math.abs(maxDrawdownR) : null;

  // Sharpe / Sortino on DAILY R sums, annualized √252, risk-free 0 (§8).
  let sharpe: number | null = null;
  let sortino: number | null = null;
  if (closed.length > 0) {
    const dailyMap = new Map<string, number>();
    for (const t of closed) dailyMap.set(t.tradingDate, (dailyMap.get(t.tradingDate) ?? 0) + rOf(t));
    const firstDate = closed[0]!.tradingDate;
    const lastDate = closed[closed.length - 1]!.tradingDate;
    const series: number[] = [];
    for (let key = firstDate; key <= lastDate; key = shiftDayKey(key)) {
      series.push(dailyMap.get(key) ?? 0);
      if (series.length > 400) break; // guard: dataset window cap
    }
    const dailyMean = meanOf(series);
    const dailyStd = stdOf(series);
    if (dailyMean !== null && dailyStd !== null && dailyStd > 0 && series.length >= 10) {
      sharpe = (dailyMean / dailyStd) * Math.sqrt(252);
    }
    const downside = Math.sqrt(meanOf(series.map((v) => Math.min(v, 0) ** 2)) ?? 0);
    if (dailyMean !== null && downside > 0 && series.length >= 10) {
      sortino = (dailyMean / downside) * Math.sqrt(252);
    }
  }
  const rMean = meanOf(rValues);
  const rStd = stdOf(rValues);
  const sqn = rMean !== null && rStd !== null && rStd > 0 && closed.length >= 10
    ? (rMean / rStd) * Math.sqrt(closed.length)
    : null;

  const durations = closed.map(durationMinOf).filter((d): d is number => d !== null);

  const summary: AnalyticsSuiteResponse["summary"] = {
    netPnl: netPnl === null ? null : toDecimalString(round2(netPnl)),
    grossProfit: grossProfit === null ? null : toDecimalString(round2(grossProfit)),
    grossLoss: grossLoss === null ? null : toDecimalString(round2(grossLoss)),
    winRate: closed.length > 0 ? toDecimalString(round2(wins.length / closed.length)) : null,
    lossRate: closed.length > 0 ? toDecimalString(round2(losses.length / closed.length)) : null,
    profitFactor: grossLoss !== null && grossLoss > 0 && grossProfit !== null
      ? toDecimalString(round2(grossProfit / grossLoss))
      : null,
    expectancyR: toDecimalString(round2(rMean ?? 0)),
    expectancyMoney: meanOf(pnlValues) === null ? null : toDecimalString(round2(meanOf(pnlValues)!)),
    avgR: rMean === null ? null : toDecimalString(round2(rMean)),
    medianR: medianOf(rValues) === null ? null : toDecimalString(round2(medianOf(rValues)!)),
    bestR: rValues.length === 0 ? null : toDecimalString(round2(Math.max(...rValues))),
    worstR: rValues.length === 0 ? null : toDecimalString(round2(Math.min(...rValues))),
    avgWinMoney: singleCurrency && wins.length > 0 ? toDecimalString(round2(meanOf(wins.map(pnlOf))!)) : null,
    avgLossMoney: singleCurrency && losses.length > 0 ? toDecimalString(round2(meanOf(losses.map(pnlOf))!)) : null,
    avgWinR: avgWinR === null ? null : toDecimalString(round2(avgWinR)),
    avgLossR: avgLossR === null ? null : toDecimalString(round2(avgLossR)),
    payoffRatio: payoffRatio === null ? null : toDecimalString(round2(payoffRatio)),
    maxDrawdownR: toDecimalString(round2(maxDrawdownR)),
    maxDrawdownPct: singleCurrency && closed.length > 0 ? toDecimalString(round2(maxDrawdownPct)) : null,
    recoveryFactor: recoveryFactor === null ? null : toDecimalString(round2(recoveryFactor)),
    sharpe: sharpe === null ? null : toDecimalString(round2(sharpe)),
    sortino: sortino === null ? null : toDecimalString(round2(sortino)),
    sqn: sqn === null ? null : toDecimalString(round2(sqn)),
    trades: closed.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: breakeven,
    avgDurationMin: durations.length > 0 ? Math.round(meanOf(durations)!) : null,
    sharpeNote:
      "Sharpe = mean daily ΣR ÷ stdev(daily ΣR) × √252, risk-free = 0. Daily series spans the full filter window (0R on no-trade days); null below 10 days.",
    sortinoNote:
      "Sortino uses the same daily ΣR series with downside deviation (√mean(min(0,d)²)), annualized √252 — penalizes only negative volatility.",
  };

  // ── Cumulative R + rolling (window 10) (§7/§9) ────────────────────────────
  const cumulativeR: AnalyticsSuiteResponse["cumulativeR"] = cumByTrade.map(
    ({ trade, cumR: value }, index) => ({
      index,
      date: trade.tradingDate,
      symbol: ctx.instruments.get(trade.instrumentId)?.symbol ?? "?",
      r: toDecimalString(round2(rOf(trade))),
      cumR: toDecimalString(round2(value)),
    }),
  );
  const ROLLING_WINDOW = 10;
  const rolling: AnalyticsSuiteResponse["rolling"] = cumByTrade.map((_, index) => {
    const start = Math.max(0, index - ROLLING_WINDOW + 1);
    const window = closed.slice(start, index + 1);
    const windowWins = winsOf(window).length;
    return {
      index,
      winRate: window.length === 0 ? null : toDecimalString(round2(windowWins / window.length)),
      avgR: toDecimalString(round2(meanOf(window.map(rOf)) ?? 0)),
    };
  });

  // ── Daily P&L (§7) ────────────────────────────────────────────────────────
  const dailyGroups = new Map<string, StatsTradeRow[]>();
  for (const trade of closed) {
    const group = dailyGroups.get(trade.tradingDate) ?? [];
    group.push(trade);
    dailyGroups.set(trade.tradingDate, group);
  }
  const dailyPnl: AnalyticsSuiteResponse["dailyPnl"] = [...dailyGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => ({
      date,
      pnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
      r: toDecimalString(round2(group.reduce((sum, t) => sum + rOf(t), 0))),
      trades: group.length,
      wins: winsOf(group).length,
    }));

  // ── Histograms (§7 distribution) ──────────────────────────────────────────
  const rHistogram: AnalyticsSuiteResponse["rHistogram"] = [];
  for (let edge = -2; edge < 4; edge += 0.5) {
    const lo = edge;
    const hi = edge + 0.5;
    const label = edge <= -2
      ? "≤ -2R"
      : edge >= 3.5
        ? "> +3.5R"
        : `${lo > 0 ? "+" : ""}${round1(lo)}R … ${hi > 0 ? "+" : ""}${round1(hi)}R`;
    const count = rValues.filter((r) =>
      edge <= -2 ? r <= -2 : edge >= 3.5 ? r > 3.5 : r > lo && r <= hi,
    ).length;
    rHistogram.push({ label, count, center: toDecimalString(round1((lo + hi) / 2)) });
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
        center: toDecimalString(round2(edge + step / 2)),
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
  const durationHistogram: AnalyticsSuiteResponse["durationHistogram"] = durationBuckets.map(
    (bucket) => ({
      label: bucket.label,
      count: durations.filter(bucket.test).length,
      center: null,
    }),
  );

  // ── Drawdown periods (§11) ────────────────────────────────────────────────
  const drawdowns: AnalyticsSuiteResponse["drawdowns"] = [];
  {
    let peak = baseBalance;
    let peakDate: string | null = null;
    let inDrawdown = false;
    let ddStart: string | null = null;
    let troughEquity = baseBalance;
    let troughDate: string | null = null;
    let troughCumR = 0;
    let diggers: { id: string; date: string; symbol: string; r: string }[] = [];
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
          peakEquity: toDecimalString(round2(peak)),
          bottomEquity: toDecimalString(round2(troughEquity)),
          drawdownMoney: drawdownMoney === null ? null : toDecimalString(round2(-Math.abs(drawdownMoney))),
          drawdownR: toDecimalString(round2(drawdownR)),
          durationDays: Math.max(0, dayDiff(ddStart, troughDate)),
          recoveryDays,
          recoveryTrades,
          trades: diggers.slice(0, 12),
        });
      }
    };
    let peakRCum = 0;
    let tradeIndexAtPeak = 0;
    for (let index = 0; index < cumByTrade.length; index += 1) {
      const { trade, cumR: value } = cumByTrade[index]!;
      const equityNow = baseBalance + closed.slice(0, index + 1).reduce((sum, t) => sum + pnlOf(t), 0);
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
        symbol: ctx.instruments.get(trade.instrumentId)?.symbol ?? "?",
        r: toDecimalString(round2(rOf(trade))),
      });
    }
    if (inDrawdown) flush(null, null, null); // still under water — honest nulls
    drawdowns.sort((a, b) => Number(a.drawdownR) - Number(b.drawdownR));
  }

  // ── Risk exposure (§10) ───────────────────────────────────────────────────
  const riskValues = closed.map((t) => num(t.riskAmount)).filter((v) => v > 0);
  const riskMean = meanOf(riskValues);
  const riskStd = stdOf(riskValues);
  const dailyRisk = new Map<string, number>();
  for (const t of closed) {
    const risk = num(t.riskAmount);
    if (risk > 0) dailyRisk.set(t.tradingDate, (dailyRisk.get(t.tradingDate) ?? 0) + risk);
  }
  let maxConcurrent = 0;
  for (const trade of closed) {
    const open = new Date(trade.entryAt).getTime();
    const close = trade.exitAt === null ? Number.POSITIVE_INFINITY : new Date(trade.exitAt).getTime();
    let concurrent = 0;
    for (const other of closed) {
      const otherOpen = new Date(other.entryAt).getTime();
      const otherClose = other.exitAt === null ? Number.POSITIVE_INFINITY : new Date(other.exitAt).getTime();
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
  const plannedTrades = closed.filter((t) => t.plannedRR !== null && !Number.isNaN(num(t.plannedRR)));
  const plannedVsRealized = [
    ...plannedBuckets.map((bucket) => {
      const group = plannedTrades.filter((t) => bucket.test(num(t.plannedRR)));
      return {
        bucket: bucket.label,
        trades: group.length,
        avgRealizedR: group.length === 0 ? null : toDecimalString(round2(meanOf(group.map(rOf))!)),
      };
    }),
    {
      bucket: "No plan",
      trades: closed.filter((t) => t.plannedRR === null).length,
      avgRealizedR:
        closed.filter((t) => t.plannedRR === null).length === 0
          ? null
          : toDecimalString(round2(meanOf(closed.filter((t) => t.plannedRR === null).map(rOf))!)),
    },
  ];

  // ── Strategy rows (§12) — factual comparisons, no ranking verdict ─────────
  const strategyGroup = (id: string | null): StatsTradeRow[] =>
    closed.filter((t) => (id === null ? t.strategyId === null : t.strategyId === id));
  const strategyIds = [...new Set(closed.map((t) => t.strategyId))];
  const strategies: AnalyticsSuiteResponse["strategies"] = strategyIds.map((id) => {
    const group = strategyGroup(id);
    const groupWins = winsOf(group);
    const groupLosses = lossesOf(group);
    const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
    const gl = singleCurrency ? Math.abs(groupLosses.reduce((sum, t) => sum + pnlOf(t), 0)) : null;
    let gCum = 0;
    let gPeak = 0;
    let gMaxDd = 0;
    for (const t of group) {
      gCum += rOf(t);
      gPeak = Math.max(gPeak, gCum);
      gMaxDd = Math.min(gMaxDd, gCum - gPeak);
    }
    const planned = group.filter((t) => t.followedPlan !== null);
    return {
      strategyId: id,
      name: id === null
        ? "Out of playbook"
        : ctx.strategies.find((s) => s.id === id)?.name ?? "Unknown strategy",
      trades: group.length,
      winRate: group.length > 0 ? toDecimalString(round2(groupWins.length / group.length)) : null,
      profitFactor: gp !== null && gl !== null && gl > 0 ? toDecimalString(round2(gp / gl)) : null,
      expectancyR: group.length > 0 ? toDecimalString(round2(meanOf(group.map(rOf))!)) : null,
      netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
      avgWinR: groupWins.length === 0 ? null : toDecimalString(round2(meanOf(groupWins.map(rOf))!)),
      avgLossR: groupLosses.length === 0 ? null : toDecimalString(round2(Math.abs(meanOf(groupLosses.map(rOf))!))),
      maxDrawdownR: toDecimalString(round2(gMaxDd)),
      avgDurationMin: (() => {
        const values = group.map(durationMinOf).filter((d): d is number => d !== null);
        return values.length === 0 ? null : Math.round(meanOf(values)!);
      })(),
      followedPlanPct: planned.length === 0
        ? null
        : toDecimalString(round2(group.filter((t) => t.followedPlan === true).length / planned.length)),
    };
  });

  // ── Symbol / asset-class rows (§13) ───────────────────────────────────────
  const instrumentOf = (t: StatsTradeRow) => ctx.instruments.get(t.instrumentId);
  const symbolRowOf = (key: string, group: StatsTradeRow[]): AnalyticsSuiteResponse["symbols"][number] => {
    const groupWins = winsOf(group);
    const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
    const gl = singleCurrency ? Math.abs(lossesOf(group).reduce((sum, t) => sum + pnlOf(t), 0)) : null;
    return {
      instrumentId: instrumentOf(group[0]!)?.id ?? key,
      symbol: instrumentOf(group[0]!)?.symbol ?? key,
      assetClass: instrumentOf(group[0]!)?.assetClass ?? "?",
      trades: group.length,
      winRate: group.length > 0 ? toDecimalString(round2(groupWins.length / group.length)) : null,
      profitFactor: gp !== null && gl !== null && gl > 0 ? toDecimalString(round2(gp / gl)) : null,
      netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
      avgR: group.length > 0 ? toDecimalString(round2(meanOf(group.map(rOf))!)) : null,
    };
  };
  const symbolsByInstrument = new Map<string, StatsTradeRow[]>();
  for (const trade of closed) {
    const group = symbolsByInstrument.get(trade.instrumentId) ?? [];
    group.push(trade);
    symbolsByInstrument.set(trade.instrumentId, group);
  }
  const symbols = [...symbolsByInstrument.values()].map((group) =>
    symbolRowOf(group[0]!.instrumentId, group),
  );
  const assetClassGroups = new Map<string, StatsTradeRow[]>();
  for (const trade of closed) {
    const key = instrumentOf(trade)?.assetClass ?? "?";
    const group = assetClassGroups.get(key) ?? [];
    group.push(trade);
    assetClassGroups.set(key, group);
  }
  const assetClasses = [...assetClassGroups.entries()].map(([key, group]) => symbolRowOf(key, group));

  // ── Direction rows (§15) ──────────────────────────────────────────────────
  const directions: AnalyticsSuiteResponse["directions"] = (["BUY", "SELL"] as const).map((direction) => {
    const group = closed.filter((t) => t.direction === direction);
    const groupWins = winsOf(group);
    const groupLosses = lossesOf(group);
    const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
    const gl = singleCurrency ? Math.abs(groupLosses.reduce((sum, t) => sum + pnlOf(t), 0)) : null;
    const groupDurations = group.map(durationMinOf).filter((d): d is number => d !== null);
    return {
      direction,
      trades: group.length,
      winRate: group.length > 0 ? toDecimalString(round2(groupWins.length / group.length)) : null,
      profitFactor: gp !== null && gl !== null && gl > 0 ? toDecimalString(round2(gp / gl)) : null,
      netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
      expectancyR: group.length > 0 ? toDecimalString(round2(meanOf(group.map(rOf))!)) : null,
      avgDurationMin: groupDurations.length === 0 ? null : Math.round(meanOf(groupDurations)!),
    };
  });

  // ── Time analytics (§14) ──────────────────────────────────────────────────
  const heatmap: HeatmapCell[] = [];
  for (const weekday of STATS_WEEKDAYS) {
    for (let bucket = 0; bucket < STATS_HOUR_BUCKETS.length; bucket += 1) {
      const cell = closed.filter((t) => weekdayOf(t) === weekday.index && hourBucketIndex(t) === bucket);
      heatmap.push({
        weekday: weekday.index,
        hourBucket: bucket,
        trades: cell.length,
        wins: cell.filter((t) => pnlOf(t) > 0).length,
        avgR: cell.length === 0
          ? null
          : toDecimalString(round2(cell.reduce((sum, t) => sum + rOf(t), 0) / cell.length)),
      });
    }
  }
  const hours: AnalyticsBucket[] = STATS_HOUR_BUCKETS.map((bucket, index) =>
    bucketOf(String(index), bucket.label, closed.filter((t) => hourBucketIndex(t) === index)),
  );
  const weekdays: AnalyticsBucket[] = STATS_WEEKDAYS.map((weekday) =>
    bucketOf(String(weekday.index), weekday.label, closed.filter((t) => weekdayOf(t) === weekday.index)),
  );
  const sessions: AnalyticsBucket[] = STATS_SESSIONS.map((session) => {
    const hourSet = new Set(session.hours);
    return bucketOf(
      session.key,
      session.label,
      closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours())),
    );
  });

  // ── Psychology (§19) ──────────────────────────────────────────────────────
  const emotionsBefore = [...new Set(closed.map((t) => t.emotionBefore).filter((e): e is string => e !== null))]
    .map((emotion) =>
      bucketOf(emotion, emotionLabelOf(emotion), closed.filter((t) => t.emotionBefore === emotion)),
    )
    .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));
  const emotionsAfter = [...new Set(closed.map((t) => t.emotionAfter).filter((e): e is string => e !== null))]
    .map((emotion) =>
      bucketOf(emotion, emotionLabelOf(emotion), closed.filter((t) => t.emotionAfter === emotion)),
    )
    .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));
  const confidenceBands = (["1–2", "3", "4–5"] as const).map((band) => {
    const group = closed.filter((t) =>
      band === "1–2"
        ? t.confidence !== null && t.confidence <= 2
        : band === "3"
          ? t.confidence === 3
          : t.confidence !== null && t.confidence >= 4,
    );
    return {
      band,
      trades: group.length,
      winRate: group.length > 0 ? toDecimalString(round2(winsOf(group).length / group.length)) : null,
      avgR: group.length > 0 ? toDecimalString(round2(meanOf(group.map(rOf))!)) : null,
    };
  });
  const tilt: TiltPoint[] = [];
  {
    let lossStreak = 0;
    let previousRisk: number | null = null;
    for (const trade of closed) {
      const risk = num(trade.riskAmount);
      const r = rOf(trade);
      const isSpike = lossStreak >= 2 && previousRisk !== null && previousRisk > 0 && risk > previousRisk * 1.2;
      tilt.push({
        tradeId: trade.id,
        date: trade.tradingDate,
        riskAmount: trade.riskAmount ?? "0",
        rMultiple: trade.rMultiple ?? "0",
        priorLossStreak: lossStreak,
        isSpike,
      });
      lossStreak = r < 0 ? lossStreak + 1 : 0;
      previousRisk = risk > 0 ? risk : previousRisk;
    }
  }

  // ── Trade quality + MAE/MFE (§16–§18) ─────────────────────────────────────
  const planFollowed = {
    followed: closed.filter((t) => t.followedPlan === true).length,
    violated: closed.filter((t) => t.followedPlan === false).length,
    unknown: closed.filter((t) => t.followedPlan === null).length,
  };
  const excursionTrades = closed.filter((t) => t.mfeR !== null || t.maeR !== null);
  const mfeValues = closed.map((t) => num(t.mfeR)).filter((v) => Number.isFinite(v));
  const maeValues = closed.map((t) => num(t.maeR)).filter((v) => Number.isFinite(v));
  const winningMfe = closed.filter((t) => t.mfeR !== null && pnlOf(t) > 0);
  const capturePct = (() => {
    const realized = winningMfe.reduce((sum, t) => sum + rOf(t), 0);
    const favorable = winningMfe.reduce((sum, t) => sum + num(t.mfeR), 0);
    if (favorable <= 0) return null;
    return round2(Math.max(0, realized / favorable));
  })();
  const mfeHistogram = [0, 0.5, 1, 1.5, 2, 3, 5].map((edge, index, list) => {
    const next = list[index + 1];
    const label = next === undefined ? "> +5R" : `+${edge}…+${next}R`;
    const count = mfeValues.filter((v) => (next === undefined ? v > edge : v > edge && v <= next)).length;
    return { label, count, center: null };
  });
  const maeHistogram = [0, 0.25, 0.5, 1, 1.5, 2].map((edge, index, list) => {
    const next = list[index + 1];
    const label = next === undefined ? "< -2R" : `-${edge}…-${next}R`;
    const count = maeValues.filter((v) => (next === undefined ? v < -edge : v <= -edge && v > -next)).length;
    return { label, count, center: null };
  });

  // ── Mistakes ledger ON the filtered set (§20) ─────────────────────────────
  const closedIds = new Set(closed.map((t) => t.id));
  const tradeMistakeByMistake = new Map<string, StatsTradeRow[]>();
  for (const m of ctx.tradeMistakes) {
    if (!closedIds.has(m.tradeId)) continue;
    const list = tradeMistakeByMistake.get(m.mistakeId) ?? [];
    const trade = closed.find((t) => t.id === m.tradeId);
    if (trade) list.push(trade);
    tradeMistakeByMistake.set(m.mistakeId, list);
  }
  const mistakeEntries: AnalyticsSuiteResponse["mistakes"]["entries"] = [];
  for (const mistake of ctx.mistakes) {
    const rows = tradeMistakeByMistake.get(mistake.id) ?? [];
    if (rows.length === 0) continue;
    const rCost = rows.reduce((sum, t) => sum + rOf(t), 0);
    const lastSeenAt = ctx.tradeMistakes
      .filter((m) => m.mistakeId === mistake.id && closedIds.has(m.tradeId))
      .reduce<string | null>(
        (latest, m) => (latest === null || m.createdAt > latest ? m.createdAt : latest),
        null,
      );
    mistakeEntries.push({
      mistakeId: mistake.id,
      key: mistake.key,
      label: mistake.label,
      category: mistake.category,
      severity: mistake.severity,
      count: rows.length,
      rCost: toDecimalString(round2(rCost)),
      lastSeenAt,
    });
  }
  mistakeEntries.sort(
    (a, b) => Math.abs(Number(b.rCost)) - Math.abs(Number(a.rCost)) || b.count - a.count,
  );
  const violatingTrades = closed.filter((t) =>
    ctx.tradeMistakes.some((m) => m.tradeId === t.id && closedIds.has(t.id)),
  );
  const mistakes: AnalyticsSuiteResponse["mistakes"] = {
    entries: mistakeEntries,
    violatingTrades: violatingTrades.length,
    totalR: toDecimalString(round2(violatingTrades.reduce((sum, t) => sum + rOf(t), 0))),
  };

  // ── Economic-event context (§21) ──────────────────────────────────────────
  const eventDates = ctx.ecoEvents.map((e) => e.scheduledAt.slice(0, 10)).sort();
  const calendarFrom = eventDates[0] ?? null;
  const calendarTo = eventDates[eventDates.length - 1] ?? null;
  const PHASES = [
    { key: "BEFORE", label: "Before event (4h→1h)" },
    { key: "DURING", label: "During release (±1h)" },
    { key: "AFTER", label: "After event (1h→4h)" },
    { key: "NONE", label: "No major event nearby" },
  ] as const;
  const phaseOf = (trade: StatsTradeRow): string | null => {
    const instrument = instrumentOf(trade);
    if (instrument === undefined) return null;
    const entry = new Date(trade.entryAt).getTime();
    let best: { phase: string; distance: number } | null = null;
    for (const event of ctx.ecoEvents) {
      if (event.impact === "LOW") continue;
      if (event.currency !== instrument.quoteCurrency) continue;
      const deltaMin = (entry - new Date(event.scheduledAt).getTime()) / 60_000;
      const phase =
        Math.abs(deltaMin) <= 60 ? "DURING"
        : deltaMin < -60 && deltaMin >= -240 ? "BEFORE"
        : deltaMin > 60 && deltaMin <= 240 ? "AFTER"
        : null;
      if (phase === null) continue;
      const distance = Math.abs(deltaMin);
      if (best === null || distance < best.distance) best = { phase, distance };
    }
    return best?.phase ?? "NONE";
  };
  // "Classified" = a non-NONE phase within calendar coverage (§21 honesty).
  const classified = closed.filter((t) => phaseOf(t) !== null && phaseOf(t) !== "NONE");
  const phases: AnalyticsBucket[] = PHASES.map((phase) =>
    bucketOf(phase.key, phase.label, closed.filter((t) => phaseOf(t) === phase.key)),
  );
  const byImpact: AnalyticsBucket[] = (["HIGH", "MEDIUM"] as const).map((impact) => {
    const impactEvents = ctx.ecoEvents.filter((e) => e.impact === impact);
    // Trades within ±240 min of ANY event of this impact on their quote currency.
    const group = closed.filter((trade) => {
      const instrument = instrumentOf(trade);
      if (instrument === undefined) return false;
      const entry = new Date(trade.entryAt).getTime();
      return impactEvents.some(
        (event) =>
          event.currency === instrument.quoteCurrency &&
          Math.abs(entry - new Date(event.scheduledAt).getTime()) <= 240 * 60_000,
      );
    });
    return bucketOf(impact, `${impact} impact ±4h`, group);
  });

  // ── Advanced statistics (§24) ─────────────────────────────────────────────
  const rSorted = [...rValues].sort((a, b) => a - b);
  const moments = (values: number[]): { skew: number | null; kurt: number | null } => {
    const m = meanOf(values);
    const s = stdOf(values);
    if (m === null || s === null || s === 0 || values.length < 3) return { skew: null, kurt: null };
    const m3 = meanOf(values.map((v) => (v - m) ** 3))!;
    const m4 = meanOf(values.map((v) => (v - m) ** 4))!;
    return { skew: m3 / s ** 3, kurt: m4 / s ** 4 - 3 };
  };
  const { skew, kurt } = moments(rValues);
  // Streak profile.
  let longestWin = 0;
  let longestLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;
  const winStreaks: number[] = [];
  const lossStreaks: number[] = [];
  for (const trade of closed) {
    if (pnlOf(trade) > 0) {
      currentWin += 1;
      if (currentLoss > 0) lossStreaks.push(currentLoss);
      currentLoss = 0;
      longestWin = Math.max(longestWin, currentWin);
    } else if (pnlOf(trade) < 0) {
      currentLoss += 1;
      if (currentWin > 0) winStreaks.push(currentWin);
      currentWin = 0;
      longestLoss = Math.max(longestLoss, currentLoss);
    }
  }
  if (currentWin > 0) winStreaks.push(currentWin);
  if (currentLoss > 0) lossStreaks.push(currentLoss);

  // ── Monte Carlo (§25) — bootstrap of the filtered R list ──────────────────
  const rng = mulberry32(20260930);
  const simulationCount = Math.max(100, Math.min(2000, sims));
  const finals: number[] = [];
  const maxDds: number[] = [];
  const paths: number[][] = Array.from({ length: Math.min(closed.length, 80) }, () => []);
  for (let run = 0; run < simulationCount; run += 1) {
    let cum = 0;
    let peak = 0;
    let dd = 0;
    for (let index = 0; index < closed.length; index += 1) {
      const sampled = rValues.length > 0 ? rValues[Math.floor(rng() * rValues.length)]! : 0;
      cum += sampled;
      peak = Math.max(peak, cum);
      dd = Math.min(dd, cum - peak);
      if (index < paths.length) paths[index]!.push(cum);
    }
    finals.push(cum);
    maxDds.push(dd);
  }
  const bandAt = (values: number[]): { p05: string; p25: string; p50: string; p75: string; p95: string } => ({
    p05: toDecimalString(round2(percentileOf(values, 5) ?? 0)),
    p25: toDecimalString(round2(percentileOf(values, 25) ?? 0)),
    p50: toDecimalString(round2(percentileOf(values, 50) ?? 0)),
    p75: toDecimalString(round2(percentileOf(values, 75) ?? 0)),
    p95: toDecimalString(round2(percentileOf(values, 95) ?? 0)),
  });

  // ── Reports (§26) ─────────────────────────────────────────────────────────
  const reportRow = (key: string, group: StatsTradeRow[]): AnalyticsReportRow => ({
    key,
    trades: group.length,
    netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
    r: toDecimalString(round2(group.reduce((sum, t) => sum + rOf(t), 0))),
    winRate: group.length > 0 ? toDecimalString(round2(winsOf(group).length / group.length)) : null,
  });
  const isoWeekOf = (dateKey: string): string => {
    const date = new Date(`${dateKey}T00:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  };
  const dailyReports = [...dailyGroups.entries()].map(([key, group]) => reportRow(key, group));
  const weeklyGroups = new Map<string, StatsTradeRow[]>();
  const monthlyGroups = new Map<string, StatsTradeRow[]>();
  for (const trade of closed) {
    const weekKey = isoWeekOf(trade.tradingDate);
    weeklyGroups.set(weekKey, [...(weeklyGroups.get(weekKey) ?? []), trade]);
    const monthKey = trade.tradingDate.slice(0, 7);
    monthlyGroups.set(monthKey, [...(monthlyGroups.get(monthKey) ?? []), trade]);
  }

  // ── Server-detected anomalies (measured facts, never verdicts) ────────────
  const anomalies: AnalyticsSuiteResponse["meta"]["anomalies"] = [];
  if (closed.length >= 10) {
    // TAIL_LOSS — the worst 5 % of losing trades vs the total loss mass (R).
    const lossR = closed.map(rOf).filter((r) => r < 0).sort((a, b) => a - b);
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
        const avgRBusy = meanOf(busyDays.flatMap(([, group]) => group.map(rOf)));
        const avgRNormal = meanOf(normalDays.flatMap(([, group]) => group.map(rOf)));
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
      if (pnlOf(trade) < 0) {
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

  // ── Phase 05 — insights/durations/streak profile (shared engine) ───────
  const insightsRows: InsightsEngineRow[] = closed.map((t) => ({
    id: t.id,
    instrumentSymbol: ctx.instruments.get(t.instrumentId)?.symbol ?? t.instrumentId,
    assetClass: ctx.instruments.get(t.instrumentId)?.assetClass ?? "?",
    strategyId: t.strategyId,
    direction: t.direction,
    tradingDate: t.tradingDate,
    entryAtMs: new Date(t.entryAt).getTime(),
    exitAtMs: t.exitAt === null ? null : new Date(t.exitAt).getTime(),
    pnlNet: num(t.pnlNet),
    rMultiple: num(t.rMultiple),
    riskMoney: t.riskAmount !== null && Number(t.riskAmount) > 0 ? Number(t.riskAmount) : null,
  }));

  return {
    meta: {
      resolvedFrom: from === "0000-01-01" ? (closed[0]?.tradingDate ?? from) : from,
      resolvedTo: to === "9999-12-31" ? (closed[closed.length - 1]?.tradingDate ?? to) : to,
      descriptor: descriptorParts.length === 0 ? "All accounts · all symbols" : descriptorParts.join(" · "),
      closedTrades: closed.length,
      openTradesExcluded,
      warnings,
      anomalies,
      singleCurrency,
    },
    currency: ctx.currency,
    summary,
    equity,
    cumulativeR,
    rolling,
    dailyPnl,
    rHistogram,
    pnlHistogram,
    durationHistogram,
    drawdowns: drawdowns.slice(0, 6),
    risk: {
      tradesWithRisk: riskValues.length,
      avgRiskMoney: riskMean === null ? null : toDecimalString(round2(riskMean)),
      maxRiskMoney: riskValues.length === 0 ? null : toDecimalString(round2(Math.max(...riskValues))),
      minRiskMoney: riskValues.length === 0 ? null : toDecimalString(round2(Math.min(...riskValues))),
      riskDeviationPct: riskMean !== null && riskStd !== null && riskMean > 0
        ? toDecimalString(round2((riskStd / riskMean) * 100))
        : null,
      maxDailyRisk: dailyRisk.size === 0 ? null : toDecimalString(round2(Math.max(...dailyRisk.values()))),
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
      excursionAvailable: excursionTrades.length > 0,
      mfe: {
        avgR: mfeValues.length === 0 ? null : toDecimalString(round2(meanOf(mfeValues)!)),
        medianR: medianOf(mfeValues) === null ? null : toDecimalString(round2(medianOf(mfeValues)!)),
        capturePct: capturePct === null ? null : toDecimalString(capturePct),
      },
      mae: {
        avgR: maeValues.length === 0 ? null : toDecimalString(round2(meanOf(maeValues)!)),
        medianR: medianOf(maeValues) === null ? null : toDecimalString(round2(medianOf(maeValues)!)),
      },
      scatter: closed.map((t) => ({
        id: t.id,
        symbol: instrumentOf(t)?.symbol ?? "?",
        mfeR: t.mfeR,
        maeR: t.maeR,
        realizedR: toDecimalString(round2(rOf(t))),
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
        mean: rMean === null ? null : toDecimalString(round2(rMean)),
        median: medianOf(rValues) === null ? null : toDecimalString(round2(medianOf(rValues)!)),
        stddev: rStd === null ? null : toDecimalString(round2(rStd)),
        variance: rStd === null ? null : toDecimalString(round2(rStd ** 2)),
        skewness: skew === null ? null : toDecimalString(round2(skew)),
        kurtosis: kurt === null ? null : toDecimalString(round2(kurt)),
        p05: percentileOf(rSorted, 5) === null ? null : toDecimalString(round2(percentileOf(rSorted, 5)!)),
        p25: percentileOf(rSorted, 25) === null ? null : toDecimalString(round2(percentileOf(rSorted, 25)!)),
        p75: percentileOf(rSorted, 75) === null ? null : toDecimalString(round2(percentileOf(rSorted, 75)!)),
        p95: percentileOf(rSorted, 95) === null ? null : toDecimalString(round2(percentileOf(rSorted, 95)!)),
      },
      streaks: {
        longestWin,
        longestLoss,
        avgWin: winStreaks.length === 0 ? null : toDecimalString(round1(meanOf(winStreaks)!)),
        avgLoss: lossStreaks.length === 0 ? null : toDecimalString(round1(meanOf(lossStreaks)!)),
      },
    },
    monteCarlo: {
      simulations: simulationCount,
      tradesPerRun: closed.length,
      bands: paths.map((values, index) => ({ index, ...bandAt(values) })),
      finalR: bandAt(finals),
      maxDrawdownR: {
        p50: toDecimalString(round2(percentileOf(maxDds, 50) ?? 0)),
        p95: toDecimalString(round2(percentileOf(maxDds, 95) ?? 0)),
        worst: maxDds.length === 0 ? "0" : toDecimalString(round2(Math.min(...maxDds))),
      },
      methodology:
        "Simulation, not a prediction: bootstrap resampling (with replacement) of the filtered trade R results, seeded and deterministic. Past sequence ≠ future sequence.",
    },
    reports: {
      daily: dailyReports,
      weekly: [...weeklyGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => reportRow(key, group)),
      monthly: [...monthlyGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => reportRow(key, group)),
    },
    // ── Phase 05 — insights/durations/streak profile (shared engine) ─────
    durations: computeDurations(insightsRows, singleCurrency),
    streakProfile: computeStreakProfile(insightsRows),
    insights: deriveInsights(insightsRows, { singleCurrency }),
  };
}

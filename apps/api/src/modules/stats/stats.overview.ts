/**
 * GET /stats/overview + GET /stats/analytics — pure computations ported
 * 1:1 from the mock store (the algorithms the frontend already renders).
 * Server-computed aggregates, decimal strings out; the client only formats.
 */
import { toDecimalString, toTradingDateKey } from "../../shared/contracts";
import type {
  AnalyticsBucket,
  AnalyticsResponse,
  GradeOutcomeCell,
  GradeOutcomeRow,
  HeatmapCell,
  SleepPoint,
  StatsOverviewResponse,
  TiltPoint,
} from "../../shared/contracts";
import {
  bucketOf,
  dayDiff,
  emotionLabelOf,
  hourBucketIndex,
  meanOf,
  num,
  round2,
  shiftDayKey,
  computeMistakeLedger,
  STATS_HOUR_BUCKETS,
  STATS_SESSIONS,
  STATS_WEEKDAYS,
  weekdayOf,
  type StatsContext,
  type StatsTradeRow,
} from "./stats.helpers";

/** Closed trades in chronological exit order (the analytics backbone). */
const closedSorted = (ctx: StatsContext): StatsTradeRow[] =>
  ctx.trades
    .filter((t) => t.status === "CLOSED")
    .sort(
      (a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt),
    );

// ── GET /stats/overview ─────────────────────────────────────────────────────

export function computeStatsOverview(ctx: StatsContext): StatsOverviewResponse {
  const closed = closedSorted(ctx);
  const startingBalance = num(ctx.startingBalance);

  const netPnl = closed.reduce((sum, t) => sum + num(t.pnlNet), 0);
  const wins = closed.filter((t) => num(t.pnlNet) > 0);
  const grossProfit = wins.reduce((sum, t) => sum + num(t.pnlNet), 0);
  const grossLoss = Math.abs(
    closed.filter((t) => num(t.pnlNet) < 0).reduce((sum, t) => sum + num(t.pnlNet), 0),
  );
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const expectancy = closed.length > 0
    ? closed.reduce((sum, t) => sum + num(t.rMultiple), 0) / closed.length
    : 0;
  const scored = ctx.dailyStats.filter((s) => s.disciplineScore !== null);
  const disciplineScore = scored.length > 0
    ? round2(scored.reduce((sum, s) => sum + num(s.disciplineScore), 0) / scored.length)
    : null;

  const byDay = new Map<string, { pnl: number; count: number }>();
  for (const trade of closed) {
    const entry = byDay.get(trade.tradingDate) ?? { pnl: 0, count: 0 };
    entry.pnl += num(trade.pnlNet);
    entry.count += 1;
    byDay.set(trade.tradingDate, entry);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  let equity = startingBalance;
  const equityCurve: StatsOverviewResponse["equityCurve"] = [];
  const dailyPnl: StatsOverviewResponse["dailyPnl"] = [];
  for (const [date, entry] of days) {
    equity += entry.pnl;
    equityCurve.push({ date, equity: toDecimalString(round2(equity)) });
    dailyPnl.push({ date, pnlNet: toDecimalString(round2(entry.pnl)), tradesCount: entry.count });
  }

  // ── Peak & max drawdown ───────────────────────────────────────────────────
  let runningPeak = startingBalance;
  let maxDdPct = 0;
  for (const point of equityCurve) {
    const eq = Number(point.equity);
    if (eq > runningPeak) runningPeak = eq;
    if (runningPeak > 0) {
      const ddPct = ((eq - runningPeak) / runningPeak) * 100;
      if (ddPct < maxDdPct) maxDdPct = ddPct;
    }
  }
  const equityPeak = Math.max(runningPeak, startingBalance);

  // ── Deltas WEEK VS WEEK (server-side date keys) ───────────────────────────
  const shiftDateKey = (offsetDays: number): string => {
    const shifted = new Date();
    shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
    return toTradingDateKey(shifted.toISOString(), ctx.timezone);
  };
  const currentStart = shiftDateKey(-6);
  const prevStart = shiftDateKey(-13);

  const aggregate = (trades: StatsTradeRow[]) => {
    const count = trades.length;
    const winCount = trades.filter((t) => num(t.pnlNet) > 0).length;
    const gp = trades.filter((t) => num(t.pnlNet) > 0).reduce((sum, t) => sum + num(t.pnlNet), 0);
    const gl = Math.abs(
      trades.filter((t) => num(t.pnlNet) < 0).reduce((sum, t) => sum + num(t.pnlNet), 0),
    );
    return {
      netPnl: trades.reduce((sum, t) => sum + num(t.pnlNet), 0),
      winRate: count > 0 ? (winCount / count) * 100 : null,
      profitFactor: gl > 0 ? gp / gl : null,
      expectancy: count > 0 ? trades.reduce((sum, t) => sum + num(t.rMultiple), 0) / count : null,
      hasData: count > 0,
    };
  };
  const cur = aggregate(closed.filter((t) => t.tradingDate >= currentStart));
  const prev = aggregate(
    closed.filter((t) => t.tradingDate >= prevStart && t.tradingDate < currentStart),
  );
  const avgDiscipline = (from: string, to: string): number | null => {
    const rows = ctx.dailyStats.filter(
      (s) => s.date >= from && s.date <= to && s.disciplineScore !== null,
    );
    if (rows.length === 0) return null;
    return rows.reduce((sum, s) => sum + num(s.disciplineScore), 0) / rows.length;
  };
  const curDisc = avgDiscipline(currentStart, shiftDateKey(0));
  const prevDisc = avgDiscipline(prevStart, currentStart);

  const rawDelta = (current: number | null, previous: number | null): StatsOverviewResponse["deltas"]["winRate"] => {
    if (current === null || previous === null) return { value: null, direction: "FLAT" };
    const diff = round2(current - previous);
    return {
      value: toDecimalString(diff),
      direction: diff > 0 ? "UP" : diff < 0 ? "DOWN" : "FLAT",
    };
  };
  const netPnlDelta: StatsOverviewResponse["deltas"]["netPnl"] =
    !cur.hasData || !prev.hasData || prev.netPnl === 0
      ? { value: null, direction: cur.netPnl > prev.netPnl && cur.hasData ? "UP" : "FLAT" }
      : rawDelta(cur.netPnl, prev.netPnl);

  // ── Per-KPI sparklines — WEEKLY buckets (last 8 weeks, Monday-anchored) ───
  const sparklines: StatsOverviewResponse["sparklines"] = {
    netPnl: [],
    winRate: [],
    profitFactor: [],
    expectancy: [],
    disciplineScore: [],
  };
  const WEEKS_SHOWN = 8;
  const weekStartKey = (dateKey: string): string => {
    const date = new Date(`${dateKey}T00:00:00Z`);
    const weekday = date.getUTCDay(); // 0 = Sunday
    const backToMonday = (weekday + 6) % 7;
    date.setUTCDate(date.getUTCDate() - backToMonday);
    return date.toISOString().slice(0, 10);
  };
  const weekBuckets = new Map<string, StatsTradeRow[]>();
  for (const trade of closed) {
    const key = weekStartKey(trade.tradingDate);
    const bucket = weekBuckets.get(key) ?? [];
    bucket.push(trade);
    weekBuckets.set(key, bucket);
  }
  const sortedWeekKeys = [...weekBuckets.keys()].sort();
  const shownWeeks = sortedWeekKeys.slice(-WEEKS_SHOWN);
  for (const weekKey of shownWeeks) {
    const weekTrades = weekBuckets.get(weekKey) ?? [];
    const weekWins = weekTrades.filter((t) => num(t.pnlNet) > 0);
    const gp = weekWins.reduce((sum, t) => sum + num(t.pnlNet), 0);
    const gl = Math.abs(
      weekTrades.filter((t) => num(t.pnlNet) < 0).reduce((sum, t) => sum + num(t.pnlNet), 0),
    );
    const weekDays = weekTrades.map((t) => t.tradingDate);
    const discScores = ctx.dailyStats
      .filter((s) => weekDays.includes(s.date) && s.disciplineScore !== null)
      .map((s) => num(s.disciplineScore));
    sparklines.netPnl.push(
      toDecimalString(round2(weekTrades.reduce((sum, t) => sum + num(t.pnlNet), 0))),
    );
    sparklines.winRate.push(
      toDecimalString(round2(weekTrades.length > 0 ? (weekWins.length / weekTrades.length) * 100 : 0)),
    );
    sparklines.profitFactor.push(toDecimalString(round2(gl > 0 ? gp / gl : 0)));
    sparklines.expectancy.push(
      toDecimalString(
        round2(
          weekTrades.length > 0
            ? weekTrades.reduce((sum, t) => sum + num(t.rMultiple), 0) / weekTrades.length
            : 0,
        ),
      ),
    );
    sparklines.disciplineScore.push(
      toDecimalString(
        round2(discScores.length > 0 ? discScores.reduce((sum, v) => sum + v, 0) / discScores.length : 0),
      ),
    );
  }

  // ── Discipline Saved / Hesitation Cost (settled ghost trades) ─────────────
  const savedGhosts = ctx.skippedTrades.filter(
    (g) => g.outcomeGuess === "WOULD_HAVE_LOST" && g.hypotheticalR !== null,
  );
  const rSaved = savedGhosts.reduce((sum, g) => sum + Math.abs(num(g.hypotheticalR)), 0);
  const hesitantGhosts = ctx.skippedTrades.filter(
    (g) => g.outcomeGuess === "WOULD_HAVE_WON" && g.hypotheticalR !== null,
  );
  const rCost = hesitantGhosts.reduce((sum, g) => sum + Math.abs(num(g.hypotheticalR)), 0);

  // ── Ghost trend — fear vs discipline skip counts, last 30 days ────────────
  const trendDays = 30;
  const ghostTrend: StatsOverviewResponse["ghostTrend"] = [];
  for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
    const date = shiftDateKey(-offset);
    const dayGhosts = ctx.skippedTrades.filter(
      (g) => toTradingDateKey(g.seenAt, ctx.timezone) === date,
    );
    ghostTrend.push({
      date,
      fear: dayGhosts.filter((g) => g.reason === "FEAR").length,
      discipline: dayGhosts.filter((g) => g.reason === "DISCIPLINE").length,
    });
  }

  // ── Weekly comparison bands (zero-filled 7-column strips) ─────────────────
  const weekBands = (fromOffset: number): StatsOverviewResponse["weeklyCompare"]["thisWeek"]["days"] =>
    Array.from({ length: 7 }, (_, i) => {
      const date = shiftDateKey(fromOffset + i);
      const found = dailyPnl.find((point) => point.date === date);
      return {
        date,
        pnlNet: found?.pnlNet ?? toDecimalString(0),
        tradesCount: found?.tradesCount ?? 0,
      };
    });
  const curCount = closed.filter((t) => t.tradingDate >= currentStart).length;
  const prevCount = closed.filter(
    (t) => t.tradingDate >= prevStart && t.tradingDate < currentStart,
  ).length;
  const weeklyCompare: StatsOverviewResponse["weeklyCompare"] = {
    thisWeek: {
      days: weekBands(-6),
      totalPnl: toDecimalString(round2(cur.netPnl)),
      winRate: cur.winRate === null ? null : toDecimalString(round2(cur.winRate)),
      tradesCount: curCount,
    },
    prevWeek: {
      days: weekBands(-13),
      totalPnl: toDecimalString(round2(prev.netPnl)),
      winRate: prev.winRate === null ? null : toDecimalString(round2(prev.winRate)),
      tradesCount: prevCount,
    },
    deltaPnlPct:
      !cur.hasData || !prev.hasData || prev.netPnl === 0
        ? null
        : toDecimalString(round2(((cur.netPnl - prev.netPnl) / Math.abs(prev.netPnl)) * 100)),
  };

  return {
    currency: ctx.currency,
    netPnl: toDecimalString(round2(netPnl)),
    winRate: toDecimalString(round2(winRate)),
    profitFactor: grossLoss > 0 ? toDecimalString(round2(grossProfit / grossLoss)) : null,
    expectancy: toDecimalString(round2(expectancy)),
    disciplineScore: disciplineScore === null ? null : toDecimalString(disciplineScore),
    equityCurve,
    dailyPnl,
    equityPeak: toDecimalString(round2(equityPeak)),
    maxDrawdownPct: toDecimalString(round2(maxDdPct)),
    deltas: {
      netPnl: netPnlDelta,
      winRate: rawDelta(cur.winRate, prev.winRate),
      profitFactor: rawDelta(cur.profitFactor, prev.profitFactor),
      expectancy: rawDelta(cur.expectancy, prev.expectancy),
      disciplineScore: rawDelta(curDisc, prevDisc),
    },
    deltaWindowDays: 7,
    sparklines,
    disciplineSaved: {
      rSaved: toDecimalString(round2(rSaved)),
      settledCount: savedGhosts.length,
    },
    hesitationCost: {
      rCost: toDecimalString(round2(rCost)),
      settledCount: hesitantGhosts.length,
    },
    ghostTrend,
    weeklyCompare,
  };
}

// ── GET /stats/analytics (Phase 9 aggregate) ────────────────────────────────

export function computeAnalytics(ctx: StatsContext): AnalyticsResponse {
  const closed = closedSorted(ctx);

  // ── Cards ─────────────────────────────────────────────────────────────────
  const wins = closed.filter((t) => num(t.pnlNet) > 0);
  const losses = closed.filter((t) => num(t.pnlNet) < 0);
  const grossProfit = wins.reduce((sum, t) => sum + num(t.pnlNet), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + num(t.pnlNet), 0));
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const expectancy = closed.length > 0
    ? closed.reduce((sum, t) => sum + num(t.rMultiple), 0) / closed.length
    : 0;
  const avgWinR = wins.length > 0 ? wins.reduce((sum, t) => sum + num(t.rMultiple), 0) / wins.length : null;
  const avgLossR = losses.length > 0
    ? Math.abs(losses.reduce((sum, t) => sum + num(t.rMultiple), 0) / losses.length)
    : null;
  const payoffRatio = avgWinR !== null && avgLossR !== null && avgLossR > 0 ? avgWinR / avgLossR : null;

  // Cumulative-R curve → max drawdown (R units) + recovery stats.
  let cumR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  let troughIndex = -1;
  const cumulative: number[] = [];
  closed.forEach((trade, index) => {
    cumR += num(trade.rMultiple);
    cumulative.push(cumR);
    if (cumR > peakR) peakR = cumR;
    const drawdown = cumR - peakR;
    if (drawdown < maxDrawdownR) {
      maxDrawdownR = drawdown;
      troughIndex = index;
    }
  });
  let recoveryTrades: number | null = null;
  let recoveryDays: number | null = null;
  if (troughIndex >= 0) {
    const recoveryIndex = cumulative.findIndex((value, index) => index > troughIndex && value >= peakR);
    if (recoveryIndex > troughIndex) {
      recoveryTrades = recoveryIndex - troughIndex;
      const from = new Date(`${closed[troughIndex]!.tradingDate}T00:00:00Z`).getTime();
      const to = new Date(`${closed[recoveryIndex]!.tradingDate}T00:00:00Z`).getTime();
      recoveryDays = Math.max(0, Math.round((to - from) / 86_400_000));
    }
  }

  // ── Heatmap + time buckets ────────────────────────────────────────────────
  const heatmap: HeatmapCell[] = [];
  for (const weekday of STATS_WEEKDAYS) {
    for (let bucket = 0; bucket < STATS_HOUR_BUCKETS.length; bucket += 1) {
      const cell = closed.filter((t) => weekdayOf(t) === weekday.index && hourBucketIndex(t) === bucket);
      heatmap.push({
        weekday: weekday.index,
        hourBucket: bucket,
        trades: cell.length,
        wins: cell.filter((t) => num(t.pnlNet) > 0).length,
        avgR: cell.length === 0
          ? null
          : toDecimalString(round2(cell.reduce((sum, t) => sum + num(t.rMultiple), 0) / cell.length)),
      });
    }
  }

  const hourBuckets: AnalyticsBucket[] = STATS_HOUR_BUCKETS.map((bucket, index) =>
    bucketOf(String(index), bucket.label, closed.filter((t) => hourBucketIndex(t) === index)),
  );
  const weekdayBuckets: AnalyticsBucket[] = STATS_WEEKDAYS.map((weekday) =>
    bucketOf(String(weekday.index), weekday.label, closed.filter((t) => weekdayOf(t) === weekday.index)),
  );
  const sessionBuckets: AnalyticsBucket[] = STATS_SESSIONS.map((session) => {
    const hourSet = new Set(session.hours);
    return bucketOf(
      session.key,
      session.label,
      closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours())),
    );
  });

  // ── Emotions (worst average R first — friction surfaces on top) ───────────
  const emotionBuckets = [...new Set(closed.map((t) => t.emotionBefore).filter((e): e is string => e !== null))]
    .map((emotion) => bucketOf(emotion, emotionLabelOf(emotion), closed.filter((t) => t.emotionBefore === emotion)))
    .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));

  // ── Decision grade × outcome matrix (A → F) ───────────────────────────────
  const gradeMatrix: GradeOutcomeRow[] = (["A", "B", "C", "D", "F"] as const).map((grade) => {
    const graded = closed.filter((t) => t.decisionGrade === grade);
    const cell = (group: StatsTradeRow[]): GradeOutcomeCell | null => {
      if (group.length === 0) return null;
      return {
        count: group.length,
        avgR: toDecimalString(round2(group.reduce((sum, t) => sum + num(t.rMultiple), 0) / group.length)),
      };
    };
    return {
      grade,
      win: cell(graded.filter((t) => num(t.pnlNet) > 0)),
      loss: cell(graded.filter((t) => num(t.pnlNet) < 0)),
    };
  });

  // ── Tilt timeline (loss streaks followed by size spikes) ──────────────────
  const tilt: TiltPoint[] = [];
  let lossStreak = 0;
  let previousRisk: number | null = null;
  for (const trade of closed) {
    const risk = num(trade.riskAmount);
    const r = num(trade.rMultiple);
    const isSpike =
      lossStreak >= 2 && previousRisk !== null && previousRisk > 0 && risk > previousRisk * 1.2;
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

  // ── Sleep scatter (nightly DailyStat rows with a known duration) ──────────
  const sleepScatter: SleepPoint[] = ctx.dailyStats
    .filter((s) => s.sleepHours !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      date: s.date,
      sleepHours: s.sleepHours ?? "0",
      pnlNet: s.pnlNet,
      tradesCount: s.tradesCount,
    }));

  // ── All-time mistake ledger + per-strategy R distributions ────────────────
  const mistakes = computeMistakeLedger(ctx, "0000-01-01").entries;
  const strategyDistributions: AnalyticsResponse["strategyDistributions"] = [];
  for (const strategy of ctx.strategies) {
    const rValues = closed
      .filter((t) => t.strategyId === strategy.id)
      .sort((a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt))
      .map((t) => t.rMultiple ?? "0");
    if (rValues.length === 0) continue;
    strategyDistributions.push({
      strategyId: strategy.id,
      name: strategy.name,
      grade: strategy.grade,
      color: strategy.color,
      rValues,
    });
  }

  return {
    currency: ctx.currency,
    cards: {
      winRate: toDecimalString(round2(winRate)),
      profitFactor: grossLoss > 0 ? toDecimalString(round2(grossProfit / grossLoss)) : null,
      expectancy: toDecimalString(round2(expectancy)),
      payoffRatio: payoffRatio === null ? null : toDecimalString(round2(payoffRatio)),
      maxDrawdownR: toDecimalString(round2(maxDrawdownR)),
      recoveryTrades,
      recoveryDays,
      sampleTrades: closed.length,
    },
    heatmap,
    hourBuckets,
    weekdayBuckets,
    sessionBuckets,
    emotionBuckets,
    gradeMatrix,
    tilt,
    sleepScatter,
    mistakes,
    strategyDistributions,
  };
}

// ── Shared small utilities ──────────────────────────────────────────────────

// Re-exported for the suite module (single import surface).
export { dayDiff, meanOf, shiftDayKey };

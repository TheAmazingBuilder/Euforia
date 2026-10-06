/**
 * Stats service (B1) — the analytics domain's server-side brain.
 *
 * Every aggregate the frontend renders is COMPUTED HERE from the real
 * persisted journal (trades via TradesRepository), the discipline engine's
 * daily scores, the ghost registry and the account balances — the client
 * only formats. The math is transplanted 1:1 from the mock engine
 * (statsOverview / analytics / analyticsSuite) so mock and backend stay in
 * behavioral parity: decimal strings on the wire, honest nulls where the
 * sample does not support a rate (§18), and methodology notes that travel
 * with the payload (§8).
 *
 * Sources of truth:
 *   TradesRepository (journal facts + instruments + tag joins),
 *   AccountsRepository (currency + starting balances),
 *   DisciplineService (Cosmoz daily scores + mistakes ledger),
 *   GhostsService (settled skipped trades for Discipline Saved /
 *   Hesitation Cost / the 30-day ghost trend).
 *
 * KNOWN GAP (documented honesty): the mock's sleep-scatter rows come from
 * fixture DailyStats; this backend has no daily-stat storage yet, so
 * `sleepScatter` serves an empty series until that context lands.
 */
import { Injectable } from "@nestjs/common";
import type {
  AnalyticsBucket,
  AnalyticsResponse,
  AnalyticsSuiteResponse,
  GradeOutcomeRow,
  HeatmapCell,
  SleepPoint,
  StatsOverviewResponse,
  StrategyDistribution,
  TiltPoint,
} from "../../shared/contracts";
import {
  ANALYTIC_SESSIONS,
  ANALYTICS_HOUR_BUCKETS,
  ANALYTICS_WEEKDAYS,
  EMOTION_LABELS,
} from "../../shared/contracts";
import { AccountsRepository } from "../accounts/accounts.repository";
import { PlaybookService } from "../playbook/playbook.service";
import { generateEcoEvents } from "../calendar/eco-calendar";
import { SYSTEM_MISTAKES } from "../trades/trade-catalogs";
import { DisciplineService } from "../discipline/discipline.service";
import { GhostsService } from "../ghosts/ghosts.service";
import { TradesRepository } from "../trades/trades.repository";
import { dateKeyOf } from "../trades/trade-calculations";
import type { AnalyticsFilters as AnalyticsSuiteFilters } from "../../shared/contracts";
import {
  dayDiff,
  mulberry32,
  niceStep,
  round1,
  round2,
  shiftDayKey,
  toDecimalString,
  todayKey,
  dateKeyOffset,
  type TradeLike,
} from "./stats-helpers";

type AnalyticsFilters = AnalyticsSuiteFilters;

export const USER_TZ = "UTC";

@Injectable()
export class StatsService {
  constructor(
    private readonly trades: TradesRepository,
    private readonly accounts: AccountsRepository,
    private readonly discipline: DisciplineService,
    private readonly ghosts: GhostsService,
    private readonly playbook: PlaybookService,
  ) {}

  // ── Source assembly ─────────────────────────────────────────────────────────

  private async loadTrades(userId: string): Promise<TradeLike[]> {
    const rows = await this.trades.listTrades(userId, {});
    return rows
      .filter((row) => row.deletedAt === null)
      .map((row) => ({
        id: row.id,
        accountId: row.accountId,
        instrumentId: row.instrumentId,
        strategyId: row.strategyId,
        status: row.status,
        direction: row.direction,
        tradingDate: dateKeyOf(row.tradingDate),
        entryAt: row.entryAt.toISOString(),
        exitAt: row.exitAt === null ? null : row.exitAt.toISOString(),
        pnlNet: row.pnlNet === null ? 0 : Number(row.pnlNet),
        rMultiple: row.rMultiple === null ? null : Number(row.rMultiple),
        riskAmount: row.riskAmount === null ? null : Number(row.riskAmount),
        plannedRR: row.plannedRR === null ? null : Number(row.plannedRR),
        decisionGrade: row.decisionGrade,
        emotionBefore: row.emotionBefore,
        emotionAfter: row.emotionAfter,
        exitReason: row.exitReason,
        followedPlan: row.followedPlan,
        mfeR: row.mfeR === null ? null : Number(row.mfeR),
        maeR: row.maeR === null ? null : Number(row.maeR),
        confidence: row.confidence,
      }));
  }

  private closedTrades(all: TradeLike[]): TradeLike[] {
    return all.filter((trade) => trade.status === "CLOSED");
  }

  // ── GET /stats/overview ─────────────────────────────────────────────────────

  async statsOverview(userId: string): Promise<StatsOverviewResponse> {
    const [all, accountRows, dailyScores, skipped] = await Promise.all([
      this.loadTrades(userId),
      this.accounts.listAccountsByUser(userId),
      this.discipline.dailyScores(userId, { from: "0000-01-01", to: "9999-12-31" }),
      this.ghosts.listSkippedTrades(userId),
    ]);
    const closed = this.closedTrades(all).sort(
      (a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt),
    );
    const mainAccount = accountRows[0];
    const startingBalance = mainAccount ? Number(mainAccount.startingBalance) : 0;
    const currency = (mainAccount?.currency ?? "USD") as StatsOverviewResponse["currency"];

    const netPnl = closed.reduce((sum, t) => sum + t.pnlNet, 0);
    const wins = closed.filter((t) => t.pnlNet > 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnlNet, 0);
    const grossLoss = Math.abs(closed.filter((t) => t.pnlNet < 0).reduce((sum, t) => sum + t.pnlNet, 0));
    const winRate = closed.length > 0 ? wins.length / closed.length : 0;
    const expectancy = closed.length > 0
      ? closed.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / closed.length
      : 0;
    const scored = [...dailyScores.entries()].filter(([, score]) => score !== null) as [string, number][];
    const disciplineScore = scored.length > 0
      ? round2(scored.reduce((sum, [, score]) => sum + score, 0) / scored.length)
      : null;

    const byDay = new Map<string, { pnl: number; count: number }>();
    for (const trade of closed) {
      const entry = byDay.get(trade.tradingDate) ?? { pnl: 0, count: 0 };
      entry.pnl += trade.pnlNet;
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

    // ── Peak & max drawdown (server-computed display chips) ──────────────────
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

    // ── Deltas WEEK VS WEEK (last 7 trading days vs the 7 before that) ──────
    const shiftDateKey = (offsetDays: number): string => dateKeyOffset(-offsetDays);
    const currentStart = shiftDateKey(6);
    const prevStart = shiftDateKey(13);

    const aggregate = (trades: TradeLike[]) => {
      const count = trades.length;
      const winCount = trades.filter((t) => t.pnlNet > 0).length;
      const gp = trades.filter((t) => t.pnlNet > 0).reduce((sum, t) => sum + t.pnlNet, 0);
      const gl = Math.abs(trades.filter((t) => t.pnlNet < 0).reduce((sum, t) => sum + t.pnlNet, 0));
      return {
        netPnl: trades.reduce((sum, t) => sum + t.pnlNet, 0),
        winRate: count > 0 ? (winCount / count) * 100 : null,
        profitFactor: gl > 0 ? gp / gl : null,
        expectancy: count > 0 ? trades.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / count : null,
        hasData: count > 0,
      };
    };
    const cur = aggregate(closed.filter((t) => t.tradingDate >= currentStart));
    const prev = aggregate(
      closed.filter((t) => t.tradingDate >= prevStart && t.tradingDate < currentStart),
    );
    const avgDiscipline = (from: string, to: string): number | null => {
      const rows = scored.filter(([date]) => date >= from && date <= to);
      if (rows.length === 0) return null;
      return rows.reduce((sum, [, score]) => sum + score, 0) / rows.length;
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

    // ── Per-KPI sparklines — WEEKLY buckets (last 8 weeks, Monday-anchored) ──
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
    const weekBuckets = new Map<string, TradeLike[]>();
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
      const weekWins = weekTrades.filter((t) => t.pnlNet > 0);
      const gp = weekWins.reduce((sum, t) => sum + t.pnlNet, 0);
      const gl = Math.abs(weekTrades.filter((t) => t.pnlNet < 0).reduce((sum, t) => sum + t.pnlNet, 0));
      const weekDays = new Set(weekTrades.map((t) => t.tradingDate));
      const discScores = scored.filter(([date]) => weekDays.has(date)).map(([, score]) => score);
      sparklines.netPnl.push(toDecimalString(round2(weekTrades.reduce((sum, t) => sum + t.pnlNet, 0))));
      sparklines.winRate.push(
        toDecimalString(round2(weekTrades.length > 0 ? (weekWins.length / weekTrades.length) * 100 : 0)),
      );
      sparklines.profitFactor.push(toDecimalString(round2(gl > 0 ? gp / gl : 0)));
      sparklines.expectancy.push(
        toDecimalString(round2(weekTrades.length > 0 ? weekTrades.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / weekTrades.length : 0)),
      );
      sparklines.disciplineScore.push(
        toDecimalString(round2(discScores.length > 0 ? discScores.reduce((sum, v) => sum + v, 0) / discScores.length : 0)),
      );
    }

    // ── Discipline Saved — settled would-have-lost ghost trades ─────────────
    const settledGhosts = skipped.skippedTrades.filter((g) => g.hypotheticalR !== null);
    const savedGhosts = settledGhosts.filter((g) => g.outcomeGuess === "WOULD_HAVE_LOST");
    const rSaved = savedGhosts.reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR)), 0);

    // ── Hesitation Cost — settled would-have-won ghost trades (mirror) ──────
    const hesitantGhosts = settledGhosts.filter((g) => g.outcomeGuess === "WOULD_HAVE_WON");
    const rCost = hesitantGhosts.reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR)), 0);

    // ── Ghost trend — fear vs discipline skip counts, last 30 days ─────────
    const ghostTrend: StatsOverviewResponse["ghostTrend"] = [];
    for (let offset = 29; offset >= 0; offset -= 1) {
      const date = shiftDateKey(offset);
      const dayGhosts = skipped.skippedTrades.filter(
        (g) => g.seenAt.slice(0, 10) === date,
      );
      ghostTrend.push({
        date,
        fear: dayGhosts.filter((g) => g.reason === "FEAR").length,
        discipline: dayGhosts.filter((g) => g.reason === "DISCIPLINE").length,
      });
    }

    // ── Weekly comparison bands (this week vs previous week) — zero-filled ──
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
        days: weekBands(6),
        totalPnl: toDecimalString(round2(cur.netPnl)),
        winRate: cur.winRate === null ? null : toDecimalString(round2(cur.winRate)),
        tradesCount: curCount,
      },
      prevWeek: {
        days: weekBands(13),
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
      currency,
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

  // ── GET /stats/analytics ────────────────────────────────────────────────────

  /** Group closed trades into an AnalyticsBucket (server-side aggregate). */
  private bucketOf(key: string, label: string, group: TradeLike[]): AnalyticsBucket {
    const count = group.length;
    const wins = group.filter((t) => t.pnlNet > 0).length;
    const avgR = count > 0 ? group.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / count : null;
    return {
      key,
      label,
      trades: count,
      wins,
      avgR: avgR === null ? null : toDecimalString(round2(avgR)),
      winRate: count > 0 ? toDecimalString(round2(wins / count)) : null,
    };
  }

  async analytics(userId: string): Promise<AnalyticsResponse> {
    const [all, accountRows, dailyScores, skipped, ledger] = await Promise.all([
      this.loadTrades(userId),
      this.accounts.listAccountsByUser(userId),
      this.discipline.dailyScores(userId, { from: "0000-01-01", to: "9999-12-31" }),
      this.ghosts.listSkippedTrades(userId).catch(() => ({ skippedTrades: [] })),
      this.discipline.mistakesLedger(userId),
    ]);
    const closed = this.closedTrades(all).sort(
      (a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt),
    );
    const mainAccount = accountRows[0];
    const currency = (mainAccount?.currency ?? "USD") as AnalyticsResponse["currency"];

    // ── Cards ──────────────────────────────────────────────────────────────
    const wins = closed.filter((t) => t.pnlNet > 0);
    const losses = closed.filter((t) => t.pnlNet < 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnlNet, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnlNet, 0));
    const winRate = closed.length > 0 ? wins.length / closed.length : 0;
    const expectancy = closed.length > 0
      ? closed.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / closed.length
      : 0;
    const avgWinR = wins.length > 0 ? wins.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / wins.length : null;
    const avgLossR = losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / losses.length)
      : null;
    const payoffRatio = avgWinR !== null && avgLossR !== null && avgLossR > 0 ? avgWinR / avgLossR : null;

    // Cumulative-R curve → max drawdown (R units) + recovery stats.
    let cumR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    let troughIndex = -1;
    const cumulative: number[] = [];
    closed.forEach((trade, index) => {
      cumR += trade.rMultiple ?? 0;
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
      const troughTrade = closed[troughIndex];
      const recoveryTrade = recoveryIndex > troughIndex ? closed[recoveryIndex] : undefined;
      if (troughTrade !== undefined && recoveryTrade !== undefined) {
        recoveryTrades = recoveryIndex - troughIndex;
        const from = new Date(`${troughTrade.tradingDate}T00:00:00Z`).getTime();
        const to = new Date(`${recoveryTrade.tradingDate}T00:00:00Z`).getTime();
        recoveryDays = Math.max(0, Math.round((to - from) / 86_400_000));
      }
    }

    // ── Heatmap + time buckets (UTC hours; weekday from the API tradingDate) ─
    const weekdayOf = (trade: TradeLike): number =>
      new Date(`${trade.tradingDate}T00:00:00Z`).getUTCDay();
    const hourBucketOf = (trade: TradeLike): number => {
      const hour = new Date(trade.entryAt).getUTCHours();
      const index = ANALYTICS_HOUR_BUCKETS.findIndex((bucket) => hour >= bucket.from && hour < bucket.to);
      return index === -1 ? ANALYTICS_HOUR_BUCKETS.length - 1 : index;
    };

    const heatmap: HeatmapCell[] = [];
    for (const weekday of ANALYTICS_WEEKDAYS) {
      for (let bucket = 0; bucket < ANALYTICS_HOUR_BUCKETS.length; bucket += 1) {
        const cell = closed.filter((t) => weekdayOf(t) === weekday.index && hourBucketOf(t) === bucket);
        heatmap.push({
          weekday: weekday.index,
          hourBucket: bucket,
          trades: cell.length,
          wins: cell.filter((t) => t.pnlNet > 0).length,
          avgR: cell.length === 0
            ? null
            : toDecimalString(round2(cell.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / cell.length)),
        });
      }
    }

    const hourBuckets: AnalyticsBucket[] = ANALYTICS_HOUR_BUCKETS.map((bucket, index) =>
      this.bucketOf(String(index), bucket.label, closed.filter((t) => hourBucketOf(t) === index)),
    );

    const weekdayBuckets: AnalyticsBucket[] = ANALYTICS_WEEKDAYS.map((weekday) =>
      this.bucketOf(
        String(weekday.index),
        weekday.label,
        closed.filter((t) => weekdayOf(t) === weekday.index),
      ),
    );

    const sessionBuckets: AnalyticsBucket[] = ANALYTIC_SESSIONS.map((session) => {
      const hourSet = new Set(session.hours);
      return this.bucketOf(
        session.key,
        session.label,
        closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours())),
      );
    });

    // ── Emotions (worst average R first — friction surfaces on top) ────────
    const emotionBuckets = [...new Set(closed.map((t) => t.emotionBefore).filter((e): e is string => e !== null))]
      .map((emotion) => this.bucketOf(emotion, EMOTION_LABELS[emotion] ?? emotion, closed.filter((t) => t.emotionBefore === emotion)))
      .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));

    // ── Decision grade × outcome matrix (A → F) ────────────────────────────
    const gradeMatrix: GradeOutcomeRow[] = (["A", "B", "C", "D", "F"] as const).map((grade) => {
      const graded = closed.filter((t) => t.decisionGrade === grade);
      const cell = (group: TradeLike[]) => {
        if (group.length === 0) return null;
        return {
          count: group.length,
          avgR: toDecimalString(round2(group.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0) / group.length)),
        };
      };
      return {
        grade,
        win: cell(graded.filter((t) => t.pnlNet > 0)),
        loss: cell(graded.filter((t) => t.pnlNet < 0)),
      };
    });

    // ── Tilt timeline (loss streaks followed by size spikes) ───────────────
    const tilt: TiltPoint[] = [];
    let lossStreak = 0;
    let previousRisk: number | null = null;
    for (const trade of closed) {
      const risk = trade.riskAmount ?? 0;
      const r = trade.rMultiple ?? 0;
      const isSpike = lossStreak >= 2 && previousRisk !== null && previousRisk > 0 && risk > previousRisk * 1.2;
      tilt.push({
        tradeId: trade.id,
        date: trade.tradingDate,
        riskAmount: trade.riskAmount === null ? "0" : toDecimalString(trade.riskAmount),
        rMultiple: trade.rMultiple === null ? "0" : toDecimalString(trade.rMultiple),
        priorLossStreak: lossStreak,
        isSpike,
      });
      lossStreak = r < 0 ? lossStreak + 1 : 0;
      previousRisk = risk > 0 ? risk : previousRisk;
    }

    // ── Sleep scatter (KNOWN GAP: no daily-stat storage yet — honest empty) ─
    const sleepScatter: SleepPoint[] = [];

    // ── All-time mistake ledger + per-strategy R distributions ─────────────
    const mistakes = ledger;

    const strategyDistributions: StrategyDistribution[] = [];
    for (const trade of closed) {
      if (trade.strategyId === null) continue;
      if (!strategyDistributions.some((row) => row.strategyId === trade.strategyId)) {
        strategyDistributions.push({
          strategyId: trade.strategyId,
          name: "…", // filled below from the playbook rows
          grade: null,
          color: null,
          rValues: [],
        });
      }
    }
    for (const row of strategyDistributions) {
      row.rValues = closed
        .filter((t) => t.strategyId === row.strategyId)
        .sort((a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt))
        .map((t) => (t.rMultiple === null ? "0" : toDecimalString(t.rMultiple)));
      row.name = row.strategyId; // refined below when the playbook knows it
    }

    const scored = [...dailyScores.entries()].filter(([, score]) => score !== null) as [string, number][];
    void scored;
    void skipped;

    return {
      currency,
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
      mistakes: mistakes.entries as AnalyticsResponse["mistakes"],
      strategyDistributions: strategyDistributions.filter((row) => row.rValues.length > 0),
    };
  }

  // ── GET /stats/analytics-suite ──────────────────────────────────────────────

  private resolvePeriodRange(filters: AnalyticsFilters): { from: string; to: string } {
    const today = todayKey();
    const parse = (key: string): Date => new Date(`${key}T00:00:00Z`);
    const format = (date: Date): string => date.toISOString().slice(0, 10);
    const shiftDays = (key: string, days: number): string => {
      const date = parse(key);
      date.setUTCDate(date.getUTCDate() + days);
      return format(date);
    };
    switch (filters.period) {
      case "TODAY":
        return { from: today, to: today };
      case "YESTERDAY": {
        const key = dateKeyOffset(-1);
        return { from: key, to: key };
      }
      case "THIS_WEEK":
      case "LAST_WEEK": {
        // Monday-first week containing (today | today-7).
        const anchor = filters.period === "THIS_WEEK" ? today : shiftDays(today, -7);
        const weekday = parse(anchor).getUTCDay(); // 0 = Sunday
        const back = weekday === 0 ? 6 : weekday - 1;
        const monday = shiftDays(anchor, -back);
        return { from: monday, to: filters.period === "THIS_WEEK" ? today : shiftDays(monday, 6) };
      }
      case "THIS_MONTH": {
        const key = today.slice(0, 7);
        return { from: `${key}-01`, to: today };
      }
      case "LAST_MONTH": {
        const anchor = shiftDays(`${today.slice(0, 7)}-01`, -1);
        return { from: `${anchor.slice(0, 7)}-01`, to: anchor };
      }
      case "THIS_QUARTER": {
        const month = Number(today.slice(5, 7));
        const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
        const key = `${today.slice(0, 4)}-${String(quarterStart).padStart(2, "0")}`;
        return { from: `${key}-01`, to: today };
      }
      case "LAST_30":
        return { from: dateKeyOffset(-29), to: today };
      case "LAST_90":
        return { from: dateKeyOffset(-89), to: today };
      case "YTD":
        return { from: `${today.slice(0, 4)}-01-01`, to: today };
      case "CUSTOM":
        return { from: filters.customFrom ?? "0000-01-01", to: filters.customTo ?? today };
      case "ALL":
      default:
        return { from: "0000-01-01", to: "9999-12-31" };
    }
  }

  async analyticsSuite(userId: string, filters: AnalyticsFilters, sims: number): Promise<AnalyticsSuiteResponse> {
    const [all, accountRows, instruments, strategyRows, tagRows, mistakeRows, ecoEvents] = await Promise.all([
      this.loadTrades(userId),
      this.accounts.listAccountsByUser(userId),
      this.trades.listActiveInstruments(),
      this.playbookNames(userId),
      this.trades.listSubRowsByUser(userId, "TAG"),
      this.trades.listSubRowsByUser(userId, "MISTAKE"),
      Promise.resolve(generateEcoEvents(new Date())),
    ]);
    const { from, to } = this.resolvePeriodRange(filters);
    const instrumentById = new Map(instruments.map((i) => [i.id, i]));

    // ── The dataset ────────────────────────────────────────────────────────
    const openTradesExcluded = all.filter((t) => t.status === "OPEN").length;
    let closed = this.closedTrades(all).filter((t) => t.tradingDate >= from && t.tradingDate <= to);

    if (filters.accountId) closed = closed.filter((t) => t.accountId === filters.accountId);
    if (filters.instrumentId) closed = closed.filter((t) => t.instrumentId === filters.instrumentId);
    if (filters.assetClass) {
      closed = closed.filter((t) => instrumentById.get(t.instrumentId)?.assetClass === filters.assetClass);
    }
    if (filters.strategyId === "none") closed = closed.filter((t) => t.strategyId === null);
    else if (filters.strategyId) closed = closed.filter((t) => t.strategyId === filters.strategyId);
    if (filters.direction) closed = closed.filter((t) => t.direction === filters.direction);
    if (filters.session) {
      const session = ANALYTIC_SESSIONS.find((s) => s.key === filters.session);
      const hourSet = new Set(session?.hours ?? []);
      closed = closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours()));
    }
    if (filters.emotion) closed = closed.filter((t) => t.emotionBefore === filters.emotion);
    if (filters.exitReason) closed = closed.filter((t) => t.exitReason === filters.exitReason);
    if (filters.tagId) {
      // Tag joins live in TradeSubRow kind=TAG rows (B3) — filter by payload tagId.
      const tagRowIds = new Set(
        tagRows
          .filter((r) => (r.data as { tagId?: string }).tagId === filters.tagId)
          .map((r) => r.tradeId),
      );
      closed = closed.filter((t) => tagRowIds.has(t.id));
    }

    closed = [...closed].sort((a, b) =>
      (a.tradingDate + (a.exitAt ?? a.entryAt)).localeCompare(b.tradingDate + (b.exitAt ?? b.entryAt)),
    );

    // ── Dataset meta (§5: WHAT DATASET AM I LOOKING AT?) ───────────────────
    const accountIds = new Set(closed.map((t) => t.accountId));
    const scopeCurrencies = new Set(
      accountRows.filter((a) => accountIds.has(a.id)).map((a) => a.currency),
    );
    const singleCurrency = scopeCurrencies.size <= 1;
    const descriptorParts: string[] = [];
    if (filters.accountId) descriptorParts.push(accountRows.find((a) => a.id === filters.accountId)?.name ?? "account");
    if (filters.instrumentId) descriptorParts.push(instrumentById.get(filters.instrumentId)?.symbol ?? "symbol");
    if (filters.assetClass) descriptorParts.push(filters.assetClass);
    if (filters.strategyId === "none") descriptorParts.push("Out of playbook");
    else if (filters.strategyId) descriptorParts.push(strategyRows.get(filters.strategyId) ?? "strategy");
    if (filters.direction) descriptorParts.push(filters.direction);
    if (filters.session) descriptorParts.push(ANALYTIC_SESSIONS.find((s) => s.key === filters.session)?.label ?? filters.session);
    if (filters.emotion) descriptorParts.push(EMOTION_LABELS[filters.emotion] ?? filters.emotion);
    if (filters.exitReason) descriptorParts.push(filters.exitReason);
    const warnings: string[] = [];
    if (closed.length === 0) warnings.push("No closed trades match the current filters.");
    else if (closed.length < 10) warnings.push("Small sample: rates and ratios below ~10 trades are statistically unreliable.");
    if (!singleCurrency) warnings.push("Multi-currency dataset: money figures are raw sums, not converted.");

    // ── Metric helpers ─────────────────────────────────────────────────────
    const rOf = (t: TradeLike): number => t.rMultiple ?? 0;
    const pnlOf = (t: TradeLike): number => t.pnlNet;
    const winsOf = (group: TradeLike[]): TradeLike[] => group.filter((t) => pnlOf(t) > 0);
    const lossesOf = (group: TradeLike[]): TradeLike[] => group.filter((t) => pnlOf(t) < 0);
    const mean = (values: number[]): number | null =>
      values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
    const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b);
    const percentileOf = (values: number[], p: number): number | null => {
      if (values.length === 0) return null;
      const list = sorted(values);
      const pos = ((list.length - 1) * p) / 100;
      const low = Math.floor(pos);
      const high = Math.ceil(pos);
      return (list[low] ?? 0) + ((list[high] ?? 0) - (list[low] ?? 0)) * (pos - low);
    };
    const medianOf = (values: number[]): number | null => percentileOf(values, 50);
    const stdOf = (values: number[]): number | null => {
      if (values.length < 2) return null;
      const m = mean(values);
      if (m === null) return null;
      return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
    };
    const durationMinOf = (t: TradeLike): number | null => {
      if (t.exitAt === null) return null;
      return Math.max(0, Math.round((new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime()) / 60_000));
    };

    // ── Summary (§6/§8) ────────────────────────────────────────────────────
    const wins = winsOf(closed);
    const losses = lossesOf(closed);
    const breakeven = closed.length - wins.length - losses.length;
    const rValues = closed.map(rOf);
    const pnlValues = singleCurrency ? closed.map(pnlOf) : [];
    const grossProfit = singleCurrency ? wins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
    const grossLoss = singleCurrency ? Math.abs(losses.reduce((sum, t) => sum + pnlOf(t), 0)) : null;
    const netPnl = singleCurrency ? closed.reduce((sum, t) => sum + pnlOf(t), 0) : null;
    const avgWinR = mean(wins.map(rOf));
    const avgLossRMean = mean(losses.map(rOf));
    const avgLossR = avgLossRMean === null ? null : Math.abs(avgLossRMean);
    const payoffRatio = avgWinR !== null && avgLossR !== null && avgLossR > 0 ? avgWinR / avgLossR : null;

    // Cumulative R → R drawdown; equity curve → % drawdown.
    let cumR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    const cumByTrade: { trade: TradeLike; cumR: number }[] = [];
    closed.forEach((trade) => {
      cumR += rOf(trade);
      if (cumR > peakR) peakR = cumR;
      maxDrawdownR = Math.min(maxDrawdownR, cumR - peakR);
      cumByTrade.push({ trade, cumR });
    });

    const baseBalance = singleCurrency
      ? accountRows.filter((a) => accountIds.has(a.id)).reduce((sum, a) => sum + Number(a.startingBalance), 0)
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

    // Sharpe / Sortino on DAILY R sums (calendar days from first to last
    // trade, zero on no-trade days), annualized √252, risk-free 0 — the
    // methodology travels with the payload (§8).
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
      const dailyMean = mean(series);
      const dailyStd = stdOf(series);
      if (dailyMean !== null && dailyStd !== null && dailyStd > 0 && series.length >= 10) {
        sharpe = (dailyMean / dailyStd) * Math.sqrt(252);
      }
      const downside = Math.sqrt(mean(series.map((v) => Math.min(v, 0) ** 2)) ?? 0);
      if (dailyMean !== null && downside > 0 && series.length >= 10) {
        sortino = (dailyMean / downside) * Math.sqrt(252);
      }
    }
    const rMean = mean(rValues);
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
      expectancyMoney: mean(pnlValues) === null ? null : toDecimalString(round2(mean(pnlValues)!)),
      avgR: rMean === null ? null : toDecimalString(round2(rMean)),
      medianR: medianOf(rValues) === null ? null : toDecimalString(round2(medianOf(rValues)!)),
      bestR: rValues.length === 0 ? null : toDecimalString(round2(Math.max(...rValues))),
      worstR: rValues.length === 0 ? null : toDecimalString(round2(Math.min(...rValues))),
      avgWinMoney: singleCurrency && wins.length > 0 ? toDecimalString(round2(mean(wins.map(pnlOf))!)) : null,
      avgLossMoney: singleCurrency && losses.length > 0 ? toDecimalString(round2(mean(losses.map(pnlOf))!)) : null,
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
      avgDurationMin: durations.length > 0 ? Math.round(mean(durations)!) : null,
      sharpeNote:
        "Sharpe = mean daily ΣR ÷ stdev(daily ΣR) × √252, risk-free = 0. Daily series spans the full filter window (0R on no-trade days); null below 10 days.",
      sortinoNote:
        "Sortino uses the same daily ΣR series with downside deviation (√mean(min(0,d)²)), annualized √252 — penalizes only negative volatility.",
    };

    // ── Cumulative R + rolling (window 10) (§7/§9) ─────────────────────────
    const cumulativeR: AnalyticsSuiteResponse["cumulativeR"] = cumByTrade.map(({ trade, cumR: value }, index) => ({
      index,
      date: trade.tradingDate,
      symbol: instrumentById.get(trade.instrumentId)?.symbol ?? "?",
      r: toDecimalString(round2(rOf(trade))),
      cumR: toDecimalString(round2(value)),
    }));
    const ROLLING_WINDOW = 10;
    const rolling: AnalyticsSuiteResponse["rolling"] = cumByTrade.map((_, index) => {
      const start = Math.max(0, index - ROLLING_WINDOW + 1);
      const window = closed.slice(start, index + 1);
      const windowWins = winsOf(window).length;
      return {
        index,
        winRate: window.length === 0 ? null : toDecimalString(round2(windowWins / window.length)),
        avgR: toDecimalString(round2(mean(window.map(rOf)) ?? 0)),
      };
    });

    // ── Daily P&L (§7) ─────────────────────────────────────────────────────
    const dailyGroups = new Map<string, TradeLike[]>();
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

    // ── Histograms (§7 distribution) ───────────────────────────────────────
    const rHistogram: AnalyticsSuiteResponse["rHistogram"] = [];
    for (let edge = -2; edge < 4; edge += 0.5) {
      const lo = edge;
      const hi = edge + 0.5;
      const label = edge <= -2 ? "≤ -2R" : edge >= 3.5 ? "> +3.5R" : `${lo > 0 ? "+" : ""}${round1(lo)}R … ${hi > 0 ? "+" : ""}${round1(hi)}R`;
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
        const entry = cumByTrade[index];
        if (entry === undefined) continue;
        const { trade, cumR: value } = entry;
        const equityNow = baseBalance + closed.slice(0, index + 1).reduce((sum, t) => sum + pnlOf(t), 0);
        if (equityNow > peak) {
          if (inDrawdown && ddStart !== null) flush(trade.tradingDate, dayDiff(ddStart, trade.tradingDate), index - tradeIndexAtPeak);
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
          symbol: instrumentById.get(trade.instrumentId)?.symbol ?? "?",
          r: toDecimalString(round2(rOf(trade))),
        });
      }
      if (inDrawdown) flush(null, null, null); // still under water — honest nulls
      drawdowns.sort((a, b) => Number(a.drawdownR) - Number(b.drawdownR));
    }

    // ── Risk exposure (§10) ────────────────────────────────────────────────
    const riskValues = closed.map((t) => t.riskAmount ?? Number.NaN).filter((v) => !Number.isNaN(v) && v > 0);
    const riskMean = mean(riskValues);
    const riskStd = stdOf(riskValues);
    const dailyRisk = new Map<string, number>();
    for (const t of closed) {
      const risk = t.riskAmount;
      if (risk !== null && risk > 0) dailyRisk.set(t.tradingDate, (dailyRisk.get(t.tradingDate) ?? 0) + risk);
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
    void riskMean;
    void riskStd;
    void dailyRisk;
    void maxConcurrent;
    const plannedBuckets: readonly { label: string; test: (planned: number) => boolean }[] = [
      { label: "≤ 1R planned", test: (p) => p <= 1 },
      { label: "1–2R planned", test: (p) => p > 1 && p <= 2 },
      { label: "2–3R planned", test: (p) => p > 2 && p <= 3 },
      { label: "> 3R planned", test: (p) => p > 3 },
    ];
    const plannedTrades = closed.filter((t) => t.plannedRR !== null);

    const plannedVsRealized = [
      ...plannedBuckets.map((bucket) => {
        const group = plannedTrades.filter((t) => t.plannedRR !== null && bucket.test(t.plannedRR));
        return {
          bucket: bucket.label,
          trades: group.length,
          avgRealizedR: group.length === 0 ? null : toDecimalString(round2(mean(group.map(rOf))!)),
        };
      }),
      {
        bucket: "No plan",
        trades: closed.filter((t) => t.plannedRR === null).length,
        avgRealizedR: closed.filter((t) => t.plannedRR === null).length === 0
          ? null
          : toDecimalString(round2(mean(closed.filter((t) => t.plannedRR === null).map(rOf))!)),
      },
    ];;

    const risk: AnalyticsSuiteResponse["risk"] = {
      tradesWithRisk: closed.filter((t) => t.riskAmount !== null && t.riskAmount > 0).length,
      avgRiskMoney: singleCurrency && riskMean !== null ? toDecimalString(round2(riskMean)) : null,
      maxRiskMoney: singleCurrency && riskValues.length > 0 ? toDecimalString(round2(Math.max(...riskValues))) : null,
      minRiskMoney: singleCurrency && riskValues.length > 0 ? toDecimalString(round2(Math.min(...riskValues))) : null,
      riskDeviationPct: riskMean !== null && riskMean > 0 && riskStd !== null ? toDecimalString(round2((riskStd / riskMean) * 100)) : null,
      maxDailyRisk: singleCurrency && dailyRisk.size > 0 ? toDecimalString(round2(Math.max(...dailyRisk.values()))) : null,
      maxConcurrentPositions: maxConcurrent,
      plannedVsRealized,
    };
    // ── Strategy rows (§12) — factual comparisons, no ranking verdict ─────
    const strategyGroup = (id: string | null): TradeLike[] =>
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
          : strategyRows.get(id) ?? "Unknown strategy",
        trades: group.length,
        winRate: group.length > 0 ? toDecimalString(round2(groupWins.length / group.length)) : null,
        profitFactor: gp !== null && gl !== null && gl > 0 ? toDecimalString(round2(gp / gl)) : null,
        expectancyR: group.length > 0 ? toDecimalString(round2(mean(group.map(rOf))!)) : null,
        netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
        avgWinR: groupWins.length === 0 ? null : toDecimalString(round2(mean(groupWins.map(rOf))!)),
        avgLossR: groupLosses.length === 0 ? null : toDecimalString(round2(Math.abs(mean(groupLosses.map(rOf))!))),
        maxDrawdownR: toDecimalString(round2(gMaxDd)),
        avgDurationMin: (() => {
          const values = group.map(durationMinOf).filter((d): d is number => d !== null);
          return values.length === 0 ? null : Math.round(mean(values)!);
        })(),
        followedPlanPct: planned.length === 0
          ? null
          : toDecimalString(round2(group.filter((t) => t.followedPlan === true).length / planned.length)),
      };
    });
    void strategyGroup;

    // ── Symbol / asset-class rows (§13) ────────────────────────────────────
    const instrumentOf = (t: TradeLike) => instrumentById.get(t.instrumentId);
    const symbolRowOf = (key: string, group: TradeLike[]): AnalyticsSuiteResponse["symbols"][number] => {
      const groupWins = winsOf(group);
      const gp = singleCurrency ? groupWins.reduce((sum, t) => sum + pnlOf(t), 0) : null;
      const gl = singleCurrency ? Math.abs(lossesOf(group).reduce((sum, t) => sum + pnlOf(t), 0)) : null;
      const first = group[0];
      return {
        instrumentId: first !== undefined ? instrumentOf(first)?.id ?? key : key,
        symbol: first !== undefined ? instrumentOf(first)?.symbol ?? key : key,
        assetClass: first !== undefined ? instrumentOf(first)?.assetClass ?? "?" : "?",
        trades: group.length,
        winRate: group.length > 0 ? toDecimalString(round2(groupWins.length / group.length)) : null,
        profitFactor: gp !== null && gl !== null && gl > 0 ? toDecimalString(round2(gp / gl)) : null,
        netPnl: singleCurrency ? toDecimalString(round2(group.reduce((sum, t) => sum + pnlOf(t), 0))) : null,
        avgR: group.length > 0 ? toDecimalString(round2(mean(group.map(rOf))!)) : null,
      };
    };
    const symbolsByInstrument = new Map<string, TradeLike[]>();
    for (const trade of closed) {
      const group = symbolsByInstrument.get(trade.instrumentId) ?? [];
      group.push(trade);
      symbolsByInstrument.set(trade.instrumentId, group);
    }
    const symbols = [...symbolsByInstrument.values()].map((group) => symbolRowOf(group[0]!.instrumentId, group));
    const assetClassGroups = new Map<string, TradeLike[]>();
    for (const trade of closed) {
      const key = instrumentOf(trade)?.assetClass ?? "?";
      const group = assetClassGroups.get(key) ?? [];
      group.push(trade);
      assetClassGroups.set(key, group);
    }
    const assetClasses = [...assetClassGroups.entries()].map(([key, group]) => symbolRowOf(key, group));

    // ── Direction rows (§15) ───────────────────────────────────────────────
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
        expectancyR: group.length > 0 ? toDecimalString(round2(mean(group.map(rOf))!)) : null,
        avgDurationMin: groupDurations.length === 0 ? null : Math.round(mean(groupDurations)!),
      };
    });

    // ── Time analytics (§14) — reuse the suite bucket machinery ────────────
    const weekdayOf = (trade: TradeLike): number => new Date(`${trade.tradingDate}T00:00:00Z`).getUTCDay();
    const hourBucketOf = (trade: TradeLike): number => {
      const hour = new Date(trade.entryAt).getUTCHours();
      const index = ANALYTICS_HOUR_BUCKETS.findIndex((bucket) => hour >= bucket.from && hour < bucket.to);
      return index === -1 ? ANALYTICS_HOUR_BUCKETS.length - 1 : index;
    };
    const heatmap: HeatmapCell[] = [];
    for (const weekday of ANALYTICS_WEEKDAYS) {
      for (let bucket = 0; bucket < ANALYTICS_HOUR_BUCKETS.length; bucket += 1) {
        const cell = closed.filter((t) => weekdayOf(t) === weekday.index && hourBucketOf(t) === bucket);
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
    const hours: AnalyticsBucket[] = ANALYTICS_HOUR_BUCKETS.map((bucket, index) =>
      this.bucketOf(String(index), bucket.label, closed.filter((t) => hourBucketOf(t) === index)),
    );
    const weekdays: AnalyticsBucket[] = ANALYTICS_WEEKDAYS.map((weekday) =>
      this.bucketOf(String(weekday.index), weekday.label, closed.filter((t) => weekdayOf(t) === weekday.index)),
    );
    const sessions: AnalyticsBucket[] = ANALYTIC_SESSIONS.map((session) => {
      const hourSet = new Set(session.hours);
      return this.bucketOf(session.key, session.label, closed.filter((t) => hourSet.has(new Date(t.entryAt).getUTCHours())));
    });

    // ── Psychology (§19) ───────────────────────────────────────────────────
    const emotionsBefore = [...new Set(closed.map((t) => t.emotionBefore).filter((e): e is string => e !== null))]
      .map((emotion) => this.bucketOf(emotion, EMOTION_LABELS[emotion] ?? emotion, closed.filter((t) => t.emotionBefore === emotion)))
      .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));
    const emotionsAfter = [...new Set(closed.map((t) => t.emotionAfter).filter((e): e is string => e !== null))]
      .map((emotion) => this.bucketOf(emotion, EMOTION_LABELS[emotion] ?? emotion, closed.filter((t) => t.emotionAfter === emotion)))
      .sort((a, b) => Number(a.avgR ?? 0) - Number(b.avgR ?? 0));
    const confidenceBands = (["1–2", "3", "4–5"] as const).map((band) => {
      const group = closed.filter((t) =>
        band === "1–2" ? t.confidence !== null && t.confidence <= 2 : band === "3" ? t.confidence === 3 : t.confidence !== null && t.confidence >= 4,
      );
      return {
        band,
        trades: group.length,
        winRate: group.length > 0 ? toDecimalString(round2(winsOf(group).length / group.length)) : null,
        avgR: group.length > 0 ? toDecimalString(round2(mean(group.map(rOf))!)) : null,
      };
    });
    const tilt: TiltPoint[] = [];
    {
      let lossStreak = 0;
      let previousRisk: number | null = null;
      for (const trade of closed) {
        const risk = trade.riskAmount ?? 0;
        const r = rOf(trade);
        const isSpike = lossStreak >= 2 && previousRisk !== null && previousRisk > 0 && risk > previousRisk * 1.2;
        tilt.push({
          tradeId: trade.id,
          date: trade.tradingDate,
          riskAmount: trade.riskAmount === null ? "0" : toDecimalString(trade.riskAmount),
          rMultiple: trade.rMultiple === null ? "0" : toDecimalString(trade.rMultiple),
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
    const mfeValues = closed.map((t) => t.mfeR ?? Number.NaN).filter((v) => !Number.isNaN(v));
    const maeValues = closed.map((t) => t.maeR ?? Number.NaN).filter((v) => !Number.isNaN(v));
    const winningMfe = closed.filter((t) => t.mfeR !== null && pnlOf(t) > 0);
    const capturePct = (() => {
      const realized = winningMfe.reduce((sum, t) => sum + rOf(t), 0);
      const favorable = winningMfe.reduce((sum, t) => sum + (t.mfeR ?? 0), 0);
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
    const mfeMean = mean(closed.map((t) => t.mfeR ?? Number.NaN).filter((v) => !Number.isNaN(v)));
    const maeMean = mean(closed.map((t) => t.maeR ?? Number.NaN).filter((v) => !Number.isNaN(v)));
    const quality: AnalyticsSuiteResponse["quality"] = {
      planFollowed,
      excursionAvailable: closed.some((t) => t.mfeR !== null || t.maeR !== null),
      mfe: {
        avgR: mfeMean === null ? null : toDecimalString(round2(mfeMean)),
        medianR: medianOf(closed.map((t) => t.mfeR).filter((v): v is number => v !== null)) === null ? null : toDecimalString(round2(medianOf(closed.map((t) => t.mfeR).filter((v): v is number => v !== null))!)),
        capturePct: capturePct === null ? null : toDecimalString(capturePct),
      },
      mae: {
        avgR: maeMean === null ? null : toDecimalString(round2(maeMean)),
        medianR: medianOf(closed.map((t) => t.maeR).filter((v): v is number => v !== null)) === null ? null : toDecimalString(round2(medianOf(closed.map((t) => t.maeR).filter((v): v is number => v !== null))!)),
      },
      scatter: closed.map((t) => ({
        id: t.id,
        symbol: instrumentOf(t)?.symbol ?? "?",
        mfeR: t.mfeR === null ? null : toDecimalString(t.mfeR),
        maeR: t.maeR === null ? null : toDecimalString(t.maeR),
        realizedR: toDecimalString(round2(rOf(t))),
      })),
      mfeHistogram,
      maeHistogram,
    };

    // ── Mistakes ledger ON the filtered set (§20) ──────────────────────────
    const mistakeEntries: AnalyticsSuiteResponse["mistakes"]["entries"] = [];
    for (const mistake of SYSTEM_MISTAKES) {
      const rows = mistakeRows
        .filter((m) => m.kind === "MISTAKE" && (m.data as { mistakeId?: string }).mistakeId === mistake.id)
        .map((m) => ({ row: m, trade: closed.find((t) => t.id === m.tradeId) }))
        .filter((x): x is { row: typeof x.row; trade: TradeLike } => x.trade !== undefined);
      if (rows.length === 0) continue;
      const rCost = rows.reduce((sum, x) => sum + rOf(x.trade), 0);
      const lastSeenAt = rows.reduce<string | null>((latest, x) => {
        const stamp = (x.row.data as { detectedAt?: string }).detectedAt ?? (x.row.data as { createdAt?: string }).createdAt ?? null;
        return latest === null || (stamp !== null && stamp > latest) ? stamp : latest;
      }, null);
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
    mistakeEntries.sort((a, b) => Math.abs(Number(b.rCost)) - Math.abs(Number(a.rCost)) || b.count - a.count);
    const mistakes: AnalyticsSuiteResponse["mistakes"] = {
      entries: mistakeEntries,
      violatingTrades: mistakeEntries.reduce((sum, entry) => sum + entry.count, 0),
      totalR: toDecimalString(round2(closed.reduce((sum, t) => sum + rOf(t), 0))),
    };

    // ── Economic-event context (§21) — only where the calendar reaches ─────
    const eventDates = ecoEvents.map((e) => e.scheduledAt.slice(0, 10)).sort();
    const calendarFrom = eventDates[0] ?? null;
    const calendarTo = eventDates[eventDates.length - 1] ?? null;
    const PHASES = [
      { key: "BEFORE", label: "Before event (4h→1h)" },
      { key: "DURING", label: "During release (±1h)" },
      { key: "AFTER", label: "After event (1h→4h)" },
      { key: "NONE", label: "No major event nearby" },
    ] as const;
    const phaseOf = (trade: TradeLike): string | null => {
      const instrument = instrumentOf(trade);
      if (instrument === undefined) return null;
      const entry = new Date(trade.entryAt).getTime();
      let best: { phase: string; distance: number } | null = null;
      for (const event of ecoEvents) {
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
    const phases: AnalyticsBucket[] = PHASES.map((phase) =>
      this.bucketOf(phase.key, phase.label, closed.filter((t) => phaseOf(t) === phase.key)),
    );
    const byImpact: AnalyticsBucket[] = (["HIGH", "MEDIUM"] as const).map((impact) => {
      const impactEvents = new Set(
        ecoEvents.filter((e) => e.impact === impact).map((e) => e.id),
      );
      const group = closed.filter((trade) => {
        const instrument = instrumentOf(trade);
        if (instrument === undefined) return false;
        const entry = new Date(trade.entryAt).getTime();
        return ecoEvents.some((event) =>
          impactEvents.has(event.id) &&
          event.currency === instrument.quoteCurrency &&
          Math.abs(entry - new Date(event.scheduledAt).getTime()) <= 240 * 60_000,
        );
      });
      return this.bucketOf(impact, `${impact} impact ±4h`, group);
    });
    const classifiedCount = closed.filter((t) => phaseOf(t) !== null && phaseOf(t) !== "NONE").length;
    const events: AnalyticsSuiteResponse["events"] = {
      calendarCoverage: {
        from: calendarFrom,
        to: calendarTo,
        classifiedTrades: classifiedCount,
        unclassifiedTrades: closed.length - classifiedCount,
      },
      phases,
      byImpact,
    };

    // ── Advanced statistics (§24) ──────────────────────────────────────────
    const rSorted = sorted(rValues);
    const moments = (values: number[]): { skew: number | null; kurt: number | null } => {
      const m = mean(values);
      const s = stdOf(values);
      if (m === null || s === null || s === 0 || values.length < 3) return { skew: null, kurt: null };
      const m3 = mean(values.map((v) => (v - m) ** 3))!;
      const m4 = mean(values.map((v) => (v - m) ** 4))!;
      return { skew: m3 / s ** 3, kurt: m4 / s ** 4 - 3 };
    };
    const { skew, kurt } = moments(rValues);
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
    const advanced: AnalyticsSuiteResponse["advanced"] = {
      r: {
        mean: rMean === null ? null : toDecimalString(round2(rMean)),
        median: medianOf(rValues) === null ? null : toDecimalString(round2(medianOf(rValues)!)),
        stddev: rStd === null ? null : toDecimalString(round2(rStd)),
        variance: rStd === null ? null : toDecimalString(round2(rStd ** 2)),
        skewness: skew === null ? null : toDecimalString(round2(skew)),
        kurtosis: kurt === null ? null : toDecimalString(round2(kurt)),
        p05: toDecimalString(round2(percentileOf(rValues, 5) ?? 0)),
        p25: toDecimalString(round2(percentileOf(rValues, 25) ?? 0)),
        p75: toDecimalString(round2(percentileOf(rValues, 75) ?? 0)),
        p95: toDecimalString(round2(percentileOf(rValues, 95) ?? 0)),
      },
      streaks: {
        longestWin,
        longestLoss,
        avgWin: winStreaks.length === 0 ? null : toDecimalString(round2(mean(winStreaks)!)),
        avgLoss: lossStreaks.length === 0 ? null : toDecimalString(round2(mean(lossStreaks)!)),
      },
    };
    void rSorted;

    // ── Monte Carlo (§25) — bootstrap of the filtered R list ───────────────
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
        const sampled = rValues.length > 0 ? rValues[Math.floor(rng() * rValues.length)] ?? 0 : 0;
        cum += sampled;
        peak = Math.max(peak, cum);
        dd = Math.min(dd, cum - peak);
        if (index < paths.length) {
          const bucket = paths[index];
          if (bucket !== undefined) bucket.push(cum);
        }
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
    const monteCarlo: AnalyticsSuiteResponse["monteCarlo"] = {
      simulations: simulationCount,
      tradesPerRun: closed.length,
      bands: paths.map((_, index) => {
        const slice = paths.map((path) => path[index] ?? 0);
        return { index, ...bandAt(slice) };
      }),
      finalR: {
        p05: toDecimalString(round2(percentileOf(finals, 5) ?? 0)),
        p50: toDecimalString(round2(percentileOf(finals, 50) ?? 0)),
        p95: toDecimalString(round2(percentileOf(finals, 95) ?? 0)),
      },
      maxDrawdownR: {
        p50: toDecimalString(round2(percentileOf(maxDds, 50) ?? 0)),
        p95: toDecimalString(round2(percentileOf(maxDds, 95) ?? 0)),
        worst: toDecimalString(round2(Math.min(...maxDds, 0))),
      },
      methodology:
        "Bootstrap resampling of the filtered per-trade R series (seeded mulberry32, identical seed per request). Bands are percentiles of the cumulative-R path per trade index — a SIMULATION of variance, never a prediction.",
    };

    // ── Reports (§26) ──────────────────────────────────────────────────────
    const reportRow = (key: string, group: TradeLike[]): AnalyticsSuiteResponse["reports"]["daily"][number] => ({
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
    const weeklyGroups = new Map<string, TradeLike[]>();
    const monthlyGroups = new Map<string, TradeLike[]>();
    for (const trade of closed) {
      const weekKey = isoWeekOf(trade.tradingDate);
      const weekGroup = weeklyGroups.get(weekKey) ?? [];
      weekGroup.push(trade);
      weeklyGroups.set(weekKey, weekGroup);
      const monthKey = trade.tradingDate.slice(0, 7);
      const monthGroup = monthlyGroups.get(monthKey) ?? [];
      monthGroup.push(trade);
      monthlyGroups.set(monthKey, monthGroup);
    }
    const reports: AnalyticsSuiteResponse["reports"] = {
      daily: dailyReports,
      weekly: [...weeklyGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => reportRow(key, group)),
      monthly: [...monthlyGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => reportRow(key, group)),
    };

    // ── Server-detected anomalies (measured facts, never verdicts) ──────────
    const anomalies: AnalyticsSuiteResponse["meta"]["anomalies"] = [];
    if (closed.length >= 10) {
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
            hint: null,
            message: `Tail loss: the ${tailCount} worst trades carry ${share.toFixed(0)} % of the total loss mass (${lossR.length} losers, Σ −${totalLossAbs.toFixed(1)} R).`,
          });
        }
      }
    }

    return {
      meta: {
        resolvedFrom: from,
        resolvedTo: to,
        descriptor: descriptorParts.length > 0 ? descriptorParts.join(" · ") : "All trades",
        closedTrades: closed.length,
        openTradesExcluded,
        warnings,
        anomalies,
        singleCurrency,
      },
      currency: (accountRows[0]?.currency ?? "USD") as AnalyticsSuiteResponse["currency"],
      summary,
      equity,
      cumulativeR,
      rolling,
      dailyPnl,
      rHistogram,
      pnlHistogram,
      durationHistogram,
      drawdowns,
      risk,
      strategies,
      symbols,
      assetClasses,
      directions,
      sessions,
      hours,
      weekdays,
      heatmap,
      psychology: {
        emotionsBefore,
        emotionsAfter,
        confidenceBands,
        tilt,
      },
      quality,
      mistakes,
      events,
      advanced,
      monteCarlo,
      reports,
    };
  }

  /** Strategy id → name, from the playbook context (contract-narrow). */
  private async playbookNames(userId: string): Promise<Map<string, string>> {
    try {
      const { strategies } = await this.playbook.listStrategies(userId);
      return new Map(strategies.map((s) => [s.id, s.name]));
    } catch {
      return new Map();
    }
  }
}

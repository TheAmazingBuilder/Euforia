/**
 * Analytics overview engine (Phase 8) — the dashboard KPI aggregation
 * (GET /stats/overview, contract `statsOverviewResponseSchema`).
 *
 * The dashboard/Session surfaces consume this — NOT the Analytics module
 * itself (the module renders the suite). Blocks owned by bounded contexts
 * that do not exist backend yet (ghost trades / DailyStat discipline
 * materialization) are honest zeros/nulls — never fabricated (§8/§54).
 *
 * Main account = the DEFAULT account (isDefault, else the first) — the
 * account the journal anchors equity to, matching the frontend reference.
 */
import type { Currency, StatsOverviewResponse } from "../../../shared/contracts";
import type { AnalyticsAccountRow, AnalyticsTradeRow } from "./analytics-input";
import { shiftDayKey, todayKeyFor } from "./analytics-clock";
import { round2 } from "./analytics-math";

type Decimal = string;

function dec(value: number): Decimal {
  return String(round2(value));
}

export interface OverviewEnvironment {
  trades: AnalyticsTradeRow[]; // closed journal rows (all accounts)
  accounts: AnalyticsAccountRow[];
  openTradeCount: number;
  timezone: string;
  now: Date;
}

export function computeAnalyticsOverview(environment: OverviewEnvironment): StatsOverviewResponse {
  const closed = [...environment.trades].sort((a, b) =>
    (a.tradingDate + (a.exitAtIso ?? a.entryAtIso)).localeCompare(b.tradingDate + (b.exitAtIso ?? b.entryAtIso)),
  );
  const mainAccount = environment.accounts.find((a) => a.isDefault) ?? environment.accounts[0];
  const baseBalance = mainAccount?.startingBalance ?? 0;

  const netPnl = closed.reduce((sum, t) => sum + t.pnlNet, 0);
  const wins = closed.filter((t) => t.pnlNet > 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.pnlNet, 0);
  const grossLoss = Math.abs(closed.filter((t) => t.pnlNet < 0).reduce((sum, t) => sum + t.pnlNet, 0));
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const expectancy =
    closed.length > 0 ? closed.reduce((sum, t) => sum + t.rMultiple, 0) / closed.length : 0;
  // Discipline score comes from the nightly DailyStat materialization —
  // that bounded context does not exist backend yet: honest null (§54).
  const disciplineScore: number | null = null;

  // ── Per-day aggregation (only days WITH closed trades — no zero-fill) ───
  const byDay = new Map<string, { pnl: number; count: number }>();
  for (const trade of closed) {
    const entry = byDay.get(trade.tradingDate) ?? { pnl: 0, count: 0 };
    entry.pnl += trade.pnlNet;
    entry.count += 1;
    byDay.set(trade.tradingDate, entry);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  let equity = baseBalance;
  const equityCurve: StatsOverviewResponse["equityCurve"] = [];
  const dailyPnl: StatsOverviewResponse["dailyPnl"] = [];
  for (const [date, entry] of days) {
    equity += entry.pnl;
    equityCurve.push({ date, equity: dec(equity) });
    dailyPnl.push({ date, pnlNet: dec(entry.pnl), tradesCount: entry.count });
  }

  // ── Peak & max drawdown ─────────────────────────────────────────────────
  let runningPeak = baseBalance;
  let maxDdPct = 0;
  for (const point of equityCurve) {
    const eq = Number(point.equity);
    if (eq > runningPeak) runningPeak = eq;
    if (runningPeak > 0) {
      const ddPct = ((eq - runningPeak) / runningPeak) * 100;
      if (ddPct < maxDdPct) maxDdPct = ddPct;
    }
  }
  const equityPeak = Math.max(runningPeak, baseBalance);

  // ── Deltas WEEK VS WEEK (7 calendar trading days vs the 7 before) ──────
  const today = todayKeyFor(environment.timezone, environment.now);
  const shiftDateKey = (offsetDays: number): string => shiftDayKey(today, offsetDays);
  const currentStart = shiftDateKey(-6);
  const prevStart = shiftDateKey(-13);

  const aggregate = (group: AnalyticsTradeRow[]) => {
    const count = group.length;
    const winCount = group.filter((t) => t.pnlNet > 0).length;
    const gp = group.filter((t) => t.pnlNet > 0).reduce((sum, t) => sum + t.pnlNet, 0);
    const gl = Math.abs(group.filter((t) => t.pnlNet < 0).reduce((sum, t) => sum + t.pnlNet, 0));
    return {
      netPnl: group.reduce((sum, t) => sum + t.pnlNet, 0),
      winRate: count > 0 ? (winCount / count) * 100 : null, // percentage form
      profitFactor: gl > 0 ? gp / gl : null,
      expectancy: count > 0 ? group.reduce((sum, t) => sum + t.rMultiple, 0) / count : null,
      hasData: count > 0,
    };
  };
  const cur = aggregate(closed.filter((t) => t.tradingDate >= currentStart));
  const prev = aggregate(closed.filter((t) => t.tradingDate >= prevStart && t.tradingDate < currentStart));
  // DailyStat-backed discipline deltas: absent backend — null baseline.
  const curDisc: number | null = null;
  const prevDisc: number | null = null;

  const rawDelta = (current: number | null, previous: number | null): StatsOverviewResponse["deltas"]["winRate"] => {
    if (current === null || previous === null) return { value: null, direction: "FLAT" };
    const diff = round2(current - previous);
    return { value: dec(diff), direction: diff > 0 ? "UP" : diff < 0 ? "DOWN" : "FLAT" };
  };
  const netPnlDelta: StatsOverviewResponse["deltas"]["netPnl"] =
    !cur.hasData || !prev.hasData || prev.netPnl === 0
      ? { value: null, direction: cur.netPnl > prev.netPnl && cur.hasData ? "UP" : "FLAT" }
      : rawDelta(cur.netPnl, prev.netPnl);

  // ── Per-KPI sparklines — WEEKLY buckets (last 8 data weeks, Mon-anchored)
  const sparklines: StatsOverviewResponse["sparklines"] = {
    netPnl: [],
    winRate: [],
    profitFactor: [],
    expectancy: [],
    disciplineScore: [],
  };
  const WEEKS_SHOWN = 8;
  const weekStart = (dateKey: string): string => {
    const date = new Date(`${dateKey}T00:00:00Z`);
    const weekday = date.getUTCDay(); // 0 = Sunday
    const backToMonday = (weekday + 6) % 7;
    date.setUTCDate(date.getUTCDate() - backToMonday);
    return date.toISOString().slice(0, 10);
  };
  const weekBuckets = new Map<string, AnalyticsTradeRow[]>();
  for (const trade of closed) {
    const key = weekStart(trade.tradingDate);
    const bucket = weekBuckets.get(key) ?? [];
    bucket.push(trade);
    weekBuckets.set(key, bucket);
  }
  const sortedWeekKeys = [...weekBuckets.keys()].sort();
  const shownWeeks = sortedWeekKeys.slice(-WEEKS_SHOWN);
  for (const weekKey of shownWeeks) {
    const weekTrades = weekBuckets.get(weekKey) ?? [];
    const weekWins = weekTrades.filter((t) => t.pnlNet > 0);
    const wp = weekWins.reduce((sum, t) => sum + t.pnlNet, 0);
    const wl = Math.abs(weekTrades.filter((t) => t.pnlNet < 0).reduce((sum, t) => sum + t.pnlNet, 0));
    sparklines.netPnl.push(dec(weekTrades.reduce((sum, t) => sum + t.pnlNet, 0)));
    sparklines.winRate.push(
      dec(weekTrades.length > 0 ? (weekWins.length / weekTrades.length) * 100 : 0),
    );
    sparklines.profitFactor.push(dec(wl > 0 ? wp / wl : 0));
    sparklines.expectancy.push(
      dec(weekTrades.length > 0 ? weekTrades.reduce((sum, t) => sum + t.rMultiple, 0) / weekTrades.length : 0),
    );
    sparklines.disciplineScore.push(dec(0)); // DailyStat domain absent backend
  }

  // ── Ghost-trade blocks (Regret Registry domain absent backend) ──────────
  const disciplineSaved: StatsOverviewResponse["disciplineSaved"] = { rSaved: dec(0), settledCount: 0 };
  const hesitationCost: StatsOverviewResponse["hesitationCost"] = { rCost: dec(0), settledCount: 0 };
  const ghostTrend: StatsOverviewResponse["ghostTrend"] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    ghostTrend.push({ date: shiftDateKey(-offset), fear: 0, discipline: 0 });
  }

  // ── Weekly comparison bands (zero-filled 7-day strips) ──────────────────
  const weekBands = (fromOffset: number): StatsOverviewResponse["weeklyCompare"]["thisWeek"]["days"] =>
    Array.from({ length: 7 }, (_, i) => {
      const date = shiftDateKey(fromOffset + i);
      const found = dailyPnl.find((point) => point.date === date);
      return { date, pnlNet: found?.pnlNet ?? dec(0), tradesCount: found?.tradesCount ?? 0 };
    });
  const curCount = closed.filter((t) => t.tradingDate >= currentStart).length;
  const prevCount = closed.filter((t) => t.tradingDate >= prevStart && t.tradingDate < currentStart).length;
  const weeklyCompare: StatsOverviewResponse["weeklyCompare"] = {
    thisWeek: {
      days: weekBands(-6),
      totalPnl: dec(cur.netPnl),
      winRate: cur.winRate === null ? null : dec(round2(cur.winRate)),
      tradesCount: curCount,
    },
    prevWeek: {
      days: weekBands(-13),
      totalPnl: dec(prev.netPnl),
      winRate: prev.winRate === null ? null : dec(round2(prev.winRate)),
      tradesCount: prevCount,
    },
    deltaPnlPct:
      !cur.hasData || !prev.hasData || prev.netPnl === 0
        ? null
        : dec(round2(((cur.netPnl - prev.netPnl) / Math.abs(prev.netPnl)) * 100)),
  };

  return {
    // Account currencies are validated against the shared Currency enum at
    // creation — the DB string is cast, never re-validated here.
    currency: (mainAccount?.currency ?? "USD") as Currency,
    netPnl: dec(netPnl),
    winRate: dec(round2(winRate)),
    profitFactor: grossLoss > 0 ? dec(round2(grossProfit / grossLoss)) : null,
    expectancy: dec(round2(expectancy)),
    disciplineScore: disciplineScore === null ? null : dec(disciplineScore),
    equityCurve,
    dailyPnl,
    equityPeak: dec(round2(equityPeak)),
    maxDrawdownPct: dec(round2(maxDdPct)),
    deltas: {
      netPnl: netPnlDelta,
      winRate: rawDelta(cur.winRate, prev.winRate),
      profitFactor: rawDelta(cur.profitFactor, prev.profitFactor),
      expectancy: rawDelta(cur.expectancy, prev.expectancy),
      disciplineScore: rawDelta(curDisc, prevDisc),
    },
    deltaWindowDays: 7,
    sparklines,
    disciplineSaved,
    hesitationCost,
    ghostTrend,
    weeklyCompare,
  };
}

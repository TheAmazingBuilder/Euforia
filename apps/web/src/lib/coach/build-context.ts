import {
  type CoachContext,
  type CoachTradeContext,
  type Instrument,
  type MistakeLedgerResponse,
  type StatsOverviewResponse,
  type StrategiesStatsResponse,
  type Strategy,
  type Trade,
  type ViolationsResponse,
} from "@cosmoz/shared";

/**
 * Builds the compact DATA snapshot the AI coach is grounded in (feature 11).
 * Pure projection over the query data the Coach view already holds — no
 * fetching, no state. Returns null until the overview (the backbone of the
 * snapshot) is available, so the chat only opens on real numbers.
 */

const RECENT_TRADES = 14;
const CLOSED_ONLY = (trade: Trade) => trade.status === "CLOSED";

/** Newest first by entry time. */
const byEntryDesc = (a: Trade, b: Trade) => b.entryAt.localeCompare(a.entryAt);

export interface CoachContextInput {
  overview?: StatsOverviewResponse;
  strategiesStats?: StrategiesStatsResponse;
  strategies?: Strategy[];
  instruments?: Instrument[];
  ledger?: MistakeLedgerResponse;
  violations?: ViolationsResponse;
  trades?: Trade[];
}

export function buildCoachContext(input: CoachContextInput): CoachContext | null {
  const { overview, strategiesStats, strategies = [], instruments = [], ledger, violations, trades = [] } = input;
  if (!overview) return null;

  const closed = trades.filter(CLOSED_ONLY);
  const symbolById = new Map(instruments.map((instrument) => [instrument.id, instrument.symbol]));
  const nameById = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));

  // ── Recent trades (any status, newest 14 — OPEN trades are coachable too)
  const recentTrades: CoachTradeContext[] = [...trades]
    .sort(byEntryDesc)
    .slice(0, RECENT_TRADES)
    .map((trade) => ({
      instrument: symbolById.get(trade.instrumentId) ?? "?",
      direction: trade.direction,
      entryAt: trade.entryAt,
      status: trade.status,
      strategy: trade.strategyId === null ? null : nameById.get(trade.strategyId) ?? null,
      rMultiple: trade.rMultiple,
      pnlNet: trade.pnlNet,
      emotionBefore: trade.emotionBefore,
      followedPlan: trade.followedPlan,
      decisionGrade: trade.decisionGrade,
    }));

  // ── Emotion distribution over closed trades (most frequent first)
  const emotionCounts = new Map<string, number>();
  for (const trade of closed) {
    if (trade.emotionBefore === null) continue;
    emotionCounts.set(trade.emotionBefore, (emotionCounts.get(trade.emotionBefore) ?? 0) + 1);
  }
  const emotions = [...emotionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([emotion, count]) => ({ emotion: emotion as CoachContext["emotions"][number]["emotion"], count }));

  // ── Per-strategy stats joined with names + status
  const stats = (strategiesStats?.stats ?? [])
    .map((stat) => {
      const strategy = strategies.find((item) => item.id === stat.strategyId);
      return strategy
        ? {
            name: strategy.name,
            status: strategy.status,
            trades: stat.trades,
            winRate: stat.winRate,
            avgR: stat.avgR,
            last20Expectancy: stat.last20Expectancy,
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 10);

  // ── Snapshot freshness: the newest journaled trading day (API-computed
  // user-timezone trading date on the trade itself — no client recomputation).
  const newest = [...trades].sort(byEntryDesc)[0];
  const dataAsOf = newest?.tradingDate ?? null;

  return {
    currency: overview.currency,
    dataAsOf,
    totals: {
      trades: trades.length,
      closedTrades: closed.length,
      winRate: overview.winRate,
      netPnl: overview.netPnl,
      expectancy: overview.expectancy,
      profitFactor: overview.profitFactor,
      maxDrawdownPct: overview.maxDrawdownPct,
      disciplineScore: overview.disciplineScore,
    },
    strategies: stats,
    topMistakes: (ledger?.entries ?? [])
      .slice(0, 6)
      .map((entry) => ({
        label: entry.label,
        category: entry.category,
        count: entry.count,
        rCost: entry.rCost,
      })),
    violations: (violations?.violations ?? [])
      .slice(0, 8)
      .map((violation) => ({
        ruleType: violation.ruleType,
        severity: violation.ruleSeverity,
        occurredAt: violation.occurredAt,
      })),
    emotions,
    recentTrades,
  };
}

/** TanStack Query key registry — stable, hierarchical, prefix-invalidation friendly. */
export const queryKeys = {
  accounts: ["accounts"] as const,
  instruments: (q: string) => ["instruments", q] as const,
  strategies: ["strategies"] as const,
  strategiesStats: ["strategies-stats"] as const,
  tags: ["tags"] as const,
  rulesStatus: (accountId: string | null) => ["rules-status", accountId] as const,
  rulesStatusRoot: ["rules-status"] as const,
  profile: ["profile"] as const,
  screenshots: (tradeId: string) => ["screenshots", tradeId] as const,
  rules: ["rules"] as const,
  violations: ["violations"] as const,
  disciplineScore: ["discipline-score"] as const,
  mistakesLedger: ["mistakes-ledger"] as const,
  trades: (params: { status?: string; graded?: string; accountId?: string }) =>
    ["trades", params] as const,
  tradesRoot: ["trades"] as const,
  review: (tradeId: string) => ["review", tradeId] as const,
  alerts: ["alerts"] as const,
  ecoEvents: ["eco-events"] as const,
  statsOverview: ["stats-overview"] as const,
  statsAnalytics: ["stats-analytics"] as const,
  skippedTrades: ["skipped-trades"] as const,
  sessionTimeline: ["session-timeline"] as const,
} as const;

/**
 * Root keys invalidated by any trade mutation. The discipline banner
 * (rules-status) refetches after EACH mutation per trade-entry-ux.md §12,
 * and the Session Live timeline is rebuilt from trades/events/alerts.
 */
export const tradeMutationInvalidations = [
  queryKeys.tradesRoot,
  queryKeys.rulesStatusRoot,
  queryKeys.alerts,
  queryKeys.statsOverview,
  queryKeys.sessionTimeline,
] as const;

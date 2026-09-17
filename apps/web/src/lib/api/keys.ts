/** TanStack Query key registry — stable, hierarchical, prefix-invalidation friendly. */
export const queryKeys = {
  accounts: ["accounts"] as const,
  instruments: (q: string) => ["instruments", q] as const,
  strategies: ["strategies"] as const,
  rulesStatus: (accountId: string | null) => ["rules-status", accountId] as const,
  rulesStatusRoot: ["rules-status"] as const,
  trades: (params: { status?: string; graded?: string; accountId?: string }) =>
    ["trades", params] as const,
  tradesRoot: ["trades"] as const,
  review: (tradeId: string) => ["review", tradeId] as const,
  alerts: ["alerts"] as const,
  statsOverview: ["stats-overview"] as const,
  skippedTrades: ["skipped-trades"] as const,
} as const;

/**
 * Root keys invalidated by any trade mutation. The discipline banner
 * (rules-status) refetches after EACH mutation per trade-entry-ux.md §12.
 */
export const tradeMutationInvalidations = [
  queryKeys.tradesRoot,
  queryKeys.rulesStatusRoot,
  queryKeys.alerts,
  queryKeys.statsOverview,
] as const;

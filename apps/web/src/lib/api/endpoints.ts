/**
 * Canonical API endpoint paths — imported by the hooks AND the MSW handlers,
 * so the mocked backend can never drift from the client's URL building.
 * Paths are relative to the API base (lib/api/urls.ts).
 */
export const apiPaths = {
  instruments: "/instruments",
  rulesStatus: "/rules/status",
  strategies: "/strategies",
  accounts: "/accounts",
  tags: "/tags",
  trades: "/trades",
  trade: (tradeId: string) => `/trades/${tradeId}`,
  tradeClose: (tradeId: string) => `/trades/${tradeId}/close`,
  tradeDecision: (tradeId: string) => `/trades/${tradeId}/decision`,
  tradeReview: (tradeId: string) => `/trades/${tradeId}/review`,
  tradeMistake: (tradeId: string, mistakeId: string) =>
    `/trades/${tradeId}/mistakes/${mistakeId}`,
  tradePlan: (tradeId: string) => `/trades/${tradeId}/plan`,
  tradePsychology: (tradeId: string) => `/trades/${tradeId}/psychology`,
  skippedTrades: "/skipped-trades",
  skippedTradeSettle: (skippedId: string) => `/skipped-trades/${skippedId}/settle`,
  alerts: "/alerts",
  alertRead: (alertId: string) => `/alerts/${alertId}/read`,
  statsOverview: "/stats/overview",
} as const;

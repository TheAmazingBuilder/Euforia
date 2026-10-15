import { useQuery } from "@tanstack/react-query";
import type {
  AnalyticsFilters,
  AnalyticsResponse,
  AnalyticsSuiteResponse,
  StatsOverviewResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /stats/overview — KPIs, equity curve, daily P&L map. */
export function useStatsOverview() {
  return useQuery({
    queryKey: queryKeys.statsOverview,
    queryFn: () => apiRequest<StatsOverviewResponse>(apiPaths.statsOverview),
  });
}

/** GET /stats/analytics — the full analytics suite aggregate (Phase 9). */
export function useAnalytics() {
  return useQuery({
    queryKey: queryKeys.statsAnalytics,
    queryFn: () => apiRequest<AnalyticsResponse>(apiPaths.statsAnalytics),
  });
}

/**
 * GET /stats/analytics-suite — the Analytics module dataset. The filter set
 * IS part of the query key: every filter change refetches from the server
 * (the client never re-derives aggregates — one dataset definition §5).
 * `options.enabled` lets consumers opt out (e.g. dashboard widgets that are
 * not on the current layout — no fetch, no wasted Monte Carlo runs).
 */
export function useAnalyticsSuite(
  filters: AnalyticsFilters,
  sims = 400,
  options?: { enabled?: boolean },
) {
  const params = new URLSearchParams();
  if (filters.period) params.set("period", filters.period);
  if (filters.customFrom) params.set("customFrom", filters.customFrom);
  if (filters.customTo) params.set("customTo", filters.customTo);
  if (filters.accountId) params.set("accountId", filters.accountId);
  if (filters.instrumentId) params.set("instrumentId", filters.instrumentId);
  if (filters.assetClass) params.set("assetClass", filters.assetClass);
  if (filters.strategyId) params.set("strategyId", filters.strategyId);
  if (filters.direction) params.set("direction", filters.direction);
  if (filters.session) params.set("session", filters.session);
  if (filters.emotion) params.set("emotion", filters.emotion);
  if (filters.exitReason) params.set("exitReason", filters.exitReason);
  if (filters.tagId) params.set("tagId", filters.tagId);
  params.set("sims", String(sims));
  const queryString = params.toString();
  return useQuery({
    queryKey: queryKeys.analyticsSuite(queryString),
    queryFn: () =>
      apiRequest<AnalyticsSuiteResponse>(`${apiPaths.statsAnalyticsSuite}?${queryString}`),
    enabled: options?.enabled ?? true,
  });
}

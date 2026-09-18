import { useQuery } from "@tanstack/react-query";
import type { AnalyticsResponse, StatsOverviewResponse } from "@cosmoz/shared";

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

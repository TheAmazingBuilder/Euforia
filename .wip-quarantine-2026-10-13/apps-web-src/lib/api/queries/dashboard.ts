import { useQuery } from "@tanstack/react-query";
import type {
  AccountBandResponse,
  MonthHighlightsResponse,
  MonthlyGoalsResponse,
  ProductMetricsResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /stats/account-band — balance, equity + drawdown bands, goal strip. */
export function useAccountBand() {
  return useQuery({
    queryKey: queryKeys.statsAccountBand,
    queryFn: () => apiRequest<AccountBandResponse>(apiPaths.statsAccountBand),
  });
}

/** GET /stats/highlights — best & worst trade of the month. */
export function useMonthHighlights() {
  return useQuery({
    queryKey: queryKeys.statsHighlights,
    queryFn: () => apiRequest<MonthHighlightsResponse>(apiPaths.statsHighlights),
  });
}

/** GET /stats/monthly-goals — the monthly goal strip. */
export function useMonthlyGoals() {
  return useQuery({
    queryKey: queryKeys.statsMonthlyGoals,
    queryFn: () => apiRequest<MonthlyGoalsResponse>(apiPaths.statsMonthlyGoals),
  });
}

/** GET /stats/product — usage metrics for the product band. */
export function useProductMetrics() {
  return useQuery({
    queryKey: queryKeys.statsProduct,
    queryFn: () => apiRequest<ProductMetricsResponse>(apiPaths.statsProduct),
  });
}

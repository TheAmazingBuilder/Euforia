import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PeriodReportResponse, ReportGranularity, WeeklyReportResponse } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * GET /stats/weekly — the weekly debrief table (coach page). `start` is a
 * Monday dateKey ("YYYY-MM-DD"); omit it for the current week.
 */
export function useWeeklyReport(start?: string) {
  return useQuery({
    queryKey: queryKeys.weeklyReport(start),
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiRequest<WeeklyReportResponse>(
        start
          ? `${apiPaths.statsWeekly}?week=${encodeURIComponent(start)}`
          : apiPaths.statsWeekly,
      ),
  });
}

/**
 * GET /stats/report — the premium multi-period report (reports page).
 * The client picks the granularity and an anchor day inside the wanted
 * window; every aggregate (totals, comparison, pro metrics, equity curve,
 * rollups) is computed server-side from closed trades.
 */
export function usePeriodReport(granularity: ReportGranularity, anchor?: string) {
  return useQuery({
    queryKey: queryKeys.periodReport(granularity, anchor),
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams({ granularity });
      if (anchor) params.set("anchor", anchor);
      return apiRequest<PeriodReportResponse>(`${apiPaths.statsReport}?${params.toString()}`);
    },
  });
}

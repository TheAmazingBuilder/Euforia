import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/** Analytics domain — aggregate overview + the Phase 9 analytics suite. */
export const statsHandlers = [
  // GET /stats/overview — netPnl, winRate, profitFactor, expectancy,
  // disciplineScore, equity points, daily P&L map (calendar fuel)
  http.get(endpoint(apiPaths.statsOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.statsOverview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /stats/analytics — summary cards, heatmap, time buckets,
  // psychology correlations, all-time mistake ledger, R distributions
  http.get(endpoint(apiPaths.statsAnalytics), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.analytics());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

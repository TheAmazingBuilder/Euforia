import { http, HttpResponse } from "msw";
import { analyticsFiltersSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, requireAuth, toErrorResponse } from "./utils";

/** Analytics domain — aggregate overview + the Phase 9 analytics suite. */
export const statsHandlers = [
  // GET /stats/overview — netPnl, winRate, profitFactor, expectancy,
  // disciplineScore, equity points, daily P&L map (calendar fuel)
  http.get(endpoint(apiPaths.statsOverview), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
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

  // GET /stats/analytics-suite — the Analytics MODULE dataset: the global
  // filter system's single source of truth (MASTER PROMPT §5). Zod-parsed
  // query params; unknown params are ignored, invalid values → 422.
  http.get(endpoint(apiPaths.statsAnalyticsSuite), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const raw = Object.fromEntries(
        [...url.searchParams.entries()].filter(([key]) => key !== "sims"),
      );
      const cleaned = Object.fromEntries(
        Object.entries(raw).filter(([, value]) => value !== "" && value !== "all"),
      );
      const filters = analyticsFiltersSchema.parse(cleaned);
      const sims = Number(url.searchParams.get("sims") ?? "400");
      return HttpResponse.json(mockStore.analyticsSuite(filters, Number.isFinite(sims) ? sims : 400));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/** Analytics domain — aggregate overview (KPIs, equity curve, daily P&L map). */
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
];

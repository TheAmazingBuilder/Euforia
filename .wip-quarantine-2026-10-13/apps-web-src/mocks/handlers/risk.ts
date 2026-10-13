import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/** Risk domain — the Risk Command Center aggregate. */
export const riskHandlers = [
  // GET /risk/overview — the four guardrails + posture + series + event feed
  http.get(endpoint(apiPaths.riskOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.riskOverview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

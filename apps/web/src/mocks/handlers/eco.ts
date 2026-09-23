import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/** Economic calendar — GET /eco-events (Priorité 3, feature 10). */
export const ecoHandlers = [
  http.get(endpoint(apiPaths.ecoEvents), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listEcoEvents());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/** Coach domain — weekly debrief + process streaks (Priority 2). */
export const coachHandlers = [
  // GET /coach/weekly-report — best decisions, discipline trend, THE one
  // focus for the coming week, all-time process streaks.
  http.get(endpoint(apiPaths.coachWeeklyReport), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.coachWeeklyReport());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

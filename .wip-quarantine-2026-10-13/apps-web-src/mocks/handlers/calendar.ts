import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/** Economic calendar domain — deterministic per-week macro events. */
export const calendarHandlers = [
  // GET /calendar/economic?week=YYYY-MM-DD (Monday key, defaults to current)
  http.get(endpoint(apiPaths.economicCalendar), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      return HttpResponse.json(mockStore.economicCalendar(url.searchParams.get("week")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

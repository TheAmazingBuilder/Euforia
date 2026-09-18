import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/**
 * Session Live domain (trade-entry-ux.md §9) — today's event timeline +
 * mood strip, assembled server-side for the server's trading date.
 */
export const sessionHandlers = [
  http.get(endpoint(apiPaths.sessionTimeline), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.sessionTimeline());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

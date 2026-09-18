import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, pathParam, toErrorResponse } from "./utils";

/** Discipline domain — daily aggregate banner + alerts inbox. */
export const disciplineHandlers = [
  // GET /rules/status?accountId= — today's aggregate; refetched after each mutation
  http.get(endpoint(apiPaths.rulesStatus), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("accountId");
      return HttpResponse.json(mockStore.rulesStatus(accountId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /alerts — inbox + unread count for the bell badge
  http.get(endpoint(apiPaths.alerts), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listAlerts());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /alerts/:id/read — mark an alert as read (inbox row action)
  http.patch(endpoint(apiPaths.alertRead(":alertId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.markAlertRead(pathParam(params, "alertId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

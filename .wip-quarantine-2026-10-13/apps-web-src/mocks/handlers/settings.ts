import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/** Settings domain — standing risk rules + journal writing goals. */
export const settingsHandlers = [
  // GET /settings/journal-goals — the writing cadence targets
  http.get(endpoint(apiPaths.journalGoals), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.getJournalGoals());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /settings/journal-goals — revise the writing cadence targets
  http.patch(endpoint(apiPaths.journalGoals), async ({ request }) => {
    await latency();
    try {
      const input = (await request.json()) as Parameters<
        typeof mockStore.updateJournalGoals
      >[0];
      return HttpResponse.json(mockStore.updateJournalGoals(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /settings/risk — the current standing risk rules
  http.get(endpoint(apiPaths.settingsRisk), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.getRiskDefaults());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /settings/risk — revise the standing risk rules
  http.patch(endpoint(apiPaths.settingsRisk), async ({ request }) => {
    await latency();
    try {
      const input = (await request.json()) as Parameters<
        typeof mockStore.updateRiskDefaults
      >[0];
      return HttpResponse.json(mockStore.updateRiskDefaults(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

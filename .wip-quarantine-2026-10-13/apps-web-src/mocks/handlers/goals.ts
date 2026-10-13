import { http, HttpResponse } from "msw";
import { updateGoalSettingsInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, readJson, toErrorResponse } from "./utils";

/**
 * Goals domain — monthly targets vs real behavior.
 * GET/PATCH /goals/settings + GET /goals/progress?month=YYYY-MM.
 * Progress is ALWAYS computed server-side from DailyStat rows.
 */
export const goalHandlers = [
  http.get(endpoint(apiPaths.goalsSettings), async () => {
    await latency();
    return HttpResponse.json(mockStore.getGoalSettings());
  }),

  http.patch(endpoint(apiPaths.goalsSettings), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(updateGoalSettingsInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateGoalSettings(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.goalsProgress), async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? undefined;
    try {
      return HttpResponse.json(mockStore.goalProgress(month ?? undefined));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

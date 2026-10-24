import { http, HttpResponse } from "msw";
import {
  createSkippedTradeInputSchema,
  settleSkippedTradeInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Ghost trades domain (Registre des Regrets) - 10-second capture + deferred
 * settlement feeding Discipline Saved / Hesitation Cost.
 */
export const ghostHandlers = [
  // GET /skipped-trades - list (feed of regrets)
  http.get(endpoint(apiPaths.skippedTrades), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listSkippedTrades());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /skipped-trades - 10-second ghost capture
  http.post(endpoint(apiPaths.skippedTrades), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createSkippedTradeInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createSkippedTrade(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /skipped-trades/:id/settle - would have won / lost / unknown (+ R)
  http.patch(endpoint(apiPaths.skippedTradeSettle(":skippedId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(settleSkippedTradeInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.settleSkippedTrade(pathParam(params, "skippedId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

import { http, HttpResponse } from "msw";
import { createStrategyInputSchema, updateStrategyInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/** Playbook domain — strategy CRUD + server-computed per-strategy stats. */
export const playbookHandlers = [
  // GET /strategies/stats — per-strategy aggregates + decay banner target.
  // Registered before GET /strategies for clarity; paths match exactly anyway.
  http.get(endpoint(apiPaths.strategyStats), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.strategyStats());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /strategies — create a playbook entry
  http.post(endpoint(apiPaths.strategies), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createStrategyInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createStrategy(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /strategies/:id — edit a playbook entry
  http.patch(endpoint(apiPaths.strategy(":strategyId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateStrategyInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.updateStrategy(pathParam(params, "strategyId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /strategies/:id — 409 while trades are attached (pause instead)
  http.delete(endpoint(apiPaths.strategy(":strategyId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteStrategy(pathParam(params, "strategyId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

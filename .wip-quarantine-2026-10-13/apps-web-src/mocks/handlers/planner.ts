import { http, HttpResponse } from "msw";
import {
  createTradePlanInputSchema,
  updateTradePlanInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, requireAuth, toErrorResponse } from "./utils";

/**
 * Trade Planner domain — plan CRUD with server-side lifecycle validation
 * (DRAFT → READY → EXECUTED / CANCELLED / EXPIRED) and the ONE aggregate
 * Risk & Money Management summary. The checklist's AUTO items and the risk
 * fields are always recomputed by the store — clients never send them.
 */
export const plannerHandlers = [
  // GET /planner/plans — every plan, newest update first.
  http.get(endpoint(apiPaths.plannerPlans), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const status = new URL(request.url).searchParams.get("status");
      return HttpResponse.json(mockStore.listTradePlans(status));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /planner/plans — create a DRAFT plan (checklist composed server-side).
  http.post(endpoint(apiPaths.plannerPlans), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const input = parseBody(createTradePlanInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createTradePlan(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /planner/plans/:id — one plan (deep links / reload persistence).
  http.get(endpoint(apiPaths.plannerPlan(":planId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(mockStore.getTradePlan(pathParam(params, "planId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /planner/plans/:id — content edits, manual checklist states and
  // lifecycle transitions, all validated against the current status.
  http.patch(endpoint(apiPaths.plannerPlan(":planId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const input = parseBody(updateTradePlanInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.updateTradePlan(pathParam(params, "planId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /planner/plans/:id — DRAFT / CANCELLED / EXPIRED only (409 else).
  http.delete(endpoint(apiPaths.plannerPlan(":planId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(mockStore.deleteTradePlan(pathParam(params, "planId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /planner/risk — the Risk & Money Management aggregate (spec §22–§36).
  http.get(endpoint(apiPaths.plannerRisk), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(mockStore.plannerRisk());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

import { http, HttpResponse } from "msw";
import {
  completePlanInputSchema,
  createAnalysisPlanInputSchema,
  invalidatePlanInputSchema,
  linkPlanTradeInputSchema,
  listPlansQuerySchema,
  updateAnalysisPlanInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { planEngine } from "@/mocks/plan-engine";
import { authEngine } from "@/mocks/auth-engine";
import { MockError } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Trade Plan handlers (Phase 11) - thin transport over planEngine, which
 * mirrors the Nest PlanService semantics exactly (state machine, activation
 * gate, ownership-safe 404s, honest-null comparison). Auth guard first, like
 * every private domain: the plan list never leaves the mock without a token.
 */

/** The mock session's user id - the same single-user convention as the store. */
function requireUserId(request: Request): string {
  const principal = authEngine.authenticate(request.headers.get("authorization"));
  if (principal === null) throw new MockError(401, "Authentication required");
  return principal.user.id;
}

export const planHandlers = [
  // GET /plans - list with filters (status, symbol, tradeId) + pagination
  http.get(endpoint(apiPaths.plans), async ({ request }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const query = listPlansQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return HttpResponse.json(planEngine.list(userId, query));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /plans - create (DRAFT default, activate:true opt-in), idempotent
  http.post(endpoint(apiPaths.plans), async ({ request }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const input = parseBody(createAnalysisPlanInputSchema, await readJson(request));
      return HttpResponse.json(planEngine.create(userId, input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /plans/:id - detail + planned-vs-actual comparison
  http.get(endpoint(apiPaths.plan(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      return HttpResponse.json(planEngine.getDetail(userId, pathParam(params, "planId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /plans/:id - editable in DRAFT/ACTIVE only (engine enforces)
  http.patch(endpoint(apiPaths.plan(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const input = parseBody(updateAnalysisPlanInputSchema, await readJson(request));
      return HttpResponse.json(planEngine.patch(userId, pathParam(params, "planId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /plans/:id/activate - DRAFT → ACTIVE (gate: invalidation criteria)
  http.post(endpoint(apiPaths.planActivate(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      return HttpResponse.json(planEngine.activate(userId, pathParam(params, "planId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /plans/:id/invalidate - ACTIVE → INVALIDATED (reason required)
  http.post(endpoint(apiPaths.planInvalidate(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const input = parseBody(invalidatePlanInputSchema, await readJson(request));
      return HttpResponse.json(
        planEngine.invalidate(userId, pathParam(params, "planId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /plans/:id/complete - ACTIVE → COMPLETED (process-focused review)
  http.post(endpoint(apiPaths.planComplete(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const input = parseBody(completePlanInputSchema, await readJson(request));
      return HttpResponse.json(
        planEngine.complete(userId, pathParam(params, "planId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /plans/:id/archive - terminal (non-destructive) transition
  http.post(endpoint(apiPaths.planArchive(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      return HttpResponse.json(planEngine.archive(userId, pathParam(params, "planId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /plans/:id/link-trade - canonical-trade association (validated)
  http.post(endpoint(apiPaths.planLinkTrade(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      const input = parseBody(linkPlanTradeInputSchema, await readJson(request));
      return HttpResponse.json(
        planEngine.linkTrade(userId, pathParam(params, "planId"), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /plans/:id/link-trade - association only; the trade is untouched
  http.delete(endpoint(apiPaths.planLinkTrade(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      return HttpResponse.json(planEngine.detachTrade(userId, pathParam(params, "planId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /plans/:id - hard delete of the plan document
  http.delete(endpoint(apiPaths.plan(":planId")), async ({ request, params }) => {
    await latency();
    try {
      const userId = requireUserId(request);
      return HttpResponse.json(planEngine.delete(userId, pathParam(params, "planId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

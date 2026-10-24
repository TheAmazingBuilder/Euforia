import { http, HttpResponse } from "msw";
import {
  createGoalInputSchema,
  updateGoalInputSchema,
  upsertReviewInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Trade Review domain - the post-trade review workflow fused with Goal
 * setting. Progress is always computed server-side from real behavior;
 * reviews are one per trade (upsert) and sync the trade's written trace.
 */
export const tradeReviewHandlers = [
  // GET /reviews/overview - the module's aggregate (stats + goals + lessons)
  http.get(endpoint(apiPaths.reviewWorkspaceOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.reviewOverview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /reviews - every review row (pending + reviewed), joined with trades
  http.get(endpoint(apiPaths.reviewWorkspace), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listReviews());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PUT /reviews/:tradeId - upsert the post-trade review (URL is authoritative)
  http.put(endpoint(apiPaths.reviewWorkspaceEntry(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(upsertReviewInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.upsertReview({ ...input, tradeId: pathParam(params, "tradeId") }),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /reviews/:tradeId - undo a review (trade returns to pending)
  http.delete(endpoint(apiPaths.reviewWorkspaceEntry(":tradeId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteReview(pathParam(params, "tradeId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /reviews/lessons - the lessons library (union of all sources)
  http.get(endpoint(apiPaths.reviewLessons), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listLessons());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /goals - goals WITH computed progress (targets vs real behavior)
  http.get(endpoint(apiPaths.goals), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listGoals());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /goals
  http.post(endpoint(apiPaths.goals), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createGoalInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createGoal(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /goals/:goalId
  http.patch(endpoint(apiPaths.goal(":goalId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateGoalInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateGoal(pathParam(params, "goalId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /goals/:goalId
  http.delete(endpoint(apiPaths.goal(":goalId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteGoal(pathParam(params, "goalId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

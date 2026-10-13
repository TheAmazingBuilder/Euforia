import { http, HttpResponse } from "msw";
import {
  createSocialPostInputSchema,
  socialPeriodSchema,
  updateSocialMeInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Social Trading domain — the shareable performance card, the period
 * leaderboards and the community feed ("the trading floor").
 */
export const socialHandlers = [
  // GET /social/overview?period=WEEK|MONTH|ALL
  http.get(endpoint(apiPaths.socialOverview), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const raw = url.searchParams.get("period") ?? "WEEK";
      const period = socialPeriodSchema.catch("WEEK").parse(raw);
      return HttpResponse.json(mockStore.socialOverview(period));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /social/me — the shareable card alone (profile identity block)
  http.get(endpoint(apiPaths.socialMe), async () => {
    await latency();
    return HttpResponse.json(mockStore.getSocialMe());
  }),

  // PATCH /social/me — publish / unpublish the card, rename the handle
  http.patch(endpoint(apiPaths.socialMe), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(updateSocialMeInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateSocialMe(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /social/posts — share a result / lesson / milestone to the feed
  http.post(endpoint(apiPaths.socialPosts), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createSocialPostInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createSocialPost(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /social/posts/:id/like — toggle my like on a feed post
  http.post(endpoint(apiPaths.socialPostLike(":postId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(
        mockStore.toggleSocialPostLike(pathParam(params, "postId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /social/traders/:traderId/follow — toggle follow on a member
  http.post(endpoint(apiPaths.socialFollow(":traderId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(
        mockStore.toggleSocialFollow(pathParam(params, "traderId")),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

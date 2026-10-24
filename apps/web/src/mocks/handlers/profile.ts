import { http, HttpResponse } from "msw";
import { profileUpdateInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, readJson, requireAuth, toErrorResponse } from "./utils";

/** Profile domain - GET /me (identity) + PATCH /me (direct edit). */
export const profileHandlers = [
  http.get(endpoint(apiPaths.me), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(mockStore.getProfile());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.patch(endpoint(apiPaths.me), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(profileUpdateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateProfile(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

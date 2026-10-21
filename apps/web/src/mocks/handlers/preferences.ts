import { http, HttpResponse } from "msw";
import {
  deactivateAccountInputSchema,
  preferenceDomainSchema,
  requestAccountDeletionInputSchema,
  resetPreferencesInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, readJson, toErrorResponse } from "./utils";

/**
 * Preferences domain (Settings module) — one GET for the whole document,
 * PATCH / reset PER DOMAIN so unrelated settings are never saved together.
 * Every PATCH body is validated with the shared zod schema (server-side
 * validation even in mock mode) and merged only after it passes.
 */
export const preferencesHandlers = [
  http.get(endpoint(apiPaths.preferences), async () => {
    await latency();
    return HttpResponse.json(mockStore.getPreferences());
  }),

  http.patch(endpoint(apiPaths.preferenceDomain(":domain")), async ({ params, request }) => {
    await latency();
    try {
      const rawDomain = (params as Record<string, unknown>).domain;
      const domain = preferenceDomainSchema.parse(rawDomain);
      const body: unknown = await readJson(request);
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return HttpResponse.json(
          { error: "Request body must be a JSON object" },
          { status: 400 },
        );
      }
      return HttpResponse.json(
        mockStore.updatePreferencesDomain(domain, body as Record<string, unknown>),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.preferencesReset), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(resetPreferencesInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.resetPreferencesDomain(input.domain));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Account actions (dangerous — typed confirmation payloads) ─────────────

  http.post(endpoint(apiPaths.accountDeactivate), async ({ request }) => {
    await latency();
    try {
      parseBody(deactivateAccountInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.deactivateAccount());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.accountDelete), async ({ request }) => {
    await latency();
    try {
      parseBody(requestAccountDeletionInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.requestAccountDeletion());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

import { http, HttpResponse } from "msw";
import {
  createKeyLevelInputSchema,
  createSavedAnalysisInputSchema,
  endSessionInputSchema,
  startSessionInputSchema,
  updateKeyLevelInputSchema,
  updateSessionInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Session Live domain — trading-session lifecycle, saved analyses and key
 * levels. READ-ONLY relative to any broker: every endpoint here mutates
 * application-owned documentation entities only (sessions, analyses,
 * levels). There is deliberately NO order/execution path in this module
 * (MASTER PROMPT §2, §50, Phase 15 negative-capability requirement).
 */
export const sessionLiveHandlers = [
  http.get(endpoint(apiPaths.sessionLiveSessions), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.sessionLiveState());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.sessionLiveSessions), async ({ request }) => {
    await latency();
    try {
      const input = startSessionInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.startSessionLive(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.patch(endpoint(apiPaths.sessionLiveSession(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      const sessionId = pathParam(params, "sessionId");
      const input = updateSessionInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.updateSessionLive(sessionId, input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.sessionLiveSessionEnd(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      const sessionId = pathParam(params, "sessionId");
      const input = endSessionInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.endSessionLive(sessionId, input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.sessionLiveSessionCancel(":sessionId")), async ({ params }) => {
    await latency();
    try {
      const sessionId = pathParam(params, "sessionId");
      return HttpResponse.json(mockStore.cancelSessionLive(sessionId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Saved analyses ────────────────────────────────────────────────────────
  http.get(endpoint(apiPaths.sessionLiveAnalyses), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listSavedAnalyses());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.sessionLiveAnalyses), async ({ request }) => {
    await latency();
    try {
      const input = createSavedAnalysisInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.createSavedAnalysis(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.sessionLiveAnalysis(":analysisId")), async ({ params }) => {
    await latency();
    try {
      const analysisId = pathParam(params, "analysisId");
      return HttpResponse.json(mockStore.deleteSavedAnalysis(analysisId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Key levels ────────────────────────────────────────────────────────────
  http.get(endpoint(apiPaths.sessionLiveLevels), async ({ request }) => {
    await latency();
    try {
      const symbol = new URL(request.url).searchParams.get("symbol");
      return HttpResponse.json(mockStore.listKeyLevels(symbol));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.sessionLiveLevels), async ({ request }) => {
    await latency();
    try {
      const input = createKeyLevelInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.createKeyLevel(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.patch(endpoint(apiPaths.sessionLiveLevel(":levelId")), async ({ request, params }) => {
    await latency();
    try {
      const levelId = pathParam(params, "levelId");
      const input = updateKeyLevelInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.updateKeyLevel(levelId, input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.sessionLiveLevel(":levelId")), async ({ params }) => {
    await latency();
    try {
      const levelId = pathParam(params, "levelId");
      return HttpResponse.json(mockStore.deleteKeyLevel(levelId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

import { http, HttpResponse } from "msw";
import {
  advanceReplayInputSchema,
  closeReplayTradeInputSchema,
  createReplayDecisionInputSchema,
  createReplayNoteInputSchema,
  createReplaySessionInputSchema,
  createReplayTradeInputSchema,
  updateReplaySessionInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, pathParam, readJson, toErrorResponse, requireAuth } from "./utils";

/**
 * Replay domain — the first-class historical replay module. SIMULATION
 * ONLY (REPLAY MASTER PROMPT §37): every endpoint mutates replay-owned
 * records (sessions, simulated trades, decisions, notes). There is
 * deliberately NO order/execution path in this module — the only "close"
 * here settles a SIMULATED position in the trader's own replay.
 */
export const replayHandlers = [
  // ── Overview & sessions ────────────────────────────────────────────────────
  http.get(endpoint(apiPaths.replayOverview), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(mockStore.replayOverview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.replaySessions), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json(mockStore.replaySessions());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.replaySessions), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const input = createReplaySessionInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.replayCreateSession(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.replaySession(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      return HttpResponse.json(mockStore.replayDetail(sessionId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.replaySession(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const input = updateReplaySessionInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.replayUpdateSession(sessionId, input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.replaySessionAdvance(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const input = advanceReplayInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.replayAdvance(sessionId, input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.replaySessionComplete(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      return HttpResponse.json(mockStore.replayComplete(sessionId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.replaySessionArchive(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      return HttpResponse.json(mockStore.replayArchive(sessionId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.replaySession(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      return HttpResponse.json(mockStore.replayDeleteSession(sessionId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Simulated trades ───────────────────────────────────────────────────────
  http.post(endpoint(apiPaths.replaySessionTrades(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const input = createReplayTradeInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.replayCreateTrade(sessionId, input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.replaySessionTradeClose(":sessionId", ":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const tradeId = pathParam(params, "tradeId");
      const input = closeReplayTradeInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.replayCloseTrade(sessionId, tradeId, input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.replaySessionTrade(":sessionId", ":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const tradeId = pathParam(params, "tradeId");
      return HttpResponse.json(mockStore.replayDeleteTrade(sessionId, tradeId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Decisions ──────────────────────────────────────────────────────────────
  http.post(endpoint(apiPaths.replaySessionDecisions(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const input = createReplayDecisionInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.replayCreateDecision(sessionId, input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.replaySessionDecision(":sessionId", ":decisionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const decisionId = pathParam(params, "decisionId");
      return HttpResponse.json(mockStore.replayDeleteDecision(sessionId, decisionId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Notes ──────────────────────────────────────────────────────────────────
  http.post(endpoint(apiPaths.replaySessionNotes(":sessionId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const input = createReplayNoteInputSchema.parse(await readJson(request));
      return HttpResponse.json(mockStore.replayCreateNote(sessionId, input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.replaySessionNote(":sessionId", ":noteId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const sessionId = pathParam(params, "sessionId");
      const noteId = pathParam(params, "noteId");
      return HttpResponse.json(mockStore.replayDeleteNote(sessionId, noteId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

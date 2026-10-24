import { http, HttpResponse } from "msw";
import {
  addScreenshotInputSchema,
  bulkTradesInputSchema,
  closeTradeInputSchema,
  createSavedTradeViewInputSchema,
  createTradeInputSchema,
  importTradesInputSchema,
  notesUpdateInputSchema,
  planUpdateInputSchema,
  psychologyUpdateInputSchema,
  resolveMistakeInputSchema,
  reviewUpdateInputSchema,
  tradeDecisionInputSchema,
  tradesListQuerySchema,
  updateTradeInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, requireAuth, toErrorResponse } from "./utils";

/**
 * Trades domain - implements the endpoint matrix from trade-entry-ux.md §12
 * EXACTLY, including the hard contract: POST /trades (closed) and
 * POST /trades/:id/close respond WITHOUT any P&L field. Only the decision
 * endpoint reveals results (§13).
 */
export const tradeHandlers = [
  // GET /trades?status=&graded=&accountId= - list + "to grade" queue filter
  http.get(endpoint(apiPaths.trades), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const url = new URL(request.url);
      const raw = {
        status: url.searchParams.get("status") ?? undefined,
        graded: url.searchParams.get("graded") ?? undefined,
        accountId: url.searchParams.get("accountId") ?? undefined,
      };
      const query = tradesListQuerySchema.parse(raw);
      return HttpResponse.json(mockStore.listTrades(query));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trades - create (open → Trade; closed → { id, awaitingDecision: true })
  http.post(endpoint(apiPaths.trades), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createTradeInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createTrade(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trades/:id/close - simple or partial exits → withheld response
  http.post(endpoint(apiPaths.tradeClose(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(closeTradeInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.closeTrade(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trades/:id/decision - { grade, followedPlan } → full RevealPayload
  http.post(endpoint(apiPaths.tradeDecision(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(tradeDecisionInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.decide(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /trades/:id/review - Act 3 data (detected mistakes + trade)
  http.get(endpoint(apiPaths.tradeReview(":tradeId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.getReview(pathParam(params, "tradeId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /trades/:id/review - Act 3 persistence (MFE/MAE prices, lesson, tags)
  http.patch(endpoint(apiPaths.tradeReview(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(reviewUpdateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateReview(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /trades/:id/mistakes/:mistakeId - { confirmed: bool }
  http.patch(endpoint(apiPaths.tradeMistake(":tradeId", ":mistakeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(resolveMistakeInputSchema, await readJson(request));
      return HttpResponse.json(
        mockStore.resolveMistake(pathParam(params, "tradeId"), pathParam(params, "mistakeId"), input.confirmed),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /trades/:id/plan - SL/TP modification; TradeEvent forged SERVER-side
  http.patch(endpoint(apiPaths.tradePlan(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(planUpdateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updatePlan(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /trades/:id/psychology - in-trade emotion taps
  http.patch(endpoint(apiPaths.tradePsychology(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(psychologyUpdateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updatePsychology(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /trades/:id/notes - session note icon quick-save
  http.patch(endpoint(apiPaths.tradeNotes(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(notesUpdateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateNotes(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Trade module: edit / delete / screenshots ─────────────────────────────

  // PATCH /trades/:id - journal correction (server recomputes closed results)
  http.patch(endpoint(apiPaths.trade(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateTradeInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateTrade(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /trades/:id - soft delete
  http.delete(endpoint(apiPaths.trade(":tradeId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteTrade(pathParam(params, "tradeId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Trade module upgrades: views / bulk / import / session series ─────────

  // GET /trade-views - saved (filters + columns) presets
  http.get(endpoint(apiPaths.tradeViews), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listTradeViews());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trade-views - snapshot the current table state
  http.post(endpoint(apiPaths.tradeViews), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createSavedTradeViewInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createTradeView(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /trade-views/:id
  http.delete(endpoint(apiPaths.tradeView(":viewId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.deleteTradeView(pathParam(params, "viewId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trades/bulk - tag / grade / delete multiple trades in one call
  http.post(endpoint(apiPaths.tradesBulk), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(bulkTradesInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.bulkTrades(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trades/import - normalized rows from the CSV mapping dialog
  http.post(endpoint(apiPaths.tradesImport), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(importTradesInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.importTrades(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /trades/:id/session-series - price path + recorded levels for the projection chart
  http.get(endpoint(apiPaths.tradeSessionSeries(":tradeId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.getTradeSessionSeries(pathParam(params, "tradeId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /trades/:id/screenshots - gallery for the detail drawer
  http.get(endpoint(apiPaths.tradeScreenshots(":tradeId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listScreenshots(pathParam(params, "tradeId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trades/:id/screenshots - upload (data URL)
  http.post(endpoint(apiPaths.tradeScreenshots(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(addScreenshotInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.addScreenshot(pathParam(params, "tradeId"), input), {
        status: 201,
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /trades/:id/screenshots/:screenshotId
  http.delete(
    endpoint(apiPaths.tradeScreenshot(":tradeId", ":screenshotId")),
    async ({ params }) => {
      await latency();
      try {
        return HttpResponse.json(
          mockStore.deleteScreenshot(pathParam(params, "tradeId"), pathParam(params, "screenshotId")),
        );
      } catch (error) {
        return toErrorResponse(error);
      }
    },
  ),
];

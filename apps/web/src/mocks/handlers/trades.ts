import { http, HttpResponse } from "msw";
import {
  closeTradeInputSchema,
  createTradeInputSchema,
  planUpdateInputSchema,
  psychologyUpdateInputSchema,
  resolveMistakeInputSchema,
  reviewUpdateInputSchema,
  tradeDecisionInputSchema,
  tradesListQuerySchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Trades domain — implements the endpoint matrix from trade-entry-ux.md §12
 * EXACTLY, including the hard contract: POST /trades (closed) and
 * POST /trades/:id/close respond WITHOUT any P&L field. Only the decision
 * endpoint reveals results (§13).
 */
export const tradeHandlers = [
  // GET /trades?status=&graded=&accountId= — list + "to grade" queue filter
  http.get(endpoint(apiPaths.trades), async ({ request }) => {
    await latency();
    try {
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

  // POST /trades — create (open → Trade; closed → { id, awaitingDecision: true })
  http.post(endpoint(apiPaths.trades), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createTradeInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createTrade(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trades/:id/close — simple or partial exits → withheld response
  http.post(endpoint(apiPaths.tradeClose(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(closeTradeInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.closeTrade(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /trades/:id/decision — { grade, followedPlan } → full RevealPayload
  http.post(endpoint(apiPaths.tradeDecision(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(tradeDecisionInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.decide(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /trades/:id/review — Act 3 data (detected mistakes + trade)
  http.get(endpoint(apiPaths.tradeReview(":tradeId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(mockStore.getReview(pathParam(params, "tradeId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /trades/:id/review — Act 3 persistence (MFE/MAE prices, lesson, tags)
  http.patch(endpoint(apiPaths.tradeReview(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(reviewUpdateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateReview(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /trades/:id/mistakes/:mistakeId — { confirmed: bool }
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

  // PATCH /trades/:id/plan — SL/TP modification; TradeEvent forged SERVER-side
  http.patch(endpoint(apiPaths.tradePlan(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(planUpdateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updatePlan(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /trades/:id/psychology — in-trade emotion taps
  http.patch(endpoint(apiPaths.tradePsychology(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(psychologyUpdateInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updatePsychology(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

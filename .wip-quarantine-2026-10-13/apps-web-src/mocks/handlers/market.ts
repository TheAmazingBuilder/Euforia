import { http, HttpResponse } from "msw";
import { timeframeSchema, updateTradeChartInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Market data domain (feature Charts):
 *  - GET /market/candles            — deterministic OHLCV history for the replay chart;
 *  - GET /market/symbol-history     — recent closed trades on one instrument (ApexCharts panel);
 *  - PATCH /trades/:id/chart        — persist timeframe + support/resistance zones.
 */
export const marketHandlers = [
  http.get(endpoint(apiPaths.marketCandles), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const symbol = url.searchParams.get("symbol");
      if (!symbol) return HttpResponse.json({ error: "symbol is required" }, { status: 400 });
      const timeframe = timeframeSchema.parse(url.searchParams.get("timeframe") ?? "M15");
      const limit = Number(url.searchParams.get("limit") ?? "320");
      return HttpResponse.json(mockStore.getInstrumentCandles(symbol, timeframe, limit));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.get(endpoint(apiPaths.symbolHistory), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const instrumentId = url.searchParams.get("instrumentId");
      if (!instrumentId) {
        return HttpResponse.json({ error: "instrumentId is required" }, { status: 400 });
      }
      return HttpResponse.json(mockStore.getSymbolHistory(instrumentId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.patch(endpoint(apiPaths.tradeChart(":tradeId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody(updateTradeChartInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.updateTradeChart(pathParam(params, "tradeId"), input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Candle, CandlesResponse, MarketInterval } from "@cosmoz/shared";

import { generateSimCandles, getChartSymbol, SIM_BAR_COUNT } from "@/lib/charts/chart-sim";
import { marketFetch } from "@/lib/realtime/market";

/**
 * Chart datafeed — one query, two sources, explicit about which served.
 *
 * 1. The authenticated market service (:3003, same feed as Session Live —
 *    gateway/rewrite proxy, NOT the /api MSW surface).
 * 2. On failure (service offline, sandbox, network), the deterministic SIM
 *    engine (lib/charts/chart-sim) generates the history locally. The caller
 *    receives `source: "sim"` and MUST display it as such — claiming a
 *    simulated feed is real is a hard product lie (mission §16).
 *
 * `nowMs` is captured inside the queryFn (impure in render — the react-hooks
 * rule keeps Date.now out of component bodies), so the SIM series regenerates
 * on refetch boundaries, not on every render.
 */

export type ChartFeedSource = "real" | "sim";

export interface ChartCandlesResult {
  candles: Candle[];
  source: ChartFeedSource;
}

const MARKET_PORT = 3003;
const CANDLES_URL = `/candles?XTransformPort=${MARKET_PORT}`;
const REAL_BAR_COUNT = 1000;
/** One quiet refetch; the SIM fallback must feel instant, not sluggish. */
const RETRIES = 1;

export function useChartCandles(symbol: string, interval: MarketInterval) {
  return useQuery({
    queryKey: ["chart-candles", symbol, interval],
    enabled: symbol.length > 0,
    queryFn: async (): Promise<ChartCandlesResult> => {
      const url = `${CANDLES_URL}&symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${REAL_BAR_COUNT}`;
      try {
        // marketFetch presents the SAME Bearer credential as Session Live
        // and single-flights a refresh on 401 (mission §45 reuse rule).
        const response = await marketFetch(url);
        if (!response.ok) throw new Error(`candles ${response.status}`);
        const payload = (await response.json()) as CandlesResponse;
        const candles = payload.candles ?? [];
        if (candles.length < 30) throw new Error("candles too thin");
        // The service labels its own feed — trust it verbatim (it serves
        // real provider candles, or its own SIM-materialized walk).
        return { candles, source: payload.source === "real" ? "real" : "sim" };
      } catch {
        // Market service unreachable — deterministic local series, labeled SIM.
        const spec = getChartSymbol(symbol);
        return {
          candles: generateSimCandles(spec, interval, Date.now()),
          source: "sim",
        };
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
    retry: RETRIES,
  });
}

/** Bar count the pane can expect (used by the range bar clamping). */
export function chartBarCapacity(): number {
  return SIM_BAR_COUNT;
}

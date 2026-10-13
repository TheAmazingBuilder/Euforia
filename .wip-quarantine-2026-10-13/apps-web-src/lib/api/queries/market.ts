import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChartCandlesResponse,
  SymbolHistoryResponse,
  Timeframe,
  TradeChartResponse,
  UpdateTradeChartInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys, tradeMutationInvalidations } from "@/lib/api/keys";

/** GET /market/candles — deterministic OHLCV history (replay chart). */
export function useCandles(symbol: string | null, timeframe: Timeframe) {
  return useQuery({
    queryKey: queryKeys.candles(symbol ?? "none", timeframe),
    queryFn: () =>
      apiRequest<ChartCandlesResponse>(apiPaths.marketCandles, {
        query: { symbol: symbol!, timeframe, limit: "320" },
      }),
    enabled: symbol !== null,
    // The generator is a pure function of (symbol, timeframe, quarter) —
    // cache aggressively; the chart is a replay, not a live feed.
    staleTime: 60_000,
  });
}

/** GET /market/symbol-history — recent closed trades on the trade's symbol. */
export function useSymbolHistory(instrumentId: string | null) {
  return useQuery({
    queryKey: queryKeys.symbolHistory(instrumentId ?? "none"),
    queryFn: () =>
      apiRequest<SymbolHistoryResponse>(apiPaths.symbolHistory, {
        query: { instrumentId: instrumentId! },
      }),
    enabled: instrumentId !== null,
  });
}

/** PATCH /trades/:id/chart — persist timeframe switch / zone edits. */
export function useUpdateTradeChart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, input }: { tradeId: string; input: UpdateTradeChartInput }) =>
      apiRequest<TradeChartResponse>(apiPaths.tradeChart(tradeId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async () => {
      // The trade row (timeframe/zones) feeds the drawer + lists.
      await Promise.all(
        [queryKeys.tradesRoot, queryKeys.tradeChartRoot].map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
    },
  });
}

/** Re-export the shared invalidation list for panels that mutate trades. */
export { tradeMutationInvalidations };

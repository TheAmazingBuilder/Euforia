import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSkippedTradeInput,
  SettleSkippedTradeInput,
  SkippedTrade,
  SkippedTradesResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** Ghost trades (Registre des Regrets) hooks. */

export function useSkippedTrades() {
  return useQuery({
    queryKey: queryKeys.skippedTrades,
    queryFn: () => apiRequest<SkippedTradesResponse>(apiPaths.skippedTrades),
  });
}

export function useCreateSkippedTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkippedTradeInput) =>
      apiRequest<SkippedTrade>(apiPaths.skippedTrades, { method: "POST", body: input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.skippedTrades }),
        queryClient.invalidateQueries({ queryKey: queryKeys.statsOverview }),
      ]);
    },
  });
}

export function useSettleSkippedTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skippedId, input }: { skippedId: string; input: SettleSkippedTradeInput }) =>
      apiRequest<SkippedTrade>(apiPaths.skippedTradeSettle(skippedId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.skippedTrades }),
        queryClient.invalidateQueries({ queryKey: queryKeys.statsOverview }),
      ]);
    },
  });
}

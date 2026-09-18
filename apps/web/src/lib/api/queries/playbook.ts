import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateStrategyInput,
  Strategy,
  StrategiesStatsResponse,
  UpdateStrategyInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** Playbook domain hooks — strategy CRUD + server-computed per-strategy stats. */

export function useStrategiesStats() {
  return useQuery({
    queryKey: queryKeys.strategiesStats,
    queryFn: () => apiRequest<StrategiesStatsResponse>(apiPaths.strategyStats),
  });
}

function useStrategyInvalidation() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.strategies });
    await queryClient.invalidateQueries({ queryKey: queryKeys.strategiesStats });
  };
}

/** POST /strategies — create a playbook entry. */
export function useCreateStrategy() {
  const invalidate = useStrategyInvalidation();
  return useMutation({
    mutationFn: (input: CreateStrategyInput) =>
      apiRequest<Strategy>(apiPaths.strategies, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** PATCH /strategies/:id — edit a playbook entry. */
export function useUpdateStrategy() {
  const invalidate = useStrategyInvalidation();
  return useMutation({
    mutationFn: ({ strategyId, input }: { strategyId: string; input: UpdateStrategyInput }) =>
      apiRequest<Strategy>(apiPaths.strategy(strategyId), { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** DELETE /strategies/:id — rejected (409) while trades are attached. */
export function useDeleteStrategy() {
  const invalidate = useStrategyInvalidation();
  return useMutation({
    mutationFn: (strategyId: string) =>
      apiRequest<{ ok: true }>(apiPaths.strategy(strategyId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

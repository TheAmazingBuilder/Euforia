import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTradePlanInput,
  DeleteTradePlanResponse,
  PlannerRiskResponse,
  TradePlan,
  TradePlanResponse,
  TradePlansResponse,
  UpdateTradePlanInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Trade Planner hooks — plan CRUD + the Risk & Money Management aggregate.
 * Mutations invalidate the plan collections AND the risk summary (planned
 * risk is derived from READY plans), plus rules-status (daily risk budget
 * reacts to nothing here, but the summary reads its methodology).
 */

export function useTradePlans() {
  return useQuery({
    queryKey: queryKeys.plannerPlans,
    queryFn: () => apiRequest<TradePlansResponse>(apiPaths.plannerPlans),
    // Planner data is derived from mutable global state (risk preferences,
    // Rules Engine, today's budget) — always refetch on mount, never serve
    // the 30s-default stale verdict from another module's session.
    staleTime: 0,
  });
}

export function useTradePlan(planId: string | null) {
  return useQuery({
    queryKey: queryKeys.plannerPlan(planId ?? "none"),
    queryFn: () => apiRequest<TradePlanResponse>(apiPaths.plannerPlan(planId!)),
    enabled: planId !== null,
    staleTime: 0,
  });
}

export function usePlannerRisk() {
  return useQuery({
    queryKey: queryKeys.plannerRisk,
    queryFn: () => apiRequest<PlannerRiskResponse>(apiPaths.plannerRisk),
    staleTime: 0,
  });
}

function usePlannerInvalidation() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.plannerPlans });
    await queryClient.invalidateQueries({ queryKey: queryKeys.plannerRisk });
    // Cross-module: a plan update can attach the executed-trade link, which
    // adds the plan-vs-actual comparison to Trade Review rows — those read
    // models must not serve a stale verdict (spec: inform, never silently age).
    await queryClient.invalidateQueries({ queryKey: queryKeys.reviewWorkspaceRoot });
    await queryClient.invalidateQueries({ queryKey: queryKeys.reviewWorkspaceOverview });
  };
}

/** POST /planner/plans — create a DRAFT plan (checklist composed server-side). */
export function useCreateTradePlan() {
  const invalidate = usePlannerInvalidation();
  return useMutation({
    mutationFn: (input: CreateTradePlanInput) =>
      apiRequest<TradePlanResponse>(apiPaths.plannerPlans, {
        method: "POST",
        body: input,
      }),
    onSuccess: async () => {
      await invalidate();
    },
  });
}

/**
 * PATCH /planner/plans/:id — content edits, manual checklist states and
 * lifecycle transitions (status), all validated server-side.
 */
export function useUpdateTradePlan() {
  const queryClient = useQueryClient();
  const invalidate = usePlannerInvalidation();
  return useMutation({
    mutationFn: ({ planId, input }: { planId: string; input: UpdateTradePlanInput }) =>
      apiRequest<TradePlanResponse>(apiPaths.plannerPlan(planId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async (_data, variables) => {
      await invalidate();
      // The singleton cache is refetched from the refreshed collections —
      // invalidate rather than hand-merge (cheap, always correct).
      await queryClient.invalidateQueries({
        queryKey: queryKeys.plannerPlan(variables.planId),
      });
    },
  });
}

/** DELETE /planner/plans/:id — allowed for DRAFT / CANCELLED / EXPIRED only. */
export function useDeleteTradePlan() {
  const queryClient = useQueryClient();
  const invalidate = usePlannerInvalidation();
  return useMutation({
    mutationFn: (planId: string) =>
      apiRequest<DeleteTradePlanResponse>(apiPaths.plannerPlan(planId), {
        method: "DELETE",
      }),
    onSuccess: async (_data, planId) => {
      await invalidate();
      // A deleted resource must not be refetched by stale singleton caches —
      // remove it instead of invalidating (avoids a guaranteed 404 round-trip).
      queryClient.removeQueries({ queryKey: queryKeys.plannerPlan(planId) });
    },
  });
}

export type { TradePlan };

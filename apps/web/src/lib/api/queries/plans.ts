import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AnalysisPlanDetailResponse,
  AnalysisPlanMutatedResponse,
  AnalysisPlansResponse,
  CompletePlanInput,
  CreateAnalysisPlanInput,
  InvalidatePlanInput,
  LinkPlanTradeInput,
  UpdateAnalysisPlanInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Trade Plan hooks (Phase 11 - documented reasoning, never execution).
 *
 * The plan lifecycle lives SERVER-SIDE (state machine, activation gate,
 * ownership checks, canonical-trade linkage rules) - these hooks are thin
 * transports. Every mutation refreshes the plan list + detail caches; trade
 * aggregates are deliberately NOT invalidated: plans never touch canonical
 * trade facts, so the journal numbers cannot change here.
 */

export interface PlansParams {
  tradeId?: string;
  status?: string;
  symbol?: string;
}

/** GET /plans - list with the server's filters (status, symbol, tradeId). */
export function usePlans(params: PlansParams = {}) {
  return useQuery({
    queryKey: queryKeys.plans(params),
    queryFn: () =>
      apiRequest<AnalysisPlansResponse>(apiPaths.plans, {
        query: {
          tradeId: params.tradeId,
          status: params.status,
          symbol: params.symbol,
        },
      }),
  });
}

/** GET /plans/:id - the plan + its planned-vs-actual comparison. */
export function usePlanDetail(planId: string | null) {
  return useQuery({
    queryKey: queryKeys.planDetail(planId ?? "none"),
    queryFn: () =>
      apiRequest<AnalysisPlanDetailResponse>(apiPaths.plan(planId!)),
    enabled: planId !== null,
  });
}

/** Shared cache refresh for any plan mutation - ["plans"] is the prefix of
 *  BOTH the list keys and the detail keys, so one call covers everything. */
function usePlanMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.plansRoot });
    },
  });
}

/** POST /plans - creates a DRAFT (or ACTIVE when activate:true). A retried
 *  clientRequestId surfaces as a 422 with PLAN_TRADE_ALREADY_LINKED. */
export function useCreatePlan() {
  return usePlanMutation((input: CreateAnalysisPlanInput) =>
    apiRequest<AnalysisPlanMutatedResponse>(apiPaths.plans, {
      method: "POST",
      body: input,
    }),
  );
}

/** PATCH /plans/:id - editable in DRAFT/ACTIVE only (server-enforced).
 *  Named ...AnalysisPlan to stay distinct from the legacy trades useUpdatePlan. */
export function useUpdateAnalysisPlan() {
  return usePlanMutation(({
    planId,
    input,
  }: {
    planId: string;
    input: UpdateAnalysisPlanInput;
  }) =>
    apiRequest<AnalysisPlanMutatedResponse>(apiPaths.plan(planId), {
      method: "PATCH",
      body: input,
    }),
  );
}

/** POST /plans/:id/activate - DRAFT → ACTIVE; requires documented
 *  invalidation criteria (PLAN_ACTIVATION_INCOMPLETE otherwise). */
export function useActivatePlan() {
  return usePlanMutation((planId: string) =>
    apiRequest<AnalysisPlanMutatedResponse>(apiPaths.planActivate(planId), {
      method: "POST",
    }),
  );
}

/** POST /plans/:id/invalidate - ACTIVE → INVALIDATED with a REQUIRED reason. */
export function useInvalidatePlan() {
  return usePlanMutation(({
    planId,
    input,
  }: {
    planId: string;
    input: InvalidatePlanInput;
  }) =>
    apiRequest<AnalysisPlanMutatedResponse>(apiPaths.planInvalidate(planId), {
      method: "POST",
      body: input,
    }),
  );
}

/** POST /plans/:id/complete - ACTIVE → COMPLETED; carries the process-focused
 *  review (notes + neutral tags). Comparison stays derivable afterwards. */
export function useCompletePlan() {
  return usePlanMutation(({
    planId,
    input,
  }: {
    planId: string;
    input: CompletePlanInput;
  }) =>
    apiRequest<AnalysisPlanMutatedResponse>(apiPaths.planComplete(planId), {
      method: "POST",
      body: input,
    }),
  );
}

/** POST /plans/:id/archive - the terminal (but non-destructive) transition. */
export function useArchivePlan() {
  return usePlanMutation((planId: string) =>
    apiRequest<AnalysisPlanMutatedResponse>(apiPaths.planArchive(planId), {
      method: "POST",
    }),
  );
}

/** POST /plans/:id/link-trade - canonical-trade association. The server
 *  validates ownership (404) and instrument (422 PLAN_TRADE_SYMBOL_MISMATCH
 *  unless confirmSymbolMismatch - the UI asks BEFORE sending that flag). */
export function useLinkPlanTrade() {
  return usePlanMutation(({
    planId,
    input,
  }: {
    planId: string;
    input: LinkPlanTradeInput;
  }) =>
    apiRequest<AnalysisPlanMutatedResponse>(apiPaths.planLinkTrade(planId), {
      method: "POST",
      body: input,
    }),
  );
}

/** DELETE /plans/:id/link-trade - the association only; the trade is never
 *  touched (unlinking NEVER mutates the canonical record). */
export function useDetachPlanTrade() {
  return usePlanMutation((planId: string) =>
    apiRequest<AnalysisPlanMutatedResponse>(apiPaths.planLinkTrade(planId), {
      method: "DELETE",
    }),
  );
}

/** DELETE /plans/:id - hard delete of the plan document only. */
export function useDeletePlan() {
  return usePlanMutation((planId: string) =>
    apiRequest<{ ok: true }>(apiPaths.plan(planId), { method: "DELETE" }),
  );
}

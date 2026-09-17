import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CloseTradeInput,
  CreateTradeInput,
  CreateTradeResponse,
  PlanUpdateInput,
  PlanUpdateResponse,
  PsychologyUpdateInput,
  RevealPayload,
  ResolveMistakeInput,
  ResolveMistakeResponse,
  ReviewResponse,
  Trade,
  TradeDecisionInput,
  TradesListResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys, tradeMutationInvalidations } from "@/lib/api/keys";

export interface TradesParams {
  status?: string;
  graded?: string;
  accountId?: string;
}

/** GET /trades — list with filters (status, graded) per §12. */
export function useTrades(params: TradesParams = {}) {
  return useQuery({
    queryKey: queryKeys.trades(params),
    queryFn: () =>
      apiRequest<TradesListResponse>(apiPaths.trades, {
        query: {
          status: params.status,
          graded: params.graded,
          accountId: params.accountId,
        },
      }),
  });
}

/** GET /trades/:id/review — Act 3 screen data. */
export function useReview(tradeId: string | null) {
  return useQuery({
    queryKey: queryKeys.review(tradeId ?? "none"),
    queryFn: () => apiRequest<ReviewResponse>(apiPaths.tradeReview(tradeId!)),
    enabled: tradeId !== null,
  });
}

function useTradeMutation<TInput, TOutput>(mutationFn: (input: TInput) => Promise<TOutput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // Every trade mutation triggers a discipline re-evaluation — the banner
    // (rules status), lists and analytics all refetch (§12 contract note).
    onSuccess: async () => {
      await Promise.all(
        tradeMutationInvalidations.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
    },
  });
}

/** POST /trades — create open (returns Trade) or closed (withheld payload). */
export function useCreateTrade() {
  return useTradeMutation((input: CreateTradeInput) =>
    apiRequest<CreateTradeResponse>(apiPaths.trades, { method: "POST", body: input }),
  );
}

/** POST /trades/:id/close — simple or partial exits; response withholds P&L. */
export function useCloseTrade() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: CloseTradeInput }) =>
    apiRequest<CreateTradeResponse>(apiPaths.tradeClose(tradeId), { method: "POST", body: input }),
  );
}

/** POST /trades/:id/decision — submits the gate, returns the RevealPayload. */
export function useDecision() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: TradeDecisionInput }) =>
    apiRequest<RevealPayload>(apiPaths.tradeDecision(tradeId), { method: "POST", body: input }),
  );
}

/** PATCH /trades/:id/plan — modify SL/TP; server forges the TradeEvent. */
export function useUpdatePlan() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: PlanUpdateInput }) =>
    apiRequest<PlanUpdateResponse>(apiPaths.tradePlan(tradeId), { method: "PATCH", body: input }),
  );
}

/** PATCH /trades/:id/psychology — in-trade emotion quick-log. */
export function useUpdatePsychology() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: PsychologyUpdateInput }) =>
    apiRequest<Trade>(apiPaths.tradePsychology(tradeId), { method: "PATCH", body: input }),
  );
}

/** PATCH /trades/:id/mistakes/:mistakeId — confirm/dismiss an auto-detection. */
export function useResolveMistake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, mistakeId, input }: { tradeId: string; mistakeId: string; input: ResolveMistakeInput }) =>
      apiRequest<ResolveMistakeResponse>(apiPaths.tradeMistake(tradeId, mistakeId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.review(variables.tradeId) });
    },
  });
}

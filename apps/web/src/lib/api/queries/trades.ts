import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddScreenshotInput,
  BulkTradesInput,
  BulkTradesResponse,
  CloseTradeInput,
  CreateSavedTradeViewInput,
  CreateSavedTradeViewResponse,
  CreateTradeInput,
  CreateTradeResponse,
  DeleteSavedTradeViewResponse,
  DeleteScreenshotResponse,
  DeleteTradeResponse,
  ImportTradesInput,
  ImportTradesResponse,
  NotesUpdateInput,
  NotesUpdateResponse,
  PlanUpdateInput,
  PlanUpdateResponse,
  PsychologyUpdateInput,
  RevealPayload,
  ResolveMistakeInput,
  ResolveMistakeResponse,
  ReviewResponse,
  ReviewUpdateInput,
  ReviewUpdateResponse,
  SavedTradeViewsResponse,
  Trade,
  TradeDecisionInput,
  TradeScreenshot,
  TradeScreenshotsResponse,
  TradeSessionSeriesResponse,
  TradesListResponse,
  UpdateTradeInput,
  UpdateTradeResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys, tradeMutationInvalidations } from "@/lib/api/keys";

export interface TradesParams {
  status?: string;
  graded?: string;
  accountId?: string;
}

/** GET /trades - list with filters (status, graded) per §12. */
export function useTrades(params: TradesParams = {}) {
  return useQuery({
    queryKey: queryKeys.trades(params),
    // Phase 09 - signal forwarding: switching account/status aborts the
    // superseded in-flight request instead of orphaning it.
    queryFn: ({ signal }) =>
      apiRequest<TradesListResponse>(apiPaths.trades, {
        signal,
        query: {
          status: params.status,
          graded: params.graded,
          accountId: params.accountId,
        },
      }),
  });
}

/** GET /trades/:id/review - Act 3 screen data. */
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
    // Every trade mutation triggers a discipline re-evaluation - the banner
    // (rules status), lists and analytics all refetch (§12 contract note).
    onSuccess: async () => {
      await Promise.all(
        tradeMutationInvalidations.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
    },
  });
}

/** POST /trades - create open (returns Trade) or closed (withheld payload). */
export function useCreateTrade() {
  return useTradeMutation((input: CreateTradeInput) =>
    apiRequest<CreateTradeResponse>(apiPaths.trades, { method: "POST", body: input }),
  );
}

/** POST /trades/:id/close - simple or partial exits; response withholds P&L. */
export function useCloseTrade() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: CloseTradeInput }) =>
    apiRequest<CreateTradeResponse>(apiPaths.tradeClose(tradeId), { method: "POST", body: input }),
  );
}

/** POST /trades/:id/decision - submits the gate, returns the RevealPayload. */
export function useDecision() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: TradeDecisionInput }) =>
    apiRequest<RevealPayload>(apiPaths.tradeDecision(tradeId), { method: "POST", body: input }),
  );
}

/** PATCH /trades/:id/plan - modify SL/TP; server forges the TradeEvent. */
export function useUpdatePlan() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: PlanUpdateInput }) =>
    apiRequest<PlanUpdateResponse>(apiPaths.tradePlan(tradeId), { method: "PATCH", body: input }),
  );
}

/** PATCH /trades/:id/psychology - in-trade emotion quick-log. */
export function useUpdatePsychology() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: PsychologyUpdateInput }) =>
    apiRequest<Trade>(apiPaths.tradePsychology(tradeId), { method: "PATCH", body: input }),
  );
}

/** PATCH /trades/:id/notes - session note icon quick-save. */
export function useUpdateNotes() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: NotesUpdateInput }) =>
    apiRequest<NotesUpdateResponse>(apiPaths.tradeNotes(tradeId), { method: "PATCH", body: input }),
  );
}

/** PATCH /trades/:id/mistakes/:mistakeId - confirm/dismiss an auto-detection. */
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

/** PATCH /trades/:id/review - Act 3 persistence (MFE/MAE prices, lesson, tags). */
export function useUpdateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, input }: { tradeId: string; input: ReviewUpdateInput }) =>
      apiRequest<ReviewUpdateResponse>(apiPaths.tradeReview(tradeId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.review(variables.tradeId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tradesRoot });
    },
  });
}

// ── Trade module: edit / delete / screenshots ────────────────────────────────

/** PATCH /trades/:id - journal correction; results recomputed server-side. */
export function useUpdateTrade() {
  return useTradeMutation(({ tradeId, input }: { tradeId: string; input: UpdateTradeInput }) =>
    apiRequest<UpdateTradeResponse>(apiPaths.trade(tradeId), { method: "PATCH", body: input }),
  );
}

/** DELETE /trades/:id - soft delete with full aggregate invalidation. */
export function useDeleteTrade() {
  return useTradeMutation((tradeId: string) =>
    apiRequest<DeleteTradeResponse>(apiPaths.trade(tradeId), { method: "DELETE" }),
  );
}

/** GET /trades/:id/screenshots - gallery for the detail drawer. */
export function useScreenshots(tradeId: string | null) {
  return useQuery({
    queryKey: queryKeys.screenshots(tradeId ?? "none"),
    queryFn: () => apiRequest<TradeScreenshotsResponse>(apiPaths.tradeScreenshots(tradeId!)),
    enabled: tradeId !== null,
  });
}

/** POST /trades/:id/screenshots - upload one chart evidence. */
export function useAddScreenshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, input }: { tradeId: string; input: AddScreenshotInput }) =>
      apiRequest<TradeScreenshot>(apiPaths.tradeScreenshots(tradeId), {
        method: "POST",
        body: input,
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.screenshots(variables.tradeId) });
    },
  });
}

/** DELETE /trades/:id/screenshots/:screenshotId. */
export function useDeleteScreenshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, screenshotId }: { tradeId: string; screenshotId: string }) =>
      apiRequest<DeleteScreenshotResponse>(apiPaths.tradeScreenshot(tradeId, screenshotId), {
        method: "DELETE",
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.screenshots(variables.tradeId) });
    },
  });
}

// ── Trade module upgrades: saved views / bulk ops / CSV import / session series ─

/** GET /trade-views - named (filters + columns) presets. */
export function useTradeViews() {
  return useQuery({
    queryKey: queryKeys.tradeViews,
    queryFn: () => apiRequest<SavedTradeViewsResponse>(apiPaths.tradeViews),
  });
}

/** POST /trade-views - snapshot the current table state. */
export function useCreateTradeView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedTradeViewInput) =>
      apiRequest<CreateSavedTradeViewResponse>(apiPaths.tradeViews, { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tradeViews });
    },
  });
}

/** DELETE /trade-views/:id. */
export function useDeleteTradeView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) =>
      apiRequest<DeleteSavedTradeViewResponse>(apiPaths.tradeView(viewId), { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tradeViews });
    },
  });
}

/** POST /trades/bulk - tag / grade / delete multiple trades in one round-trip. */
export function useBulkTrades() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkTradesInput) =>
      apiRequest<BulkTradesResponse>(apiPaths.tradesBulk, { method: "POST", body: input }),
    onSuccess: async () => {
      await Promise.all([
        ...tradeMutationInvalidations.map((key) => queryClient.invalidateQueries({ queryKey: key })),
        // Bulk TAG touches the review join (drawer tag chips) - refresh both.
        queryClient.invalidateQueries({ queryKey: queryKeys.reviewRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.analyticsSuiteRoot }),
      ]);
    },
  });
}

/** POST /trades/import - create trades from mapped CSV rows (idempotent). */
export function useImportTrades() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportTradesInput) =>
      apiRequest<ImportTradesResponse>(apiPaths.tradesImport, { method: "POST", body: input }),
    onSuccess: async () => {
      await Promise.all([
        ...tradeMutationInvalidations.map((key) => queryClient.invalidateQueries({ queryKey: key })),
        queryClient.invalidateQueries({ queryKey: queryKeys.analyticsSuiteRoot }),
      ]);
    },
  });
}

/** GET /trades/:id/session-series - price path + recorded levels (drawer chart). */
export function useTradeSessionSeries(tradeId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessionSeries(tradeId ?? "none"),
    queryFn: () => apiRequest<TradeSessionSeriesResponse>(apiPaths.tradeSessionSeries(tradeId!)),
    enabled: tradeId !== null,
  });
}

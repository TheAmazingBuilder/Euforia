import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateKeyLevelInput,
  CreateSavedAnalysisInput,
  DeleteResponse,
  EndSessionInput,
  EndSessionResponse,
  KeyLevelResponse,
  KeyLevelsResponse,
  SavedAnalysesResponse,
  SavedAnalysisResponse,
  SessionLiveStateResponse,
  StartSessionInput,
  TradingSessionResponse,
  UpdateKeyLevelInput,
  UpdateSessionInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Session Live domain hooks — trading-session lifecycle, saved analyses and
 * key levels. All reads/writes target app-owned entities; nothing here can
 * reach a broker (execution-negative by construction).
 */

/** GET /session-live/sessions — active session + history. */
export function useSessionLiveState() {
  return useQuery({
    queryKey: queryKeys.sessionLiveState,
    queryFn: () => apiRequest<SessionLiveStateResponse>(apiPaths.sessionLiveSessions),
  });
}

/** POST /session-live/sessions — create + start with optional context. */
export function useStartSessionLive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartSessionInput) =>
      apiRequest<TradingSessionResponse>(apiPaths.sessionLiveSessions, { method: "POST", body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessionLiveState }),
  });
}

/** PATCH /session-live/sessions/:id — bias / objective / notes while active. */
export function useUpdateSessionLive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...input }: UpdateSessionInput & { sessionId: string }) =>
      apiRequest<TradingSessionResponse>(apiPaths.sessionLiveSession(sessionId), { method: "PATCH", body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessionLiveState }),
  });
}

/** POST /session-live/sessions/:id/end — close the session, return its summary. */
export function useEndSessionLive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...input }: EndSessionInput & { sessionId: string }) =>
      apiRequest<EndSessionResponse>(apiPaths.sessionLiveSessionEnd(sessionId), { method: "POST", body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessionLiveState }),
  });
}

/** POST /session-live/sessions/:id/cancel — abandon without a summary. */
export function useCancelSessionLive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<TradingSessionResponse>(apiPaths.sessionLiveSessionCancel(sessionId), { method: "POST", body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessionLiveState }),
  });
}

// ── Saved analyses ──────────────────────────────────────────────────────────

/** GET /session-live/analyses — newest first. */
export function useSavedAnalyses() {
  return useQuery({
    queryKey: queryKeys.sessionLiveAnalyses,
    queryFn: () => apiRequest<SavedAnalysesResponse>(apiPaths.sessionLiveAnalyses),
  });
}

/** POST /session-live/analyses — freeze the current analytical context. */
export function useCreateSavedAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedAnalysisInput) =>
      apiRequest<SavedAnalysisResponse>(apiPaths.sessionLiveAnalyses, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionLiveAnalyses });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionLiveState });
    },
  });
}

/** DELETE /session-live/analyses/:id */
export function useDeleteSavedAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (analysisId: string) =>
      apiRequest<DeleteResponse>(apiPaths.sessionLiveAnalysis(analysisId), { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessionLiveAnalyses }),
  });
}

// ── Key levels ──────────────────────────────────────────────────────────────

/** GET /session-live/levels?symbol= — per-symbol documentation. */
export function useKeyLevels(symbol: string | null) {
  return useQuery({
    queryKey: queryKeys.sessionLiveLevels(symbol ?? "all"),
    enabled: symbol !== null,
    queryFn: () =>
      apiRequest<KeyLevelsResponse>(
        symbol ? `${apiPaths.sessionLiveLevels}?symbol=${encodeURIComponent(symbol)}` : apiPaths.sessionLiveLevels,
      ),
  });
}

/** POST /session-live/levels */
export function useCreateKeyLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKeyLevelInput) =>
      apiRequest<KeyLevelResponse>(apiPaths.sessionLiveLevels, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session-live-levels"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionLiveState });
    },
  });
}

/** PATCH /session-live/levels/:id */
export function useUpdateKeyLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ levelId, ...input }: UpdateKeyLevelInput & { levelId: string }) =>
      apiRequest<KeyLevelResponse>(apiPaths.sessionLiveLevel(levelId), { method: "PATCH", body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["session-live-levels"] }),
  });
}

/** DELETE /session-live/levels/:id */
export function useDeleteKeyLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (levelId: string) =>
      apiRequest<DeleteResponse>(apiPaths.sessionLiveLevel(levelId), { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["session-live-levels"] }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdvanceReplayInput,
  CloseReplayTradeInput,
  CreateReplayDecisionInput,
  CreateReplayNoteInput,
  CreateReplaySessionInput,
  CreateReplayTradeInput,
  DeleteResponse,
  ReplayDecisionResponse,
  ReplayDetailResponse,
  ReplayNoteResponse,
  ReplayOverviewResponse,
  ReplaySessionResponse,
  ReplaySessionsResponse,
  ReplayTradeResponse,
  UpdateReplaySessionInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Replay domain hooks — historical replay sessions and their simulated
 * trades / decisions / notes. SIMULATION ONLY (REPLAY MASTER PROMPT §37):
 * every hook targets replay-owned records; nothing here can reach a broker.
 * The `replayRoot` invalidation keeps list cards, overview metrics and the
 * open workspace consistent after any write.
 */

function invalidateReplay(queryClient: ReturnType<typeof useQueryClient>, sessionId?: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.replayRoot });
  if (sessionId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.replayDetail(sessionId) });
  }
}

/** GET /replay/overview — landing metrics (§13). */
export function useReplayOverview() {
  return useQuery({
    queryKey: queryKeys.replayOverview,
    queryFn: () => apiRequest<ReplayOverviewResponse>(apiPaths.replayOverview),
  });
}

/** GET /replay/sessions — newest first. */
export function useReplaySessions() {
  return useQuery({
    queryKey: queryKeys.replaySessions,
    queryFn: () => apiRequest<ReplaySessionsResponse>(apiPaths.replaySessions),
  });
}

/** GET /replay/sessions/:id — session + children (workspace payload). */
export function useReplayDetail(sessionId: string) {
  return useQuery({
    queryKey: queryKeys.replayDetail(sessionId),
    queryFn: () => apiRequest<ReplayDetailResponse>(apiPaths.replaySession(sessionId)),
  });
}

/** POST /replay/sessions — create a DRAFT replay. */
export function useReplayCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReplaySessionInput) =>
      apiRequest<ReplaySessionResponse>(apiPaths.replaySessions, { method: "POST", body: input }),
    onSuccess: () => invalidateReplay(queryClient),
  });
}

/** POST /replay/sessions/:id — attach/detach playbook context. */
export function useReplayUpdateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...input }: UpdateReplaySessionInput & { sessionId: string }) =>
      apiRequest<ReplaySessionResponse>(apiPaths.replaySession(sessionId), { method: "POST", body: input }),
    onSuccess: (_data, variables) => invalidateReplay(queryClient, variables.sessionId),
  });
}

/** POST /replay/sessions/:id/advance — resume checkpoint (§51). */
export function useReplayAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...input }: AdvanceReplayInput & { sessionId: string }) =>
      apiRequest<ReplaySessionResponse>(apiPaths.replaySessionAdvance(sessionId), { method: "POST", body: input }),
    onSuccess: (_data, variables) => invalidateReplay(queryClient, variables.sessionId),
  });
}

/** POST /replay/sessions/:id/complete — freeze the result (§30). */
export function useReplayComplete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<ReplaySessionResponse>(apiPaths.replaySessionComplete(sessionId), { method: "POST", body: {} }),
    onSuccess: (_data, sessionId) => invalidateReplay(queryClient, sessionId),
  });
}

/** POST /replay/sessions/:id/archive (§32). */
export function useReplayArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<ReplaySessionResponse>(apiPaths.replaySessionArchive(sessionId), { method: "POST", body: {} }),
    onSuccess: (_data, sessionId) => invalidateReplay(queryClient, sessionId),
  });
}

/** DELETE /replay/sessions/:id. */
export function useReplayDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<DeleteResponse>(apiPaths.replaySession(sessionId), { method: "DELETE" }),
    onSuccess: () => invalidateReplay(queryClient),
  });
}

/** POST /replay/sessions/:id/trades — open a simulated position. */
export function useReplayCreateTrade(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReplayTradeInput) =>
      apiRequest<ReplayTradeResponse>(apiPaths.replaySessionTrades(sessionId), { method: "POST", body: input }),
    onSuccess: () => invalidateReplay(queryClient, sessionId),
  });
}

/** POST /replay/sessions/:id/trades/:tradeId/close — settle a simulation. */
export function useReplayCloseTrade(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...input }: CloseReplayTradeInput & { tradeId: string }) =>
      apiRequest<ReplayTradeResponse>(apiPaths.replaySessionTradeClose(sessionId, tradeId), {
        method: "POST",
        body: input,
      }),
    onSuccess: () => invalidateReplay(queryClient, sessionId),
  });
}

/** DELETE /replay/sessions/:id/trades/:tradeId. */
export function useReplayDeleteTrade(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tradeId: string) =>
      apiRequest<DeleteResponse>(apiPaths.replaySessionTrade(sessionId, tradeId), { method: "DELETE" }),
    onSuccess: () => invalidateReplay(queryClient, sessionId),
  });
}

/** POST /replay/sessions/:id/decisions — record a decision marker. */
export function useReplayCreateDecision(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReplayDecisionInput) =>
      apiRequest<ReplayDecisionResponse>(apiPaths.replaySessionDecisions(sessionId), { method: "POST", body: input }),
    onSuccess: () => invalidateReplay(queryClient, sessionId),
  });
}

/** DELETE /replay/sessions/:id/decisions/:decisionId. */
export function useReplayDeleteDecision(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decisionId: string) =>
      apiRequest<DeleteResponse>(apiPaths.replaySessionDecision(sessionId, decisionId), { method: "DELETE" }),
    onSuccess: () => invalidateReplay(queryClient, sessionId),
  });
}

/** POST /replay/sessions/:id/notes — timestamped observation (§28). */
export function useReplayCreateNote(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReplayNoteInput) =>
      apiRequest<ReplayNoteResponse>(apiPaths.replaySessionNotes(sessionId), { method: "POST", body: input }),
    onSuccess: () => invalidateReplay(queryClient, sessionId),
  });
}

/** DELETE /replay/sessions/:id/notes/:noteId. */
export function useReplayDeleteNote(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiRequest<DeleteResponse>(apiPaths.replaySessionNote(sessionId, noteId), { method: "DELETE" }),
    onSuccess: () => invalidateReplay(queryClient, sessionId),
  });
}

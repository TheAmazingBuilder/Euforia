import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcknowledgeViolationInput,
  AcknowledgeViolationResponse,
  AlertsResponse,
  EcoEventsResponse,
  CreateRuleInput,
  DisciplineScoreResponse,
  MarkAlertReadResponse,
  MistakeLedgerResponse,
  Rule,
  RulesResponse,
  RulesStatusResponse,
  UpdateRuleInput,
  ViolationsResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** Discipline domain hooks — banner aggregate + alerts inbox + rules engine. */

export function useRulesStatus(accountId: string | null = null) {
  return useQuery({
    queryKey: queryKeys.rulesStatus(accountId),
    queryFn: () =>
      apiRequest<RulesStatusResponse>(apiPaths.rulesStatus, {
        query: { accountId: accountId ?? undefined },
      }),
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => apiRequest<AlertsResponse>(apiPaths.alerts),
    // Notification inbox — gentle background refresh so goal-status and
    // discipline alerts reach the bell without requiring a navigation.
    refetchInterval: 60_000,
  });
}

/** GET /eco-events — economic calendar (Priorité 3, feature 10). */
export function useEcoEvents() {
  return useQuery({
    queryKey: queryKeys.ecoEvents,
    queryFn: () => apiRequest<EcoEventsResponse>(apiPaths.ecoEvents),
  });
}

/** PATCH /alerts/:id/read — dashboard inbox "mark as read" row action. */
export function useMarkAlertRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      apiRequest<MarkAlertReadResponse>(apiPaths.alertRead(alertId), { method: "PATCH" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    },
  });
}

// ── Phase 8 — discipline screen: rules CRUD, violations, score, ledger ──────

export function useRules() {
  return useQuery({
    queryKey: queryKeys.rules,
    queryFn: () => apiRequest<RulesResponse>(apiPaths.rules),
  });
}

export function useViolations() {
  return useQuery({
    queryKey: queryKeys.violations,
    queryFn: () => apiRequest<ViolationsResponse>(apiPaths.violations),
  });
}

export function useDisciplineScore() {
  return useQuery({
    queryKey: queryKeys.disciplineScore,
    queryFn: () => apiRequest<DisciplineScoreResponse>(apiPaths.disciplineScore),
  });
}

export function useMistakesLedger() {
  return useQuery({
    queryKey: queryKeys.mistakesLedger,
    queryFn: () => apiRequest<MistakeLedgerResponse>(apiPaths.mistakesLedger),
  });
}

/** POST /rules — create a discipline rule (the banner reflects it via rules-status). */
export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRuleInput) =>
      apiRequest<Rule>(apiPaths.rules, { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.rules });
      await queryClient.invalidateQueries({ queryKey: queryKeys.rulesStatusRoot });
    },
  });
}

/** PATCH /rules/:id — param editor + severity + active toggle. */
export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: UpdateRuleInput }) =>
      apiRequest<Rule>(apiPaths.rule(ruleId), { method: "PATCH", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.rules });
      await queryClient.invalidateQueries({ queryKey: queryKeys.rulesStatusRoot });
    },
  });
}

/** DELETE /rules/:id */
export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      apiRequest<{ ok: true }>(apiPaths.rule(ruleId), { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.rules });
      await queryClient.invalidateQueries({ queryKey: queryKeys.rulesStatusRoot });
      await queryClient.invalidateQueries({ queryKey: queryKeys.violations });
    },
  });
}

/** PATCH /violations/:id/acknowledge — log row action (score refetches). */
export function useAcknowledgeViolation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ violationId, input }: { violationId: string; input: AcknowledgeViolationInput }) =>
      apiRequest<AcknowledgeViolationResponse>(apiPaths.violationAcknowledge(violationId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.violations });
      await queryClient.invalidateQueries({ queryKey: queryKeys.disciplineScore });
    },
  });
}

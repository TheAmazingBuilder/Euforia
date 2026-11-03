import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Alert,
  CreateMetricAlertRuleInput,
  EvaluateMetricAlertsResponse,
  MetricAlertRule,
  MetricAlertRuleEventsResponse,
  MetricAlertRulesResponse,
  UpdateMetricAlertRuleInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** Metric alert rules (Dashboard Customization Phase 07) - rule CRUD, the
 * manual evaluation pass and per-rule event history. Triggered events land
 * in the shared inbox (queryKeys.alerts) - every mutation invalidates it. */

export function useAlertRules() {
  return useQuery({
    queryKey: queryKeys.alertRules,
    queryFn: () => apiRequest<MetricAlertRulesResponse>(apiPaths.alertRules),
  });
}

export function useCreateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMetricAlertRuleInput) =>
      apiRequest<MetricAlertRule>(apiPaths.alertRules, { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.alertRules });
    },
  });
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: UpdateMetricAlertRuleInput }) =>
      apiRequest<MetricAlertRule>(apiPaths.alertRule(ruleId), { method: "PATCH", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.alertRules });
    },
  });
}

export function useDeleteAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      apiRequest<{ ok: true }>(apiPaths.alertRule(ruleId), { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.alertRules });
      await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    },
  });
}

/** POST /alert-rules/evaluate - explicit pass (diagnostics / "Run now"). */
export function useEvaluateAlertRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<EvaluateMetricAlertsResponse>(apiPaths.alertRulesEvaluate, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.alertRules });
      await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    },
  });
}

/** GET /alert-rules/:id/events - recent inbox events for one rule. */
export function useAlertRuleEvents(ruleId: string | null) {
  return useQuery({
    queryKey: queryKeys.alertRuleEvents(ruleId ?? "none"),
    queryFn: () =>
      apiRequest<MetricAlertRuleEventsResponse>(apiPaths.alertRuleEvents(ruleId!)),
    enabled: ruleId !== null,
  });
}

/** PATCH /alerts/:id/dismiss - archive WITHOUT deleting (audit history). */
export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      apiRequest<Alert>(apiPaths.alertDismiss(alertId), { method: "PATCH" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    },
  });
}

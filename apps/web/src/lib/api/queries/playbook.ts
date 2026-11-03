import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChecklistTemplate,
  CreateChecklistInput,
  CreatePlaybookRuleInput,
  CreateSetupInput,
  CreateStrategyInput,
  ChecklistsResponse,
  InstantiateTemplateInput,
  PlaybookOverviewResponse,
  PlaybookRule,
  PlaybookRulesResponse,
  PlaybookTemplatesResponse,
  Setup,
  SetupsResponse,
  SetupInsightsResponse,
  Strategy,
  StrategyVersionsResponse,
  StrategiesStatsResponse,
  UpdateChecklistInput,
  UpdatePlaybookRuleInput,
  UpdateSetupInput,
  UpdateStrategyInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Professional Playbook hooks - strategies + setups + checklists + operating
 * rules + template library + the ONE aggregate overview. Strategy mutations
 * invalidate the module keys AND the analytics suite (per-strategy rows read
 * trades through the strategy link).
 */

export function usePlaybookOverview() {
  return useQuery({
    queryKey: queryKeys.playbookOverview,
    queryFn: () => apiRequest<PlaybookOverviewResponse>(apiPaths.playbookOverview),
  });
}

export function useStrategiesStats() {
  return useQuery({
    queryKey: queryKeys.strategiesStats,
    queryFn: () => apiRequest<StrategiesStatsResponse>(apiPaths.strategyStats),
  });
}

export function useSetups() {
  return useQuery({
    queryKey: queryKeys.setups,
    queryFn: () => apiRequest<SetupsResponse>(apiPaths.setups),
  });
}

/** GET /setups/insights - light 90d backtest + market heuristics per setup. */
export function useSetupInsights() {
  return useQuery({
    queryKey: queryKeys.setupInsights,
    queryFn: () => apiRequest<SetupInsightsResponse>(apiPaths.setupInsights),
  });
}

/** GET /strategies/:id/versions - history for the visual diff. */
export function useStrategyVersions(strategyId: string | null) {
  return useQuery({
    queryKey: queryKeys.strategyVersions(strategyId ?? "none"),
    queryFn: () => apiRequest<StrategyVersionsResponse>(apiPaths.strategyVersions(strategyId!)),
    enabled: strategyId !== null,
  });
}

export function useChecklists() {
  return useQuery({
    queryKey: queryKeys.checklists,
    queryFn: () => apiRequest<ChecklistsResponse>(apiPaths.checklists),
  });
}

export function usePlaybookRules() {
  return useQuery({
    queryKey: queryKeys.playbookRules,
    queryFn: () => apiRequest<PlaybookRulesResponse>(apiPaths.playbookRules),
  });
}

export function usePlaybookTemplates() {
  return useQuery({
    queryKey: queryKeys.playbookTemplates,
    queryFn: () => apiRequest<PlaybookTemplatesResponse>(apiPaths.playbookTemplates),
  });
}

function useStrategyInvalidation() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.strategies });
    await queryClient.invalidateQueries({ queryKey: queryKeys.strategiesStats });
    await queryClient.invalidateQueries({ queryKey: queryKeys.playbookOverview });
    await queryClient.invalidateQueries({ queryKey: queryKeys.analyticsSuiteRoot });
  };
}

/** Invalidate every playbook child collection - cheap, always correct. */
function usePlaybookInvalidation() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.setups });
    await queryClient.invalidateQueries({ queryKey: queryKeys.checklists });
    await queryClient.invalidateQueries({ queryKey: queryKeys.playbookRules });
    await queryClient.invalidateQueries({ queryKey: queryKeys.playbookOverview });
    await queryClient.invalidateQueries({ queryKey: queryKeys.strategies });
  };
}

/** POST /strategies - create a playbook entry. */
export function useCreateStrategy() {
  const invalidate = useStrategyInvalidation();
  return useMutation({
    mutationFn: (input: CreateStrategyInput) =>
      apiRequest<Strategy>(apiPaths.strategies, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** PATCH /strategies/:id - edit a playbook entry. */
export function useUpdateStrategy() {
  const invalidate = useStrategyInvalidation();
  return useMutation({
    mutationFn: ({ strategyId, input }: { strategyId: string; input: UpdateStrategyInput }) =>
      apiRequest<Strategy>(apiPaths.strategy(strategyId), { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** DELETE /strategies/:id - rejected (409) while trades are attached. */
export function useDeleteStrategy() {
  const invalidate = useStrategyInvalidation();
  return useMutation({
    mutationFn: (strategyId: string) =>
      apiRequest<{ ok: true }>(apiPaths.strategy(strategyId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

/** POST /strategies/:id/duplicate - fresh DRAFT copy incl. setups/checklists. */
export function useDuplicateStrategy() {
  const invalidate = useStrategyInvalidation();
  return useMutation({
    mutationFn: (strategyId: string) =>
      apiRequest<Strategy>(apiPaths.strategyDuplicate(strategyId), { method: "POST" }),
    onSuccess: () => invalidate(),
  });
}

/** POST /playbook/templates/instantiate - DRAFT from a starting-point template. */
export function useInstantiateTemplate() {
  const invalidate = useStrategyInvalidation();
  return useMutation({
    mutationFn: (input: InstantiateTemplateInput) =>
      apiRequest<Strategy>(apiPaths.playbookTemplateInstantiate, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

// ── Setups ───────────────────────────────────────────────────────────────────

export function useCreateSetup() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: (input: CreateSetupInput) =>
      apiRequest<Setup>(apiPaths.setups, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateSetup() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: ({ setupId, input }: { setupId: string; input: UpdateSetupInput }) =>
      apiRequest<Setup>(apiPaths.setup(setupId), { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteSetup() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: (setupId: string) =>
      apiRequest<{ ok: true }>(apiPaths.setup(setupId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

// ── Checklist templates ──────────────────────────────────────────────────

export function useCreateChecklist() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: (input: CreateChecklistInput) =>
      apiRequest<ChecklistTemplate>(apiPaths.checklists, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateChecklist() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: ({ checklistId, input }: { checklistId: string; input: UpdateChecklistInput }) =>
      apiRequest<ChecklistTemplate>(apiPaths.checklist(checklistId), { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteChecklist() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: (checklistId: string) =>
      apiRequest<{ ok: true }>(apiPaths.checklist(checklistId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

// ── Operating rules ──────────────────────────────────────────────────────

export function useCreatePlaybookRule() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: (input: CreatePlaybookRuleInput) =>
      apiRequest<PlaybookRule>(apiPaths.playbookRules, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePlaybookRule() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: UpdatePlaybookRuleInput }) =>
      apiRequest<PlaybookRule>(apiPaths.playbookRule(ruleId), { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useDeletePlaybookRule() {
  const invalidate = usePlaybookInvalidation();
  return useMutation({
    mutationFn: (ruleId: string) =>
      apiRequest<{ ok: true }>(apiPaths.playbookRule(ruleId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

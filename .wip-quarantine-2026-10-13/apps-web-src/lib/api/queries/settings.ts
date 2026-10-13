import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JournalGoals,
  RiskDefaults,
  UpdateJournalGoalsInput,
  UpdateRiskDefaultsInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /settings/risk — the standing risk rules. */
export function useRiskDefaults() {
  return useQuery({
    queryKey: queryKeys.settingsRisk,
    queryFn: () => apiRequest<RiskDefaults>(apiPaths.settingsRisk),
  });
}

/** PATCH /settings/risk — revise the standing risk rules. */
export function useUpdateRiskDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRiskDefaultsInput) =>
      apiRequest<RiskDefaults>(apiPaths.settingsRisk, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: (risk) => {
      queryClient.setQueryData(queryKeys.settingsRisk, risk);
    },
  });
}

/** GET /settings/journal-goals — the writing cadence targets (Journal page). */
export function useJournalGoals() {
  return useQuery({
    queryKey: queryKeys.journalGoals,
    queryFn: () => apiRequest<JournalGoals>(apiPaths.journalGoals),
  });
}

/** PATCH /settings/journal-goals — revise the writing cadence targets. */
export function useUpdateJournalGoals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateJournalGoalsInput) =>
      apiRequest<JournalGoals>(apiPaths.journalGoals, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: (goals) => {
      queryClient.setQueryData(queryKeys.journalGoals, goals);
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GoalProgressResponse, GoalSettings, UpdateGoalSettingsInput } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /goals/settings — the trader's monthly targets. */
export function useGoalSettings() {
  return useQuery({
    queryKey: queryKeys.goalSettings,
    queryFn: () => apiRequest<GoalSettings>(apiPaths.goalsSettings),
  });
}

/** PATCH /goals/settings — edit one or more targets. */
export function useUpdateGoalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGoalSettingsInput) =>
      apiRequest<GoalSettings>(apiPaths.goalsSettings, { method: "PATCH", body: input }),
    onSuccess: async (settings) => {
      queryClient.setQueryData(queryKeys.goalSettings, settings);
      // Progress is derived from the targets — refetch the whole subtree.
      await queryClient.invalidateQueries({ queryKey: queryKeys.goalRoot });
    },
  });
}

/** GET /goals/progress?month=YYYY-MM — behavior vs targets, server-computed. */
export function useGoalProgress(month?: string) {
  return useQuery({
    queryKey: queryKeys.goalProgress(month ?? "current"),
    queryFn: () =>
      apiRequest<GoalProgressResponse>(
        month ? `${apiPaths.goalsProgress}?month=${encodeURIComponent(month)}` : apiPaths.goalsProgress,
      ),
  });
}

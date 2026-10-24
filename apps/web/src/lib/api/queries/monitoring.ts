import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MonitoringJobRunResponse,
  MonitoringOverviewResponse,
  MonitoringThresholds,
  MonitoringThresholdsUpdateInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Monitoring hooks. The overview is one aggregate of observed state, polled
 * lightly (§18) - 12 s interval, no focus refetch storms. Threshold updates
 * and manual job runs invalidate the aggregate onSettled (failures change
 * the engine state too: failed runs land in the job ledger).
 */

export function useMonitoringOverview() {
  return useQuery({
    queryKey: queryKeys.monitoring,
    queryFn: () => apiRequest<MonitoringOverviewResponse>(apiPaths.monitoringOverview),
    refetchInterval: 12_000,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateMonitoringThresholds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MonitoringThresholdsUpdateInput) =>
      apiRequest<{ thresholds: MonitoringThresholds }>(apiPaths.monitoringThresholds, {
        method: "PATCH",
        body: input,
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.monitoring });
    },
  });
}

export function useRunMonitoringJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      apiRequest<MonitoringJobRunResponse>(apiPaths.monitoringJobRun(jobId), {
        method: "POST",
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.monitoring });
    },
  });
}

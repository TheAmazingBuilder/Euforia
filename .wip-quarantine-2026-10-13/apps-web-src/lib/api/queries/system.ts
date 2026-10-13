import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActiveAlert,
  AlertRule,
  AlertRuleKind,
  ApiWindow,
  FreshnessConfig,
  MonitoringSnapshot,
  SystemHealth,
  UpdateAlertRuleInput,
  UpdateFreshnessInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /system/health — services, latency window and incident log. */
export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.systemHealth,
    queryFn: () => apiRequest<SystemHealth>(apiPaths.systemHealth),
  });
}

/**
 * GET /system/monitoring — the full observability snapshot (§3–§17).
 * Refreshed every 15s while the console is open: statuses are computed
 * server-side against live evidence on each fetch.
 */
export function useMonitoringSnapshot(window: ApiWindow = "1h") {
  return useQuery({
    queryKey: queryKeys.monitoringSnapshot(window),
    queryFn: () => apiRequest<MonitoringSnapshot>(`${apiPaths.monitoringSnapshot}?window=${window}`),
    refetchInterval: 15_000,
  });
}

/** PATCH /system/monitoring/alert-rules/:kind — toggle or re-threshold (§14). */
export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, input }: { kind: AlertRuleKind; input: UpdateAlertRuleInput }) =>
      apiRequest<AlertRule>(apiPaths.monitoringAlertRule(kind), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoring-snapshot"] });
    },
  });
}

/** POST /system/monitoring/alerts/:id/ack — acknowledge without deleting. */
export function useAckMonitoringAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      apiRequest<ActiveAlert>(apiPaths.monitoringAlertAck(alertId), { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoring-snapshot"] });
    },
  });
}

/** PATCH /system/monitoring/freshness — configurable freshness thresholds (§17). */
export function useUpdateFreshness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateFreshnessInput) =>
      apiRequest<FreshnessConfig>(apiPaths.monitoringFreshness, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoring-snapshot"] });
    },
  });
}

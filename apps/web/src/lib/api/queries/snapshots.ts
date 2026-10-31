import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePerformanceSnapshotInput,
  PerformanceSnapshot,
  PerformanceSnapshotsResponse,
  UpdatePerformanceSnapshotInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Performance snapshots (Dashboard Customization Phase 08) - capture the
 * analytics suite's current scope as a frozen point-in-time record, list/
 * inspect/rename/delete, and compare (comparison itself is the pure shared
 * engine - see components/analytics/snapshots-panel). Every mutation
 * invalidates the single snapshots list key (targeted, never broad).
 */

export function usePerformanceSnapshots() {
  return useQuery({
    queryKey: queryKeys.snapshots,
    queryFn: () => apiRequest<PerformanceSnapshotsResponse>(apiPaths.snapshots),
  });
}

export function useCreatePerformanceSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePerformanceSnapshotInput) =>
      apiRequest<PerformanceSnapshot>(apiPaths.snapshots, { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshots });
    },
  });
}

export function useUpdatePerformanceSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ snapshotId, input }: { snapshotId: string; input: UpdatePerformanceSnapshotInput }) =>
      apiRequest<PerformanceSnapshot>(apiPaths.snapshot(snapshotId), { method: "PATCH", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshots });
    },
  });
}

export function useDeletePerformanceSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (snapshotId: string) =>
      apiRequest<{ ok: true }>(apiPaths.snapshot(snapshotId), { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshots });
    },
  });
}

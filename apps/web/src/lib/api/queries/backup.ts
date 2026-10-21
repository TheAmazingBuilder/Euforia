import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ImportBackupResponse } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Backup domain hooks — feature 12. Export is handled as a direct download
 * in the UI (blob) — only the import needs a mutation + cache invalidation.
 */
export function useImportBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) =>
      apiRequest<ImportBackupResponse>(apiPaths.importBackup, {
        method: "POST",
        body: payload,
      }),
    onSuccess: async () => {
      // The import replaces trades and may add strategies/tags.
      await queryClient.invalidateQueries({ queryKey: queryKeys.tradesRoot });
      await queryClient.invalidateQueries({ queryKey: queryKeys.strategies });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      await queryClient.invalidateQueries({ queryKey: queryKeys.statsOverview });
      await queryClient.invalidateQueries({ queryKey: queryKeys.strategiesStats });
    },
  });
}

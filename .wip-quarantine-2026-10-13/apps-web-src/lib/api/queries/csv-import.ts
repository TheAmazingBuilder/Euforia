import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CsvImportCommitRequest,
  CsvImportCommitResponse,
  CsvImportPreviewRequest,
  CsvImportPreviewResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Broker CSV import — Phase 10 two-step flow. Preview parses the raw file
 * server-side (mock) and never touches the ledger; commit is idempotent per
 * externalRef, so re-submitting the same statement adds zero duplicates.
 */

/** POST /import/csv/preview — parse + validate, no writes. */
export function usePreviewCsv() {
  return useMutation({
    mutationFn: (input: CsvImportPreviewRequest) =>
      apiRequest<CsvImportPreviewResponse>(apiPaths.csvPreview, {
        method: "POST",
        body: input,
      }),
  });
}

/** POST /import/csv/commit — import the OK rows of a previewed batch. */
export function useCommitCsvImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CsvImportCommitRequest) =>
      apiRequest<CsvImportCommitResponse>(apiPaths.csvCommit, {
        method: "POST",
        body: input,
      }),
    onSuccess: async () => {
      await Promise.all(
        [queryKeys.tradesRoot, queryKeys.accounts, queryKeys.portfoliosOverview].map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
    },
  });
}

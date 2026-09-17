import { useQuery } from "@tanstack/react-query";
import type { AlertsResponse, RulesStatusResponse } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** Discipline domain hooks — banner aggregate + alerts inbox. */

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
  });
}

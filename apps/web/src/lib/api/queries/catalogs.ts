import { useQuery } from "@tanstack/react-query";
import type { AccountsResponse, InstrumentsResponse, StrategiesResponse } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** Catalog hooks — instruments / strategies / accounts. */

export function useInstruments(q = "") {
  return useQuery({
    queryKey: queryKeys.instruments(q),
    queryFn: () =>
      apiRequest<InstrumentsResponse>(apiPaths.instruments, { query: { q: q || undefined } }),
  });
}

export function useStrategies() {
  return useQuery({
    queryKey: queryKeys.strategies,
    queryFn: () => apiRequest<StrategiesResponse>(apiPaths.strategies),
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => apiRequest<AccountsResponse>(apiPaths.accounts),
  });
}

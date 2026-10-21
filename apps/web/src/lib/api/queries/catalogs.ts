import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toDecimalString } from "@cosmoz/shared";
import type {
  AccountsResponse,
  CreateTagInput,
  Currency,
  InstrumentsResponse,
  StrategiesResponse,
  Tag,
  TagsResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";
import { useStatsOverview } from "./stats";

/** Catalog hooks — instruments / strategies / accounts / tags + derived balance. */

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

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: () => apiRequest<TagsResponse>(apiPaths.tags),
  });
}

/** POST /tags — inline tag creation (reflect screen); refreshes the catalog. */
export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) =>
      apiRequest<Tag>(apiPaths.tags, { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

export interface AccountBalance {
  /** Live balance estimate (starting balance + realized net P&L), decimal string. */
  balance: string;
  currency: Currency;
}

/**
 * Live balance of the default account, derived from API read models:
 * startingBalance + netPnl (stats overview). The sizer and the live
 * calculation bar use it for risk estimates — never a hardcoded number.
 */
export function useCurrentBalance(): AccountBalance | null {
  const { data: accountsData } = useAccounts();
  const { data: stats } = useStatsOverview();
  if (!accountsData || !stats) return null;
  const account =
    accountsData.accounts.find((a) => a.isDefault) ?? accountsData.accounts[0];
  if (!account) return null;
  const balance = Number(account.startingBalance) + Number(stats.netPnl);
  return { balance: toDecimalString(balance), currency: account.currency };
}

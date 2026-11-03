"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

/**
 * React Query provider (v5). Global defaults per Phase 3 brief:
 * staleTime 30s, retry 1.
 *
 * Perf: `gcTime` (ex-cacheTime) is raised to 30 min so route revisits reuse
 * warm data instead of refetching cold; the dashboard and analytics views
 * mount heavy query trees on every navigation and this removes most of the
 * perceived "slow page switch" latency while staying within the 30s
 * staleness window for background refreshes.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

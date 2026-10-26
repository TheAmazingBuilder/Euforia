"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Health probe of the market service (Monitoring MASTER PROMPT §6).
 *
 * The service exposes GET /health through the same gateway rewrite as the
 * quote feed (XTransformPort) - NOT the /api MSW surface, so this uses fetch
 * directly inside the data layer (components stay fetch-free). The response
 * lists the REAL providers with their status - the Market Data tab renders
 * these as evidence, never a synthesized status.
 */

export interface MarketProviderHealth {
  id: string;
  source: string;
  /** Structured status from the provider itself: { transport, symbols, … }. */
  status: Record<string, unknown>;
}

export interface MarketServiceHealth {
  ok: boolean;
  providers: MarketProviderHealth[];
  symbols: string[];
}

const HEALTH_URL = `/health?XTransformPort=3003`;

async function fetchHealth(): Promise<MarketServiceHealth> {
  const response = await fetch(HEALTH_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`market health ${response.status}`);
  return (await response.json()) as MarketServiceHealth;
}

/**
 * Polls the service health lightly (§18 - monitoring must not become a load
 * source): every 15 s, 2 retries max, no refetch storms on window focus.
 */
export function useMarketServiceHealth() {
  return useQuery({
    queryKey: ["market-service-health"],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

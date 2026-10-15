import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BridgePairing,
  BrokerCatalogResponse,
  BrokerIdentification,
  TradingAccountConnectInput,
  TradingAccountDetails,
  TradingAccountDetailsResponse,
  TradingAccountSyncResponse,
  TradingAccountUpdateInput,
  TradingConnectionTestResponse,
  TradingDisconnectResponse,
  TradingDealsResponse,
  TradingOrdersResponse,
  TradingPositionsResponse,
  TradingProviderListResponse,
  TradingReconnectInput,
  TradingSyncRunsResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Accounts & Trading Connectivity hooks (Phase 02).
 *
 * Read-only by construction: every operation here maps 1:1 onto the Nest
 * trading-accounts surface (apps/api trading-accounts.controller.ts) and the
 * @cosmoz/shared trading-account.ts contracts — no other fetch layer, no
 * client-side state machine. The connection/sync axes are server-owned: the
 * UI renders what the backend reports and never derives a CONNECTED state
 * from the mere existence of an account row.
 *
 * Invalidation: every mutation settles on the `trading-accounts` root key,
 * which prefix-matches the list, the detail, positions, orders and deals —
 * one coarse invalidation, no unrelated module is touched. broker/session is
 * invalidated too: it aggregates the same connection state (NOT_CONFIGURED
 * flips once an account exists).
 */

function invalidateTradingAccounts(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void>[] {
  return [
    queryClient.invalidateQueries({ queryKey: queryKeys.tradingAccounts }),
    queryClient.invalidateQueries({ queryKey: queryKeys.brokerSession }),
  ];
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** GET /trading-accounts — every owned account with connection + snapshot. */
export function useTradingAccounts() {
  return useQuery({
    queryKey: queryKeys.tradingAccounts,
    queryFn: () =>
      apiRequest<{ accounts: TradingAccountDetails[] }>(apiPaths.tradingAccounts),
  });
}

/** GET /trading-accounts/providers — registry descriptors (metadata only). */
export function useTradingAccountProviders() {
  return useQuery({
    queryKey: queryKeys.tradingAccountProviders,
    queryFn: () => apiRequest<TradingProviderListResponse>(apiPaths.tradingAccountProviders),
    // The registry is code-defined — it only changes with a deploy.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * GET /trading-accounts/brokers — the universal broker catalog (Phase 07):
 * every known broker/platform with its HONEST connector status. Powers the
 * "any broker" picker: connectable entries come from the provider registry,
 * recognized-but-unimplemented entries render a truthful locked state.
 */
export function useTradingBrokerCatalog() {
  return useQuery({
    queryKey: queryKeys.tradingAccountBrokers,
    queryFn: () => apiRequest<BrokerCatalogResponse>(apiPaths.tradingAccountBrokers),
    // The catalog is code-defined — it only changes with a deploy.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * POST /trading-accounts/brokers/identify — rule-based broker identification
 * (Phase 07). No secrets are sent: only id/endpoint hints. Debounced callers
 * stay far below the 30/15-min rate limit.
 */
export function useIdentifyBroker() {
  return useMutation({
    mutationFn: (hints: { providerId?: string; externalAccountId?: string; endpoint?: string }) =>
      apiRequest<{ identification: BrokerIdentification }>(apiPaths.tradingAccountBrokerIdentify, {
        method: "POST",
        body: JSON.stringify(hints),
      }),
  });
}

/** GET /trading-accounts/:id — full details (snapshot + synchronization embedded). */
export function useTradingAccountDetails(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.tradingAccount(accountId ?? "none"),
    queryFn: () =>
      apiRequest<TradingAccountDetailsResponse>(apiPaths.tradingAccount(accountId ?? "")),
    enabled: accountId !== null,
  });
}

/** GET /trading-accounts/:id/positions — provider-reported open positions. */
export function useTradingAccountPositions(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.tradingAccountPositions(accountId ?? "none"),
    queryFn: () =>
      apiRequest<TradingPositionsResponse>(apiPaths.tradingAccountPositions(accountId ?? "")),
    enabled: accountId !== null,
  });
}

/** GET /trading-accounts/:id/orders — provider-reported orders. */
export function useTradingAccountOrders(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.tradingAccountOrders(accountId ?? "none"),
    queryFn: () =>
      apiRequest<TradingOrdersResponse>(apiPaths.tradingAccountOrders(accountId ?? "")),
    enabled: accountId !== null,
  });
}

/** GET /trading-accounts/:id/deals — provider-reported fills/executions. */
export function useTradingAccountDeals(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.tradingAccountDeals(accountId ?? "none"),
    queryFn: () =>
      apiRequest<TradingDealsResponse>(apiPaths.tradingAccountDeals(accountId ?? "")),
    enabled: accountId !== null,
  });
}

/**
 * GET /trading-accounts/:id/sync-runs — bounded synchronization history
 * (Phase 05): newest first, keyset-paginated. Manual AND scheduled runs
 * appear here — the honest audit trail of what the backend actually did.
 */
export function useTradingAccountSyncRuns(accountId: string | null, limit = 10) {
  return useQuery({
    queryKey: queryKeys.tradingAccountSyncRuns(`${accountId ?? "none"}:${limit}`),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      return apiRequest<TradingSyncRunsResponse>(
        `${apiPaths.tradingAccountSyncRuns(accountId ?? "")}?${params.toString()}`,
      );
    },
    enabled: accountId !== null,
  });
}

// ── Mutations (every action the backend genuinely supports) ─────────────────

/** POST /trading-accounts/connect — register + connect + initial sync (201). */
export function useConnectTradingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TradingAccountConnectInput) =>
      apiRequest<TradingAccountDetailsResponse>(apiPaths.tradingAccountConnect, {
        method: "POST",
        body: input,
      }),
    onSettled: async () => {
      await Promise.all(invalidateTradingAccounts(queryClient));
    },
  });
}

/** PATCH /trading-accounts/:id — rename the display label (label only). */
export function useRenameTradingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, input }: { accountId: string; input: TradingAccountUpdateInput }) =>
      apiRequest<TradingAccountDetailsResponse>(apiPaths.tradingAccount(accountId), {
        method: "PATCH",
        body: input,
      }),
    onSettled: async () => {
      await Promise.all(invalidateTradingAccounts(queryClient));
    },
  });
}

/** POST /trading-accounts/:id/test — the 4 named connection checks. */
export function useTestTradingConnection(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<TradingConnectionTestResponse>(apiPaths.tradingAccountTest(accountId), {
        method: "POST",
      }),
    onSettled: async () => {
      await Promise.all(invalidateTradingAccounts(queryClient));
    },
  });
}

/** POST /trading-accounts/:id/reconnect — fresh credentials; 409 when live. */
export function useReconnectTradingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, input }: { accountId: string; input: TradingReconnectInput }) =>
      apiRequest<TradingAccountDetailsResponse>(apiPaths.tradingAccountReconnect(accountId), {
        method: "POST",
        body: input,
      }),
    onSettled: async () => {
      await Promise.all(invalidateTradingAccounts(queryClient));
    },
  });
}

/** DELETE /trading-accounts/:id — disconnect; credentials wiped, history kept. */
export function useDisconnectTradingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      apiRequest<TradingDisconnectResponse>(apiPaths.tradingAccount(accountId), {
        method: "DELETE",
      }),
    onSettled: async () => {
      await Promise.all(invalidateTradingAccounts(queryClient));
    },
  });
}

/** POST /trading-accounts/:id/sync — manual synchronization run. */
export function useSyncTradingAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      apiRequest<TradingAccountSyncResponse>(apiPaths.tradingAccountSync(accountId), {
        method: "POST",
      }),
    onSettled: async () => {
      await Promise.all(invalidateTradingAccounts(queryClient));
    },
  });
}

/**
 * GET /trading-accounts/:id/bridge/pairing — the MT5 terminal pairing sheet
 * (Phase 08, owner-only). The ONLY surface where the bridge secret is
 * re-readable: details views never carry it (leak-checked server-side).
 * Non-bridge accounts answer 422 — the caller must gate on
 * connection.method === "PLATFORM_BRIDGE".
 */
export function useBridgePairing(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.tradingAccountBridgePairing(accountId ?? "none"),
    queryFn: () =>
      apiRequest<{ pairing: BridgePairing }>(
        apiPaths.tradingAccountBridgePairing(accountId ?? ""),
      ),
    enabled: accountId !== null,
  });
}

/**
 * POST /trading-accounts/:id/bridge/rotate — mint a fresh bridge secret and
 * invalidate the previous terminal configuration (Phase 08). The response is
 * the full details view PLUS the new pairing sheet (the one-shot delivery of
 * the new secret, same contract as connect).
 */
export function useRotateBridgeSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      apiRequest<TradingAccountDetailsResponse>(
        apiPaths.tradingAccountBridgeRotate(accountId),
        { method: "POST" },
      ),
    onSettled: async () => {
      await Promise.all(invalidateTradingAccounts(queryClient));
    },
  });
}

// ── Presentation mapping (pure — unit-testable without a renderer) ──────────

/**
 * The environment stamp shown on every account surface. PROP_FIRM renders as
 * "PROP" (established AccountSwitcher convention).
 */
export function environmentStamp(environment: string): string {
  return environment === "PROP_FIRM" ? "PROP" : environment;
}

/**
 * Whether a connection status is a healthy one. ERROR and DISCONNECTED are
 * NOT the same: ERROR means the last auth-class interaction failed and a
 * reconnect is meaningful; DISCONNECTED is a deliberate state.
 */
export function connectionIsHealthy(status: string): boolean {
  return status === "CONNECTED" || status === "CONNECTING";
}

/**
 * Freshness presentation for the sync axis. LIVE here means "the last
 * successful sync completed within the backend freshness TTL" — never
 * "real-time": polling providers do not stream. The label pair keeps color
 * non-authoritative (spec: never color alone).
 */
export function syncStatusMeta(status: string): { label: string; tone: "positive" | "warning" | "negative" | "muted" | "info" } {
  switch (status) {
    case "SYNCING":
      return { label: "Syncing", tone: "info" };
    case "LIVE":
      return { label: "Fresh", tone: "positive" };
    case "DELAYED":
      return { label: "Delayed", tone: "warning" };
    case "STALE":
      return { label: "Stale", tone: "warning" };
    case "ERROR":
      return { label: "Sync error", tone: "negative" };
    default:
      return { label: "Never synced", tone: "muted" };
  }
}

/** Connection-axis presentation metadata (label + tone), per doc B §3.1. */
export function connectionStatusMeta(status: string): {
  label: string;
  tone: "positive" | "warning" | "negative" | "muted" | "info";
} {
  switch (status) {
    case "CONNECTED":
      return { label: "Connected", tone: "positive" };
    case "CONNECTING":
      return { label: "Connecting", tone: "info" };
    case "ERROR":
      return { label: "Connection error", tone: "negative" };
    default:
      return { label: "Disconnected", tone: "muted" };
  }
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Account,
  BrokerConnectionsResponse,
  ConnectBrokerResponse,
  CreateAccountInput,
  CreateBrokerConnectionInput,
  DeleteAccountResponse,
  ImportBatchesResponse,
  PortfolioOverviewResponse,
  SyncConnectionResponse,
  UpdateAccountInput,
  UpdateBrokerConnectionInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys, tradeMutationInvalidations } from "@/lib/api/keys";

/** GET /portfolios/overview — the whole desk in one server-computed shot. */
export function usePortfolioOverview() {
  return useQuery({
    queryKey: queryKeys.portfoliosOverview,
    queryFn: () => apiRequest<PortfolioOverviewResponse>(apiPaths.portfoliosOverview),
  });
}

/** GET /broker-connections — feed list for the desk. */
export function useBrokerConnections() {
  return useQuery({
    queryKey: queryKeys.brokerConnections,
    queryFn: () => apiRequest<BrokerConnectionsResponse>(apiPaths.brokerConnections),
  });
}

/** GET /import-batches — recent import feed. */
export function useImportBatches() {
  return useQuery({
    queryKey: queryKeys.importBatches,
    queryFn: () => apiRequest<ImportBatchesResponse>(apiPaths.importBatches),
  });
}

function useDeskInvalidation() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      queryClient.invalidateQueries({ queryKey: queryKeys.portfoliosOverview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.brokerConnections }),
      queryClient.invalidateQueries({ queryKey: queryKeys.importBatches }),
    ]);
  };
}

/** POST /accounts — create a journal account. */
export function useCreateAccount() {
  const invalidate = useDeskInvalidation();
  return useMutation({
    mutationFn: (input: CreateAccountInput) =>
      apiRequest<Account>(apiPaths.accounts, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** PATCH /accounts/:id — rename, retype, re-home the default flag. */
export function useUpdateAccount() {
  const invalidate = useDeskInvalidation();
  return useMutation({
    mutationFn: ({ accountId, input }: { accountId: string; input: UpdateAccountInput }) =>
      apiRequest<Account>(apiPaths.account(accountId), { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** DELETE /accounts/:id — guarded by the server (default flag, remaining trades). */
export function useDeleteAccount() {
  const invalidate = useDeskInvalidation();
  return useMutation({
    mutationFn: (accountId: string) =>
      apiRequest<DeleteAccountResponse>(apiPaths.account(accountId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

/** POST /broker-connections — connect a feed; the first sync runs immediately. */
export function useConnectBroker() {
  const queryClient = useQueryClient();
  const invalidate = useDeskInvalidation();
  return useMutation({
    mutationFn: (input: CreateBrokerConnectionInput) =>
      apiRequest<ConnectBrokerResponse>(apiPaths.brokerConnections, { method: "POST", body: input }),
    onSuccess: async () => {
      await invalidate();
      // A connection's first pull spawns trades → trade-derived reads refresh.
      await Promise.all(
        tradeMutationInvalidations.map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
    },
  });
}

/** POST /broker-connections/:id/sync — pull the feed now. */
export function useSyncBroker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiRequest<SyncConnectionResponse>(apiPaths.brokerConnectionSync(connectionId), { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.brokerConnections }),
        queryClient.invalidateQueries({ queryKey: queryKeys.importBatches }),
        queryClient.invalidateQueries({ queryKey: queryKeys.portfoliosOverview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all(
        tradeMutationInvalidations.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
    },
  });
}

/** PATCH /broker-connections/:id — auto-import toggle / label. */
export function useUpdateBrokerConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, input }: { connectionId: string; input: UpdateBrokerConnectionInput }) =>
      apiRequest<BrokerConnectionsResponse["connections"][number]>(apiPaths.brokerConnection(connectionId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.brokerConnections });
      await queryClient.invalidateQueries({ queryKey: queryKeys.portfoliosOverview });
    },
  });
}

/** DELETE /broker-connections/:id. */
export function useDeleteBrokerConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiRequest<{ id: string; deleted: true }>(apiPaths.brokerConnection(connectionId), { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.brokerConnections });
      await queryClient.invalidateQueries({ queryKey: queryKeys.portfoliosOverview });
    },
  });
}

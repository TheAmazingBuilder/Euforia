import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  IntegrationConnectInput,
  IntegrationDisconnectResponse,
  IntegrationSyncResponse,
  IntegrationTestResponse,
  IntegrationsOverviewResponse,
  WebhookDeliverResponse,
  WebhookSimulateInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Integration Hub hooks. The overview is the hub's single aggregate -
 * every mutation invalidates it plus the eco calendar (economic events flow
 * through the provider pipeline) and the broker session (lifecycle parity).
 */

function invalidateIntegrationSurfaces(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.integrations }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ecoEvents }),
    queryClient.invalidateQueries({ queryKey: queryKeys.brokerSession }),
  ]);
}

type IntegrationProviderResponse = IntegrationsOverviewResponse["providers"][number];

export function useIntegrationsOverview() {
  return useQuery({
    queryKey: queryKeys.integrations,
    queryFn: () =>
      apiRequest<IntegrationsOverviewResponse>(apiPaths.integrationsOverview),
  });
}

export function useConnectIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      input,
    }: {
      providerId: string;
      input: IntegrationConnectInput;
    }) =>
      apiRequest<IntegrationProviderResponse>(
        apiPaths.integrationConnect(providerId),
        { method: "POST", body: input },
      ),
    // onSettled — errors (rate limits, auth failures) ALSO change engine
    // state: the error ledger and event log must refresh on failures too.
    onSettled: async () => {
      await invalidateIntegrationSurfaces(queryClient);
    },
  });
}

export function useDisconnectIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      apiRequest<IntegrationDisconnectResponse>(
        apiPaths.integrationDisconnect(providerId),
        { method: "POST" },
      ),
    // onSettled — errors (rate limits, auth failures) ALSO change engine
    // state: the error ledger and event log must refresh on failures too.
    onSettled: async () => {
      await invalidateIntegrationSurfaces(queryClient);
    },
  });
}

export function useTestIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      apiRequest<IntegrationTestResponse>(apiPaths.integrationTest(providerId), {
        method: "POST",
      }),
    // onSettled — errors (rate limits, auth failures) ALSO change engine
    // state: the error ledger and event log must refresh on failures too.
    onSettled: async () => {
      await invalidateIntegrationSurfaces(queryClient);
    },
  });
}

export function useSyncIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      apiRequest<IntegrationSyncResponse>(apiPaths.integrationSync(providerId), {
        method: "POST",
      }),
    // onSettled — errors (rate limits, auth failures) ALSO change engine
    // state: the error ledger and event log must refresh on failures too.
    onSettled: async () => {
      await invalidateIntegrationSurfaces(queryClient);
    },
  });
}

export function useSimulateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      endpointId,
      input,
    }: {
      endpointId: string;
      input: WebhookSimulateInput;
    }) =>
      apiRequest<WebhookDeliverResponse>(
        apiPaths.integrationWebhookSimulate(endpointId),
        { method: "POST", body: input },
      ),
    // onSettled — errors (rate limits, auth failures) ALSO change engine
    // state: the error ledger and event log must refresh on failures too.
    onSettled: async () => {
      await invalidateIntegrationSurfaces(queryClient);
    },
  });
}

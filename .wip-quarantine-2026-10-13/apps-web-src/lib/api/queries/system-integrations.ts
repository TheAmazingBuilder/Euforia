import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Integration,
  IntegrationsCatalogResponse,
  ToggleIntegrationResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * System integrations — the lightweight demo catalog behind the /integrations
 * toggle screen. Connections are simulated browser state: no keys, nothing
 * leaves the session (the Integration Hub's provider architecture is wired
 * separately in queries/integrations.ts).
 */

/** GET /integrations — the grouped catalog. */
export function useSystemIntegrations() {
  return useQuery({
    queryKey: queryKeys.systemIntegrations,
    queryFn: () => apiRequest<IntegrationsCatalogResponse>(apiPaths.systemIntegrations),
  });
}

/** POST /integrations/:id/toggle — flip one connection (simulated). */
export function useToggleSystemIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (integrationId: string) =>
      apiRequest<ToggleIntegrationResponse>(
        apiPaths.systemIntegrationToggle(integrationId),
        { method: "POST" },
      ),
    onSuccess: (updated: ToggleIntegrationResponse) => {
      queryClient.setQueryData<IntegrationsCatalogResponse>(
        queryKeys.systemIntegrations,
        (current) =>
          current
            ? {
                integrations: current.integrations.map((integration: Integration) =>
                  integration.id === updated.id
                    ? {
                        ...integration,
                        status: updated.status,
                        connectedAt: updated.connectedAt,
                      }
                    : integration,
                ),
              }
            : current,
      );
    },
  });
}

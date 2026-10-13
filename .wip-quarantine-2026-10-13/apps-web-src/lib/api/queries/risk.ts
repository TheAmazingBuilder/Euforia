import { useQuery } from "@tanstack/react-query";
import type { RiskOverviewResponse } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** Risk domain hooks — the Risk Command Center aggregate (GET /risk/overview). */

export function useRiskOverview() {
  return useQuery({
    queryKey: queryKeys.riskOverview,
    queryFn: () => apiRequest<RiskOverviewResponse>(apiPaths.riskOverview),
  });
}

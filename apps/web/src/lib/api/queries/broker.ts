import { useQuery } from "@tanstack/react-query";
import type { BrokerSessionResponse } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * GET /broker/session — read-only monitoring of the REAL trading account
 * (account metrics + positions + pending orders, mission §9–§12). The
 * response `state` drives the UI: NOT_CONFIGURED/ERROR render honest empty
 * states — the Session Live never invents broker numbers.
 */
export function useBrokerSession() {
  return useQuery({
    queryKey: queryKeys.brokerSession,
    queryFn: () => apiRequest<BrokerSessionResponse>(apiPaths.brokerSession),
    // Connection state must stay current but calm — this is monitoring,
    // not a trading blaster. Reconnects resync on the next poll.
    refetchInterval: 15_000,
  });
}

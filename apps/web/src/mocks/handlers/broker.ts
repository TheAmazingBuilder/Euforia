import { http, HttpResponse } from "msw";
import type { BrokerSessionResponse } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { endpoint, latency } from "./utils";

/**
 * Broker monitoring (read-only, mission §19–§21).
 *
 * The workspace has NO broker provider configured, so the honest answer is
 * a structured NOT_CONFIGURED envelope — never placeholder balance/equity
 * numbers (mission §33). Phase 2 will implement the TradingAccountProvider
 * behind this same read-only endpoint; the contract (@cosmoz/shared
 * brokerSessionResponseSchema) stays stable, only the answer changes.
 */
export const brokerHandlers = [
  http.get(endpoint(apiPaths.brokerSession), async () => {
    await latency();
    const body: BrokerSessionResponse = {
      connected: false,
      state: "NOT_CONFIGURED",
      reason:
        "No broker account is linked to this workspace. Read-only monitoring (positions, pending orders, account) activates once a provider is configured in Settings - Phase 2 of the Session Live.",
      account: null,
      positions: [],
      orders: [],
      lastSyncAt: null,
    };
    return HttpResponse.json(body);
  }),
];

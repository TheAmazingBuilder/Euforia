/**
 * MT5 terminal bridge adapter (Phase 08) - the FIRST push-based connector.
 *
 * MECHANISM (documented decision - U1 resolved as "terminal bridge"):
 *   MT5/IC Markets expose NO official cloud REST API (feasibility doc,
 *   verified 2026-10-14). The only honest paths are platform-resident
 *   bridges. This connector pairs with an MQL5 Expert Advisor the user
 *   installs INSIDE their own MT5 terminal: the EA reads the attached
 *   account (account info, snapshot, positions, orders, deals) and pushes
 *   signed events to Euforia's public ingest endpoint. Broker credentials
 *   NEVER leave the terminal; Euforia never sees them.
 *
 * ARCHITECTURE (why a pull adapter): the sync orchestrator and capability
 * gates are pull-shaped (§60 - "nothing else changes"). The bridge adapter
 * therefore reads the SERVER-PERSISTED ingest log (TradingBridgeEvent):
 *   terminal ──push──▶ ingest endpoint ──persist──▶ TradingBridgeEvent
 *   orchestrator ──fetch*──▶ latest event per kind (this adapter)
 * Freshness is honest by construction: data is exactly as fresh as the
 * last accepted push, and every fetch says so via its source.
 *
 * READ-ONLY red line intact: the EA implements read verbs only
 * (AccountInfo, Positions, Orders, History getters); no trade verb exists
 * here.
 */
import { Injectable } from "@nestjs/common";
import type {
  TradingProviderCapabilitiesV2,
  TradingProviderDescriptor,
} from "../../../../shared/contracts";
import { AccountsRepository } from "../../accounts.repository";
import {
  ProviderError,
  type DealsSyncResult,
  type NormalizedAccountInfo,
  type NormalizedDeal,
  type NormalizedOrder,
  type NormalizedPosition,
  type NormalizedSnapshot,
  type PositionsSyncResult,
  type ProviderCredentials,
  type ProviderRequestContext,
  type TradingProviderAdapter,
} from "../../provider.types";

function bridgeLimitation(): string {
  return "Data is as fresh as the last push from the MT5 terminal bridge (default every 30 s while the terminal runs).";
}

/** Capability V2 descriptor - one honest limitation covers every key. */
const BRIDGE_CAPABILITIES: TradingProviderCapabilitiesV2 = {
  accountDiscovery: {
    support: "UNSUPPORTED",
    evidence:
      "docs/architecture/accounts-connectivity-provider-feasibility.md - MT5 has no account-discovery API; the user types their login",
  },
  accountMetadata: {
    support: "SUPPORTED",
    retrieval: "POLL",
    evidence: "MT5 terminal AccountInfo* pushed by the bridge EA (docs/bridge/EuforiaBridge.mq5)",
    limitation: bridgeLimitation(),
  },
  balanceEquity: {
    support: "SUPPORTED",
    retrieval: "POLL",
    evidence:
      "MT5 terminal AccountInfoDouble(ACCOUNT_BALANCE/ACCOUNT_EQUITY) pushed by the bridge EA",
    limitation: bridgeLimitation(),
  },
  marginInfo: {
    support: "SUPPORTED",
    retrieval: "POLL",
    evidence:
      "MT5 terminal AccountInfoDouble(ACCOUNT_MARGIN/ACCOUNT_MARGIN_FREE/ACCOUNT_MARGIN_LEVEL) pushed by the bridge EA",
    limitation: bridgeLimitation(),
  },
  openPositions: {
    support: "SUPPORTED",
    retrieval: "POLL",
    evidence: "MT5 PositionsTotal/PositionGet* pushed as the COMPLETE open set each cycle",
    limitation: bridgeLimitation(),
  },
  orders: {
    support: "SUPPORTED",
    retrieval: "POLL",
    evidence: "MT5 OrdersTotal/OrderGet* pushed as the COMPLETE pending set each cycle",
    limitation: bridgeLimitation(),
  },
  deals: {
    support: "SUPPORTED",
    retrieval: "POLL",
    evidence: "MT5 HistoryDealsGet incremental push (position-linked, MT5 netting semantics §17)",
    limitation: bridgeLimitation(),
  },
  historyDepth: {
    support: "SUPPORTED",
    retrieval: "POLL",
    evidence:
      "Incremental since the EA's first start (MT5 terminal history window); depth documented in the bridge guide",
    limitation: bridgeLimitation(),
  },
  streamingAccountUpdates: {
    support: "UNSUPPORTED",
    evidence: "Poll-style push cadence (default 30 s); no streaming channel",
  },
  streamingPositions: {
    support: "UNSUPPORTED",
    evidence: "Poll-style push cadence (default 30 s); no streaming channel",
  },
  streamingOrderDealUpdates: {
    support: "UNSUPPORTED",
    evidence: "Poll-style push cadence (default 30 s); no streaming channel",
  },
  connectionValidation: {
    support: "SUPPORTED",
    retrieval: "ON_CONNECT",
    evidence:
      "Pairing IS the validation: the first accepted signed push flips CONNECTING → CONNECTED",
    limitation: "No pre-push validation is possible - the terminal is external by design",
  },
  credentialRevocation: {
    support: "SUPPORTED",
    retrieval: "POLL",
    evidence:
      "Rotate/disconnect wipes the bridge secret server-side; pushes without it fail HMAC (§22)",
  },
};

export const MT5_BRIDGE_DESCRIPTOR: TradingProviderDescriptor = {
  providerId: "mt5-bridge",
  providerName: "MT5 Terminal Bridge",
  platform: "MT5",
  supportedEnvironments: ["DEMO", "LIVE", "PROP_FIRM"],
  supportedConnectionMethods: ["PLATFORM_BRIDGE"],
  supportedPermissions: [
    "READ_ACCOUNT",
    "READ_BALANCE",
    "READ_EQUITY",
    "READ_POSITIONS",
    "READ_ORDERS",
    "READ_DEALS",
    "READ_HISTORY",
  ],
  capabilities: BRIDGE_CAPABILITIES,
  isMock: false,
};

/** Ingest event kinds the bridge adapter reads (mirrors the ingest service). */
type BridgeEventKind = "ACCOUNT_INFO" | "SNAPSHOT" | "POSITIONS" | "ORDERS" | "DEALS";

/** Narrow row projection of a cached bridge event (repository shape). */
interface BridgeEventRow {
  payload: unknown;
  receivedAt: Date;
}

@Injectable()
export class Mt5BridgeProviderAdapter implements TradingProviderAdapter {
  readonly descriptor = MT5_BRIDGE_DESCRIPTOR;

  constructor(private readonly repository: AccountsRepository) {}

  /**
   * Bridge "validation" cannot dial a terminal (there is nothing to dial at
   * connect time - the EA may not be installed yet). The REAL validation is
   * the first accepted signed push (capability connectionValidation,
   * retrieval ON_CONNECT). The connect flow for PLATFORM_BRIDGE therefore
   * never calls this; the connection-health endpoint answers from the
   * connection status + last-push age instead. Kept as an explicit no-op so
   * any accidental call path fails OPEN honestly rather than faking latency.
   */
  async testConnection(_credentials: ProviderCredentials): Promise<void> {
    return;
  }

  async fetchAccountInfo(context: ProviderRequestContext): Promise<NormalizedAccountInfo> {
    const row = await this.requireLatest(context, "ACCOUNT_INFO");
    const payload = row.payload as {
      externalAccountId?: string;
      currency?: string;
      leverage?: string | null;
      server?: string | null;
      brokerName?: string | null;
      accountClass?: "REAL" | "DEMO" | null;
    };
    if (!payload.externalAccountId || !payload.currency) {
      throw this.invalidResponse("ACCOUNT_INFO");
    }
    return {
      externalAccountId: payload.externalAccountId,
      currency: payload.currency,
      leverage: payload.leverage ?? null,
      server: payload.server ?? null,
      brokerIdentity: payload.brokerName
        ? { brokerName: payload.brokerName, accountClass: payload.accountClass ?? null }
        : null,
    };
  }

  async fetchSnapshot(context: ProviderRequestContext): Promise<NormalizedSnapshot> {
    const row = await this.requireLatest(context, "SNAPSHOT");
    const payload = row.payload as Partial<NormalizedSnapshot>;
    const asString = (v: unknown): string | null =>
      typeof v === "string" && v.length > 0 ? v : null;
    return {
      balance: asString(payload.balance),
      equity: asString(payload.equity),
      margin: asString(payload.margin),
      freeMargin: asString(payload.freeMargin),
      marginLevel: asString(payload.marginLevel),
    };
  }

  async fetchPositions(context: ProviderRequestContext): Promise<PositionsSyncResult> {
    const row = await this.requireLatest(context, "POSITIONS");
    const payload = row.payload as { positions?: NormalizedPosition[] };
    if (!Array.isArray(payload.positions)) throw this.invalidResponse("POSITIONS");
    // The EA pushes the COMPLETE open set each cycle → completeness fact true.
    return { positions: payload.positions, complete: true };
  }

  async fetchOrders(context: ProviderRequestContext): Promise<NormalizedOrder[]> {
    // No event is not an empty order book. Only an explicitly received
    // complete list (possibly empty) may be persisted as current state.
    const row = await this.requireLatest(context, "ORDERS");
    const payload = row.payload as { orders?: NormalizedOrder[] };
    if (!Array.isArray(payload.orders)) throw this.invalidResponse("ORDERS");
    return payload.orders;
  }

  async fetchDeals(context: ProviderRequestContext): Promise<DealsSyncResult> {
    // The EA emits an explicit DEALS event even when there are zero deals.
    // Missing/stale data must not be mistaken for a successful empty history.
    const row = await this.requireLatest(context, "DEALS");
    const payload = row.payload as {
      deals?: NormalizedDeal[];
      observedThrough?: string | null;
      complete?: boolean;
    };
    if (!Array.isArray(payload.deals)) throw this.invalidResponse("DEALS");
    // The EA's incremental window is its own checkpoint; observedThrough and
    // completeness travel WITH the event (§8 semantics - never invented here).
    return {
      deals: payload.deals,
      observedThrough: payload.observedThrough ?? null,
      complete: payload.complete ?? true,
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async latest(
    context: ProviderRequestContext,
    kind: BridgeEventKind,
  ): Promise<{ payload: unknown; receivedAt: Date } | null> {
    if (!context.bridgeKeyId) {
      throw new ProviderError(
        "INVALID_CREDENTIALS",
        "The bridge connection is missing its routing key. Please reconnect the account.",
      );
    }
    const row = await this.repository.latestBridgeEvent(context.bridgeKeyId, kind);
    if (!row) return null;

    // Do not re-persist a cached payload as if it were a fresh broker poll.
    // The EA pushes all five event kinds every cycle (including empty orders
    // and deals). If an event predates the last successful snapshot sync, that
    // resource has not reported a new observation for this run.
    if (context.lastSyncAt && row.receivedAt.getTime() <= context.lastSyncAt.getTime()) {
      throw new ProviderError(
        "PROVIDER_UNAVAILABLE",
        "The MT5 terminal bridge has not sent a new observation since the last synchronization. Keep the terminal running and verify the EuforiaBridge EA.",
      );
    }
    return row;
  }

  private async requireLatest(
    context: ProviderRequestContext,
    kind: BridgeEventKind,
  ): Promise<BridgeEventRow> {
    const row = await this.latest(context, kind);
    if (!row) {
      throw new ProviderError(
        "PROVIDER_UNAVAILABLE",
        "No data has been received from the MT5 terminal bridge yet. Make sure the EuforiaBridge EA is attached and the terminal is running.",
      );
    }
    return row;
  }

  private invalidResponse(kind: BridgeEventKind): ProviderError {
    return new ProviderError(
      "INVALID_PROVIDER_RESPONSE",
      `The terminal bridge sent a ${kind} payload that could not be understood.`,
    );
  }
}

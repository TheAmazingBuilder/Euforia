/**
 * CapabilityPoorTestProviderAdapter (Phase 03 — doc E Phase 03 scope).
 *
 * A deliberately capability-POOR fixture adapter whose sole purpose is to
 * exercise the capability model WITHOUT a real provider:
 *
 *   - `orders` is declared UNSUPPORTED → fetchOrders() throws
 *     UNSUPPORTED_CAPABILITY (adapter-level enforcement — proven by unit
 *     tests + the wire mapping 422 proof).
 *   - `deals` is declared UNKNOWN → the sync orchestration must SKIP the
 *     deals segment as a capability FACT (doc B §8.2), never mark the run
 *     failed, and the direct call must also throw (UNKNOWN blocks with an
 *     honest error, doc A §4.4).
 *   - remaining read segments are SUPPORTED with deterministic FNV-1a
 *     fixtures (same determinism discipline as the mock adapter).
 *
 * §57 policy: this is TEST infrastructure — it is NEVER registered by the
 * production module factory; tests construct their own registry instances.
 * isMock: true everywhere it renders.
 */
import type { TradingProviderDescriptor } from "../../../shared/contracts";
import { capabilitySupportLevel } from "../../../shared/contracts";
import type {
  NormalizedAccountInfo,
  NormalizedDeal,
  NormalizedOrder,
  NormalizedPosition,
  NormalizedSnapshot,
  ProviderCredentials,
  ProviderRequestContext,
  TradingProviderAdapter,
} from "../provider.types";
import { ProviderError } from "../provider.types";

function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const UNSUPPORTED_MESSAGE = "This provider does not declare support for the requested operation.";

export class CapabilityPoorTestProviderAdapter implements TradingProviderAdapter {
  readonly descriptor: TradingProviderDescriptor = {
    providerId: "CAPABILITY_TEST",
    providerName: "Capability Test Provider",
    platform: "OTHER",
    supportedEnvironments: ["DEMO"],
    supportedConnectionMethods: ["API_KEY"],
    supportedPermissions: ["READ_ACCOUNT", "READ_BALANCE", "READ_EQUITY", "READ_POSITIONS"],
    capabilities: {
      accountDiscovery: { support: "UNSUPPORTED" },
      accountMetadata: { support: "SUPPORTED", retrieval: "POLL" },
      balanceEquity: { support: "SUPPORTED", retrieval: "POLL" },
      marginInfo: { support: "UNKNOWN", limitation: "Test fixture — margin declared unknown on purpose." },
      openPositions: { support: "SUPPORTED", retrieval: "POLL" },
      orders: {
        support: "UNSUPPORTED",
        limitation: "Test fixture — orders declared unsupported on purpose (gating proof).",
      },
      deals: {
        support: "UNKNOWN",
        limitation: "Test fixture — deals declared UNKNOWN on purpose (UNKNOWN-blocks proof).",
      },
      historyDepth: { support: "UNSUPPORTED" },
      streamingAccountUpdates: { support: "UNSUPPORTED" },
      streamingPositions: { support: "UNSUPPORTED" },
      streamingOrderDealUpdates: { support: "UNSUPPORTED" },
      connectionValidation: { support: "SUPPORTED", retrieval: "ON_CONNECT" },
      credentialRevocation: { support: "UNSUPPORTED" },
    },
    isMock: true,
  };

  async testConnection(credentials: ProviderCredentials): Promise<void> {
    if (hashSeed(credentials.secret) % 7 === 3) {
      throw new ProviderError("INVALID_CREDENTIALS", "The provider rejected these credentials.");
    }
  }

  async fetchAccountInfo(context: ProviderRequestContext): Promise<NormalizedAccountInfo> {
    this.assertSupported("accountMetadata");
    return {
      externalAccountId: context.externalAccountId,
      currency: "USD",
      leverage: null,
      server: "Capability-Test",
    };
  }

  async fetchSnapshot(context: ProviderRequestContext): Promise<NormalizedSnapshot> {
    this.assertSupported("balanceEquity");
    const h = hashSeed(context.externalAccountId);
    return {
      balance: String(10_000 + (h % 5_000)),
      equity: String(10_000 + (h % 5_000) + 12),
      margin: "0.00",
      freeMargin: String(10_000 + (h % 5_000) + 12),
      marginLevel: null, // marginInfo is UNKNOWN — honest null
    };
  }

  async fetchPositions(context: ProviderRequestContext): Promise<NormalizedPosition[]> {
    this.assertSupported("openPositions");
    const h = hashSeed(context.externalAccountId);
    if (h % 2 === 0) return [];
    return [
      {
        externalPositionId: `${context.externalAccountId}-pos-1`,
        symbol: "EURUSD",
        side: "BUY",
        volume: "0.10",
        entryPrice: "1.08650",
        currentPrice: null,
        stopLoss: null,
        takeProfit: null,
        profit: "3.50",
        swap: null,
        commission: null,
        openedAt: new Date(Date.UTC(2026, 0, 8, 14, 0, 0)).toISOString(),
      },
    ];
  }

  /** UNSUPPORTED enforcement — the operation exists, the capability does not. */
  async fetchOrders(_context: ProviderRequestContext): Promise<NormalizedOrder[]> {
    void _context;
    throw new ProviderError("UNSUPPORTED_CAPABILITY", UNSUPPORTED_MESSAGE);
  }

  /** UNKNOWN blocks with an honest error — never silent emptiness (doc A §4.4). */
  async fetchDeals(_context: ProviderRequestContext): Promise<NormalizedDeal[]> {
    void _context;
    throw new ProviderError(
      "UNSUPPORTED_CAPABILITY",
      "This provider has not evidenced support for the requested operation.",
    );
  }

  private assertSupported(key: "accountMetadata" | "balanceEquity" | "openPositions"): void {
    if (capabilitySupportLevel(this.descriptor.capabilities, key) !== "SUPPORTED") {
      throw new ProviderError("UNSUPPORTED_CAPABILITY", UNSUPPORTED_MESSAGE);
    }
  }
}

/**
 * MockTradingProviderAdapter (Phase 3 §55).
 *
 * Simulates a read-only MT5-style broker so the whole connectivity
 * architecture — connect, test, synchronize, normalize, persist — can be
 * exercised WITHOUT a real broker account, including CONTROLLED FAILURES:
 *
 *   secret prefix "fail-invalid"     → INVALID_CREDENTIALS
 *   secret prefix "fail-timeout"     → (sleeps past the configured timeout) CONNECTION_TIMEOUT
 *   secret prefix "fail-unavailable" → PROVIDER_UNAVAILABLE
 *   secret prefix "fail-malformed"   → deliberately type-broken payloads → INVALID_PROVIDER_RESPONSE
 *
 * Data determinism: every generated value is a PURE function of the
 * externalAccountId (FNV-1a hash) — stable external identifiers (§18), no
 * clock reads, no randomness. Synchronizing twice yields byte-identical
 * external objects (idempotent upserts), which the tests rely on.
 *
 * §57: mock providers are dev/test infrastructure — the registry only
 * registers this adapter when config.accounts.mockProviderEnabled, so
 * production cannot silently serve mock data.
 */
import type { TradingProviderDescriptor } from "../../../shared/contracts";
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

/** All V1 read permissions (§24) — the mock supports the full read set. */
const ALL_READ_PERMISSIONS = [
  "READ_ACCOUNT",
  "READ_BALANCE",
  "READ_EQUITY",
  "READ_POSITIONS",
  "READ_ORDERS",
  "READ_DEALS",
  "READ_HISTORY",
] as const;

const SYMBOLS = ["EURUSD", "XAUUSD", "BTCUSD", "GBPJPY", "US30"] as const;
const CURRENCIES = ["USD", "EUR", "GBP"] as const;

/** Fixed epoch anchors — UTC (§64), deterministic across calls and restarts. */
const BASE_DEAL_MS = Date.UTC(2026, 0, 5, 9, 30, 0); // 2026-01-05T09:30:00Z
const BASE_POSITION_MS = Date.UTC(2026, 0, 8, 14, 0, 0); // 2026-01-08T14:00:00Z
const BASE_ORDER_MS = Date.UTC(2026, 0, 9, 10, 15, 0); // 2026-01-09T10:15:00Z

/** FNV-1a 32-bit — small, dependency-free, stable across processes. */
function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const FAILURE_SCENARIOS = ["fail-invalid", "fail-timeout", "fail-unavailable", "fail-malformed"] as const;

function scenarioOf(secret: string): (typeof FAILURE_SCENARIOS)[number] | null {
  return FAILURE_SCENARIOS.find((marker) => secret.startsWith(marker)) ?? null;
}

function fail(scenario: NonNullable<ReturnType<typeof scenarioOf>>): never {
  switch (scenario) {
    case "fail-invalid":
      throw new ProviderError("INVALID_CREDENTIALS", "The provider rejected these credentials.");
    case "fail-unavailable":
      throw new ProviderError("PROVIDER_UNAVAILABLE", "The trading provider is currently unavailable.");
    case "fail-timeout":
      throw new ProviderError("CONNECTION_TIMEOUT", "The trading provider did not respond in time.");
    case "fail-malformed":
      // The malformed scenario fails at VALIDATION time (application layer),
      // not here — the adapter "answers" with type-broken payloads.
      return undefined as never;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Money-ish decimal string with fixed 2 decimals, no float drift. */
function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export class MockTradingProviderAdapter implements TradingProviderAdapter {
  readonly descriptor: TradingProviderDescriptor = {
    providerId: "MOCK",
    providerName: "Cosmoz Mock Broker",
    platform: "MT5",
    supportedEnvironments: ["DEMO", "LIVE"],
    supportedConnectionMethods: ["API_KEY"],
    supportedPermissions: [...ALL_READ_PERMISSIONS],
    capabilities: {
      account: true,
      snapshot: true,
      positions: true,
      orders: true,
      deals: true,
      history: true,
    },
    isMock: true,
  };

  /** Any provider call fails per the scenario encoded in the secret. */
  private async guard(secret: string): Promise<void> {
    const scenario = scenarioOf(secret);
    if (scenario === "fail-timeout") {
      // 3s: outlives the 2s test timeout, but never hangs a process.
      await sleep(3_000);
      fail("fail-timeout");
    }
    if (scenario !== null) fail(scenario);
  }

  async testConnection(credentials: ProviderCredentials): Promise<void> {
    await this.guard(credentials.secret);
  }

  async fetchAccountInfo(context: ProviderRequestContext): Promise<NormalizedAccountInfo> {
    await this.guard(context.credentials.secret);
    const h = hashSeed(context.externalAccountId);
    return {
      externalAccountId: context.externalAccountId,
      currency: CURRENCIES[h % CURRENCIES.length] ?? "USD",
      leverage: String([30, 100, 200, 500][h % 4]),
      server: "Cosmoz-MT5-Sim",
    };
  }

  async fetchSnapshot(context: ProviderRequestContext): Promise<NormalizedSnapshot> {
    await this.guard(context.credentials.secret);
    const h = hashSeed(context.externalAccountId);
    const balance = money(10_000 + (h % 9_000) + (h % 100) / 100);
    const equity = money(10_000 + (h % 9_000) + ((h >> 7) % 40) / 10 - 2);
    if (scenarioOf(context.credentials.secret) === "fail-malformed") {
      // Type-broken on purpose — the application layer's schema validation
      // must catch this and normalize it to INVALID_PROVIDER_RESPONSE.
      return {
        balance: Number(balance),
        equity: "not-a-decimal",
        margin: null,
        freeMargin: undefined,
        marginLevel: 0,
      } as unknown as NormalizedSnapshot;
    }
    return {
      balance,
      equity,
      margin: money((h % 500) + 25),
      freeMargin: money((h % 4_000) + 500),
      marginLevel: money((h % 3_000) + 150),
    };
  }

  async fetchPositions(context: ProviderRequestContext): Promise<NormalizedPosition[]> {
    await this.guard(context.credentials.secret);
    const h = hashSeed(context.externalAccountId);
    const count = h % 3; // 0–2 open positions
    const positions: NormalizedPosition[] = [];
    for (let i = 0; i < count; i += 1) {
      const hi = (h + i * 0x9e3779b9) >>> 0;
      const entryBase = [1.05, 2_650.5, 96_400, 195.2, 44_300][hi % 5] ?? 1.05;
      const entry = entryBase + ((hi % 200) / 10_000);
      const current = entry * (hi % 2 === 0 ? 1.0007 : 0.9993);
      const hasSl = hi % 3 !== 0;
      positions.push({
        externalPositionId: `${context.externalAccountId}-pos-${i + 1}`,
        symbol: SYMBOLS[hi % SYMBOLS.length] ?? "EURUSD",
        side: hi % 2 === 0 ? "BUY" : "SELL",
        volume: (0.1 + 0.1 * (hi % 5)).toFixed(2),
        entryPrice: entry.toFixed(entry < 10 ? 5 : 2),
        currentPrice: current.toFixed(current < 10 ? 5 : 2),
        stopLoss: hasSl ? (entry * 0.99).toFixed(entry < 10 ? 5 : 2) : null,
        takeProfit: (entry * 1.02).toFixed(entry < 10 ? 5 : 2),
        profit: money((hi % 600) / 2 - 150),
        swap: hi % 4 === 0 ? money((hi % 30) / -10) : null,
        commission: money(-((hi % 40) / 10) - 2),
        openedAt: new Date(BASE_POSITION_MS + i * 3_600_000).toISOString(),
      });
    }
    return positions;
  }

  async fetchOrders(context: ProviderRequestContext): Promise<NormalizedOrder[]> {
    await this.guard(context.credentials.secret);
    const h = hashSeed(context.externalAccountId);
    if (h % 2 === 0) return []; // no pending orders
    const entryBase = [1.08, 2_700, 97_500, 196.4, 45_100][h % 5] ?? 1.08;
    return [
      {
        externalOrderId: `${context.externalAccountId}-ord-1`,
        symbol: SYMBOLS[(h >> 3) % SYMBOLS.length] ?? "EURUSD",
        type: h % 4 === 0 ? "SELL_STOP" : "BUY_LIMIT",
        volume: "0.20",
        price: entryBase.toFixed(entryBase < 10 ? 5 : 2),
        stopLoss: null,
        takeProfit: (entryBase * 1.03).toFixed(entryBase < 10 ? 5 : 2),
        status: "PENDING",
        createdAt: new Date(BASE_ORDER_MS).toISOString(),
        updatedAt: new Date(BASE_ORDER_MS + 1_800_000).toISOString(),
      },
    ];
  }

  async fetchDeals(context: ProviderRequestContext): Promise<NormalizedDeal[]> {
    await this.guard(context.credentials.secret);
    const h = hashSeed(context.externalAccountId);
    const count = 6 + (h % 5); // 6–10 deals
    const deals: NormalizedDeal[] = [];
    for (let k = 0; k < count; k += 1) {
      const hk = (h + k * 0x85ebca6b) >>> 0;
      const isBalanceOp = k % 4 === 3; // every 4th deal is a deposit
      deals.push({
        externalDealId: `${context.externalAccountId}-deal-${k + 1}`,
        symbol: isBalanceOp ? null : (SYMBOLS[hk % SYMBOLS.length] ?? "EURUSD"),
        side: hk % 2 === 0 ? "BUY" : "SELL",
        volume: isBalanceOp ? "0.00" : (0.1 + 0.1 * (hk % 4)).toFixed(2),
        price: isBalanceOp ? null : (1.02 + (hk % 500) / 1_000).toFixed(5),
        profit: isBalanceOp ? money(1_000 + (hk % 500)) : money((hk % 400) / 2 - 90),
        commission: isBalanceOp ? null : money(-((hk % 30) / 10) - 1),
        swap: hk % 5 === 0 ? money((hk % 20) / -10) : null,
        executedAt: new Date(BASE_DEAL_MS + k * 86_400_000).toISOString(),
      });
    }
    return deals;
  }
}

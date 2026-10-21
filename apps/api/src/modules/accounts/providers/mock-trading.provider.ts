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
  DealsSyncResult,
  NormalizedAccountInfo,
  PositionsSyncResult,
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

/** Catalog-aligned symbols (Phase 4 §14): the mock simulates a broker whose
 * instruments all exist in the Euforia catalog, so the deal→trade
 * reconstruction can resolve every symbol. Deterministic, read-only. */
const SYMBOLS = ["EURUSD", "XAUUSD", "BTCUSDT", "BOOM500", "CRASH500"] as const;
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
    providerName: "Euforia Mock Broker",
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
      server: "Euforia-MT5-Sim",
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

  async fetchPositions(context: ProviderRequestContext): Promise<PositionsSyncResult> {
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
    // The mock serves its generated set as the complete open set (fixture
    // semantics — reconciliation closure exercises against this).
    return { positions, complete: true };
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

  async fetchDeals(context: ProviderRequestContext): Promise<DealsSyncResult> {
    await this.guard(context.credentials.secret);
    const h = hashSeed(context.externalAccountId);

    /**
     * Phase 4 §9/§17: deals carry the provider-side positionId and form
     * COHERENT netting cycles — entry deals share the position side, exit
     * deals the opposite one, exit volume sums back to entry volume — so
     * the Trading Core reconstruction can rebuild journal trades the way it
     * will with real MT5 data. Balance operations (deposits) have no symbol
     * and no positionId. All deterministic (pure function of the external
     * account id), still idempotent across repeated syncs (§18).
     */
    const bases = [1.0865, 2385.0, 61240.0, 9820.0, 8340.0] as const;
    const cycleCount = 3 + (h % 3); // 3–5 position cycles
    const lastCycleOpen = h % 2 === 0; // one reconstructable OPEN trade on even logins

    interface Draft {
      executedAtMs: number;
      deal: NormalizedDeal;
    }
    const drafts: Draft[] = [];
    let cursorMs = BASE_DEAL_MS;
    let dealSeq = 0;

    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
      const hc = (h + cycle * 0x9e3779b9) >>> 0;
      const isDeposit = cycle % 3 === 2; // every 3rd cycle is a balance op
      if (isDeposit) {
        cursorMs += 86_400_000;
        drafts.push({
          executedAtMs: cursorMs,
          deal: {
            externalDealId: `${context.externalAccountId}-deal-${(dealSeq += 1)}`,
            symbol: null,
            side: "BUY",
            volume: "0.00",
            price: null,
            profit: money(1_000 + (hc % 500)),
            commission: null,
            swap: null,
            positionId: null,
            executedAt: "",
          },
        });
        continue;
      }

      const base = bases[hc % bases.length] ?? 1.0865;
      const digits = base < 10 ? 5 : 2;
      const isOpenCycle = lastCycleOpen && cycle === cycleCount - 1;
      const positionId = `${context.externalAccountId}-cyc-${cycle + 1}`;
      const direction: "BUY" | "SELL" = hc % 2 === 0 ? "BUY" : "SELL";
      const exitSide: "BUY" | "SELL" = direction === "BUY" ? "SELL" : "BUY";
      const entry = base + ((hc % 200) / 10_000);

      // Entry volume split across 1–2 in-deals; exits mirror it exactly.
      const totalVolume = Number((0.2 + 0.1 * (hc % 4)).toFixed(2));
      const inCount = 1 + (hc % 2);
      const inLeg = Number((totalVolume / inCount).toFixed(2));
      const outCount = isOpenCycle ? 0 : 1 + ((hc >> 3) % 2);
      const outLeg = outCount === 0 ? 0 : Number((totalVolume / outCount).toFixed(2));
      const profitFinal = money((hc % 600) / 2 - 150);

      const push = (
        side: "BUY" | "SELL",
        volume: string,
        price: number,
        profit: string | null,
        minutesOffset: number,
      ): void => {
        cursorMs += minutesOffset * 60_000;
        drafts.push({
          executedAtMs: cursorMs,
          deal: {
            externalDealId: `${context.externalAccountId}-deal-${(dealSeq += 1)}`,
            symbol: SYMBOLS[hc % SYMBOLS.length] ?? "EURUSD",
            side,
            volume,
            price: price.toFixed(digits),
            profit,
            commission: money(-((hc % 30) / 10) - 1),
            swap: hc % 5 === 0 ? money((hc % 20) / -10) : null,
            positionId,
            executedAt: "",
          },
        });
      };

      // In-deals at the (weighted-same) entry price, then out-deals at a
      // nearby price — the LAST out-deal carries the cycle's closed profit.
      for (let i = 0; i < inCount; i += 1) {
        push(direction, inLeg.toFixed(2), entry, "0.00", 17 + i * 41);
      }
      const exitPrice = entry * (direction === "BUY" ? 1.0009 : 0.9991);
      for (let i = 0; i < outCount; i += 1) {
        const isLast = i === outCount - 1;
        push(exitSide, outLeg.toFixed(2), exitPrice, isLast ? profitFinal : "0.00", 23 + i * 37);
      }
      cursorMs += 86_400_000;
    }

    const deals = drafts
      .sort((a, b) => a.executedAtMs - b.executedAtMs)
      .map((draft) => ({
        ...draft.deal,
        executedAt: new Date(draft.executedAtMs).toISOString(),
      }));
    // Fixture semantics: the generated window IS the full deal history —
    // complete, no checkpoint (observedThrough null = nothing to resume).
    return { deals, observedThrough: null, complete: true };
  }
}

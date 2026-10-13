/**
 * Unit — OandaRestProviderAdapter (Phase 03).
 *
 * The adapter's HTTP transport is stubbed at the global-fetch boundary: every
 * fixture below uses REALISTIC OANDA v20 payload shapes (decimal STRINGS,
 * nanosecond RFC3339 timestamps, signed units) as documented at
 * developer.oanda.com/rest-live-v20. Fixture evidence is labeled as such —
 * it proves the ADAPTER logic, never real connectivity (doc E §1: mock/
 * fixture evidence is never presented as provider verification).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  capabilitySupportLevel,
  isCapabilitiesV2,
  tradingProviderDescriptorSchema,
  TRADING_ERROR_CODES,
} from "../../src/shared/contracts";
import { OandaRestProviderAdapter } from "../../src/modules/accounts/providers/oanda/oanda-rest.provider";
import {
  dealsFromTransactions,
  leverageFromMarginRate,
  mapOandaSymbol,
  ordersFromPending,
  positionsFromTrades,
} from "../../src/modules/accounts/providers/oanda/oanda-mapping";
import { ProviderError, withProviderTimeout } from "../../src/modules/accounts/provider.types";
import { normalizeProviderError } from "../../src/modules/accounts/trading-sync.service";
import { BusinessRuleError, RateLimitError } from "../../src/shared/errors/app-error";

const ACCOUNT_ID = "101-004-7192958-001";

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    credentials: { method: "API_KEY" as const, secret: "oanda-personal-token" },
    externalAccountId: ACCOUNT_ID,
    environment: "DEMO" as const,
    ...overrides,
  };
}

/** Install a stubbed global fetch answering with (status, body, headers). */
function stubFetch(handler: (url: string, init: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> }) {
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const result = handler(String(url), init);
    const status = result.status ?? 200;
    const response = new Response(
      result.body === undefined ? "{}" : JSON.stringify(result.body),
      {
        status,
        headers: { "content-type": "application/json", ...(result.headers ?? {}) },
      },
    );
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Descriptor honesty ───────────────────────────────────────────────────────

describe("OandaRestProviderAdapter — descriptor", () => {
  it("declares a V2 capability set that parses against the shared descriptor schema", () => {
    const adapter = new OandaRestProviderAdapter();
    const parsed = tradingProviderDescriptorSchema.safeParse(adapter.descriptor);
    expect(parsed.success).toBe(true);
    expect(adapter.descriptor.providerId).toBe("oanda-v20");
    expect(adapter.descriptor.platform).toBe("OANDA");
    expect(adapter.descriptor.isMock).toBe(false);
    expect(adapter.descriptor.supportedPermissions.every((p) => p.startsWith("READ_"))).toBe(true);
  });

  it("declares UNKNOWN where evidence is missing and UNSUPPORTED streaming — never silent booleans", () => {
    const adapter = new OandaRestProviderAdapter();
    expect(capabilitySupportLevel(adapter.descriptor.capabilities, "accountDiscovery")).toBe("UNKNOWN");
    expect(capabilitySupportLevel(adapter.descriptor.capabilities, "historyDepth")).toBe("UNKNOWN");
    expect(capabilitySupportLevel(adapter.descriptor.capabilities, "balanceEquity")).toBe("SUPPORTED");
    expect(capabilitySupportLevel(adapter.descriptor.capabilities, "streamingAccountUpdates")).toBe("UNSUPPORTED");
    if (isCapabilitiesV2(adapter.descriptor.capabilities)) {
      expect(adapter.descriptor.capabilities.accountDiscovery.limitation).toBeTruthy();
    } else {
      expect.fail("the OANDA descriptor must declare the V2 capability shape");
  }
  });

  it("exposes the 6 port methods and NO execution surface (red line)", () => {
    const adapter = new OandaRestProviderAdapter() as unknown as Record<string, unknown>;
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter)).filter(
      (name) => typeof adapter[name] === "function" && name !== "constructor",
    );
    for (const portMethod of [
      "fetchAccountInfo",
      "fetchDeals",
      "fetchOrders",
      "fetchPositions",
      "fetchSnapshot",
      "testConnection",
    ]) {
      expect(methods).toContain(portMethod);
    }
    // No execution verb anywhere in the surface (§47 red line).
    const executionVerb = /^(place|cancel|close|modify|execute|submit|send)/;
    expect(methods.filter((name) => executionVerb.test(name))).toEqual([]);
  });
});

// ── Environment routing + auth header ────────────────────────────────────────

describe("OandaRestProviderAdapter — environment routing", () => {
  it("DEMO routes to the practice host, LIVE to the trade host", async () => {
    const fetchMock = stubFetch(() => ({
      body: { account: summaryAccount() },
    }));
    const adapter = new OandaRestProviderAdapter();
    await adapter.fetchSnapshot(ctx({ environment: "DEMO" }));
    await adapter.fetchSnapshot(ctx({ environment: "LIVE" }));
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("https://api-fxpractice.oanda.com");
    expect(urls[1]).toContain("https://api-fxtrade.oanda.com");
  });

  it("the URL override wins (tests/fixture server)", async () => {
    const fetchMock = stubFetch(() => ({ body: { account: summaryAccount() } }));
    const adapter = new OandaRestProviderAdapter({ restUrlOverride: "http://127.0.0.1:45999" });
    await adapter.fetchSnapshot(ctx());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("http://127.0.0.1:45999");
  });

  it("sends the token as a Bearer Authorization header (never a query param)", async () => {
    const fetchMock = stubFetch(() => ({ body: { account: summaryAccount() } }));
    const adapter = new OandaRestProviderAdapter();
    await adapter.fetchSnapshot(ctx());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer oanda-personal-token");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("oanda-personal-token");
  });

  it("rejects PROP_FIRM honestly (UNSUPPORTED_ACCOUNT) before any HTTP call", async () => {
    const fetchMock = stubFetch(() => ({ body: { account: summaryAccount() } }));
    const adapter = new OandaRestProviderAdapter();
    await expect(adapter.fetchSnapshot(ctx({ environment: "PROP_FIRM" }))).rejects.toMatchObject({
      code: "UNSUPPORTED_ACCOUNT",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Payload mapping ──────────────────────────────────────────────────────────

function summaryAccount(overrides: Record<string, string> = {}) {
  return {
    id: ACCOUNT_ID,
    alias: "Primary",
    currency: "USD",
    balance: "10482.5512",
    openTradeCount: 1,
    openPositionCount: 0,
    pendingOrderCount: 1,
    hedgingEnabled: false,
    pl: "-2.1935",
    resettablePL: "-2.1935",
    financing: "0.0000",
    commission: "0.0000",
    guaranteedExecutionFee: "0.0000",
    marginRate: "0.02",
    marginUsed: "55.4210",
    marginAvailable: "10427.1302",
    unrealizedPL: "-2.1935",
    nav: "10480.3577",
    lastTransactionID: "2347",
    ...overrides,
  };
}

describe("OandaRestProviderAdapter — fetchAccountInfo / fetchSnapshot", () => {
  it("maps summary decimal strings verbatim; marginLevel stays null (not reported)", async () => {
    stubFetch(() => ({ body: { account: summaryAccount() } }));
    const adapter = new OandaRestProviderAdapter();
    const snapshot = await adapter.fetchSnapshot(ctx());
    expect(snapshot).toEqual({
      balance: "10482.5512",
      equity: "10480.3577",
      margin: "55.4210",
      freeMargin: "10427.1302",
      marginLevel: null,
    });
  });

  it("account info derives leverage from marginRate and echoes the requested id", async () => {
    stubFetch(() => ({ body: { account: summaryAccount() } }));
    const adapter = new OandaRestProviderAdapter();
    const info = await adapter.fetchAccountInfo(ctx());
    expect(info.externalAccountId).toBe(ACCOUNT_ID);
    expect(info.currency).toBe("USD");
    expect(info.leverage).toBe("50"); // 1 / 0.02
    expect(info.server).toBeNull();
  });

  it("an account currency outside the journal vocabulary is UNSUPPORTED_ACCOUNT (honest)", async () => {
    stubFetch(() => ({ body: { account: summaryAccount({ currency: "HKD" }) } }));
    const adapter = new OandaRestProviderAdapter();
    await expect(adapter.fetchAccountInfo(ctx())).rejects.toMatchObject({
      code: "UNSUPPORTED_ACCOUNT",
    });
  });

  it("a payload echoing a DIFFERENT account id is INVALID_PROVIDER_RESPONSE", async () => {
    stubFetch(() => ({ body: { account: summaryAccount({ id: "999-999-9999999-999" }) } }));
    const adapter = new OandaRestProviderAdapter();
    await expect(adapter.fetchSnapshot(ctx())).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });
  });
});

// ── Positions (open trades) ──────────────────────────────────────────────────

describe("OandaRestProviderAdapter — fetchPositions (open trades)", () => {
  it("maps open trades with stable tradeID, side from signed units, nanosecond time truncated to ms", async () => {
    stubFetch(() => ({
      body: {
        trades: [
          {
            id: "2344",
            instrument: "EUR_USD",
            price: "1.11338",
            openTime: "2026-01-07T09:12:04.057358072Z",
            state: "OPEN",
            currentUnits: "100",
            realizedPL: "0.0000",
            financing: "0.0000",
            unrealizedPL: "-0.0540",
            marginUsed: "55.4210",
          },
          {
            id: "2350",
            instrument: "XAU_USD",
            price: "2650.50",
            openTime: "2026-01-08T14:00:00.000000000Z",
            state: "OPEN",
            currentUnits: "-3",
            unrealizedPL: "12.30",
          },
        ],
        lastTransactionID: "2350",
      },
    }));
    const adapter = new OandaRestProviderAdapter();
    const positions = await adapter.fetchPositions(ctx());
    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({
      externalPositionId: "2344",
      symbol: "EURUSD",
      side: "BUY",
      volume: "100",
      entryPrice: "1.11338",
      profit: "-0.0540",
      currentPrice: null,
      stopLoss: null,
      takeProfit: null,
      openedAt: "2026-01-07T09:12:04.057Z",
    });
    expect(positions[1]).toMatchObject({
      externalPositionId: "2350",
      symbol: "XAUUSD",
      side: "SELL",
      volume: "3",
      openedAt: "2026-01-08T14:00:00.000Z",
    });
  });

  it("requests the OPEN state explicitly", async () => {
    const fetchMock = stubFetch(() => ({ body: { trades: [], lastTransactionID: "1" } }));
    const adapter = new OandaRestProviderAdapter();
    await adapter.fetchPositions(ctx());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/trades?state=OPEN");
  });
});

// ── Orders (pending) ─────────────────────────────────────────────────────────

describe("OandaRestProviderAdapter — fetchOrders (pending)", () => {
  it("composes the broker verb from direction+type (never collapsed) and carries on-fill SL/TP", async () => {
    stubFetch(() => ({
      body: {
        orders: [
          {
            id: "2347",
            createTime: "2026-01-09T10:15:00.057358072Z",
            type: "LIMIT",
            instrument: "EUR_USD",
            units: "-200",
            timeInForce: "GTC",
            price: "1.10000",
            triggerCondition: "BID",
            stopLossOnFill: { timeInForce: "GTC", price: "1.12000", type: "STOP_LOSS" },
            takeProfitOnFill: { price: "1.05000", type: "TAKE_PROFIT" },
            state: "PENDING",
          },
        ],
        lastTransactionID: "2347",
      },
    }));
    const adapter = new OandaRestProviderAdapter();
    const orders = await adapter.fetchOrders(ctx());
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      externalOrderId: "2347",
      symbol: "EURUSD",
      type: "SELL_LIMIT",
      volume: "200",
      price: "1.10000",
      stopLoss: "1.12000",
      takeProfit: "1.05000",
      status: "PENDING",
      createdAt: "2026-01-09T10:15:00.057Z",
      updatedAt: null,
    });
  });

  it("excludes price-less guaranteed-stop orders instead of inventing a price (documented limitation)", async () => {
    stubFetch(() => ({
      body: {
        orders: [
          {
            id: "2400",
            createTime: "2026-01-09T10:15:00.057358072Z",
            type: "STOP",
            instrument: "EUR_USD",
            units: "100",
            timeInForce: "GTC",
            distance: "0.0050",
            guaranteedExecutionPremium: "0.50",
            state: "PENDING",
          },
          {
            id: "2401",
            createTime: "2026-01-09T10:16:00.057358072Z",
            type: "LIMIT",
            instrument: "EUR_USD",
            units: "100",
            price: "1.09500",
            state: "PENDING",
          },
        ],
        lastTransactionID: "2401",
      },
    }));
    const adapter = new OandaRestProviderAdapter();
    const orders = await adapter.fetchOrders(ctx());
    expect(orders).toHaveLength(1);
    expect(orders[0]?.externalOrderId).toBe("2401");
    if (isCapabilitiesV2(adapter.descriptor.capabilities)) {
      expect(adapter.descriptor.capabilities.orders.limitation).toContain("Guaranteed-stop");
    }
  });
});

// ── Deals (transactions) ─────────────────────────────────────────────────────

describe("OandaRestProviderAdapter — fetchDeals (transactions)", () => {
  it("maps ORDER_FILL with the provider-side trade link and TRANSFER_FUNDS as balance op; excludes bookkeeping", async () => {
    stubFetch(() => ({
      body: {
        transactions: [
          {
            type: "ORDER_FILL",
            id: "2346",
            time: "2026-01-07T09:12:05.057358072Z",
            userID: 1234,
            accountID: ACCOUNT_ID,
            batchID: "2345",
            orderID: "2345",
            instrument: "EUR_USD",
            units: "100",
            requestedUnits: "100",
            price: "1.11338",
            pl: "0.0000",
            financing: "-0.0070",
            commission: "0.0434",
            accountBalance: "10482.5512",
            tradeOpened: { tradeID: "2344", units: "100", price: "1.11338" },
            halfSpreadCost: "0.0217",
            reason: "MARKET_ORDER",
          },
          {
            type: "ORDER_FILL",
            id: "2355",
            time: "2026-01-08T09:00:00.000000000Z",
            accountID: ACCOUNT_ID,
            instrument: "EUR_USD",
            units: "-100",
            price: "1.12000",
            pl: "6.6200",
            commission: "0.0434",
            financing: "0.0000",
            tradeClosed: [{ tradeID: "2344", units: "-100", realizedPL: "6.6200", price: "1.12000" }],
            reason: "TAKE_PROFIT_ORDER",
          },
          {
            type: "TRANSFER_FUNDS",
            id: "2340",
            time: "2026-01-01T00:00:00.000000000Z",
            accountID: ACCOUNT_ID,
            amount: "10000.0000",
            fundingReason: "ACCOUNT_TRANSFER",
            accountBalance: "10000.0000",
          },
          {
            type: "MARGIN_CALL_ENTRY",
            id: "2360",
            time: "2026-01-09T00:00:00.000000000Z",
            accountID: ACCOUNT_ID,
          },
        ],
        lastTransactionID: "2360",
      },
    }));
    const adapter = new OandaRestProviderAdapter();
    const deals = await adapter.fetchDeals(ctx());
    expect(deals).toHaveLength(3); // margin-call bookkeeping excluded
    expect(deals[0]).toMatchObject({
      externalDealId: "2346",
      symbol: "EURUSD",
      side: "BUY",
      volume: "100",
      price: "1.11338",
      profit: "0.0000",
      commission: "0.0434",
      swap: "-0.0070",
      positionId: "2344",
      executedAt: "2026-01-07T09:12:05.057Z",
    });
    expect(deals[1]).toMatchObject({
      externalDealId: "2355",
      side: "SELL",
      positionId: "2344", // closed-trade link wins over opened
      executedAt: "2026-01-08T09:00:00.000Z",
    });
    expect(deals[2]).toMatchObject({
      externalDealId: "2340",
      symbol: null, // balance operation
      side: "BUY",
      volume: "0.00",
      profit: "10000.0000",
      positionId: null,
    });
  });

  it("bounds the full-refresh window to the v20 page maximum (pageSize=1000)", async () => {
    const fetchMock = stubFetch(() => ({ body: { transactions: [], lastTransactionID: "1" } }));
    const adapter = new OandaRestProviderAdapter();
    await adapter.fetchDeals(ctx());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/transactions?pageSize=1000");
  });
});

// ── Error translation (doc B §4.3 normative table) ───────────────────────────

describe("OandaRestProviderAdapter — error translation", () => {
  const cases: Array<{
    name: string;
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
    code: string;
  }> = [
    { name: "401 → INVALID_CREDENTIALS", status: 401, code: "INVALID_CREDENTIALS" },
    { name: "403 → UNAUTHORIZED_PROVIDER_ACCESS", status: 403, code: "UNAUTHORIZED_PROVIDER_ACCESS" },
    { name: "404 → UNSUPPORTED_ACCOUNT", status: 404, code: "UNSUPPORTED_ACCOUNT" },
    { name: "500 → PROVIDER_UNAVAILABLE", status: 500, code: "PROVIDER_UNAVAILABLE" },
    { name: "503 → PROVIDER_UNAVAILABLE", status: 503, code: "PROVIDER_UNAVAILABLE" },
  ];
  for (const testCase of cases) {
    it(testCase.name, async () => {
      stubFetch(() => ({ status: testCase.status, body: { errorCode: "X", errorMessage: "secret internal" } }));
      const adapter = new OandaRestProviderAdapter();
      await expect(adapter.fetchSnapshot(ctx())).rejects.toMatchObject({ code: testCase.code });
    });
  }

  it("429 → RATE_LIMITED carrying the provider-advertised Retry-After", async () => {
    stubFetch(() => ({ status: 429, headers: { "retry-after": "17" }, body: {} }));
    const adapter = new OandaRestProviderAdapter();
    const error = await adapter.fetchSnapshot(ctx()).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("RATE_LIMITED");
    expect((error as ProviderError).retryAfterSeconds).toBe(17);
  });

  it("provider error text NEVER reaches the thrown message (sanitization §9.5)", async () => {
    stubFetch(() => ({ status: 401, body: { errorCode: "INVALID_AUTH", errorMessage: "token abc-123 for user secret@x" } }));
    const adapter = new OandaRestProviderAdapter();
    const error = await adapter.fetchSnapshot(ctx()).catch((e) => e);
    expect((error as Error).message).not.toContain("abc-123");
    expect((error as Error).message).not.toContain("secret@x");
  });

  it("non-JSON body → INVALID_PROVIDER_RESPONSE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>boom</html>", { status: 200 })));
    const adapter = new OandaRestProviderAdapter();
    await expect(adapter.fetchSnapshot(ctx())).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });
  });

  it("shape-broken JSON body → INVALID_PROVIDER_RESPONSE (never a guess)", async () => {
    stubFetch(() => ({ body: { account: { id: ACCOUNT_ID, currency: 12 } } }));
    const adapter = new OandaRestProviderAdapter();
    await expect(adapter.fetchSnapshot(ctx())).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });
  });

  it("network failure → PROVIDER_UNAVAILABLE (timeouts remain the orchestrator's)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const adapter = new OandaRestProviderAdapter();
    await expect(adapter.fetchSnapshot(ctx())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("testConnection probes the token-scoped account list", async () => {
    const fetchMock = stubFetch(() => ({ body: { accounts: [{ id: ACCOUNT_ID }] } }));
    const adapter = new OandaRestProviderAdapter();
    await expect(adapter.testConnection(ctx().credentials)).resolves.toBeUndefined();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v3/accounts");
    await expect(
      adapter.testConnection({ method: "API_KEY", secret: "bad" }),
    ).resolves.toBeUndefined(); // stub returns 200 regardless — 401 mapping covered above
  });
});

// ── Adapter-level capability enforcement ─────────────────────────────────────

describe("OandaRestProviderAdapter — capability enforcement", () => {
  it("every port method is gated by its declared capability (SUPPORTED required)", async () => {
    // Swap the descriptor to a capability-poor declaration and ensure the
    // adapter refuses to run the operation instead of silently returning [].
    const adapter = new OandaRestProviderAdapter();
    const poor = Object.create(Object.getPrototypeOf(adapter)) as OandaRestProviderAdapter;
    Object.defineProperty(poor, "descriptor", {
      value: {
        ...adapter.descriptor,
        capabilities: {
          ...adapter.descriptor.capabilities,
          balanceEquity: { support: "UNSUPPORTED" },
        },
      },
    });
    stubFetch(() => ({ body: { account: summaryAccount() } }));
    await expect(poor.fetchSnapshot(ctx())).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
  });
});

// ── Pure mapping helpers ─────────────────────────────────────────────────────

describe("oanda-mapping — pure helpers", () => {
  it("maps only IDENTICAL instruments; everything else passes through verbatim", () => {
    expect(mapOandaSymbol("EUR_USD")).toBe("EURUSD");
    expect(mapOandaSymbol("GBP_USD")).toBe("GBPUSD");
    expect(mapOandaSymbol("USD_JPY")).toBe("USDJPY");
    expect(mapOandaSymbol("XAU_USD")).toBe("XAUUSD");
    // BTC_USD ≠ BTCUSDT (different quote asset — a wrong-symbol join)
    expect(mapOandaSymbol("BTC_USD")).toBe("BTC_USD");
    expect(mapOandaSymbol("EUR_GBP")).toBe("EUR_GBP");
    expect(mapOandaSymbol("NAS_100")).toBe("NAS_100");
  });

  it("leverage derivation is deterministic and rejects absurd rates", () => {
    expect(leverageFromMarginRate("0.02")).toBe("50");
    expect(leverageFromMarginRate("0.05")).toBe("20");
    expect(leverageFromMarginRate("0")).toBeNull();
    expect(leverageFromMarginRate("-1")).toBeNull();
  });

  it("ordersFromPending reports the excluded count for price-less orders", () => {
    const result = ordersFromPending([
      {
        id: "1",
        instrument: "EUR_USD",
        type: "STOP",
        units: "100",
        createTime: "2026-01-09T10:15:00.000Z",
      },
    ]);
    expect(result.orders).toHaveLength(0);
    expect(result.excludedCount).toBe(1);
  });

  it("positionsFromTrades rejects zero-unit trades as provider contract violations", () => {
    expect(() =>
      positionsFromTrades([
        {
          id: "1",
          instrument: "EUR_USD",
          price: "1.1",
          openTime: "2026-01-07T09:12:04.057Z",
          state: "OPEN",
          currentUnits: "0",
        },
      ]),
    ).toThrow(ProviderError);
  });

  it("dealsFromTransactions requires instrument+units on fills", () => {
    expect(() =>
      dealsFromTransactions([{ type: "ORDER_FILL", id: "1", time: "2026-01-07T09:12:05.057Z" }]),
    ).toThrow(ProviderError);
  });
});

// ── Error mapping (normalizeProviderError — Phase 03 additions) ──────────────

describe("normalizeProviderError — UNSUPPORTED_CAPABILITY + Retry-After", () => {
  it("UNSUPPORTED_CAPABILITY maps to a 422-class BusinessRuleError with the stable code", () => {
    const appError = normalizeProviderError(
      new ProviderError("UNSUPPORTED_CAPABILITY", "This provider does not declare support for the requested operation."),
    );
    expect(appError).toBeInstanceOf(BusinessRuleError);
    expect((appError as BusinessRuleError).code).toBe(TRADING_ERROR_CODES.UNSUPPORTED_CAPABILITY);
  });

  it("RATE_LIMITED carries the provider-advertised retry delay through to the wire error", () => {
    const appError = normalizeProviderError(
      new ProviderError("RATE_LIMITED", "The trading provider asked us to slow down.", { retryAfterSeconds: 23 }),
    );
    expect(appError).toBeInstanceOf(RateLimitError);
    expect((appError as RateLimitError).retryAfterSeconds).toBe(23);
  });

  it("RATE_LIMITED without an advertised delay keeps the conservative default", () => {
    const appError = normalizeProviderError(
      new ProviderError("RATE_LIMITED", "The trading provider asked us to slow down."),
    );
    expect((appError as RateLimitError).retryAfterSeconds).toBe(60);
  });
});

// ── Transport cancellation backstop (Phase 04 — spec §6.1) ───────────────────

describe("OandaRestProviderAdapter — transport cancellation backstop", () => {
  /**
   * A fetch that NEVER settles on its own but honors the abort signal —
   * the shape of a hung socket. The adapter must pass an abort signal when
   * constructed with requestTimeoutMs, the abort must actually fire, and the
   * surfaced error must be the honest CONNECTION_TIMEOUT class.
   */
  function stubHangingFetch() {
    const observed: Array<{ aborted: () => boolean }> = [];
    const fetchMock = vi.fn(
      (_url: string | URL, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal as AbortSignal | undefined;
          observed.push({ aborted: () => signal?.aborted ?? false });
          if (!signal) {
            return; // never settles — the pre-Phase-04 leak shape
          }
          signal.addEventListener("abort", () => {
            // AbortSignal.timeout aborts with a TimeoutError DOMException.
            reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, observed };
  }

  it("aborts a hung request at the configured backstop and surfaces CONNECTION_TIMEOUT", async () => {
    vi.useFakeTimers();
    try {
      const { observed } = stubHangingFetch();
      const adapter = new OandaRestProviderAdapter({ requestTimeoutMs: 5_000 });
      const pending = adapter.fetchSnapshot(ctx());
      const assertion = expect(pending).rejects.toMatchObject({ code: "CONNECTION_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(5_001);
      await assertion;
      expect(observed[0]?.aborted()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("without requestTimeoutMs no signal is passed (orchestrator watchdog semantics unchanged)", async () => {
    const { fetchMock } = stubHangingFetch();
    const adapter = new OandaRestProviderAdapter();
    const pending = adapter.fetchSnapshot(ctx());
    pending.catch(() => undefined); // a hung transport must never become an unhandled rejection
    // No signal reaches the transport — the adapter does not time it itself.
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();
    // The orchestrator watchdog remains the bounding mechanism (§16):
    await expect(withProviderTimeout(pending, 20)).rejects.toMatchObject({
      code: "CONNECTION_TIMEOUT",
    });
  });
});

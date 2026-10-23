/**
 * Trading-accounts mock engine (Phase 02) — MSW parity with the Nest
 * trading-accounts surface (apps/api/src/modules/accounts).
 *
 * This is a MOCK, visibly and honestly: every account it creates carries its
 * registry provider stamp, so the UI can never present simulated data as a
 * real broker connection (Phase 02 spec §4.2/§15.3 — no fake connectivity, no
 * fake success). Registry mirrors: MOCK (isMock), deriv-ws, and the Phase 08
 * MT5 terminal bridge (mt5-bridge) — bridge connections start CONNECTING and
 * no handler ever fakes the first terminal push that would flip CONNECTED.
 *
 * Semantics mirrored from the backend, deliberately:
 *  - connect is atomic (test → metadata → persist → initial sync); failed
 *    connects persist nothing.
 *  - provider outage does NOT move a connection out of CONNECTED; only
 *    auth-class sync failures (INVALID_CREDENTIALS) write connection ERROR.
 *  - disconnect wipes the (simulated) credentials and keeps all history.
 *  - syncs are idempotent: data is a pure function of the external account
 *    id (FNV-1a, same shapes as MockTradingProviderAdapter), so repeated
 *    runs upsert the same external ids.
 *  - controlled failure secrets, mirroring the adapter:
 *      fail-invalid → INVALID_CREDENTIALS · fail-unavailable → PROVIDER_UNAVAILABLE
 *      fail-timeout → CONNECTION_TIMEOUT   · fail-malformed → INVALID_PROVIDER_RESPONSE
 *
 * NOT mirrored (server infrastructure, documented gaps):
 *  - per-user rate limits (connect 5 / reconnect 5 / sync 20 per 15 min) —
 *    enforced by the API's in-memory limiter, not reproducible meaningfully
 *    in a browser worker;
 *  - the SecurityEvent audit ledger (server-side concern);
 *  - request-id correlation.
 *
 * Errors use the exact live envelope ({ error, message, code? }) so the UI
 * branches on `apiErrorCode()` identically over MSW and the live bridge.
 */
import type {
  BridgePairing,
  BrokerCatalogEntry,
  BrokerCatalogResponse,
  BrokerIdentification,
  BrokerIdentifyInput,
  BrokerOrder,
  BrokerPosition,
  TradingAccountConnectInput,
  TradingAccountDetails,
  TradingAccountSnapshotView,
  TradingConnectionTestResponse,
  TradingConnectionView,
  TradingDeal,
  TradingProviderDescriptor,
  TradingReconnectInput,
  TradingSyncRunView,
} from "@cosmoz/shared";

import { isCapabilitiesV2 } from "@cosmoz/shared";

import { MockError } from "@/mocks/store";

// ── Provider registry (mirrors the mock adapter descriptor verbatim) ────────

const ALL_READ_PERMISSIONS = [
  "READ_ACCOUNT",
  "READ_BALANCE",
  "READ_EQUITY",
  "READ_POSITIONS",
  "READ_ORDERS",
  "READ_DEALS",
  "READ_HISTORY",
] as const;

const MOCK_DESCRIPTOR: TradingProviderDescriptor = {
  providerId: "MOCK",
  providerName: "Euforia Mock Broker",
  platform: "MT5",
  supportedEnvironments: ["DEMO", "LIVE"],
  supportedConnectionMethods: ["API_KEY"],
  supportedPermissions: [...ALL_READ_PERMISSIONS],
  capabilities: { account: true, snapshot: true, positions: true, orders: true, deals: true, history: true },
  isMock: true,
};

/**
 * Phase 07 mirror — the Deriv descriptor (V2 capabilities, verbatim from the
 * backend adapter). The MSW engine simulates a deployment where deriv-ws is
 * ENABLED; the "orders" capability stays honestly UNSUPPORTED and its sync
 * segment is skipped as a capability fact, exactly like the real pipeline.
 */
const DERIV_DESCRIPTOR: TradingProviderDescriptor = {
  providerId: "deriv-ws",
  providerName: "Deriv WebSocket API",
  platform: "DERIV",
  supportedEnvironments: ["DEMO", "LIVE"],
  supportedConnectionMethods: ["API_KEY"],
  supportedPermissions: ["READ_ACCOUNT", "READ_BALANCE", "READ_POSITIONS", "READ_DEALS", "READ_HISTORY"],
  capabilities: {
    accountDiscovery: { support: "UNKNOWN" },
    accountMetadata: { support: "SUPPORTED", retrieval: "POLL" },
    balanceEquity: { support: "SUPPORTED", retrieval: "POLL" },
    marginInfo: { support: "UNSUPPORTED" },
    openPositions: { support: "SUPPORTED", retrieval: "POLL" },
    orders: { support: "UNSUPPORTED" },
    deals: { support: "SUPPORTED", retrieval: "POLL" },
    historyDepth: { support: "UNKNOWN" },
    streamingAccountUpdates: { support: "UNSUPPORTED" },
    streamingPositions: { support: "UNSUPPORTED" },
    streamingOrderDealUpdates: { support: "UNSUPPORTED" },
    connectionValidation: { support: "SUPPORTED", retrieval: "ON_CONNECT" },
    credentialRevocation: { support: "SUPPORTED", retrieval: "POLL" },
  },
  isMock: false,
};

/**
 * Phase 08 mirror — the MT5 terminal bridge descriptor (verbatim from the
 * backend adapter). PLATFORM_BRIDGE = an Expert Advisor inside the user's
 * MT5 terminal pushes signed events to the ingest endpoint; the connection
 * starts CONNECTING and flips CONNECTED only with the first terminal push
 * (never simulated here — a browser mock cannot host an MT5 terminal, so
 * bridge accounts honestly stay CONNECTING with no data).
 */
const MT5_BRIDGE_DESCRIPTOR: TradingProviderDescriptor = {
  providerId: "mt5-bridge",
  providerName: "MT5 Terminal Bridge",
  platform: "MT5",
  supportedEnvironments: ["DEMO", "LIVE", "PROP_FIRM"],
  supportedConnectionMethods: ["PLATFORM_BRIDGE"],
  supportedPermissions: [...ALL_READ_PERMISSIONS],
  capabilities: {
    accountDiscovery: { support: "UNSUPPORTED" },
    accountMetadata: { support: "SUPPORTED", retrieval: "POLL" },
    balanceEquity: { support: "SUPPORTED", retrieval: "POLL" },
    marginInfo: { support: "SUPPORTED", retrieval: "POLL" },
    openPositions: { support: "SUPPORTED", retrieval: "POLL" },
    orders: { support: "SUPPORTED", retrieval: "POLL" },
    deals: { support: "SUPPORTED", retrieval: "POLL" },
    historyDepth: { support: "SUPPORTED", retrieval: "POLL" },
    streamingAccountUpdates: { support: "UNSUPPORTED" },
    streamingPositions: { support: "UNSUPPORTED" },
    streamingOrderDealUpdates: { support: "UNSUPPORTED" },
    connectionValidation: { support: "SUPPORTED", retrieval: "ON_CONNECT" },
    credentialRevocation: { support: "SUPPORTED", retrieval: "POLL" },
  },
  isMock: false,
};

const PROVIDER_DESCRIPTORS: Record<string, TradingProviderDescriptor> = {
  [MOCK_DESCRIPTOR.providerId]: MOCK_DESCRIPTOR,
  [DERIV_DESCRIPTOR.providerId]: DERIV_DESCRIPTOR,
  [MT5_BRIDGE_DESCRIPTOR.providerId]: MT5_BRIDGE_DESCRIPTOR,
};

// ── Error helpers (live envelope shape) ─────────────────────────────────────

function coded(status: number, code: string, message: string): MockError {
  const error = new MockError(status, message);
  (error as MockError & { code?: string }).code = code;
  return error;
}

function notOwned(): MockError {
  // Ownership-safe: a foreign id is indistinguishable from a missing one.
  return coded(404, "NOT_FOUND", "Account not found.");
}

// ── Phase 07 — universal broker layer mirror ─────────────────────────────────

/** Catalog mirror — same 17 entries as the backend broker-catalog.ts. */
const BROKER_CATALOG_MIRROR: Array<Omit<BrokerCatalogEntry, "connectorStatus"> & { connectorProviderId: string | null }> = [
  { brokerId: "deriv", displayName: "Deriv", platforms: ["DERIV"], providerId: "deriv-ws", connectorProviderId: "deriv-ws", aliases: ["Binary.com", "binary.com"], notes: "Connected through the official Deriv WebSocket API with a Read-scope API token." },
  { brokerId: "oanda", displayName: "OANDA", platforms: ["OANDA"], providerId: "oanda-v20", connectorProviderId: "oanda-v20", aliases: ["OANDA Corporation", "fxTrade"], notes: "Connected through the official OANDA v20 REST API with a personal access token." },
  { brokerId: "icmarkets", displayName: "IC Markets", platforms: ["MT4", "MT5", "CTRADER"], providerId: null, connectorProviderId: null, aliases: ["IC Markets Global", "ICMarkets", "Raw Trading Ltd"], notes: "Access paths are MT4/MT5/cTrader platform integrations - no dedicated retail REST API; gated on the MT5 decision (U1) and the cTrader decision." },
  { brokerId: "pepperstone", displayName: "Pepperstone", platforms: ["MT4", "MT5", "CTRADER"], providerId: null, connectorProviderId: null, aliases: ["Pepperstone Group"], notes: "Access paths are MT4/MT5/cTrader platform integrations - gated on the MT5 decision (U1) and the cTrader decision." },
  { brokerId: "exness", displayName: "Exness", platforms: ["MT4", "MT5"], providerId: null, connectorProviderId: null, aliases: ["Exness Group"], notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1)." },
  { brokerId: "xm", displayName: "XM", platforms: ["MT4", "MT5"], providerId: null, connectorProviderId: null, aliases: ["XM Global", "Trading Point"], notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1)." },
  { brokerId: "fxtm", displayName: "FXTM (ForexTime)", platforms: ["MT4", "MT5"], providerId: null, connectorProviderId: null, aliases: ["ForexTime"], notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1)." },
  { brokerId: "fpmarkets", displayName: "FP Markets", platforms: ["MT4", "MT5", "CTRADER"], providerId: null, connectorProviderId: null, aliases: ["First Prudential Markets"], notes: "Access paths are MT4/MT5/cTrader platform integrations." },
  { brokerId: "avatrade", displayName: "AvaTrade", platforms: ["MT4", "MT5"], providerId: null, connectorProviderId: null, aliases: ["Ava Trade"], notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1)." },
  { brokerId: "vantage", displayName: "Vantage", platforms: ["MT4", "MT5"], providerId: null, connectorProviderId: null, aliases: ["Vantage FX", "Vantage International"], notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1)." },
  { brokerId: "eightcap", displayName: "Eightcap", platforms: ["MT4", "MT5"], providerId: null, connectorProviderId: null, aliases: ["Eightcap Global"], notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1)." },
  { brokerId: "interactivebrokers", displayName: "Interactive Brokers", platforms: ["OTHER"], providerId: null, connectorProviderId: null, aliases: ["IBKR", "Interactive Brokers LLC"], notes: "Official Client Portal Web API exists but requires individual account configuration and approval steps - not part of the current connector roadmap." },
  { brokerId: "binance", displayName: "Binance", platforms: ["BINANCE"], providerId: null, connectorProviderId: null, aliases: ["Binance.com"], notes: "Public exchange REST API exists; an exchange connector is a separate product decision outside the Accounts roadmap scope." },
  { brokerId: "metatrader-platform", displayName: "MetaTrader (MT4/MT5)", platforms: ["MT4", "MT5"], providerId: null, connectorProviderId: null, aliases: ["MetaQuotes", "MT4", "MT5"], notes: "The MetaQuotes terminal/gateway integration is gated on decision U1 (self-hosted bridge vs cloud gateway vs documented defer) - broker entries above list per-broker access." },
  { brokerId: "ctrader-platform", displayName: "cTrader", platforms: ["CTRADER"], providerId: null, connectorProviderId: null, aliases: ["Spotware", "cTrader Open API"], notes: "cTrader Open API (OAuth 2.0 + protobuf over WebSocket) - implementation stopped pending explicit owner approval." },
  { brokerId: "tradingview", displayName: "TradingView", platforms: ["OTHER"], providerId: null, connectorProviderId: null, aliases: ["TradingView Inc."], notes: "No account-data interface exists - chart embedding is not brokerage-account access (documented verdict, doc D)." },
  { brokerId: "plus500", displayName: "Plus500", platforms: ["OTHER"], providerId: null, connectorProviderId: null, aliases: ["Plus500 Ltd"], notes: "Proprietary platform without a public retail account-data API." },
  { brokerId: "etoro", displayName: "eToro", platforms: ["OTHER"], providerId: null, connectorProviderId: null, aliases: ["eToro Group"], notes: "Proprietary platform without a public retail account-data API." },
];

const BROKER_CATALOG_MIRROR_VERSION = "2026-10.1";

/**
 * Connect-time identification mirror — same ladder as the backend service:
 * provider-reported identity (Deriv landing company) wins, then documented
 * id patterns, then registry platform knowledge.
 */
function identifyAtConnectMirror(providerId: string, externalAccountId: string): BrokerIdentification {
  const now = isoNow();
  if (providerId === "deriv-ws") {
    return {
      brokerId: "deriv",
      displayName: "Deriv (SVG) Corp",
      platform: "DERIV",
      confidence: "PROVIDER_REPORTED",
      connectorStatus: "CONNECTOR_AVAILABLE",
      providerId,
      signals: [
        "provider-reported broker identity: Deriv (SVG) Corp",
        "provider-reported account class: from the virtual/real loginid",
      ],
      identifiedAt: now,
    };
  }
  // Rules mirror: OANDA / Deriv id shapes, then registry platform knowledge.
  if (/^\d{1,4}-\d{1,3}-\d{6,8}(-\d{2,3})?$/.test(externalAccountId)) {
    return {
      brokerId: "oanda",
      displayName: "OANDA",
      platform: "OANDA",
      confidence: "PATTERN_MATCH",
      connectorStatus: "CONNECTOR_NOT_IMPLEMENTED",
      providerId: "oanda-v20",
      signals: ["account id matches the OANDA v20 format (hyphen-separated segments)"],
      identifiedAt: now,
    };
  }
  if (/^(CR|MRT|MVT|VRTC)\d{4,}$/.test(externalAccountId)) {
    return {
      brokerId: "deriv",
      displayName: "Deriv",
      platform: "DERIV",
      confidence: "PATTERN_MATCH",
      connectorStatus: "CONNECTOR_AVAILABLE",
      providerId: "deriv-ws",
      signals: ["loginid matches the Deriv account format (CR/VRTC/MRT/MVT prefix)"],
      identifiedAt: now,
    };
  }
  const descriptor = PROVIDER_DESCRIPTORS[providerId];
  if (descriptor) {
    const platformEntry =
      descriptor.platform === "MT5"
        ? BROKER_CATALOG_MIRROR.find((entry) => entry.brokerId === "metatrader-platform")
        : undefined;
    return {
      brokerId: platformEntry?.brokerId ?? "unknown",
      displayName: platformEntry?.displayName ?? "Unknown broker",
      platform: descriptor.platform,
      confidence: "PLATFORM_KNOWN",
      connectorStatus: "CONNECTOR_AVAILABLE",
      providerId,
      signals: [`provider "${descriptor.providerId}" is registered (platform ${descriptor.platform})`],
      identifiedAt: now,
    };
  }
  return {
    brokerId: "unknown",
    displayName: "Unknown broker",
    platform: "OTHER",
    confidence: "UNKNOWN",
    connectorStatus: "CONNECTOR_NOT_IMPLEMENTED",
    providerId: null,
    signals: ["external account id matched no documented catalog pattern"],
    identifiedAt: now,
  };
}

function brokerCatalogMirror(): BrokerCatalogResponse {
  // The engine simulates a deployment where deriv-ws is registered; the
  // oanda adapter stays env-gated OFF (matching the deriv fixture e2e).
  return {
    catalogVersion: BROKER_CATALOG_MIRROR_VERSION,
    brokers: BROKER_CATALOG_MIRROR.map((entry) => ({
      brokerId: entry.brokerId,
      displayName: entry.displayName,
      platforms: [...entry.platforms],
      connectorStatus:
        entry.connectorProviderId && PROVIDER_DESCRIPTORS[entry.connectorProviderId]
          ? "CONNECTOR_AVAILABLE"
          : "CONNECTOR_NOT_IMPLEMENTED",
      providerId: entry.providerId,
      aliases: [...entry.aliases],
      notes: entry.notes,
    })),
  };
}

function identifyBrokerMirror(hints: BrokerIdentifyInput): BrokerIdentification {
  if (hints.endpoint) {
    if (/^api-fx(practice|trade)\.oanda\.com$/.test(hints.endpoint)) {
      return {
        brokerId: "oanda", displayName: "OANDA", platform: "OANDA", confidence: "PATTERN_MATCH",
        connectorStatus: "CONNECTOR_NOT_IMPLEMENTED", providerId: "oanda-v20",
        signals: ["endpoint host is a documented OANDA v20 REST host"], identifiedAt: isoNow(),
      };
    }
    if (/^(ws|api)\.(derivws|binaryws)\.com$/.test(hints.endpoint) || /^app\.deriv\.com$/.test(hints.endpoint)) {
      return {
        brokerId: "deriv", displayName: "Deriv", platform: "DERIV", confidence: "PATTERN_MATCH",
        connectorStatus: "CONNECTOR_AVAILABLE", providerId: "deriv-ws",
        signals: ["endpoint host is a documented Deriv API gateway"], identifiedAt: isoNow(),
      };
    }
  }
  if (hints.externalAccountId) {
    return identifyAtConnectMirror(hints.providerId ?? "", hints.externalAccountId);
  }
  if (hints.providerId && PROVIDER_DESCRIPTORS[hints.providerId]) {
    const descriptor = PROVIDER_DESCRIPTORS[hints.providerId];
    return {
      brokerId: descriptor.platform === "MT5" ? "metatrader-platform" : descriptor.platform === "DERIV" ? "deriv" : "unknown",
      displayName: descriptor.platform === "MT5" ? "MetaTrader (MT4/MT5)" : descriptor.platform === "DERIV" ? "Deriv" : "Unknown broker",
      platform: descriptor.platform,
      confidence: "PLATFORM_KNOWN",
      connectorStatus: "CONNECTOR_AVAILABLE",
      providerId: descriptor.providerId,
      signals: [`provider "${descriptor.providerId}" is registered (platform ${descriptor.platform})`],
      identifiedAt: isoNow(),
    };
  }
  return {
    brokerId: "unknown", displayName: "Unknown broker", platform: "OTHER", confidence: "UNKNOWN",
    connectorStatus: "CONNECTOR_NOT_IMPLEMENTED", providerId: null,
    signals: ["no hint matched the broker catalog"], identifiedAt: isoNow(),
  };
}

// ── Deterministic provider data (mirrors MockTradingProviderAdapter) ────────

/** FNV-1a 32-bit — same primitive the backend adapter uses. */
function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const SYMBOLS = ["EURUSD", "XAUUSD", "BTCUSDT", "BOOM500", "CRASH500"] as const;
const CURRENCIES = ["USD", "EUR", "GBP"] as const;
const BASE_DEAL_MS = Date.UTC(2026, 0, 5, 9, 30, 0);
const BASE_POSITION_MS = Date.UTC(2026, 0, 8, 14, 0, 0);
const BASE_ORDER_MS = Date.UTC(2026, 0, 9, 10, 15, 0);

const FAILURE_SCENARIOS = ["fail-invalid", "fail-timeout", "fail-unavailable", "fail-malformed"] as const;
type FailureScenario = (typeof FAILURE_SCENARIOS)[number];

function scenarioOf(secret: string): FailureScenario | null {
  return FAILURE_SCENARIOS.find((marker) => secret.startsWith(marker)) ?? null;
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** Masked hint — same rule as CredentialsEncryptionService.hint. */
function hintOf(secret: string): string {
  return secret.length <= 4 ? "••••" : `••••${secret.slice(-4)}`;
}

interface ProviderData {
  currency: string;
  snapshot: {
    balance: string;
    equity: string;
    unrealizedPnl: string;
    margin: string;
    freeMargin: string;
    marginLevel: string;
  };
  positions: BrokerPosition[];
  orders: BrokerOrder[];
  deals: TradingDeal[];
}

/**
 * The provider's answer for an external account - a pure function of the id,
 * byte-identical across calls (idempotent upserts, §18 of the backend spec).
 */
function providerData(externalAccountId: string): ProviderData {
  const h = hashSeed(externalAccountId);
  const currency = CURRENCIES[h % CURRENCIES.length] ?? "USD";
  const balance = money(10_000 + (h % 9_000) + (h % 100) / 100);
  const equity = money(10_000 + (h % 9_000) + ((h >> 7) % 40) / 10 - 2);

  const positions: BrokerPosition[] = [];
  const positionCount = h % 3;
  for (let i = 0; i < positionCount; i += 1) {
    const hi = (h + i * 0x9e3779b9) >>> 0;
    const entryBase = [1.05, 2_650.5, 96_400, 195.2, 44_300][hi % 5] ?? 1.05;
    const entry = entryBase + (hi % 200) / 10_000;
    const current = entry * (hi % 2 === 0 ? 1.0007 : 0.9993);
    positions.push({
      id: `${externalAccountId}-pos-${i + 1}`,
      symbol: SYMBOLS[hi % SYMBOLS.length] ?? "EURUSD",
      direction: hi % 2 === 0 ? "BUY" : "SELL",
      volume: (0.1 + 0.1 * (hi % 5)).toFixed(2),
      entryPrice: entry.toFixed(entry < 10 ? 5 : 2),
      currentPrice: current.toFixed(current < 10 ? 5 : 2),
      stopLoss: hi % 3 !== 0 ? (entry * 0.99).toFixed(entry < 10 ? 5 : 2) : null,
      takeProfit: (entry * 1.02).toFixed(entry < 10 ? 5 : 2),
      unrealizedPnl: money((hi % 600) / 2 - 150),
      openedAt: new Date(BASE_POSITION_MS + i * 3_600_000).toISOString(),
    });
  }

  const orders: BrokerOrder[] = [];
  if (h % 2 !== 0) {
    const entryBase = [1.08, 2_700, 97_500, 196.4, 45_100][h % 5] ?? 1.08;
    orders.push({
      id: `${externalAccountId}-ord-1`,
      symbol: SYMBOLS[(h >> 3) % SYMBOLS.length] ?? "EURUSD",
      type: h % 4 === 0 ? "SELL_STOP" : "BUY_LIMIT",
      volume: "0.20",
      price: entryBase.toFixed(entryBase < 10 ? 5 : 2),
      stopLoss: null,
      takeProfit: (entryBase * 1.03).toFixed(entryBase < 10 ? 5 : 2),
      createdAt: new Date(BASE_ORDER_MS).toISOString(),
    });
  }

  // Deals — coherent netting cycles + balance operations, compacted from the
  // adapter's generator (same invariants: exit volume mirrors entries, the
  // last exit carries the cycle profit, deposits have no symbol/position).
  const bases = [1.0865, 2385.0, 61240.0, 9820.0, 8340.0] as const;
  const cycleCount = 3 + (h % 3);
  const lastCycleOpen = h % 2 === 0;
  const deals: TradingDeal[] = [];
  let cursorMs = BASE_DEAL_MS;
  let dealSeq = 0;
  for (let cycle = 0; cycle < cycleCount; cycle += 1) {
    const hc = (h + cycle * 0x9e3779b9) >>> 0;
    if (cycle % 3 === 2) {
      cursorMs += 86_400_000;
      deals.push({
        id: uuid(),
        externalDealId: `${externalAccountId}-deal-${(dealSeq += 1)}`,
        symbol: null,
        side: "BUY",
        volume: "0.00",
        price: null,
        profit: money(1_000 + (hc % 500)),
        commission: null,
        swap: null,
        executedAt: new Date(cursorMs).toISOString(),
      });
      continue;
    }
    const base = bases[hc % bases.length] ?? 1.0865;
    const digits = base < 10 ? 5 : 2;
    const isOpenCycle = lastCycleOpen && cycle === cycleCount - 1;
    const direction: "BUY" | "SELL" = hc % 2 === 0 ? "BUY" : "SELL";
    const exitSide: "BUY" | "SELL" = direction === "BUY" ? "SELL" : "BUY";
    const entry = base + (hc % 200) / 10_000;
    const totalVolume = Number((0.2 + 0.1 * (hc % 4)).toFixed(2));
    const inCount = 1 + (hc % 2);
    const inLeg = (totalVolume / inCount).toFixed(2);
    const outCount = isOpenCycle ? 0 : 1 + ((hc >> 3) % 2);
    const outLeg = outCount === 0 ? "0.00" : (totalVolume / outCount).toFixed(2);
    const profitFinal = money((hc % 600) / 2 - 150);
    const push = (side: "BUY" | "SELL", volume: string, price: number, profit: string | null, minutes: number): void => {
      cursorMs += minutes * 60_000;
      deals.push({
        id: uuid(),
        externalDealId: `${externalAccountId}-deal-${dealSeq}`,
        symbol: SYMBOLS[hc % SYMBOLS.length] ?? "EURUSD",
        side,
        volume,
        price: price.toFixed(digits),
        profit,
        commission: money(-((hc % 30) / 10) - 1),
        swap: hc % 5 === 0 ? money((hc % 20) / -10) : null,
        executedAt: new Date(cursorMs).toISOString(),
      });
      dealSeq += 1;
    };
    for (let i = 0; i < inCount; i += 1) push(direction, inLeg, entry, "0.00", 17 + i * 41);
    const exitPrice = entry * (direction === "BUY" ? 1.0009 : 0.9991);
    for (let i = 0; i < outCount; i += 1) {
      push(exitSide, outLeg, exitPrice, i === outCount - 1 ? profitFinal : "0.00", 23 + i * 37);
    }
    cursorMs += 86_400_000;
  }

  return {
    currency,
    snapshot: {
      balance,
      equity,
      unrealizedPnl: money(Number(equity) - Number(balance)),
      margin: money((h % 500) + 25),
      freeMargin: money((h % 4_000) + 500),
      marginLevel: money((h % 3_000) + 150),
    },
    positions,
    orders,
    deals,
  };
}

// ── Store (module-singleton — one browser session) ──────────────────────────

interface ConnectionRecord {
  status: "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "ERROR";
  method: "API_KEY" | "PLATFORM_BRIDGE";
  /** The stored secret — mock-only simulation of the encrypted vault.
   * PLATFORM_BRIDGE connections keep this null: the bridge secret lives in
   * the pairing sheet below, generated server-side, never user-supplied. */
  secret: string | null;
  credentialsHint: string | null;
  /** Phase 08 — the terminal pairing sheet (bridge connections only). */
  pairing: BridgePairing | null;
  permissions: TradingConnectionView["permissions"];
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

type SyncRunRecord = TradingSyncRunView;

interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  type: "DEMO" | "LIVE" | "PROP_FIRM";
  broker: string;
  currency: string;
  startingBalance: string;
  isDefault: boolean;
  externalAccountId: string;
  providerId: string;
  /** Phase 07 — connect-time broker identification mirror. */
  brokerIdentification: BrokerIdentification | null;
  connection: ConnectionRecord | null;
  snapshot: TradingAccountSnapshotView | null;
  positions: BrokerPosition[];
  orders: BrokerOrder[];
  deals: TradingDeal[];
  runs: SyncRunRecord[];
  createdAt: string;
  updatedAt: string;
}

const accounts = new Map<string, AccountRecord>();

function uuid(): string {
  return crypto.randomUUID();
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Freshness TTL — the same 15-min derivation as the backend mapper. */
const FRESHNESS_TTL_MS = 15 * 60 * 1000;

/**
 * Phase 08 — mint a bridge pairing sheet. The demo secret carries the
 * "bks_demo_" prefix so it can never be mistaken for a production bridge
 * secret; each call passes a nonce so rotations produce a DIFFERENT one.
 * Shape mirrors the backend BridgePairing (ingestPath/headers/serialization
 * are the live contract strings, not inventions).
 */
let bridgeKeyCounter = 0;
function bridgePairingFor(externalAccountId: string, nonce: number = bridgeKeyCounter++): BridgePairing {
  const seed = hashSeed(`${externalAccountId}:${nonce}:${Date.now()}`);
  const hex = (value: number, length: number): string =>
    value.toString(16).padStart(length, "0").slice(-length);
  const secret = `bks_demo_${hex(seed, 8)}${hex(hashSeed(`s:${seed}:${nonce}`), 8)}${hex(hashSeed(`t:${seed}:${nonce}`), 8)}${hex(hashSeed(`u:${seed}:${nonce}`), 8)}`;
  return {
    bridgeKeyId: `bk_${hex(seed, 12)}`,
    secret,
    ingestPath: "/api/v1/trading-accounts/bridge/ingest",
    headers: {
      key: "X-Bridge-Key",
      timestamp: "X-Bridge-Timestamp",
      signature: "X-Bridge-Signature",
      eventId: "X-Bridge-Event-Id",
    },
    serialization: "${timestamp}.${JSON.stringify({eventId,kind,payload})}",
    pushIntervalSeconds: 30,
    ea: {
      fileName: "EuforiaBridge.mq5",
      downloadPath: "/bridge/EuforiaBridge.mq5",
      version: "1.0.0",
    },
  };
}

function deriveSynchronizationStatus(
  record: AccountRecord,
  nowMs: number,
): TradingAccountDetails["synchronization"]["status"] {
  const latestRun = record.runs[0] ?? null;
  const lastSyncMs = record.connection?.lastSyncAt ? Date.parse(record.connection.lastSyncAt) : null;
  if (latestRun?.status === "RUNNING") return "SYNCING";
  if (latestRun?.status === "FAILED" && !lastSyncMs) return "ERROR";
  if (!lastSyncMs) return "UNKNOWN";
  // Phase 03 parity: a PARTIAL run is never LIVE-fresh (doc B §8.2/§9).
  if (latestRun?.status === "PARTIAL") return "DELAYED";
  if (latestRun?.status === "FAILED" && nowMs - lastSyncMs <= FRESHNESS_TTL_MS) return "LIVE";
  return nowMs - lastSyncMs <= FRESHNESS_TTL_MS ? "LIVE" : "STALE";
}

/** Phase 05 — per-resource freshness from run segment timestamps (max). */
function resourceFreshnessOf(
  record: AccountRecord,
  key: "snapshotAt" | "positionsAt" | "ordersAt" | "dealsAt",
  nowMs: number,
): { at: string | null; state: "FRESH" | "STALE" | "NEVER" } {
  const latest = record.runs.find((run) => run[key])?.[key] ?? null;
  if (!latest) return { at: null, state: "NEVER" };
  return {
    at: latest,
    state: nowMs - Date.parse(latest) <= FRESHNESS_TTL_MS ? "FRESH" : "STALE",
  };
}

function detailsOf(record: AccountRecord, nowMs = Date.now()): TradingAccountDetails {
  const latestRun = record.runs[0] ?? null;
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    type: record.type,
    broker: record.broker as TradingAccountDetails["broker"],
    currency: record.currency as TradingAccountDetails["currency"],
    startingBalance: record.startingBalance,
    isDefault: record.isDefault,
    propConfig: null,
    externalAccountId: record.externalAccountId,
    provider: PROVIDER_DESCRIPTORS[record.providerId] ?? MOCK_DESCRIPTOR,
    brokerIdentification: record.brokerIdentification,
    connection: record.connection
      ? {
          status: record.connection.status,
          method: record.connection.method,
          permissions: [...record.connection.permissions],
          credentialsHint: record.connection.credentialsHint ?? "••••",
          lastConnectedAt: record.connection.lastConnectedAt,
          lastSyncAt: record.connection.lastSyncAt,
          lastError: record.connection.lastError,
        }
      : null,
    synchronization: {
      status: deriveSynchronizationStatus(record, nowMs),
      lastSyncAt: record.connection?.lastSyncAt ?? null,
      lastRun: latestRun,
      // Phase 05 — mirror of the backend's per-resource freshness rules.
      resources: {
        snapshot: resourceFreshnessOf(record, "snapshotAt", nowMs),
        positions: resourceFreshnessOf(record, "positionsAt", nowMs),
        orders: resourceFreshnessOf(record, "ordersAt", nowMs),
        deals: resourceFreshnessOf(record, "dealsAt", nowMs),
      },
    },
    snapshot: record.snapshot,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function owned(userId: string, accountId: string): AccountRecord {
  const record = accounts.get(accountId);
  if (!record || record.userId !== userId) throw notOwned();
  return record;
}

/** HTTP mapping for the stable codes (mirrors the backend error mapper). */
function statusForCode(code: string): number {
  switch (code) {
    case "INVALID_CREDENTIALS":
    case "UNSUPPORTED_PROVIDER":
    case "NOT_CONNECTED":
      return 422;
    case "SYNC_ALREADY_RUNNING":
    case "DUPLICATE_ACCOUNT":
    case "ALREADY_CONNECTED":
      return 409;
    default:
      return 502; // provider-side class (forward-compatibility rule)
  }
}

function codedByCode(code: string, message: string): MockError {
  return coded(statusForCode(code), code, message);
}

/** The provider's verdict for a secret — mirrors the adapter's guard. */
function guardSecret(secret: string): void {
  const scenario = scenarioOf(secret);
  if (scenario === null) return;
  switch (scenario) {
    case "fail-invalid":
      throw coded(422, "INVALID_CREDENTIALS", "The provider rejected these credentials.");
    case "fail-unavailable":
      throw coded(502, "PROVIDER_UNAVAILABLE", "The trading provider is currently unavailable.");
    case "fail-timeout":
      throw coded(502, "CONNECTION_TIMEOUT", "The trading provider did not respond in time.");
    case "fail-malformed":
      throw coded(502, "INVALID_PROVIDER_RESPONSE", "The provider returned an unreadable response.");
  }
}

/** Execute a sync run against the stored credentials (mutates the record). */
function runSynchronization(record: AccountRecord, trigger: "INITIAL" | "MANUAL"): SyncRunRecord {
  const startedAt = isoNow();
  const startedMs = Date.now();
  const run: SyncRunRecord = {
    id: uuid(),
    status: "RUNNING",
    trigger,
    startedAt,
    finishedAt: null,
    durationMs: null,
    positionsUpserted: 0,
    ordersUpserted: 0,
    dealsUpserted: 0,
    errorCode: null,
  };
  record.runs.unshift(run);
  try {
    if (!record.connection?.secret) {
      throw coded(422, "NOT_CONNECTED", "This account has no active connection.");
    }
    guardSecret(record.connection.secret);
    // fail-malformed never reaches here: guardSecret throws 502 first.
    const descriptor = PROVIDER_DESCRIPTORS[record.providerId] ?? MOCK_DESCRIPTOR;
    // Capability gate (Phase 07 mirror): a V2 UNSUPPORTED capability is a
    // capability FACT — the segment is skipped (ordersAt null), never a
    // failure, never an empty success.
    const derivCaps = descriptor.capabilities as { orders?: { support?: string } };
    const ordersUnsupported =
      isCapabilitiesV2(descriptor.capabilities) && derivCaps.orders?.support === "UNSUPPORTED";
    const data = providerData(record.externalAccountId);
    record.currency = data.currency;
    record.positions = data.positions;
    record.orders = ordersUnsupported ? [] : data.orders;
    record.deals = data.deals;
    record.snapshot = {
      ...data.snapshot,
      currency: data.currency as TradingAccountSnapshotView["currency"],
      syncedAt: isoNow(),
    };
    run.positionsUpserted = data.positions.length;
    run.ordersUpserted = ordersUnsupported ? 0 : data.orders.length;
    run.dealsUpserted = data.deals.length;
    run.snapshotAt = record.snapshot.syncedAt;
    run.positionsAt = isoNow();
    run.ordersAt = ordersUnsupported ? null : isoNow();
    run.dealsAt = isoNow();
    run.status = "COMPLETED";
    record.connection.lastSyncAt = isoNow();
    record.connection.lastError = null;
  } catch (error) {
    run.status = "FAILED";
    const code =
      error instanceof MockError && (error as MockError & { code?: string }).code
        ? (error as MockError & { code?: string }).code!
        : "SYNC_FAILED";
    run.errorCode = code;
    // Only auth-class failures move the connection out of CONNECTED (doc B
    // §3.1) — provider outages degrade the sync axis, nothing else.
    if (code === "INVALID_CREDENTIALS" || code === "UNAUTHORIZED_PROVIDER_ACCESS") {
      if (record.connection) {
        record.connection.status = "ERROR";
        record.connection.lastError =
          code === "INVALID_CREDENTIALS"
            ? "The provider rejected the stored credentials. Reconnect with fresh credentials."
            : "The provider denied access to this account.";
      }
    }
  } finally {
    run.finishedAt = isoNow();
    run.durationMs = Math.max(1, Date.now() - startedMs);
  }
  return run;
}

// ── Engine use cases (1:1 with TradingAccountService) ───────────────────────

export const tradingAccountsEngine = {
  reset(): void {
    accounts.clear();
  },

  listProviders(): { providers: TradingProviderDescriptor[] } {
    // Phase 07/08 mirror: the engine simulates a deployment with mock +
    // deriv-ws + mt5-bridge enabled (oanda stays env-gated OFF, exactly
    // like the fixture e2e).
    return { providers: [MOCK_DESCRIPTOR, DERIV_DESCRIPTOR, MT5_BRIDGE_DESCRIPTOR] };
  },

  /** Phase 07 — universal broker catalog mirror (honest connector status). */
  listBrokers(): BrokerCatalogResponse {
    return brokerCatalogMirror();
  },

  /** Phase 07 — rule-based identification mirror (no secrets involved). */
  identifyBroker(hints: BrokerIdentifyInput): { identification: BrokerIdentification } {
    return { identification: identifyBrokerMirror(hints) };
  },

  connect(userId: string, input: TradingAccountConnectInput): { account: TradingAccountDetails } {
    // registry.require — unknown provider ids never connect.
    const descriptor = PROVIDER_DESCRIPTORS[input.providerId];
    if (!descriptor) {
      throw coded(422, "UNSUPPORTED_PROVIDER", "This trading provider is not supported.");
    }
    // Phase 08 — connection-method shape check (mirrors the backend service
    // layer): API_KEY providers REQUIRE credentials; bridge providers REFUSE
    // them (the secret is generated server-side, never user-supplied).
    const isBridge = descriptor.supportedConnectionMethods.includes("PLATFORM_BRIDGE");
    if (isBridge && input.credentials !== undefined) {
      throw coded(
        422,
        "INVALID_CREDENTIALS",
        "Bridge connections take no client credentials - Euforia generates the secret.",
      );
    }
    if (!isBridge && input.credentials === undefined) {
      throw coded(422, "INVALID_CREDENTIALS", "This provider requires API-key credentials.");
    }
    // Provider validation BEFORE persisting anything (§17 step order).
    if (input.credentials !== undefined) {
      guardSecret(input.credentials.secret);
    }
    if (!descriptor.supportedEnvironments.includes(input.environment as "DEMO" | "LIVE" | "PROP_FIRM")) {
      throw coded(502, "UNSUPPORTED_ACCOUNT", "The provider does not support this account environment.");
    }
    const duplicate = [...accounts.values()].find(
      (record) =>
        record.userId === userId &&
        record.providerId === input.providerId &&
        record.externalAccountId === input.externalAccountId,
    );
    if (duplicate) {
      throw coded(409, "DUPLICATE_ACCOUNT", "This trading account is already connected.");
    }

    // Phase 07 — connect-time broker identification, same ladder as the
    // backend: provider-reported (Deriv landing company) > rules.
    const brokerIdentification = identifyAtConnectMirror(input.providerId, input.externalAccountId);

    const now = isoNow();
    const count = [...accounts.values()].filter((record) => record.userId === userId).length;
    const record: AccountRecord = {
      id: uuid(),
      userId,
      name: input.displayName ?? `${descriptor.providerName} ${input.environment}`,
      type: input.environment as AccountRecord["type"],
      broker: descriptor.platform,
      // Bridge accounts have NOTHING reported yet — the first push brings
      // the real currency/balance. Values stay honest nulls/zeroes until then.
      currency: isBridge ? "USD" : providerData(input.externalAccountId).currency,
      // Provider-reported balance at connect is the journal anchor (§25).
      startingBalance: isBridge ? "0.00" : providerData(input.externalAccountId).snapshot.balance,
      isDefault: count === 0,
      externalAccountId: input.externalAccountId,
      providerId: descriptor.providerId,
      brokerIdentification,
      connection: isBridge
        ? {
            // Phase 08 — a bridge connection starts CONNECTING: it flips
            // CONNECTED only with the first signed terminal push. No initial
            // sync runs (there is nothing to pull — the terminal pushes).
            status: "CONNECTING",
            method: "PLATFORM_BRIDGE",
            secret: null,
            credentialsHint: null,
            pairing: bridgePairingFor(input.externalAccountId),
            permissions: [...descriptor.supportedPermissions],
            lastConnectedAt: null,
            lastSyncAt: null,
            lastError: null,
          }
        : {
            status: "CONNECTED",
            method: "API_KEY",
            secret: input.credentials!.secret,
            credentialsHint: hintOf(input.credentials!.secret),
            pairing: null,
            permissions: [...descriptor.supportedPermissions],
            lastConnectedAt: now,
            lastSyncAt: null,
            lastError: null,
          },
      snapshot: null,
      positions: [],
      orders: [],
      deals: [],
      runs: [],
      createdAt: now,
      updatedAt: now,
    };
    accounts.set(record.id, record);

    // Initial synchronization — failures never invalidate the registration
    // (best-effort, exactly like the backend connect use case). Bridge
    // connections skip it deliberately: data arrives with the first push.
    if (!isBridge) {
      runSynchronization(record, "INITIAL");
    }
    // Leak-check parity with the backend: the details view NEVER carries the
    // pairing sheet — it is delivered ONLY on connect (right here) and via
    // GET /bridge/pairing + /bridge/rotate.
    const deliveredPairing = record.connection?.pairing ?? null;
    return { account: { ...detailsOf(record), pairing: deliveredPairing } };
  },

  /** Phase 08 — the owner-only pairing sheet (422 for non-bridge accounts). */
  bridgePairing(userId: string, accountId: string): { pairing: BridgePairing } {
    const record = owned(userId, accountId);
    const pairing = record.connection?.pairing ?? null;
    if (pairing === null) {
      throw coded(422, "UNSUPPORTED_CAPABILITY", "This account is not an MT5 bridge connection.");
    }
    return { pairing };
  },

  /**
   * Phase 08 — rotate the bridge secret: the old terminal configuration is
   * invalidated (the EA must be re-fed), the response carries the NEW sheet
   * exactly like connect did.
   */
  rotateBridgeSecret(userId: string, accountId: string): { account: TradingAccountDetails } {
    const record = owned(userId, accountId);
    if (record.connection?.method !== "PLATFORM_BRIDGE" || record.connection.pairing === null) {
      throw coded(422, "UNSUPPORTED_CAPABILITY", "This account is not an MT5 bridge connection.");
    }
    record.connection.pairing = bridgePairingFor(record.externalAccountId);
    record.updatedAt = isoNow();
    return { account: { ...detailsOf(record), pairing: record.connection.pairing } };
  },

  list(userId: string): { accounts: TradingAccountDetails[] } {
    const nowMs = Date.now();
    return {
      accounts: [...accounts.values()]
        .filter((record) => record.userId === userId)
        .map((record) => detailsOf(record, nowMs)),
    };
  },

  details(userId: string, accountId: string): { account: TradingAccountDetails } {
    return { account: detailsOf(owned(userId, accountId)) };
  },

  rename(
    userId: string,
    accountId: string,
    input: { name?: string },
  ): { account: TradingAccountDetails } {
    const record = owned(userId, accountId);
    if (input.name !== undefined) {
      record.name = input.name;
      record.updatedAt = isoNow();
    }
    return { account: detailsOf(record) };
  },

  positions(userId: string, accountId: string): { positions: BrokerPosition[] } {
    return { positions: owned(userId, accountId).positions };
  },

  orders(userId: string, accountId: string): { orders: BrokerOrder[] } {
    return { orders: owned(userId, accountId).orders };
  },

  deals(userId: string, accountId: string): { deals: TradingDeal[] } {
    return { deals: owned(userId, accountId).deals };
  },

  /** Phase 05 — bounded sync history (newest first, keyset-paginated). */
  syncRuns(userId: string, accountId: string, limit: number, before: string | null): { runs: TradingSyncRunView[]; nextCursor: string | null } {
    const record = owned(userId, accountId);
    const filtered = before
      ? record.runs.filter((run) => run.startedAt < before)
      : [...record.runs];
    const page = filtered.slice(0, limit);
    const oldest = page.length > 0 ? page[page.length - 1] : null;
    return {
      runs: page,
      nextCursor: filtered.length > limit && oldest ? oldest.startedAt : null,
    };
  },

  test(userId: string, accountId: string): TradingConnectionTestResponse {
    const record = owned(userId, accountId);
    const secret = record.connection?.secret ?? null;
    const authOk = secret !== null && scenarioOf(secret) === null;
    // Phase 08 — bridge connections validate ON_CONNECT with the terminal,
    // not by pulling the provider: authentication is the server-held bridge
    // secret, and the "provider response" is the first terminal push.
    if (record.connection?.method === "PLATFORM_BRIDGE") {
      const pushing = record.connection.status === "CONNECTED";
      const checks = [
        {
          name: "authentication" as const,
          ok: true,
          detail: "The bridge secret is held server-side - the terminal signs every push with it.",
        },
        {
          name: "connectivity" as const,
          ok: true,
          detail: "The ingest endpoint answered within the timeout budget.",
        },
        {
          name: "providerResponse" as const,
          ok: pushing,
          detail: pushing
            ? "The terminal payload was readable."
            : "No terminal payload received yet - attach the EA and wait for the first push.",
        },
        {
          name: "permissions" as const,
          ok: true,
          detail: `Read scope granted: ${record.connection.permissions.length} READ permissions.`,
        },
      ];
      return { ok: checks.every((check) => check.ok), checks };
    }
    return {
      ok: authOk,
      checks: [
        {
          name: "authentication",
          ok: authOk,
          detail: authOk
            ? "The stored credential authenticates with the provider."
            : "The stored credential was rejected by the provider.",
        },
        {
          name: "connectivity",
          ok: true,
          detail: "The provider endpoint answered within the timeout budget.",
        },
        {
          name: "providerResponse",
          ok: authOk,
          detail: authOk
            ? "The provider returned a readable account payload."
            : "No readable payload - authentication failed first.",
        },
        {
          name: "permissions",
          ok: record.connection !== null,
          detail:
            record.connection === null
              ? "No stored permissions - connect the account first."
              : `Read scope granted: ${record.connection.permissions.length} READ permissions.`,
        },
      ],
    };
  },

  reconnect(
    userId: string,
    accountId: string,
    input: TradingReconnectInput,
  ): { account: TradingAccountDetails } {
    const record = owned(userId, accountId);
    if (record.connection?.status === "CONNECTED") {
      throw coded(409, "ALREADY_CONNECTED", "This account is already connected.");
    }
    guardSecret(input.credentials.secret);
    record.connection = {
      status: "CONNECTED",
      method: "API_KEY",
      secret: input.credentials.secret,
      credentialsHint: hintOf(input.credentials.secret),
      pairing: null,
      permissions: [...MOCK_DESCRIPTOR.supportedPermissions],
      lastConnectedAt: isoNow(),
      lastSyncAt: record.connection?.lastSyncAt ?? null,
      lastError: null,
    };
    record.updatedAt = isoNow();
    return { account: detailsOf(record) };
  },

  disconnect(userId: string, accountId: string): {
    accountId: string;
    status: "DISCONNECTED";
    historyPreserved: true;
  } {
    const record = owned(userId, accountId);
    // Disconnect wipes the credentials (and the bridge pairing sheet), keeps
    // every historical row (§52).
    if (record.connection) {
      record.connection.status = "DISCONNECTED";
      record.connection.secret = null;
      record.connection.credentialsHint = null;
      record.connection.pairing = null;
      record.connection.lastError = null;
    }
    record.updatedAt = isoNow();
    return { accountId: record.id, status: "DISCONNECTED", historyPreserved: true };
  },

  synchronize(userId: string, accountId: string): {
    accountId: string;
    synchronization: TradingAccountDetails["synchronization"];
    run: TradingSyncRunView;
  } {
    const record = owned(userId, accountId);
    if (!record.connection || record.connection.secret === null) {
      throw coded(422, "NOT_CONNECTED", "Connect the account before synchronizing.");
    }
    if (record.runs[0]?.status === "RUNNING") {
      throw coded(409, "SYNC_ALREADY_RUNNING", "A synchronization is already running for this account.");
    }
    const run = runSynchronization(record, "MANUAL");
    // The failed run is RECORDED, then the error is rethrown — the HTTP
    // response is the error envelope exactly like the backend (POST /sync
    // answers 422/502; the run stays visible in the details view).
    if (run.status === "FAILED" && run.errorCode) {
      throw codedByCode(
        run.errorCode,
        run.errorCode === "INVALID_CREDENTIALS"
          ? "The provider rejected the stored credentials. Reconnect with fresh credentials."
          : "The synchronization could not complete this time.",
      );
    }
    return {
      accountId: record.id,
      synchronization: detailsOf(record).synchronization,
      run,
    };
  },

  /**
   * Test-only credential rotation — mirrors what the backend e2e does by
   * re-encrypting a scenario secret directly in the DB (accounts.e2e.spec.ts
   * "provider auth failure during sync flips the connection to ERROR").
   * Never called by handlers; exists so the mock parity tests can reproduce
   * stale stored credentials.
   */
  _testRotateSecret(accountId: string, secret: string): void {
    const record = accounts.get(accountId);
    if (record?.connection) {
      record.connection.secret = secret;
      record.connection.credentialsHint = hintOf(secret);
    }
  },
};

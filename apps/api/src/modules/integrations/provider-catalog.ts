import type { IntegrationEcoEvent, IntegrationPermission, NewsItem } from "../../shared/contracts";

/**
 * Integration Hub - the static provider REGISTRY (MASTER PROMPT §5–§10).
 *
 * Registry entries are PLATFORM CONTENT (capabilities, licensing posture,
 * demo defaults), identical for every user - exactly like the mock's
 * `seedProviders`. Per-user runtime state (connection lifecycle, credentials
 * view, sync progress, scenario flags) lives in IntegrationRow persistence
 * and is layered over this catalog by IntegrationsService.
 *
 * The `secret` field is the DEMO secret material the mock used to
 * demonstrate `sanitizeSecrets`; it never appears on the wire (§18).
 */

export interface ProviderSeedSync {
  successAgoMs: number;
  processed: number;
  cursor: string | null;
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  kind: "BROKER" | "EXCHANGE" | "MARKET_DATA" | "ECONOMIC" | "NEWS" | "CHARTING" | "NOTIFICATION" | "EXTERNAL";
  tagline: string;
  description: string;
  docsUrl: string | null;
  capabilities: IntegrationPermission[];
  marketData: { tick: boolean; ohlc: boolean; volume: boolean; spread: boolean; sessions: boolean } | null;
  licensing: { verified: boolean; note: string };
  readOnly: boolean;
  /** Fresh-user default connection state (the demo beats of the mock). */
  status: "CONNECTED" | "SYNCING" | "DEGRADED" | "DISCONNECTED" | "AUTH_REQUIRED" | "ERROR";
  authState: "OK" | "MISSING" | "EXPIRED";
  latencyMs: number | null;
  connectedDaysAgo: number | null;
  seedSync: ProviderSeedSync;
  /** Fresh-user credentials - only Deriv ships a vault reference by default. */
  seedCredentials: { vaultRef: string; maskedHint: string; rotatedDaysAgo: number } | null;
  secret: string | null;
  rateLimit: { limitPerWindow: number; windowMs: number };
  /** cTrader's first pairing ships an expired-key demo scenario (§32). */
  firstPairingScenario: "expired-credentials" | null;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "deriv",
    name: "Deriv",
    kind: "BROKER",
    tagline: "Live account monitoring over the official Deriv API",
    description:
      "Market-data and account scope for the Deriv Live account the Session Live module watches. Positions and executions stream once the broker adapter (Phase 2) connects through this registration.",
    docsUrl: "https://api.deriv.com",
    capabilities: ["READ_MARKET_DATA", "READ_ACCOUNT"],
    marketData: null,
    licensing: {
      verified: true,
      note: "Official Deriv API - personal journaling scope, redistribution not permitted.",
    },
    readOnly: true,
    status: "CONNECTED",
    authState: "OK",
    latencyMs: 80,
    connectedDaysAgo: 9,
    seedSync: { successAgoMs: 2 * 60_000, processed: 42, cursor: "acct-1007" },
    seedCredentials: { vaultRef: "vault://deriv/api-token", maskedHint: "••••4f2a", rotatedDaysAgo: 6 },
    secret: "deriv-demo-token-9f2a4c",
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "mt5-bridge",
    name: "MT5 - Local Bridge",
    kind: "BROKER",
    tagline: "MetaTrader 5 through a local companion process",
    description:
      "A small bridge process runs on your machine, talks to the MT5 terminal and exposes a read-only surface. Nothing leaves your network except normalized account data.",
    docsUrl: null,
    capabilities: ["READ_ACCOUNT", "READ_POSITIONS", "READ_MARKET_DATA"],
    marketData: null,
    licensing: {
      verified: true,
      note: "Local bridge over your own terminal - no third-party redistribution.",
    },
    readOnly: true,
    status: "DISCONNECTED",
    authState: "MISSING",
    latencyMs: null,
    connectedDaysAgo: null,
    seedSync: { successAgoMs: 0, processed: 0, cursor: null },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "ctrader",
    name: "cTrader Open API",
    kind: "BROKER",
    tagline: "Spotware's official API for cTrader accounts",
    description:
      "Read-only account and position monitoring through the Spotware Open API. The demo registration ships with an expired credential scenario: the first test connection fails with CREDENTIALS_EXPIRED until the key is rotated.",
    docsUrl: "https://help.ctrader.com/open-api/",
    capabilities: ["READ_ACCOUNT", "READ_POSITIONS", "READ_ORDERS"],
    marketData: null,
    licensing: {
      verified: true,
      note: "Spotware Open API - read-only personal scope.",
    },
    readOnly: true,
    status: "DISCONNECTED",
    authState: "MISSING",
    latencyMs: null,
    connectedDaysAgo: null,
    seedSync: { successAgoMs: 0, processed: 0, cursor: null },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: "expired-credentials",
  },
  {
    id: "binance-exchange",
    name: "Binance Spot",
    kind: "EXCHANGE",
    tagline: "Spot account monitoring via REST + WebSocket",
    description:
      "Exchange accounts differ from brokers: custody, API scopes and rate limits are provider-specific. This registration reads balances and executions only - withdrawal scopes are refused by policy.",
    docsUrl: "https://binance-docs.github.io",
    capabilities: ["READ_ACCOUNT", "READ_EXECUTIONS"],
    marketData: null,
    licensing: {
      verified: false,
      note: "ToS review pending before production enablement.",
    },
    readOnly: true,
    status: "DISCONNECTED",
    authState: "MISSING",
    latencyMs: null,
    connectedDaysAgo: null,
    seedSync: { successAgoMs: 0, processed: 0, cursor: null },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "binance-market",
    name: "Binance Market Data",
    kind: "MARKET_DATA",
    tagline: "Public REST + WebSocket market streams",
    description:
      "Independent from any broker account: prices, candles and volume for crypto pairs. Serves the Session Live price chart when the simulated feed is not selected.",
    docsUrl: "https://binance-docs.github.io",
    capabilities: ["READ_MARKET_DATA"],
    marketData: { tick: true, ohlc: true, volume: true, spread: false, sessions: false },
    licensing: {
      verified: true,
      note: "Public market data - attribution required, storage limited to the retention window.",
    },
    readOnly: true,
    status: "CONNECTED",
    authState: "OK",
    latencyMs: 120,
    connectedDaysAgo: 12,
    seedSync: { successAgoMs: 60_000, processed: 312, cursor: "stream-btcusdt@0421" },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 60, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "simulated-feed",
    name: "Simulated Feed",
    kind: "MARKET_DATA",
    tagline: "Deterministic offline fallback",
    description:
      "The offline-safe price source for demos and tests. Deliberately narrower than real providers - no OHLC history, no volume - so capability differences stay visible.",
    docsUrl: null,
    capabilities: ["READ_MARKET_DATA"],
    marketData: { tick: true, ohlc: false, volume: false, spread: false, sessions: true },
    licensing: {
      verified: true,
      note: "Generated locally - no external licensing.",
    },
    readOnly: true,
    status: "CONNECTED",
    authState: "OK",
    latencyMs: 15,
    connectedDaysAgo: 12,
    seedSync: { successAgoMs: 30_000, processed: 1_204, cursor: "tick@t-30" },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 60, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "macro-sample",
    name: "Macro Calendar (sample feed)",
    kind: "ECONOMIC",
    tagline: "Provider-shaped macro calendar, normalized on ingest",
    description:
      "The economic pipeline stands in for a licensed macro provider: a raw provider payload is normalized (previous / forecast / actual / impact / status) and upserted idempotently by provider key. Production requires a licensed provider that passes review - until then this feed is clearly labelled sample.",
    docsUrl: null,
    capabilities: ["READ_ECONOMIC_DATA", "WEBHOOK_INBOUND"],
    marketData: null,
    licensing: {
      verified: false,
      note: "Sample dataset for development - a licensed provider must pass §29 review before production use.",
    },
    readOnly: true,
    status: "CONNECTED",
    authState: "OK",
    latencyMs: 95,
    connectedDaysAgo: 5,
    seedSync: { successAgoMs: 5 * 60_000, processed: 61, cursor: "batch-7" },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 3, windowMs: 10_000 },
    firstPairingScenario: null,
  },
  {
    id: "news-wire",
    name: "Market News Wire",
    kind: "NEWS",
    tagline: "Headlines pipeline - awaiting a licensed provider",
    description:
      "The news architecture (headline, source, category, related symbols, importance) is provider-ready. Redistribution rights are verified BEFORE connecting: no publicly accessible feed is assumed licensable.",
    docsUrl: null,
    capabilities: ["READ_NEWS"],
    marketData: null,
    licensing: {
      verified: false,
      note: "No provider connected: commercial redistribution rights must be verified first (§29).",
    },
    readOnly: true,
    status: "DISCONNECTED",
    authState: "MISSING",
    latencyMs: null,
    connectedDaysAgo: null,
    seedSync: { successAgoMs: 0, processed: 0, cursor: null },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "tradingview",
    name: "TradingView",
    kind: "CHARTING",
    tagline: "Chart visualization - never the source of truth",
    description:
      "TradingView renders market display and chart interaction. Positions, executions and account state remain owned by the broker adapter; the chart layer can never write them.",
    docsUrl: "https://www.tradingview.com/widget-docs/",
    capabilities: [],
    marketData: null,
    licensing: {
      verified: true,
      note: "Widget terms - visualization only, no data redistribution.",
    },
    readOnly: true,
    status: "CONNECTED",
    authState: "OK",
    latencyMs: 40,
    connectedDaysAgo: 4,
    seedSync: { successAgoMs: 3 * 60_000, processed: 0, cursor: null },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "email-outbound",
    name: "Email Notifications",
    kind: "NOTIFICATION",
    tagline: "Outbound alert delivery over a transactional provider",
    description:
      "The in-app alert engine already routes by your notification preferences; this provider adds the email channel. Connect with a vault-stored SMTP/API key.",
    docsUrl: null,
    capabilities: [],
    marketData: null,
    licensing: {
      verified: true,
      note: "Your own sending provider - no third-party data.",
    },
    readOnly: true,
    status: "DISCONNECTED",
    authState: "MISSING",
    latencyMs: null,
    connectedDaysAgo: null,
    seedSync: { successAgoMs: 0, processed: 0, cursor: null },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "push-outbound",
    name: "Push Notifications",
    kind: "NOTIFICATION",
    tagline: "Web-push delivery for risk and system alerts",
    description:
      "Delivers the alerts your notification preferences allow to devices running the Euforia PWA.",
    docsUrl: null,
    capabilities: [],
    marketData: null,
    licensing: {
      verified: true,
      note: "Standard web push - no third-party data.",
    },
    readOnly: true,
    status: "DISCONNECTED",
    authState: "MISSING",
    latencyMs: null,
    connectedDaysAgo: null,
    seedSync: { successAgoMs: 0, processed: 0, cursor: null },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: null,
  },
  {
    id: "webhook-out",
    name: "Outbound Webhooks",
    kind: "EXTERNAL",
    tagline: "Push journal events to your own automations",
    description:
      "Signed outbound webhooks (HMAC, timestamped, retried with backoff) toward endpoints you own - spreadsheets, pipelines, home dashboards.",
    docsUrl: null,
    capabilities: [],
    marketData: null,
    licensing: {
      verified: true,
      note: "Your own endpoints - no third-party data.",
    },
    readOnly: true,
    status: "DISCONNECTED",
    authState: "MISSING",
    latencyMs: null,
    connectedDaysAgo: null,
    seedSync: { successAgoMs: 0, processed: 0, cursor: null },
    seedCredentials: null,
    secret: null,
    rateLimit: { limitPerWindow: 30, windowMs: 60_000 },
    firstPairingScenario: null,
  },
]

export const INTEGRATION_RETENTION = {
  marketDataDays: 30,
  newsDays: 2,
  economicHistoryDays: 365,
  syncLogsDays: 14,
} as const;

/** §6 honesty - numbers arrive with the broker adapter sync, never invented. */
export const DEMO_ACCOUNT_VIEW = {
  providerId: "deriv",
  providerName: "Deriv",
  accountIdentifier: "Deriv Live · Standard",
  accountType: "CFD - forex & synthetic indices",
  currency: "USD",
  balance: null,
  equity: null,
  positionsOpen: null,
  permissions: ["READ_MARKET_DATA", "READ_ACCOUNT"] as Array<"READ_MARKET_DATA" | "READ_ACCOUNT">,
  readOnly: true,
} as const;

/** The single seeded inbound webhook endpoint (macro-sample). */
export const DEMO_WEBHOOK = {
  id: "wh-macro",
  providerId: "macro-sample",
  path: "/integrations/webhooks/wh-macro",
  status: "ACTIVE",
  secretMaskedHint: "whsec_••••e7c1",
  secret: "whsec_demo_77b1e7c1",
} as const;

const NEWS_SAMPLES: Array<Omit<NewsItem, "id" | "sample">> = [
  {
    providerKey: "sample:news-1",
    headline: "Dollar steadies as traders look past mixed US jobs revisions",
    source: "Euforia Sample Wire",
    category: "FOREX",
    publishedAt: "",
    relatedSymbols: ["EURUSD", "USDJPY"],
    relatedCurrencies: ["USD"],
    importance: 2,
    url: "https://example.invalid/news/usd-steadies",
  },
  {
    providerKey: "sample:news-2",
    headline: "Gold holds the 2 330 $ pivot ahead of the FOMC minutes",
    source: "Euforia Sample Wire",
    category: "GOLD",
    publishedAt: "",
    relatedSymbols: ["XAUUSD"],
    relatedCurrencies: ["USD"],
    importance: 2,
    url: "https://example.invalid/news/gold-fomc",
  },
  {
    providerKey: "sample:news-3",
    headline: "Bitcoin ETF inflows resume after two quiet sessions",
    source: "Euforia Sample Wire",
    category: "CRYPTO",
    publishedAt: "",
    relatedSymbols: ["BTCUSDT"],
    relatedCurrencies: ["USD"],
    importance: 1,
    url: "https://example.invalid/news/btc-etf",
  },
  {
    providerKey: "sample:news-4",
    headline: "ECB speakers signal patience: rate path hinges on Q2 prints",
    source: "Euforia Sample Wire",
    category: "CENTRAL_BANKS",
    publishedAt: "",
    relatedSymbols: ["EURUSD", "DE40"],
    relatedCurrencies: ["EUR"],
    importance: 3,
    url: "https://example.invalid/news/ecb-patience",
  },
  {
    providerKey: "sample:news-5",
    headline: "Index futures drift lower as macro calendar thins out",
    source: "Euforia Sample Wire",
    category: "INDICES",
    publishedAt: "",
    relatedSymbols: ["US500", "NAS100"],
    relatedCurrencies: ["USD"],
    importance: 1,
    url: "https://example.invalid/news/futures-drift",
  },
  {
    providerKey: "sample:news-6",
    headline: "Oil inventories surprise: energy majors trim hedges",
    source: "Euforia Sample Wire",
    category: "MACRO",
    publishedAt: "",
    relatedSymbols: ["USOIL"],
    relatedCurrencies: ["USD"],
    importance: 2,
    url: "https://example.invalid/news/oil-inventories",
  },
];

/** News publishedAt offsets (ms before seed time) - the retention window eats
 * the oldest sample exactly like the mock's `pruneRetention`. */
export const NEWS_AGE_MS = [2 * 3_600_000, 5 * 3_600_000, 8 * 3_600_000, 86_400_000 + 3_600_000, 86_400_000 + 7 * 3_600_000, 2 * 86_400_000] as const;

/** Deterministic v4-format UUID from a string seed (same shape as the
 * calendar module's uuidFrom - ids must satisfy the shared uuid format). */
function uuidFrom(seed: string): string {
  let hash1 = 0x811c9dc5;
  let hash2 = 0x01000193;
  for (let index = 0; index < seed.length; index += 1) {
    hash1 = (Math.imul(hash1 ^ seed.charCodeAt(index), 0x01000193) >>> 0) % 4294967296;
    hash2 = (Math.imul(hash2 + seed.charCodeAt(index), 2654435761) >>> 0) % 4294967296;
  }
  const hex = (value: number, length: number): string => value.toString(16).padStart(length, "0").slice(0, length);
  return `${hex(hash1, 8)}-4${hex(hash2, 3)}-8${hex(hash1 >>> 8, 3)}-${hex(hash2 >>> 4, 4)}-${hex(hash1, 8)}${hex(hash2, 4)}`.slice(0, 36);
}

export function newsSamplesAt(nowMs: number): NewsItem[] {
  return NEWS_SAMPLES.map((item, index) => ({
    ...item,
    publishedAt: new Date(nowMs - (NEWS_AGE_MS[index] ?? 0)).toISOString(),
    id: uuidFrom(`cosmoz-news-${index + 1}`),
    sample: true,
  }));
}

/** Fresh-user audit log entries (CONNECTED beats + one SYNCED). */
export const SEED_EVENT_LOG: Array<{
  providerId: string;
  providerName: string;
  type: string;
  message: string;
}> = [
  { providerId: "deriv", providerName: "Deriv", type: "CONNECTED", message: "Read-only connection established (market data + account scope)" },
  { providerId: "binance-market", providerName: "Binance Market Data", type: "CONNECTED", message: "Public streams attached - attribution recorded" },
  { providerId: "simulated-feed", providerName: "Simulated Feed", type: "CONNECTED", message: "Offline fallback registered" },
  { providerId: "macro-sample", providerName: "Macro Calendar (sample feed)", type: "CONNECTED", message: "Sample feed attached - production requires a licensed provider" },
  { providerId: "tradingview", providerName: "TradingView", type: "CONNECTED", message: "Charting layer attached (visualization only)" },
  { providerId: "macro-sample", providerName: "Macro Calendar (sample feed)", type: "SYNCED", message: "Incremental sync - batch-7, 61 records" },
];

/** The countries map used by the §9 normalization layer in the mock seed. */
export const ECO_COUNTRIES: Record<string, string> = {
  USD: "United States",
  EUR: "Euro Area",
  GBP: "United Kingdom",
  CAD: "Canada",
};

export type { IntegrationEcoEvent };

/**
 * Integration provider registry (Phase 14 §11) — the CODE registry of
 * supported generic external providers. Provider definitions are static
 * configuration (like the accounts provider descriptors and the builtin
 * economic-calendar adapter): there is NO provider table — adding a
 * provider means adding a catalog entry + its adapter behaviour, nothing
 * else (§50/§60).
 *
 * Ownership guard (§2/§5/§30): these entries are the Hub's GENERIC
 * registrations. They never displace specialized-domain ownership:
 *   - real trading connectivity stays owned by Accounts (TradingConnection);
 *   - the canonical economic-event feed stays owned by Calendar;
 *   - specialized OCR/vision stays owned by the FastAPI sidecar.
 * The Hub owns the connection state, health, ledgers and webhook pipeline
 * for these registrations — nothing more.
 *
 * Shapes mirror the shared `integrationProviderSchema` registry-side fields
 * (Phase 14 §8: the wire contract is the audited shared schema — the
 * runtime/status fields are filled per user by the service layer).
 */

import type {
  IntegrationKind,
  IntegrationPermission,
  MarketDataCapabilities,
} from "../../../shared/contracts";

export interface ProviderRateLimit {
  /** Requests allowed per sliding window (mock parity, §25). */
  readonly limitPerWindow: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
}

/** Static registry entry — the part every user sees before any connection. */
export interface ProviderCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: IntegrationKind;
  readonly tagline: string;
  readonly description: string;
  readonly docsUrl: string | null;
  readonly capabilities: readonly IntegrationPermission[];
  /** Market-data providers only — null otherwise (§8: honest capabilities). */
  readonly marketData: MarketDataCapabilities | null;
  readonly licensing: { readonly verified: boolean; readonly note: string };
  /** Simulated round-trip latency of the builtin adapter (null = unreachable
   * until credentials are valid — mock parity for the connectivity check). */
  readonly latencyMs: number | null;
  readonly readOnly: boolean;
  /** Provider-side rate limit enforced by the Hub rate limiter on sync (§25). */
  readonly rateLimit: ProviderRateLimit;
}

/** Default demo quota: 30 requests / 60 s window (mock registry parity). */
const DEFAULT_RATE: ProviderRateLimit = { limitPerWindow: 30, windowMs: 60_000 };
/** Market-data quota: 60 requests / 60 s. */
const MARKET_RATE: ProviderRateLimit = { limitPerWindow: 60, windowMs: 60_000 };
/** Economic sample quota: 3 requests / 10 s — the tight provider contract. */
const MACRO_RATE: ProviderRateLimit = { limitPerWindow: 3, windowMs: 10_000 };

/**
 * The audited 12-provider registry (mock §21 parity, verbatim metadata).
 * Order is the overview render order.
 */
export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
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
      note: "Official Deriv API — personal journaling scope, redistribution not permitted.",
    },
    latencyMs: 80,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
  },
  {
    id: "mt5-bridge",
    name: "MT5 — Local Bridge",
    kind: "BROKER",
    tagline: "MetaTrader 5 through a local companion process",
    description:
      "A small bridge process runs on your machine, talks to the MT5 terminal and exposes a read-only surface. Nothing leaves your network except normalized account data.",
    docsUrl: null,
    capabilities: ["READ_ACCOUNT", "READ_POSITIONS", "READ_MARKET_DATA"],
    marketData: null,
    licensing: {
      verified: true,
      note: "Local bridge over your own terminal — no third-party redistribution.",
    },
    latencyMs: null,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
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
      note: "Spotware Open API — read-only personal scope.",
    },
    latencyMs: null,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
  },
  {
    id: "binance-exchange",
    name: "Binance Spot",
    kind: "EXCHANGE",
    tagline: "Spot account monitoring via REST + WebSocket",
    description:
      "Exchange accounts differ from brokers: custody, API scopes and rate limits are provider-specific. This registration reads balances and executions only — withdrawal scopes are refused by policy.",
    docsUrl: "https://binance-docs.github.io",
    capabilities: ["READ_ACCOUNT", "READ_EXECUTIONS"],
    marketData: null,
    licensing: {
      verified: false,
      note: "ToS review pending before production enablement.",
    },
    latencyMs: null,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
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
      note: "Public market data — attribution required, storage limited to the retention window.",
    },
    latencyMs: 120,
    readOnly: true,
    rateLimit: MARKET_RATE,
  },
  {
    id: "simulated-feed",
    name: "Simulated Feed",
    kind: "MARKET_DATA",
    tagline: "Deterministic offline fallback",
    description:
      "The offline-safe price source for demos and tests. Deliberately narrower than real providers — no OHLC history, no volume — so capability differences stay visible.",
    docsUrl: null,
    capabilities: ["READ_MARKET_DATA"],
    marketData: { tick: true, ohlc: false, volume: false, spread: false, sessions: true },
    licensing: {
      verified: true,
      note: "Generated locally — no external licensing.",
    },
    latencyMs: 15,
    readOnly: true,
    rateLimit: MARKET_RATE,
  },
  {
    id: "macro-sample",
    name: "Macro Calendar (sample feed)",
    kind: "ECONOMIC",
    tagline: "Provider-shaped macro calendar, normalized on ingest",
    description:
      "The economic pipeline stands in for a licensed macro provider: a raw provider payload is normalized (previous / forecast / actual / impact / status) and upserted idempotently by provider key. Production requires a licensed provider that passes review — until then this feed is clearly labelled sample.",
    docsUrl: null,
    capabilities: ["READ_ECONOMIC_DATA", "WEBHOOK_INBOUND"],
    marketData: null,
    licensing: {
      verified: false,
      note: "Sample dataset for development — a licensed provider must pass §29 review before production use.",
    },
    latencyMs: 95,
    readOnly: true,
    rateLimit: MACRO_RATE,
  },
  {
    id: "news-wire",
    name: "Market News Wire",
    kind: "NEWS",
    tagline: "Headlines pipeline — awaiting a licensed provider",
    description:
      "The news architecture (headline, source, category, related symbols, importance) is provider-ready. Redistribution rights are verified BEFORE connecting: no publicly accessible feed is assumed licensable.",
    docsUrl: null,
    capabilities: ["READ_NEWS"],
    marketData: null,
    licensing: {
      verified: false,
      note: "No provider connected: commercial redistribution rights must be verified first (§29).",
    },
    latencyMs: null,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
  },
  {
    id: "tradingview",
    name: "TradingView",
    kind: "CHARTING",
    tagline: "Chart visualization — never the source of truth",
    description:
      "TradingView renders market display and chart interaction. Positions, executions and account state remain owned by the broker adapter; the chart layer can never write them.",
    docsUrl: "https://www.tradingview.com/widget-docs/",
    capabilities: [],
    marketData: null,
    licensing: {
      verified: true,
      note: "Widget terms — visualization only, no data redistribution.",
    },
    latencyMs: 40,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
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
      note: "Your own sending provider — no third-party data.",
    },
    latencyMs: null,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
  },
  {
    id: "push-outbound",
    name: "Push Notifications",
    kind: "NOTIFICATION",
    tagline: "Web-push delivery for risk and system alerts",
    description:
      "Delivers the alerts your notification preferences allow to devices running the Cosmoz PWA.",
    docsUrl: null,
    capabilities: [],
    marketData: null,
    licensing: {
      verified: true,
      note: "Standard web push — no third-party data.",
    },
    latencyMs: null,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
  },
  {
    id: "webhook-out",
    name: "Outbound Webhooks",
    kind: "EXTERNAL",
    tagline: "Push journal events to your own automations",
    description:
      "Signed outbound webhooks (HMAC, timestamped, retried with backoff) toward endpoints you own — spreadsheets, pipelines, home dashboards.",
    docsUrl: null,
    capabilities: [],
    marketData: null,
    licensing: {
      verified: true,
      note: "Your own endpoints — no third-party data.",
    },
    latencyMs: null,
    readOnly: true,
    rateLimit: DEFAULT_RATE,
  },
];

const byId = new Map(PROVIDER_CATALOG.map((provider) => [provider.id, provider]));

/** Registry lookup — null for unknown provider ids (404 UNKNOWN_PROVIDER). */
export function findProvider(providerId: string): ProviderCatalogEntry | null {
  return byId.get(providerId) ?? null;
}

/** The one provider that carries the inbound webhook capability (mock §21). */
export function findWebhookInboundProvider(): ProviderCatalogEntry | null {
  return (
    PROVIDER_CATALOG.find((provider) => provider.capabilities.includes("WEBHOOK_INBOUND")) ??
    null
  );
}

/**
 * §10/§36 — registry entries that receive INBOUND webhooks are SYSTEM-level
 * in the shared catalogue (the provider pushes to Cosmoz), while connection
 * state stays per user. Exposed for the provisioning policy documentation.
 */
export const WEBHOOK_PROVISIONING_NOTE =
  "Inbound webhook endpoints are provisioned lazily per user (one per user+provider) " +
  "when the Hub overview is first rendered — the signing secret is generated " +
  "server-side and never leaves the backend (§12/§14).";

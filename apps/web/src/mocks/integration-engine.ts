import type {
  IntegrationConnectInput,
  IntegrationDisconnectResponse,
  IntegrationEcoEvent,
  IntegrationEvent,
  IntegrationError,
  IntegrationProvider,
  IntegrationsOverviewResponse,
  IntegrationSyncResponse,
  IntegrationTestResponse,
  NewsItem,
  RetentionPolicy,
  TradingAccountView,
  WebhookDeliverResponse,
  WebhookEndpoint,
  WebhookSimulateInput,
} from "@cosmoz/shared";
import {
  backoffDelayMs,
  idempotencyKey,
  isWebhookTimestampFresh,
  sanitizeSecrets,
} from "@cosmoz/shared";

import { buildEcoEvents } from "./fixtures/eco-events";
import { mulberry32, uuid } from "./fixtures/random";

/**
 * Integration Hub engine — the mock platform layer (MASTER PROMPT §3–§31).
 *
 * Providers are REGISTRY ENTRIES with an adapter surface; the engine owns:
 * - connection lifecycle (connect / reconnect / disconnect / test / sync)
 * - incremental synchronization with cursors and idempotent upserts
 * - provider rate-limit bookkeeping with retry-after
 * - a sanitized, actionable error ledger and an audit event log
 * - inbound webhook pipeline: HMAC signature → timestamp freshness →
 *   idempotency (the signing secret NEVER leaves this module)
 * - retention pruning per policy
 *
 * Every action returns a discriminated result; the MSW handlers map failures
 * to HTTP statuses. No secret string ever appears in any returned payload —
 * messages pass through `sanitizeSecrets` before leaving the engine.
 */

// ── Results ──────────────────────────────────────────────────────────────────

type Ok<T> = { ok: true; value: T };
type Fail = {
  ok: false;
  status: number;
  code: string;
  message: string;
  retryAfterMs?: number;
};
type Result<T> = Ok<T> | Fail;

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const fail = (
  status: number,
  code: string,
  message: string,
  retryAfterMs?: number,
): Fail => ({ ok: false, status, code, message, retryAfterMs });

// ── Runtime provider (registry entry + secrets that never leave) ────────────

interface ProviderRuntime extends IntegrationProvider {
  /** Secret material — vault-scoped, NEVER included in any response. */
  secret: string | null;
  rateLimit: {
    count: number;
    windowStartMs: number;
    limitPerWindow: number;
    windowMs: number;
  };
  /** Deterministic demo scenario for the §32 test paths. */
  scenario: "expired-credentials" | null;
  /** True after the first successful pairing — one-shot demo scenarios. */
  pairedOnce: boolean;
  /** Executed-sync counter — drives the deterministic partial-sync beat. */
  syncCounter: number;
  /** Incremental cursor per provider. */
  cursor: string | null;
}

interface WebhookRuntime extends WebhookEndpoint {
  secret: string;
  lastAcceptedEventId: string | null;
}

const nowIso = (): string => new Date().toISOString();

function baseSync() {
  return {
    lastAttemptedAt: null,
    lastSuccessAt: null,
    lastDurationMs: null,
    recordsProcessed: 0,
    recordsFailed: 0,
    retryCount: 0,
    cursor: null,
    nextRetryAt: null,
  };
}

function emptySummary(): IntegrationsOverviewResponse["summary"] {
  return {
    connected: 0,
    syncing: 0,
    degraded: 0,
    disconnected: 0,
    authRequired: 0,
    error: 0,
  };
}

// ── Engine ───────────────────────────────────────────────────────────────────

class IntegrationEngine {
  private providers = new Map<string, ProviderRuntime>();
  private events: IntegrationEvent[] = [];
  private errors: IntegrationError[] = [];
  private seenKeys = new Set<string>();
  private ecoEvents: IntegrationEcoEvent[] = [];
  private news: NewsItem[] = [];
  private webhooks: WebhookRuntime[] = [];
  private accounts: TradingAccountView[] = [];
  private ecoCursorBatch = 7;

  readonly retention: RetentionPolicy = {
    marketDataDays: 30,
    newsDays: 2,
    economicHistoryDays: 365,
    syncLogsDays: 14,
  };

  constructor(nowMs: number) {
    this.seedProviders(nowMs);
    this.seedEcoFromProviderPayload(nowMs);
    this.seedNews(nowMs);
    this.seedWebhooks();
    this.seedAccounts();
    this.seedEventLog(nowMs);
  }

  // ── Seeding ────────────────────────────────────────────────────────────────

  private seedProviders(nowMs: number) {
    const iso = (ms: number): string => new Date(ms).toISOString();
    const seedSync = (
      successAgoMs: number,
      processed: number,
      cursor: string | null,
    ) => ({
      lastAttemptedAt: iso(nowMs - successAgoMs),
      lastSuccessAt: iso(nowMs - successAgoMs),
      lastDurationMs: 420,
      recordsProcessed: processed,
      recordsFailed: 0,
      retryCount: 0,
      cursor,
      nextRetryAt: null,
    });

    const registry: ProviderRuntime[] = [
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
        status: "CONNECTED",
        authState: "OK",
        latencyMs: 80,
        sync: seedSync(2 * 60_000, 42, "acct-1007"),
        credentials: {
          vaultRef: "vault://deriv/api-token",
          maskedHint: "••••4f2a",
          expiresAt: null,
          lastRotatedAt: iso(nowMs - 6 * 86_400_000),
        },
        connectedAt: iso(nowMs - 9 * 86_400_000),
        readOnly: true,
        secret: "deriv-demo-token-9f2a4c",
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: "acct-1007",
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
        status: "DISCONNECTED",
        authState: "MISSING",
        latencyMs: null,
        sync: baseSync(),
        credentials: null,
        connectedAt: null,
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: null,
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
        status: "DISCONNECTED",
        authState: "MISSING",
        latencyMs: null,
        sync: baseSync(),
        credentials: null,
        connectedAt: null,
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: null,
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
        status: "DISCONNECTED",
        authState: "MISSING",
        latencyMs: null,
        sync: baseSync(),
        credentials: null,
        connectedAt: null,
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: null,
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
        status: "CONNECTED",
        authState: "OK",
        latencyMs: 120,
        sync: seedSync(60_000, 312, "stream-btcusdt@0421"),
        credentials: null,
        connectedAt: iso(nowMs - 12 * 86_400_000),
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 60, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: "stream-btcusdt@0421",
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
        status: "CONNECTED",
        authState: "OK",
        latencyMs: 15,
        sync: seedSync(30_000, 1_204, "tick@t-30"),
        credentials: null,
        connectedAt: iso(nowMs - 12 * 86_400_000),
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 60, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: "tick@t-30",
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
        status: "CONNECTED",
        authState: "OK",
        latencyMs: 95,
        sync: seedSync(5 * 60_000, 61, "batch-7"),
        credentials: null,
        connectedAt: iso(nowMs - 5 * 86_400_000),
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 3, windowMs: 10_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: "batch-7",
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
        status: "DISCONNECTED",
        authState: "MISSING",
        latencyMs: null,
        sync: baseSync(),
        credentials: null,
        connectedAt: null,
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: null,
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
        status: "CONNECTED",
        authState: "OK",
        latencyMs: 40,
        sync: seedSync(3 * 60_000, 0, null),
        credentials: null,
        connectedAt: iso(nowMs - 4 * 86_400_000),
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: null,
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
        status: "DISCONNECTED",
        authState: "MISSING",
        latencyMs: null,
        sync: baseSync(),
        credentials: null,
        connectedAt: null,
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: null,
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
        status: "DISCONNECTED",
        authState: "MISSING",
        latencyMs: null,
        sync: baseSync(),
        credentials: null,
        connectedAt: null,
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: null,
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
        status: "DISCONNECTED",
        authState: "MISSING",
        latencyMs: null,
        sync: baseSync(),
        credentials: null,
        connectedAt: null,
        readOnly: true,
        secret: null,
        rateLimit: { count: 0, windowStartMs: nowMs, limitPerWindow: 30, windowMs: 60_000 },
        scenario: null,
        pairedOnce: false,
        syncCounter: 0,
        cursor: null,
      },
    ];

    for (const provider of registry) {
      this.providers.set(provider.id, provider);
    }
  }

  /**
   * §9 — the economic layer consumes a RAW provider payload and normalizes
   * it. The existing deterministic calendar generator stands in for the
   * provider's wire format; it is re-mapped through the normalizer so the
   * calendar is fed by the pipeline, not by hardcoded display rows.
   */
  private seedEcoFromProviderPayload(nowMs: number) {
    const raw = buildEcoEvents(nowMs);
    const rng = mulberry32(0xec0);
    const countries: Record<string, string> = {
      USD: "United States",
      EUR: "Euro Area",
      GBP: "United Kingdom",
      CAD: "Canada",
    };

    // Provider wire format — deliberately different from the domain schema.
    const providerPayload = raw.map((event) => ({
      evt_ref: `MACRO-${event.id.slice(0, 8)}`,
      cal_title: event.title,
      cal_ccy: event.currency,
      cal_tone: event.impact.toLowerCase(),
      cal_ts_utc: event.scheduledAt,
      vals: { prev: event.previous, fcst: event.forecast, act: event.actual },
      region: countries[event.currency] ?? event.currency,
    }));

    for (const row of providerPayload) {
      const key = idempotencyKey("macro-sample", row.evt_ref);
      this.seenKeys.add(key);
      this.ecoEvents.push(this.normalizeEco(row, key, rng));
    }
    void nowMs;
  }

  /** Provider wire → normalized domain event (§25 normalization layer). */
  private normalizeEco(
    row: {
      evt_ref: string;
      cal_title: string;
      cal_ccy: string;
      cal_tone: string;
      cal_ts_utc: string;
      vals: { prev: string | null; fcst: string | null; act: string | null };
      region: string;
    },
    providerKey: string,
    rng: () => number,
  ): IntegrationEcoEvent {
    const impact =
      row.cal_tone === "high" ? "HIGH" : row.cal_tone === "medium" ? "MEDIUM" : "LOW";
    const released = Date.parse(row.cal_ts_utc) <= Date.now();
    return {
      id: uuid(rng),
      providerKey,
      providerId: "macro-sample",
      title: row.cal_title,
      country: row.region,
      currency: row.cal_ccy,
      impact,
      scheduledAt: row.cal_ts_utc,
      previous: row.vals.prev,
      forecast: row.vals.fcst,
      actual: row.vals.act,
      status: released ? (row.vals.act !== null ? "RELEASED" : "SCHEDULED") : "SCHEDULED",
    };
  }

  private seedNews(nowMs: number) {
    const day = 86_400_000;
    const samples: Array<Omit<NewsItem, "id" | "sample">> = [
      {
        providerKey: "sample:news-1",
        headline: "Dollar steadies as traders look past mixed US jobs revisions",
        source: "Euforia Sample Wire",
        category: "FOREX",
        publishedAt: new Date(nowMs - 2 * 3_600_000).toISOString(),
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
        publishedAt: new Date(nowMs - 5 * 3_600_000).toISOString(),
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
        publishedAt: new Date(nowMs - 8 * 3_600_000).toISOString(),
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
        publishedAt: new Date(nowMs - day - 3_600_000).toISOString(),
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
        publishedAt: new Date(nowMs - day - 7 * 3_600_000).toISOString(),
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
        publishedAt: new Date(nowMs - 2 * day).toISOString(),
        relatedSymbols: ["USOIL"],
        relatedCurrencies: ["USD"],
        importance: 2,
        url: "https://example.invalid/news/oil-inventories",
      },
    ];

    const rng = mulberry32(0x3e05);
    this.news = samples.map((item) => ({ ...item, id: uuid(rng), sample: true }));
  }

  private seedWebhooks() {
    this.webhooks = [
      {
        id: "wh-macro",
        providerId: "macro-sample",
        path: "/integrations/webhooks/wh-macro",
        status: "ACTIVE",
        secretMaskedHint: "whsec_••••e7c1",
        deliveries: [],
        secret: "whsec_demo_77b1e7c1",
        lastAcceptedEventId: null,
      },
    ];
  }

  private seedAccounts() {
    this.accounts = [
      {
        providerId: "deriv",
        providerName: "Deriv",
        accountIdentifier: "Deriv Live · Standard",
        accountType: "CFD - forex & synthetic indices",
        currency: "USD",
        // §6 honesty: numbers arrive with the broker adapter sync — never invented.
        balance: null,
        equity: null,
        positionsOpen: null,
        permissions: ["READ_MARKET_DATA", "READ_ACCOUNT"],
        lastSyncAt: this.providers.get("deriv")?.sync.lastSuccessAt ?? null,
        readOnly: true,
      },
    ];
  }

  private seedEventLog(nowMs: number) {
    const iso = (ms: number): string => new Date(ms).toISOString();
    const entries: Array<[string, string, IntegrationEvent["type"], string]> = [
      ["deriv", "Deriv", "CONNECTED", "Read-only connection established (market data + account scope)"],
      ["binance-market", "Binance Market Data", "CONNECTED", "Public streams attached - attribution recorded"],
      ["simulated-feed", "Simulated Feed", "CONNECTED", "Offline fallback registered"],
      ["macro-sample", "Macro Calendar (sample feed)", "CONNECTED", "Sample feed attached - production requires a licensed provider"],
      ["tradingview", "TradingView", "CONNECTED", "Charting layer attached (visualization only)"],
      ["macro-sample", "Macro Calendar (sample feed)", "SYNCED", "Incremental sync - batch-7, 61 records"],
    ];
    this.events = entries.map(([providerId, providerName, type, message], index) => ({
      id: uuid(mulberry32(0x1d7a + index)),
      occurredAt: iso(nowMs - (entries.length - index) * 7 * 60_000),
      providerId,
      providerName,
      type,
      message,
    }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private logEvent(
    provider: ProviderRuntime,
    type: IntegrationEvent["type"],
    message: string,
  ) {
    this.events.push({
      id: uuid(mulberry32(Date.now() & 0xffff)),
      occurredAt: nowIso(),
      providerId: provider.id,
      providerName: provider.name,
      type,
      message: sanitizeSecrets(message, provider.secret ? [provider.secret] : []),
    });
    if (this.events.length > 80) this.events.splice(0, this.events.length - 80);
  }

  private logError(
    provider: ProviderRuntime,
    code: IntegrationError["code"],
    message: string,
    options: { retryable: boolean; actionHint: string; retryAfterMs?: number },
  ) {
    this.errors.push({
      id: uuid(mulberry32(Date.now() & 0xffff)),
      providerId: provider.id,
      occurredAt: nowIso(),
      code,
      message: sanitizeSecrets(message, provider.secret ? [provider.secret] : []),
      retryable: options.retryable,
      actionHint: options.actionHint,
      retryAfterMs: options.retryAfterMs ?? null,
    });
    if (this.errors.length > 40) this.errors.splice(0, this.errors.length - 40);
  }

  clearError(providerId: string, code?: string) {
    this.errors = this.errors.filter(
      (error) => !(error.providerId === providerId && (code === undefined || error.code === code)),
    );
  }

  private rateLimitCheck(provider: ProviderRuntime, nowMs: number): Fail | null {
    const limits = provider.rateLimit;
    if (nowMs - limits.windowStartMs > limits.windowMs) {
      limits.windowStartMs = nowMs;
      limits.count = 0;
    }
    if (limits.count >= limits.limitPerWindow) {
      const retryAfterMs = Math.max(0, limits.windowMs - (nowMs - limits.windowStartMs));
      this.logError(
        provider,
        "RATE_LIMITED",
        `Provider rate limit reached (${limits.limitPerWindow} requests / ${Math.round(limits.windowMs / 1000)} s demo window)`,
        {
          retryable: true,
          actionHint: "Wait for the quota window to reset, then retry manually",
          retryAfterMs,
        },
      );
      this.logEvent(provider, "SYNC_FAILED", "Rate limited - quota window exhausted");
      return fail(
        429,
        "RATE_LIMITED",
        `Rate limit reached for ${provider.name} - retry after the quota window`,
        retryAfterMs,
      );
    }
    limits.count += 1;
    return null;
  }

  private requireConnected(provider: ProviderRuntime): Fail | null {
    // Status is the source of truth — several connected data feeds (market
    // data, economic sample, charting) operate without stored credentials.
    if (provider.status === "DISCONNECTED") {
      return fail(409, "NOT_CONNECTED", `${provider.name} is not connected - connect it first`);
    }
    if (provider.status === "AUTH_REQUIRED") {
      return fail(
        409,
        "AUTH_REQUIRED",
        `${provider.name} needs reauthorization - rotate the key and reconnect`,
      );
    }
    return null;
  }

  // ── §5 Overview ────────────────────────────────────────────────────────────

  overview(): IntegrationsOverviewResponse {
    const summary = emptySummary();
    for (const provider of this.providers.values()) {
      switch (provider.status) {
        case "CONNECTED":
          summary.connected += 1;
          break;
        case "SYNCING":
          summary.syncing += 1;
          break;
        case "DEGRADED":
          summary.degraded += 1;
          break;
        case "DISCONNECTED":
          summary.disconnected += 1;
          break;
        case "AUTH_REQUIRED":
          summary.authRequired += 1;
          break;
        case "ERROR":
          summary.error += 1;
          break;
      }
    }
    return {
      summary,
      providers: [...this.providers.values()].map(({ secret, rateLimit, scenario, syncCounter, cursor, ...public_ }) => {
        void secret;
        void rateLimit;
        void scenario;
        void syncCounter;
        return { ...public_, sync: { ...public_.sync, cursor } };
      }),
      accounts: this.accounts.map((account) => ({
        ...account,
        lastSyncAt: this.providers.get(account.providerId)?.sync.lastSuccessAt ?? null,
      })),
      ecoEvents: [...this.ecoEvents].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
      news: [...this.news].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
      webhooks: this.webhooks.map(({ secret, lastAcceptedEventId, ...public_ }) => {
        void secret;
        void lastAcceptedEventId;
        return { ...public_, deliveries: [...public_.deliveries].slice(-12) };
      }),
      events: [...this.events].slice(-30).reverse(),
      errors: [...this.errors].slice(-12).reverse(),
      retention: { ...this.retention },
    };
  }

  // ── §25–§27 Lifecycle ──────────────────────────────────────────────────────

  connect(providerId: string, input: IntegrationConnectInput): Result<IntegrationProvider> {
    const provider = this.providers.get(providerId);
    if (provider === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");
    // §29 gate — an unverified provider cannot be connected at all.
    if (!provider.licensing.verified) {
      return fail(
        422,
        "LICENSE_UNVERIFIED",
        `${provider.name} cannot be connected: licensing review has not passed (§29)`,
      );
    }
    if (provider.status === "CONNECTED" && provider.credentials !== null) {
      return fail(409, "ALREADY_CONNECTED", `${provider.name} is already connected`);
    }

    provider.credentials = {
      vaultRef: input.vaultRef,
      maskedHint: `••••${input.vaultRef.slice(-4)}`,
      expiresAt: null,
      lastRotatedAt: nowIso(),
    };
    provider.secret = `${providerId}-secret-${input.vaultRef.slice(-6)}`;
    provider.authState = "OK";
    provider.connectedAt = nowIso();

    // §32 deterministic demo: cTrader's FIRST pairing ships an expired key.
    if (provider.id === "ctrader" && !provider.pairedOnce) {
      provider.pairedOnce = true;
      provider.scenario = "expired-credentials";
      provider.authState = "EXPIRED";
      provider.status = "AUTH_REQUIRED";
    } else {
      provider.scenario = null;
      provider.status = "CONNECTED";
    }

    this.clearError(providerId, "CREDENTIALS_EXPIRED");
    this.logEvent(
      provider,
      provider.status === "AUTH_REQUIRED" ? "TEST_FAILED" : "CONNECTED",
      provider.status === "AUTH_REQUIRED"
        ? "Paired, but the stored credential is expired - reauthorization required"
        : `Connected via ${input.vaultRef} - read-only scope`,
    );
    return ok(this.publicView(provider));
  }

  disconnect(providerId: string): Result<IntegrationDisconnectResponse> {
    const provider = this.providers.get(providerId);
    if (provider === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");
    if (provider.status === "DISCONNECTED") {
      return fail(409, "NOT_CONNECTED", `${provider.name} is already disconnected`);
    }
    // §26 — disconnecting must not silently delete historical data.
    provider.status = "DISCONNECTED";
    provider.authState = "MISSING";
    provider.credentials = null;
    provider.secret = null;
    provider.scenario = null;
    provider.sync.nextRetryAt = null;
    this.clearError(providerId);
    this.logEvent(
      provider,
      "DISCONNECTED",
      "Disconnected - synced history retained, credentials revoked from the vault",
    );
    return ok({ providerId, status: provider.status, historyPreserved: true });
  }

  /** §27 — safe connection test. Never creates trades or orders. */
  test(providerId: string): Result<IntegrationTestResponse> {
    const provider = this.providers.get(providerId);
    if (provider === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");

    const authOk = provider.credentials !== null && provider.scenario !== "expired-credentials";
    const checks: IntegrationTestResponse["checks"] = [
      {
        name: "authentication",
        ok: authOk,
        detail: authOk
          ? "Vault credential accepted"
          : provider.credentials === null
            ? "No credential stored - connect the provider first"
            : "Stored credential is expired - rotate the key and reconnect",
      },
      {
        name: "permissions",
        ok: provider.capabilities.length > 0,
        detail:
          provider.capabilities.length > 0
            ? `Scoped: ${provider.capabilities.join(", ")}`
            : "No data permissions - visualization only",
      },
      {
        name: "connectivity",
        ok: provider.latencyMs === null ? authOk : true,
        detail:
          provider.latencyMs === null
            ? "Endpoint unreachable until credentials are valid"
            : `Reachable - ${provider.latencyMs} ms round trip`,
      },
      {
        name: "providerResponse",
        ok: authOk,
        detail: authOk
          ? "Schema-valid response against the provider contract"
          : "Rejected - the provider answered with an auth error",
      },
    ];

    const allOk = checks.every((check) => check.ok);
    if (allOk) {
      this.clearError(providerId, "AUTH_FAILED");
      this.clearError(providerId, "CREDENTIALS_EXPIRED");
      if (provider.status === "AUTH_REQUIRED" || provider.status === "ERROR") {
        provider.status = "CONNECTED";
        provider.authState = "OK";
        this.logEvent(provider, "RECOVERED", "Connection test passed - provider recovered");
      } else {
        this.logEvent(provider, "TEST_OK", "Connection test passed (auth, permissions, connectivity)");
      }
    } else {
      provider.status = "AUTH_REQUIRED";
      provider.authState = "EXPIRED";
      this.logError(provider, "CREDENTIALS_EXPIRED", "Connection test failed: stored credential expired", {
        retryable: true,
        actionHint: "Rotate the key in the Security vault, then reconnect",
      });
      this.logEvent(provider, "TEST_FAILED", "Connection test failed - credentials expired");
    }
    return ok({ ok: allOk, checks });
  }

  // ── §13/§16/§17 Synchronization ────────────────────────────────────────────

  sync(providerId: string, nowMs: number): Result<IntegrationSyncResponse> {
    const provider = this.providers.get(providerId);
    if (provider === undefined) return fail(404, "UNKNOWN_PROVIDER", "Unknown provider");

    const notConnected = this.requireConnected(provider);
    if (notConnected !== null) return notConnected;

    const rateLimited = this.rateLimitCheck(provider, nowMs);
    if (rateLimited !== null) return rateLimited;

    provider.syncCounter += 1;
    provider.sync.lastAttemptedAt = nowIso();
    const wasDegraded = provider.status === "DEGRADED" || provider.authState === "EXPIRED";
    provider.status = "SYNCING";
    const durationMs = 320 + (provider.syncCounter * 137) % 640;

    // §15 deterministic partial-sync beat: every 5th macro sync drops one record.
    const partial =
      provider.kind === "ECONOMIC" && provider.syncCounter % 5 === 0;

    const batch = provider.kind === "ECONOMIC" ? (this.ecoCursorBatch += 1) : null;
    const processed = this.runIncrementalSync(provider, nowMs, partial, batch);
    provider.sync.lastDurationMs = durationMs;
    if (batch !== null) provider.sync.cursor = `batch-${batch}`;
    provider.sync.recordsProcessed += processed;
    provider.sync.recordsFailed = partial ? 1 : 0;

    if (partial) {
      provider.sync.retryCount += 1;
      provider.sync.nextRetryAt = new Date(nowMs + backoffDelayMs(provider.sync.retryCount)).toISOString();
      provider.status = "DEGRADED";
      this.logError(provider, "PARTIAL_SYNC", "Incremental sync completed with 1 failed record", {
        retryable: true,
        actionHint: "Retry the sync - the cursor resumes where it stopped",
      });
      this.logEvent(provider, "DEGRADED", "Partial sync - 1 record failed, cursor retained");
    } else {
      provider.sync.lastSuccessAt = nowIso();
      provider.sync.retryCount = 0;
      provider.sync.nextRetryAt = null;
      provider.sync.recordsFailed = 0;
      provider.status = "CONNECTED";
      provider.authState = "OK";
      if (wasDegraded) {
        this.clearError(providerId);
        this.logEvent(provider, "RECOVERED", "Sync healthy again - provider fully operational");
      } else {
        this.logEvent(
          provider,
          "SYNCED",
          `Incremental sync ok - ${processed} record(s) in ${durationMs} ms (cursor ${provider.sync.cursor ?? "n/a"})`,
        );
      }
    }

    this.pruneRetention(nowMs);
    return ok({ providerId, status: provider.status, sync: { ...provider.sync } });
  }

  /** Provider-specific incremental surface (§13 cursor + §14 idempotency). */
  private runIncrementalSync(
    provider: ProviderRuntime,
    nowMs: number,
    partial: boolean,
    batch: number | null,
  ): number {
    switch (provider.kind) {
      case "ECONOMIC": {
        // A "provider batch" updates one past event with its actual release
        // and schedules one new event. Upserts are idempotent by providerKey.
        const rng = mulberry32(0x517c + (batch ?? 0));
        let processed = 0;
        const pending = this.ecoEvents.find(
          (event) => event.status === "SCHEDULED" && Date.parse(event.scheduledAt) <= nowMs,
        );
        if (pending !== undefined) {
          pending.actual = pending.forecast === null ? null : pending.forecast;
          pending.status = "RELEASED";
          processed += 1;
        }
        const day = 86_400_000;
        const lastScheduled = [...this.ecoEvents]
          .filter((event) => Date.parse(event.scheduledAt) > nowMs)
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
        const anchor = lastScheduled !== undefined ? Date.parse(lastScheduled.scheduledAt) : nowMs + day;
        const key = idempotencyKey("macro-sample", `MACRO-batch${batch ?? 0}`);
        if (!this.seenKeys.has(key)) {
          this.seenKeys.add(key);
          this.ecoEvents.push({
            id: uuid(rng),
            providerKey: key,
            providerId: "macro-sample",
            title: "US Nonfarm Payrolls",
            country: "United States",
            currency: "USD",
            impact: "HIGH",
            scheduledAt: new Date(anchor + day).toISOString(),
            previous: "216",
            forecast: "221",
            actual: null,
            status: "SCHEDULED",
          });
          processed += 1;
        }
        if (partial) processed += 0; // the failed record never lands
        return processed;
      }
      case "MARKET_DATA": {
        // Tick ingestion is counted, deduped by stream cursor, never stored raw.
        const processed = 96 + provider.syncCounter * 8;
        return processed;
      }
      case "BROKER":
      case "EXCHANGE": {
        // Account snapshot refresh — nulls stay nulls until the adapter sends
        // real numbers (honesty rule: never invent balance/equity).
        return 1;
      }
      default:
        // CHARTING ping, NOTIFICATION/EXTERNAL without a data surface.
        return 0;
    }
  }

  /** §28 retention pruning — news outlives its window, logs are trimmed. */
  private pruneRetention(nowMs: number) {
    const newsTtlMs = this.retention.newsDays * 86_400_000;
    this.news = this.news.filter(
      (item) => !item.sample || nowMs - Date.parse(item.publishedAt) <= newsTtlMs,
    );
    const logTtlMs = this.retention.syncLogsDays * 86_400_000;
    this.events = this.events.filter(
      (event) => nowMs - Date.parse(event.occurredAt) <= logTtlMs * 3, // keep visible history a bit longer in demo
    );
  }

  // ── §12 Webhook pipeline ───────────────────────────────────────────────────

  async simulateWebhook(
    endpointId: string,
    input: WebhookSimulateInput,
    nowMs: number,
  ): Promise<Result<WebhookDeliverResponse>> {
    const hook = this.webhooks.find((candidate) => candidate.id === endpointId);
    if (hook === undefined) return fail(404, "UNKNOWN_WEBHOOK", "Unknown webhook endpoint");

    const replay = input.mode === "replay" && hook.lastAcceptedEventId !== null;
    const eventId =
      input.mode === "replay" && hook.lastAcceptedEventId !== null
        ? hook.lastAcceptedEventId
        : `evt-${Math.abs(Math.floor(Math.sin(nowMs) * 1e9))}-${input.eventType}`;
    const timestamp = input.mode === "stale-timestamp" ? nowMs - 30 * 60_000 : nowMs;
    const rawBody = `${timestamp}.${JSON.stringify({ eventId, eventType: input.eventType, payload: input.payload })}`;
    const signature = await this.hmac(hook.secret, rawBody);
    const providedSignature = input.mode === "bad-signature" ? `0${signature.slice(1)}` : signature;

    // Pipeline step 1 — timestamp freshness (replay protection).
    if (!isWebhookTimestampFresh(timestamp, nowMs)) {
      this.recordDelivery(hook, input.eventType, false, false, false, "Rejected: timestamp outside the replay window");
      return ok({
        accepted: false,
        duplicate: false,
        signatureValid: true,
        message: "Rejected - timestamp outside the replay window",
      });
    }
    // Pipeline step 2 — signature verification.
    if (providedSignature !== signature) {
      this.recordDelivery(hook, input.eventType, false, false, false, "Rejected: invalid signature");
      this.logEvent(this.providers.get(hook.providerId)!, "WEBHOOK_REJECTED", "Webhook rejected - invalid signature");
      return ok({
        accepted: false,
        duplicate: false,
        signatureValid: false,
        message: "Rejected - invalid signature",
      });
    }
    // Pipeline step 3 — idempotency (§14).
    const key = idempotencyKey(hook.providerId, eventId);
    if (this.seenKeys.has(key) && !replay) {
      this.recordDelivery(hook, input.eventType, true, false, false, "Accepted but already processed");
      return ok({ accepted: false, duplicate: false, signatureValid: true, message: "Duplicate event - ignored" });
    }
    if (replay) {
      this.recordDelivery(hook, input.eventType, true, true, true, "Duplicate delivery ignored (idempotent)");
      this.logEvent(this.providers.get(hook.providerId)!, "WEBHOOK_DUPLICATE", "Replayed delivery ignored - idempotency held");
      return ok({
        accepted: false,
        duplicate: true,
        signatureValid: true,
        message: "Duplicate - the event was already processed",
      });
    }

    // Accepted → apply the real-time event update (§22) idempotently.
    this.seenKeys.add(key);
    hook.lastAcceptedEventId = eventId;
    const payload = input.payload as Record<string, unknown>;
    // The sender references the normalized record by its full provider key.
    const providerKey = typeof payload.eventRef === "string" ? payload.eventRef : idempotencyKey(hook.providerId, eventId);
    const target = this.ecoEvents.find((event) => event.providerKey === providerKey);
    if (target !== undefined && typeof payload.actual === "string") {
      target.actual = String(payload.actual);
      target.status = "UPDATED";
    }
    this.recordDelivery(hook, input.eventType, true, true, false, "Signature verified - event applied");
    this.logEvent(this.providers.get(hook.providerId)!, "WEBHOOK_RECEIVED", `Webhook accepted - ${input.eventType} applied in real time`);
    return ok({
      accepted: true,
      duplicate: false,
      signatureValid: true,
      message: "Accepted - event applied",
    });
  }

  private recordDelivery(
    hook: WebhookRuntime,
    eventType: string,
    signatureValid: boolean,
    accepted: boolean,
    duplicate: boolean,
    message: string,
  ) {
    hook.deliveries.push({
      id: uuid(mulberry32(Date.now() & 0xffff)),
      receivedAt: nowIso(),
      eventType,
      signatureValid,
      accepted,
      duplicate,
      message: sanitizeSecrets(message, [hook.secret]),
    });
    if (hook.deliveries.length > 12) hook.deliveries.splice(0, hook.deliveries.length - 12);
  }

  private async hmac(secret: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // ── Cross-module surface ───────────────────────────────────────────────────

  /** GET /eco-events keeps its exact wire shape — now provider-fed (§22). */
  listEcoEventsForCalendar() {
    return {
      events: this.ecoEvents.map((event) => ({
        id: event.id,
        title: event.title,
        currency: event.currency,
        impact: event.impact,
        scheduledAt: event.scheduledAt,
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous,
      })),
    };
  }

  /** §23 — compact health rows for the Monitoring module. */
  healthRows() {
    return [...this.providers.values()].map((provider) => ({
      id: provider.id,
      name: provider.name,
      status: provider.status,
      latencyMs: provider.latencyMs,
      lastSuccessAt: provider.sync.lastSuccessAt,
      authState: provider.authState,
    }));
  }

  private publicView(provider: ProviderRuntime): IntegrationProvider {
    const { secret, rateLimit, scenario, syncCounter, cursor, ...public_ } = provider;
    void secret;
    void rateLimit;
    void scenario;
    void syncCounter;
    return { ...public_, sync: { ...public_.sync, cursor } };
  }
}

export const integrationEngine = new IntegrationEngine(Date.now());
export type { IntegrationEngine };

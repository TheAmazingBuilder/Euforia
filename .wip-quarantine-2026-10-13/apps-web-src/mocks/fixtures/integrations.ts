import type { NewsItem, ProviderCatalogEntry } from "@cosmoz/shared";

import { mulberry32, uuid, int, type Rng } from "./random";

/**
 * Integrations fixtures (t49 — Integration Hub).
 *
 * The provider catalog is STATIC data: what a provider is, which scopes it
 * needs, its licensing posture, retention and retry policy. Runtime status
 * lives in the store (see store.integrations section). Everything here is
 * deterministic — same seed, same catalog, same headlines.
 */

// ── Provider catalog ─────────────────────────────────────────────────────────

export const INTEGRATION_PROVIDERS: ProviderCatalogEntry[] = [
  {
    id: "mt5",
    name: "MetaTrader 5",
    vendor: "MetaQuotes",
    category: "TRADING_ACCOUNT",
    tagline: "Broker account adapter — positions, orders, executions.",
    description:
      "Connects an MT5 account through the read-only broker adapter. Positions, orders, executions, balance and equity are normalized into the journal domain and streamed to Session Live. Nothing here can place or modify an order.",
    scopes: ["READ_ACCOUNT", "READ_POSITIONS", "READ_ORDERS", "READ_EXECUTIONS"],
    capabilities: ["accounts", "positions", "orders", "executions", "balance", "equity"],
    credentialFields: [
      { key: "login", label: "Login", secret: false, placeholder: "5031 234 567", help: "Account number — demo accounts work with the mock adapter." },
      { key: "password", label: "Investor password", secret: true, placeholder: "••••••••••", help: "Investor (read-only) password — execution is impossible by design." },
      { key: "server", label: "Server", secret: false, placeholder: "MetaQuotes-Demo", help: null },
    ],
    licensing: { level: "OWN_DATA", note: "Your own account data — no redistribution constraints." },
    retention: "Sync logs 30d · executions retained in journal indefinitely",
    rateLimit: "60 req/min sustained, burst 120",
    retryPolicy: "Exponential backoff 2s→60s, max 5 attempts, dead-letter after",
    docsUrl: null,
  },
  {
    id: "ctrader",
    name: "Deriv cTrader",
    vendor: "Deriv",
    category: "BROKER",
    tagline: "Broker adapter for cTrader open-API accounts.",
    description:
      "Same normalized contract as the MT5 adapter: accounts, positions, orders, executions. The adapter preserves provider-specific metadata (symbol IDs, lot math) so the journal never guesses.",
    scopes: ["READ_ACCOUNT", "READ_POSITIONS", "READ_ORDERS", "READ_EXECUTIONS"],
    capabilities: ["accounts", "positions", "orders", "executions"],
    credentialFields: [
      { key: "client_id", label: "Client ID", secret: false, placeholder: "cosmoz_ro_client", help: null },
      { key: "client_secret", label: "Client secret", secret: true, placeholder: "••••••••••", help: null },
    ],
    licensing: { level: "OWN_DATA", note: "Your own account data — no redistribution constraints." },
    retention: "Sync logs 30d · executions retained in journal indefinitely",
    rateLimit: "50 req/min",
    retryPolicy: "Exponential backoff 2s→60s, max 5 attempts",
    docsUrl: null,
  },
  {
    id: "binance",
    name: "Binance",
    vendor: "Binance",
    category: "EXCHANGE",
    tagline: "Exchange account adapter — spot balances and fills.",
    description:
      "Read-only exchange account via API keys. Balances, fills and open orders are normalized; provider metadata (weights, recvWindow) is preserved for observability.",
    scopes: ["READ_ACCOUNT", "READ_POSITIONS", "READ_EXECUTIONS"],
    capabilities: ["balances", "fills", "open-orders"],
    credentialFields: [
      { key: "api_key", label: "API key", secret: false, placeholder: "AbC1xY…", help: "Enable read only — withdrawals are never requested." },
      { key: "api_secret", label: "API secret", secret: true, placeholder: "••••••••••", help: null },
    ],
    licensing: { level: "OWN_DATA", note: "Your own account data — no redistribution constraints." },
    retention: "Sync logs 30d · fills retained in journal indefinitely",
    rateLimit: "Weight budget 1200/min, honored via Retry-After",
    retryPolicy: "Exponential backoff 1s→30s, max 4 attempts",
    docsUrl: null,
  },
  {
    id: "market-feed",
    name: "Cosmoz Market Feed",
    vendor: "Binance + SIM",
    category: "MARKET_DATA",
    tagline: "Ticks, candles, volume and sessions for the chart stack.",
    description:
      "Independent market-data provider that powers Session Live quotes and the candlestick chart. Real Binance streams where available, honest SIM fallback otherwise — the feed badge always says which.",
    scopes: ["READ_MARKET_DATA"],
    capabilities: ["tick", "ohlc", "volume", "spread", "sessions"],
    credentialFields: [],
    licensing: { level: "ALLOWED", note: "Market display inside the product — no redistribution beyond the workspace." },
    retention: "Candles 30d rolling · ticks not persisted",
    rateLimit: "Streaming + 2s polling fallback",
    retryPolicy: "Reconnect with jitter, polling fallback after 3.5s",
    docsUrl: null,
  },
  {
    id: "macro-calendar",
    name: "MacroWire Economic Calendar",
    vendor: "MacroWire",
    category: "ECONOMIC_DATA",
    tagline: "Real economic events — previous, forecast, actual, impact.",
    description:
      "Dedicated economic-data integration. Events are normalized to (date, time, country, currency, event, previous, forecast, actual, impact) and feed the Calendar screen. Scheduled releases, updates and actuals are idempotent on provider event IDs.",
    scopes: ["READ_ECONOMIC_DATA"],
    capabilities: ["scheduled-events", "updates", "actuals", "history"],
    credentialFields: [
      { key: "api_key", label: "API key", secret: true, placeholder: "mw_live_••••", help: null },
    ],
    licensing: { level: "RESTRICTED", note: "Display inside the workspace only — no commercial redistribution." },
    retention: "Events 90d rolling",
    rateLimit: "1 req/min refresh, updates pushed",
    retryPolicy: "Exponential backoff 5s→120s, max 5 attempts",
    docsUrl: null,
  },
  {
    id: "news-wire",
    name: "MacroWire News",
    vendor: "MacroWire",
    category: "MARKET_NEWS",
    tagline: "Headlines and stories — forex, gold, crypto, macro.",
    description:
      "Financial news feed kept strictly separate from the economic calendar. Items carry source, category, related symbols and importance. Storage and display respect the provider's redistribution terms.",
    scopes: ["READ_NEWS"],
    capabilities: ["headlines", "articles", "categories", "related-symbols"],
    credentialFields: [
      { key: "api_key", label: "API key", secret: true, placeholder: "mw_live_••••", help: null },
    ],
    licensing: { level: "RESTRICTED", note: "Internal journal display only — redistribution prohibited by provider terms." },
    retention: "Headlines 7d rolling",
    rateLimit: "30 req/min",
    retryPolicy: "Exponential backoff 2s→60s, max 4 attempts",
    docsUrl: null,
  },
  {
    id: "tradingview",
    name: "TradingView Widgets",
    vendor: "TradingView",
    category: "CHARTING",
    tagline: "Chart visualization — never the source of truth for positions.",
    description:
      "TradingView is used for visualization and market display only. Broker/exchange integrations remain the single source of truth for positions, executions and account state; charts can never edit them.",
    scopes: ["READ_MARKET_DATA"],
    capabilities: ["chart-embed", "symbol-search", "theme-sync"],
    credentialFields: [],
    licensing: { level: "ALLOWED", note: "Attribution rendered with the widget per TradingView terms." },
    retention: "No storage — embed only",
    rateLimit: "Client-side embed",
    retryPolicy: "n/a — static embed",
    docsUrl: null,
  },
  {
    id: "telegram-bot",
    name: "Telegram Bot",
    vendor: "Telegram",
    category: "COMMUNICATION",
    tagline: "Trade alerts and daily summaries in your pocket.",
    description:
      "A first-class communication provider. You bring the bot token and the chat that receives the messages; Cosmoz fans discipline alerts, trade outcomes and session limits out through the Bot API. The bot only sends — it can never read journal data, and revoking the token never touches history.",
    scopes: ["SEND_NOTIFICATIONS"],
    capabilities: ["trade-alerts", "daily-summary", "rule-violations", "ghost-checkins", "markdown-rendering"],
    credentialFields: [
      { key: "bot_token", label: "Bot token", secret: true, placeholder: "7284912••••:AAH••••••••••", help: "From @BotFather — stored encrypted, never echoed." },
      { key: "chat_id", label: "Chat ID", secret: false, placeholder: "-1002345678901 ou @mon_canal", help: "Numeric chat id or @channelname — send /start to the bot once so it can reach you." },
    ],
    licensing: { level: "OWN_DATA", note: "Your own alerts to your own chats — no third-party constraints." },
    retention: "Delivery logs 14d · message content never persisted",
    rateLimit: "30 msg/min per chat (Telegram hard cap), queued",
    retryPolicy: "3 attempts 2s→10s, then skipped with a WARN — never infinite",
    docsUrl: null,
  },
  {
    id: "discord",
    name: "Discord",
    vendor: "Discord",
    category: "COMMUNICATION",
    tagline: "Rich-embed alerts straight into your server channels.",
    description:
      "Connect a server through a webhook URL (or bot token) and receive rich-embed alerts: trade closed with R multiple, rule violations flagged, session limits hit. Deliveries are idempotent on event IDs — a retried webhook never posts twice.",
    scopes: ["SEND_NOTIFICATIONS"],
    capabilities: ["rich-embeds", "trade-alerts", "session-limits", "role-mentions", "thread-delivery"],
    credentialFields: [
      { key: "webhook_url", label: "Webhook URL", secret: true, placeholder: "https://discord.com/api/webhooks/…", help: "Server settings → Integrations → Webhooks. The URL embeds the token — masked and encrypted." },
      { key: "bot_token", label: "Bot token (optionnel)", secret: true, placeholder: "MTIzNDU2••••••••••••", help: "Only for threaded delivery or role mentions — leave empty to use the webhook alone." },
    ],
    licensing: { level: "OWN_DATA", note: "Your own alerts to your own server — no third-party constraints." },
    retention: "Delivery logs 14d · embed payloads not persisted",
    rateLimit: "5 msg/2s per webhook, burst-queued",
    retryPolicy: "3 attempts 2s→10s honoring 429 Retry-After",
    docsUrl: null,
  },
  {
    id: "slack",
    name: "Slack",
    vendor: "Salesforce",
    category: "COMMUNICATION",
    tagline: "Incoming-webhook alerts into a workspace channel.",
    description:
      "One-way Slack incoming webhook. The same normalized alert payload renders as a Block Kit message; broken or revoked URLs surface as ERROR — never silently dropped. Idempotent on event IDs like every communication provider.",
    scopes: ["SEND_NOTIFICATIONS"],
    capabilities: ["block-kit", "trade-alerts", "daily-summary", "workflow-links"],
    credentialFields: [
      { key: "webhook_url", label: "Incoming webhook URL", secret: true, placeholder: "https://hooks.slack.com/services/T•••/B•••/•••", help: "Slack app → Incoming Webhooks → copy the URL. Masked and encrypted at rest." },
    ],
    licensing: { level: "OWN_DATA", note: "Your own alerts to your own workspace — no third-party constraints." },
    retention: "Delivery logs 14d · payloads not persisted",
    rateLimit: "1 msg/sec sustained, burst 20",
    retryPolicy: "3 attempts 2s→10s, then skipped with a WARN",
    docsUrl: null,
  },
  {
    id: "notify-relay",
    name: "Notification Relay",
    vendor: "Cosmoz",
    category: "NOTIFICATIONS",
    tagline: "Email and generic webhook pushes — the fan-out router.",
    description:
      "Routes discipline alerts, ghost check-ins and economic reminders to relay-owned channels (email, generic webhook push). Platform destinations — Telegram, Discord, Slack — are first-class providers in the Communication tab; the relay fans events out to whatever adapters are connected.",
    scopes: ["SEND_NOTIFICATIONS"],
    capabilities: ["email", "webhook-push", "fan-out"],
    credentialFields: [],
    licensing: { level: "OWN_DATA", note: "Your own alerts — no third-party constraints." },
    retention: "Delivery logs 14d",
    rateLimit: "Rate-limited per channel to protect quotas",
    retryPolicy: "3 attempts, 10s apart, per channel",
    docsUrl: null,
  },
  {
    id: "sheets-sync",
    name: "Google Sheets Sync",
    vendor: "Google",
    category: "EXTERNAL_SERVICE",
    tagline: "Mirror closed trades into a spreadsheet.",
    description:
      "One-way export of closed trades to a Google Sheet. OAuth token expired tokens surface as AUTH_REQUIRED — reconnect without losing any journal data.",
    scopes: ["EXPORT_BACKUP"],
    capabilities: ["export-closed-trades"],
    credentialFields: [],
    licensing: { level: "OWN_DATA", note: "Your own data to your own sheet." },
    retention: "n/a — one-way export",
    rateLimit: "Nightly batch",
    retryPolicy: "Reauthorize on 401 — no silent retries",
    docsUrl: null,
  },
  {
    id: "vault-backup",
    name: "S3 Vault Backup",
    vendor: "AWS",
    category: "EXTERNAL_SERVICE",
    tagline: "Encrypted JSON snapshots of the journal.",
    description:
      "Pushes the JSON backup (feature 12 format) to an S3 bucket you own. Server-side encryption required; keys stay yours.",
    scopes: ["EXPORT_BACKUP"],
    capabilities: ["json-snapshots", "schedule"],
    credentialFields: [
      { key: "bucket", label: "Bucket URI", secret: false, placeholder: "s3://cosmoz-backups", help: null },
      { key: "access_key", label: "Access key", secret: true, placeholder: "AKIA…", help: null },
      { key: "secret_key", label: "Secret key", secret: true, placeholder: "••••••••••", help: null },
    ],
    licensing: { level: "OWN_DATA", note: "Your own storage, your own keys." },
    retention: "Nightly snapshot · 30 versions",
    rateLimit: "1 upload/day + manual",
    retryPolicy: "Exponential backoff 10s→5m, max 3 attempts",
    docsUrl: null,
  },
  {
    id: "zapier",
    name: "Zapier",
    vendor: "Zapier",
    category: "EXTERNAL_SERVICE",
    tagline: "Wire journal events into 6,000+ apps.",
    description:
      "Outbound zaps on journal events (trade closed, rule breach, ghost settled). Events are signed and idempotent; a broken hook URL surfaces as ERROR until you fix it.",
    scopes: ["EXPORT_BACKUP"],
    capabilities: ["outbound-zaps"],
    credentialFields: [
      { key: "hook_url", label: "Zap hook URL", secret: false, placeholder: "https://hooks.zapier.com/…", help: null },
    ],
    licensing: { level: "OWN_DATA", note: "Your own events to your own zaps." },
    retention: "Delivery logs 14d",
    rateLimit: "Event-driven",
    retryPolicy: "Exponential backoff 30s→15m, max 5 attempts, dead-letter",
    docsUrl: null,
  },
  {
    id: "inbound-webhooks",
    name: "Inbound Webhooks",
    vendor: "Cosmoz",
    category: "EXTERNAL_SERVICE",
    tagline: "Signed inbound events — verified, replay-safe, idempotent.",
    description:
      "Receives signed events from external providers. Every delivery is authenticated (HMAC-SHA256), timestamp-checked (±5 min), replay-protected and idempotent on event IDs. Invalid payloads never touch journal data.",
    scopes: [],
    capabilities: ["hmac-verification", "replay-protection", "idempotency", "event-log"],
    credentialFields: [],
    licensing: { level: "OWN_DATA", note: "Your own ingestion endpoint." },
    retention: "Event log 14d",
    rateLimit: "60 deliveries/min",
    retryPolicy: "n/a — callers retry; dead-letter after 5",
    docsUrl: null,
  },
];

/** Fixed initial status per provider — covers all six §5 lifecycle states. */
export const INITIAL_PROVIDER_STATUS: Record<string, { status: string; note?: string }> = {
  mt5: { status: "DISCONNECTED" },
  ctrader: { status: "DISCONNECTED" },
  binance: { status: "DISCONNECTED" },
  "market-feed": { status: "CONNECTED" },
  "macro-calendar": { status: "CONNECTED" },
  "news-wire": { status: "DEGRADED", note: "Upstream latency elevated — retries active with backoff." },
  tradingview: { status: "CONNECTED" },
  "telegram-bot": { status: "DISCONNECTED" },
  discord: { status: "CONNECTED" },
  slack: { status: "DISCONNECTED" },
  "notify-relay": { status: "CONNECTED" },
  "sheets-sync": { status: "AUTH_REQUIRED", note: "OAuth token expired — reauthorize to resume nightly exports." },
  "vault-backup": { status: "CONNECTED" },
  zapier: { status: "ERROR", note: "Webhook target returned 404 — verify the hook URL." },
  "inbound-webhooks": { status: "CONNECTED" },
};

/** Stable latency sparkline per provider — degraded feeds show elevated tails. */
export function latencySeries(providerId: string, degraded = false): number[] {
  let seed = 0;
  for (const ch of providerId) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rng: Rng = mulberry32(seed ^ 0x49);
  const points: number[] = [];
  for (let i = 0; i < 24; i += 1) {
    const base = degraded ? 220 : 42;
    const spike = degraded && rng() < 0.3 ? int(rng, 120, 460) : 0;
    points.push(base + Math.round(rng() * (degraded ? 180 : 70)) + spike);
  }
  return points;
}

// ── Market news fixtures (deterministic per day) ─────────────────────────────

interface NewsTemplate {
  headline: string;
  summary: string;
  source: string;
  category: NewsItem["category"];
  symbols: string[];
  currencies: string[];
  importance: NewsItem["importance"];
}

const NEWS_TEMPLATES: NewsTemplate[] = [
  { headline: "Dollar firms as rate-cut bets recede ahead of CPI", summary: "Traders trimmed easing bets after hawkish comments from two Fed officials, lifting the dollar index to a two-week high.", source: "MacroWire", category: "FOREX", symbols: ["EURUSD", "XAUUSD"], currencies: ["USD"], importance: "HIGH" },
  { headline: "Gold holds above 3,300 as yields stall", summary: "Bullion consolidated near multi-month highs with spot demand supported by central-bank buying, dealers said.", source: "Bullion Brief", category: "GOLD", symbols: ["XAUUSD"], currencies: ["USD"], importance: "MEDIUM" },
  { headline: "Bitcoin tops 90k as ETF inflows accelerate", summary: "Spot ETFs logged their largest weekly inflow since launch, with momentum strategies adding to upside pressure.", source: "ChainFeed", category: "CRYPTO", symbols: ["BTCUSDT"], currencies: [], importance: "HIGH" },
  { headline: "ECB's Lagarde: inflation path 'broadly on track'", summary: "The ECB president signalled patience on cuts, pointing to services inflation and wage data due next month.", source: "MacroWire", category: "CENTRAL_BANKS", symbols: ["EURUSD", "DAX40"], currencies: ["EUR"], importance: "HIGH" },
  { headline: "Oil slips as OPEC+ compliance wavers", summary: "Crude gave back early gains after a panel report showed overproduction above the agreed ceiling.", source: "MacroWire", category: "MACRO", symbols: ["USOIL"], currencies: [], importance: "MEDIUM" },
  { headline: "S&P 500 futures flat as earnings season peaks", summary: "Index futures were little changed with megacap tech earnings dominating the tape this week.", source: "Index Daily", category: "EQUITIES", symbols: ["SPX500", "NAS100"], currencies: ["USD"], importance: "LOW" },
  { headline: "Yen intervention watch ramps up as USDJPY tests 158", summary: "Japanese officials repeated they are 'ready to act' as the pair probed levels last seen in July.", source: "FXNewswire", category: "FOREX", symbols: ["USDJPY"], currencies: ["JPY", "USD"], importance: "HIGH" },
  { headline: "Silver industrial demand seen at record", summary: "A deficit outlook for a third straight year underpinned silver, analysts wrote in a quarterly note.", source: "Bullion Brief", category: "GOLD", symbols: ["XAGUSD"], currencies: [], importance: "LOW" },
  { headline: "Ethereum staking yields compress after upgrade", summary: "Post-upgrade validator entries pushed staking yields to an 18-month low, on-chain data showed.", source: "ChainFeed", category: "CRYPTO", symbols: ["ETHUSDT"], currencies: [], importance: "MEDIUM" },
  { headline: "UK wage growth cools less than expected", summary: "Sterling trimmed losses after data showed pay growth excluding bonuses holding above forecasts.", source: "FXNewswire", category: "MACRO", symbols: ["GBPUSD"], currencies: ["GBP"], importance: "MEDIUM" },
  { headline: "Nasdaq leads futures higher on chip demand", summary: "Semiconductor orders beat estimates, pulling tech futures up in early trade.", source: "Index Daily", category: "INDICES", symbols: ["NAS100"], currencies: ["USD"], importance: "MEDIUM" },
  { headline: "FOMC minutes: 'patience' on cuts, balance sheet talk", summary: "Minutes showed members preferred to hold rates while inflation risks linger; balance-sheet runoff discussed.", source: "MacroWire", category: "CENTRAL_BANKS", symbols: ["EURUSD", "SPX500"], currencies: ["USD"], importance: "HIGH" },
  { headline: "Canada CPI surprise lifts loonie", summary: "Headline CPI printed above consensus for a second month, boosting BoC tightening odds.", source: "FXNewswire", category: "MACRO", symbols: ["USDCAD"], currencies: ["CAD"], importance: "MEDIUM" },
  { headline: "Crypto liquidations top $400M in long squeeze", summary: "Leveraged longs were flushed as BTC dropped 4% in an hour before recovering, trackers reported.", source: "ChainFeed", category: "CRYPTO", symbols: ["BTCUSDT", "ETHUSDT"], currencies: [], importance: "HIGH" },
  { headline: "DAX hits record on export optimism", summary: "German equities closed at an all-time high as factory orders beat and energy prices eased.", source: "Index Daily", category: "INDICES", symbols: ["DAX40"], currencies: ["EUR"], importance: "LOW" },
  { headline: "Earnings preview: banks kick off Q3 on strong trading desks", summary: "Fixed-income desks are expected to drive beats as volatility returned to the curve.", source: "Index Daily", category: "EQUITIES", symbols: ["SPX500"], currencies: ["USD"], importance: "LOW" },
];

/** Deterministic headlines for the last 48h — same seed → same tape. */
export function buildNews(nowMs: number): NewsItem[] {
  const rng: Rng = mulberry32(Math.floor(nowMs / 86_400_000) ^ 0x1e75);
  const items: NewsItem[] = [];

  for (let i = 0; i < NEWS_TEMPLATES.length; i += 1) {
    const template = NEWS_TEMPLATES[i]!;
    // Spread across the last 48 hours, newest first; ~7-22 min of drift.
    const ageMinutes = int(rng, 12, 48 * 60);
    const publishedMs = nowMs - ageMinutes * 60_000 - int(rng, 0, 9) * 60_000;
    items.push({
      id: uuid(rng),
      headline: template.headline,
      summary: template.summary,
      source: template.source,
      category: template.category,
      symbols: template.symbols,
      currencies: template.currencies,
      importance: template.importance,
      publishedAt: new Date(publishedMs).toISOString(),
      url: null,
    });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

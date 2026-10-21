// ═══════════════════════════════════════════════════════════════════════════════
// RESTORE EXTENSIONS — domains that were mid-wiring when the previous session
// died (Academy save, Sep 27). Every builder here is deterministic from the
// same seeded fixtures, computes server-side aggregates, and returns payloads
// that satisfy the shared schemas (honest at zero, decimal-string money).
// ═══════════════════════════════════════════════════════════════════════════════

// ── local small helpers ──────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const daysAgoIso = (days: number): string => iso(Date.now() - days * DAY_MS);
const num = (value: string | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);
/** Random integer in [min, max] from a deterministic RNG. */
function int(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
/** Monday key of the week containing the given date key (UTC-anchored). */
function mondayOf(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}
function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}
const MONTH_LABEL_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
function monthLabel(monthKey: string): string {
  return MONTH_LABEL_FMT.format(new Date(`${monthKey}-15T12:00:00Z`));
}
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── mutable state for the new domains ────────────────────────────────────────

/** Broker feeds + import batches (portfolios desk). */
const brokerConnections: BrokerConnectionRow[] = data.accounts
  .filter((account) => account.broker !== "MANUAL")
  .slice(0, 2)
  .map((account, index) => ({
    id: `bc_${account.id.slice(-6)}`,
    userId: user.id,
    accountId: account.id,
    provider: account.broker === "MANUAL" ? "OTHER" : account.broker,
    label: `${account.broker === "MANUAL" ? "Generic" : account.broker} feed — ${account.name}`,
    status: index === 0 ? "ACTIVE" : "ACTIVE",
    autoImport: index === 0,
    lastSyncAt: daysAgoIso(index === 0 ? 0.2 : 2.4),
    createdAt: daysAgoIso(21 - index * 3),
    accountName: account.name,
  }));

const importBatches: ImportBatchRow[] = brokerConnections.map((connection, index) => ({
  id: `batch_${connection.id.slice(-6)}`,
  userId: user.id,
  accountId: connection.accountId,
  source: connection.provider === "DERIV" ? "DERIV_API" : connection.provider === "BINANCE" ? "BINANCE_API" : "MT5_SYNC",
  filename: `auto-import ${connection.provider.toLowerCase()} ${new Date(Date.now() - (index + 1) * 2 * DAY_MS).toISOString().slice(0, 10)}`,
  status: "COMPLETED",
  rowsTotal: index === 0 ? 214 : 96,
  rowsImported: index === 0 ? 214 : 90,
  rowsSkipped: index === 0 ? 0 : 6,
  errorLog: [],
  startedAt: daysAgoIso(index + 1),
  completedAt: daysAgoIso(index + 1),
  accountName: connection.accountName,
}));

/** Journal entries (V1 in-memory; the real API owns persistence). */
const journalEntries: JournalEntry[] = (() => {
  const seeds: { title: string; body: string; tag: string; dayOffset: number }[] = [
    { title: "Patience paid on the BOOM spike", body: "Waited for the NY open range to settle before touching the sizer. Entry was textbook, exit at the planned level. No revenge after the first small red.", tag: "patience", dayOffset: 1 },
    { title: "Checklist saved me from a FOMO entry", body: "The setup looked tempting mid-session but the checklist flagged news in 10 minutes. Skipped it — the move reversed within the hour. Process win, P&L irrelevant.", tag: "checklist", dayOffset: 2 },
    { title: "Stop moved too early on CRASH", body: "I shaded the stop tighter because of a streak of losses. The trade would have survived the wick and hit target. Lesson: size down instead of moving stops.", tag: "leak", dayOffset: 4 },
    { title: "Weekly review — the desk is calm", body: "Three green days out of four, every trade graded the same evening. The discipline band is trending up since I started journaling before the session instead of after.", tag: "review", dayOffset: 6 },
  ];
  return seeds.map((seed, index) => ({
    id: `jrn_${String(index + 1).padStart(4, "0")}`,
    date: dateKeyForOffsetLocal(seed.dayOffset),
    title: seed.title,
    body: seed.body,
    tags: [seed.tag],
    mood: null,
    relatedTradeId: null,
    createdAt: daysAgoIso(seed.dayOffset),
    updatedAt: daysAgoIso(seed.dayOffset),
  }));
})();

function dateKeyForOffsetLocal(offset: number): string {
  return toTradingDateKey(new Date(Date.now() - offset * DAY_MS + 12 * 3_600_000).toISOString(), USER_TZ);
}

/** Editable settings state. */
let riskDefaultsState: RiskDefaults = {
  riskPerTradePct: "0.5",
  maxDailyLossPct: "2",
  maxTradesPerDay: 4,
};
const goalSettingsState: GoalSettings = {
  monthlyPnlTarget: "1200",
  avgRTarget: "0.35",
  winRateTargetPct: 58,
  greenDaysTarget: 15,
  disciplineTargetPct: 80,
  maxTradesPerDay: 4,
  updatedAt: daysAgoIso(3),
};
const journalGoalsState: JournalGoals = { entriesPerDay: 1, entriesPerMonth: 20, entriesPerYear: 240 };

/** Security domain state. */
const securityState = {
  twoFactorEnabled: false,
  passwordLastChangedAt: daysAgoIso(34),
  sessions: [
    { id: "ses_current", device: "Chrome · macOS", location: "Toronto, CA", lastActiveAt: iso(Date.now() - 4 * 60_000), current: true },
    { id: "ses_phone", device: "Safari · iPhone", location: "Toronto, CA", lastActiveAt: daysAgoIso(1.2), current: false },
  ],
  logins: [
    { id: "log_1", at: iso(Date.now() - 4 * 60_000), device: "Chrome · macOS", location: "Toronto, CA", outcome: "success" as const },
    { id: "log_2", at: daysAgoIso(1.2), device: "Safari · iPhone", location: "Toronto, CA", outcome: "success" as const },
    { id: "log_3", at: daysAgoIso(3.4), device: "Unknown · Linux", location: "Lisbon, PT", outcome: "failed" as const },
  ],
  recommendations: [
    { id: "rec_2fa", title: "Enable two-factor authentication", detail: "A second factor blocks 99% of account-takeover attempts.", done: false },
    { id: "rec_pass", title: "Rotate your password quarterly", detail: "Your password is 34 days old — still fresh, plan a rotation.", done: true },
  ],
};

/** Social / community state. */
const socialTraders: SocialTrader[] = [
  { id: "soc_1", handle: "nova_fx", displayName: "Nova · synthetics", avatarHue: 210, assetFocus: "BOOM/CRASH", followers: 128, following: 41 },
  { id: "soc_2", handle: "ironrisk", displayName: "Ironrisk", avatarHue: 150, assetFocus: "Gold", followers: 342, following: 12 },
  { id: "soc_3", handle: "kd_prop", displayName: "K.D. Prop Diary", avatarHue: 25, assetFocus: "Indices", followers: 87, following: 66 },
  { id: "soc_4", handle: "mika_j", displayName: "Mika J.", avatarHue: 285, assetFocus: "Crypto", followers: 219, following: 30 },
];
const followedTraders = new Set<string>(["soc_2"]);
const socialPostsState: SocialPost[] = [
  { id: "sp_1", traderId: "soc_2", handle: "ironrisk", displayName: "Ironrisk", avatarHue: 150, kind: "TRADE_SHARE", text: "Clean London sweep long on XAUUSD, +1.8R, checklist followed to the letter.", isFollowing: true, symbol: "XAUUSD", direction: "BUY", rMultiple: "1.8", pnl: null, likes: 23, likedByMe: false, comments: 4, createdAt: daysAgoIso(0.2) },
  { id: "sp_2", traderId: "soc_1", handle: "nova_fx", displayName: "Nova · synthetics", avatarHue: 210, kind: "MILESTONE", text: "30 days without breaking the daily loss limit. The register works.", isFollowing: false, symbol: null, direction: null, rMultiple: null, pnl: null, likes: 51, likedByMe: true, comments: 9, createdAt: daysAgoIso(1.1) },
  { id: "sp_3", traderId: "soc_3", handle: "kd_prop", displayName: "K.D. Prop Diary", avatarHue: 25, kind: "LESSON", text: "Moving a stop is a decision — grade it like one. My leak this month was exactly there.", isFollowing: false, symbol: null, direction: null, rMultiple: null, pnl: null, likes: 17, likedByMe: false, comments: 3, createdAt: daysAgoIso(2.3) },
];
const socialMeState: SocialMe = {
  handle: "alex_trades",
  displayName: user.name,
  isPublic: false,
  shareUrl: "https://cosmoz.app/u/alex_trades",
  followers: 12,
  following: 34,
  card: {
    netPnlPct: "4.2",
    winRate: "56.3",
    avgR: "0.28",
    disciplineScore: "81",
    totalTrades: num(String(data.trades.length)),
    bestStreak: 6,
    equitySpark: data.trades
      .filter((t) => t.status === "CLOSED")
      .slice(-12)
      .map((t) => num(t.rMultiple)),
    currency: mainAccount.currency,
  },
  publishedAt: null,
};

/** System health (static-ish snapshot with live latency jitter). */
function buildSystemHealth(): SystemHealth {
  const now = Date.now();
  return {
    services: [
      { id: "web", name: "Web app", status: "operational", latencyMs: 42, uptimePct: 99.98, detail: "Next.js app shell and static assets." },
      { id: "api", name: "API (mock)", status: "operational", latencyMs: 18, uptimePct: 99.95, detail: "MSW-backed endpoints in this demo build." },
      { id: "market", name: "Market service", status: "operational", latencyMs: 65, uptimePct: 99.9, detail: "Binance-backed quotes + synthesized fallback." },
      { id: "coach", name: "AI coach", status: "degraded", latencyMs: 950, uptimePct: 98.7, detail: "Higher latency on grounded replies today." },
    ],
    latencySeries: Array.from({ length: 24 }, (_, i) => 30 + Math.round(20 * Math.sin(i / 3) + (i % 5) * 3)),
    windowLabel: "Last 24 hours",
    incidents: [
      { id: "inc_1", serviceId: "coach", title: "Elevated reply latency", severity: "minor", startedAt: iso(now - 3 * 3_600_000), resolvedAt: null },
      { id: "inc_2", serviceId: "market", title: "Candle backfill gap (resolved)", severity: "maintenance", startedAt: iso(now - 26 * 3_600_000), resolvedAt: iso(now - 24 * 3_600_000) },
    ],
    checkedAt: iso(now),
  };
}

/** System integrations — the lightweight demo catalog. */
const systemIntegrationsState: Integration[] = [
  { id: "int_deriv", name: "Deriv API", category: "broker", status: "connected", connectedAt: daysAgoIso(9), description: "Pulls closed positions from your Deriv account into the journal.", detail: "Demo build: simulated sync over the seeded ledger." },
  { id: "int_mt5", name: "MT4 / MT5 bridge", category: "broker", status: "disconnected", connectedAt: null, description: "Reads the MT terminal history and imports trades idempotently.", detail: "Demo build: no terminal is contacted." },
  { id: "int_market", name: "Market data feed", category: "data", status: "connected", connectedAt: daysAgoIso(30), description: "Prices, candles and session volume for Session Live.", detail: "Demo build: Binance-backed quotes via the market service." },
  { id: "int_eco", name: "Economic calendar", category: "data", status: "connected", connectedAt: daysAgoIso(30), description: "High-impact macro events mapped onto your trading days.", detail: "Demo build: deterministic weekly fixture generator." },
  { id: "int_tv", name: "TradingView charts", category: "data", status: "disconnected", connectedAt: null, description: "Embeds pro charting for the replay view — never the source of truth.", detail: "Demo build: charting only, no execution." },
  { id: "int_news", name: "Market news feed", category: "data", status: "disconnected", connectedAt: null, description: "Headlines tagged by asset and importance for the session runner.", detail: "Demo build: provider-ready, not wired to a real vendor." },
  { id: "int_webhook", name: "Webhooks & alerts", category: "automation", status: "disconnected", connectedAt: null, description: "Signed inbound events with replay protection and retries.", detail: "Demo build: signing console is simulated." },
  { id: "int_backup", name: "Cloud backup", category: "productivity", status: "connected", connectedAt: daysAgoIso(2), description: "Nightly JSON snapshot of the journal for disaster recovery.", detail: "Demo build: export lives in your browser storage." },
  { id: "int_pwa", name: "Offline mode", category: "productivity", status: "connected", connectedAt: daysAgoIso(30), description: "Full journal access offline; mutations queue and replay.", detail: "Demo build: service worker + IndexedDB queue." },
];

// ── shared aggregates ────────────────────────────────────────────────────────

const instrumentById = new Map(data.instruments.map((instrument) => [instrument.id, instrument]));
const strategyById = new Map(data.strategies.map((strategy) => [strategy.id, strategy]));
const closedTrades = (): Trade[] =>
  data.trades.filter((trade) => trade.status === "CLOSED" && !trade.deletedAt);
const symbolOf = (trade: Trade): string =>
  instrumentById.get(trade.instrumentId)?.symbol ?? "—";
const strategyNameOf = (trade: Trade): string | null =>
  trade.strategyId ? strategyById.get(trade.strategyId)?.name ?? null : null;
const strategyColorOf = (trade: Trade): string | null =>
  trade.strategyId ? strategyById.get(trade.strategyId)?.color ?? null : null;

function minutesBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
}

/** Week start keys (Mondays) for the last 8 weeks, oldest first. */
function lastNWeekMondays(count: number): string[] {
  const currentMonday = mondayOf(
    toTradingDateKey(new Date().toISOString(), USER_TZ),
  );
  const currentMs = Date.parse(`${currentMonday}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    iso(currentMs - (count - 1 - i) * 7 * DAY_MS).slice(0, 10),
  );
}

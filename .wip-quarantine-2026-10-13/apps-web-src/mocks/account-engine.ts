import type {
  AccountConnectInput,
  AccountConnectResponse,
  AccountDisconnectResponse,
  AccountHistoryResponse,
  AccountOrdersResponse,
  AccountPositionsResponse,
  AccountProvidersResponse,
  AccountSyncResponse,
  AccountTestInput,
  AccountTestResponse,
  AccountTestStep,
  AccountUpdateInput,
  BrokerOrder,
  BrokerPosition,
  ConnectedAccountDetailResponse,
  ConnectedAccountsOverviewResponse,
  ConnectedAccountView,
  TradingAccountSnapshot,
  TradingAccountHistoryEntry,
} from "@cosmoz/shared";
import {
  accountConnectInputSchema,
  accountTestInputSchema,
  accountUpdateInputSchema,
} from "@cosmoz/shared";

import {
  deriveSyncStatus,
  initialSnapshotBalance,
  maskTail,
  simulateConnectionTest,
} from "@/lib/accounts/accounts";
import { MockError, mockStore } from "./store";

/**
 * Accounts engine — the mock connectivity layer of the ACCOUNT-CENTRIC
 * Accounts module (frontend-only phase; the future NestJS "Trading
 * Connectivity" domain implements the same contract).
 *
 * Owns, PER TRADING ACCOUNT (≠ the Integration Hub's per-PROVIDER scope):
 * - connection lifecycle: CONNECTING → CONNECTED, disconnect, reconnect
 *   (with a deterministic one-shot authentication-failure scenario)
 * - synchronization health: LIVE is derived from lastSyncedAt recency
 *   (thresholds centralized in lib/accounts), SYNCING progresses through
 *   the initial-sync steps, DELAYED/STALE emerge from elapsed time
 * - the account snapshot, read-only positions/orders and normalized
 *   history (deals / orders / balance operations are distinct kinds)
 *
 * Security invariants (prompt §44, §69): credentials are validated at this
 * boundary and then DISCARDED — only a masked hint survives; account
 * numbers are stored masked; disconnecting never deletes journal data.
 */

// ── Provider catalog (typed metadata — no provider-specific UI branches) ────

const READ_CAPABILITIES = [
  "READ_ACCOUNT",
  "READ_POSITIONS",
  "READ_ORDERS",
  "READ_EXECUTIONS",
] as const;

export const ACCOUNT_PROVIDERS: AccountProvidersResponse["providers"] = [
  {
    id: "mt5",
    name: "MetaTrader 5",
    platform: "MT5",
    broker: "MT5",
    availability: "AVAILABLE",
    environments: ["DEMO", "LIVE"],
    methods: [
      {
        id: "investor-credentials",
        label: "Investor password (read-only)",
        description:
          "The MT5 investor password grants read-only access to the account — trades cannot be placed or modified.",
        fields: [
          { id: "login", label: "Account number", type: "text", placeholder: "e.g. 5102883", required: true, hint: null },
          { id: "password", label: "Investor password", type: "password", placeholder: "Read-only password", required: true, hint: null },
          { id: "server", label: "Server", type: "text", placeholder: "e.g. FTMO-Server2", required: true, hint: "Exact server name from your broker email" },
        ],
        note: "Credentials are sent once to the Cosmoz backend boundary and never stored in the browser.",
      },
    ],
    capabilities: [...READ_CAPABILITIES],
    tagline: "The most widely supported retail platform.",
  },
  {
    id: "mt4",
    name: "MetaTrader 4",
    platform: "MT4",
    broker: "MT4",
    availability: "AVAILABLE",
    environments: ["DEMO", "LIVE"],
    methods: [
      {
        id: "investor-credentials",
        label: "Investor password (read-only)",
        description:
          "The MT4 investor password grants read-only access to the account — trades cannot be placed or modified.",
        fields: [
          { id: "login", label: "Account number", type: "text", placeholder: "e.g. 2048817", required: true, hint: null },
          { id: "password", label: "Investor password", type: "password", placeholder: "Read-only password", required: true, hint: null },
          { id: "server", label: "Server", type: "text", placeholder: "e.g. BrokerLive-01", required: true, hint: null },
        ],
        note: "Credentials are sent once to the Cosmoz backend boundary and never stored in the browser.",
      },
    ],
    capabilities: [...READ_CAPABILITIES],
    tagline: "Legacy platform — same read-only connectivity.",
  },
  {
    id: "deriv",
    name: "Deriv",
    platform: "DERIV",
    broker: "DERIV",
    availability: "AVAILABLE",
    environments: ["DEMO", "LIVE"],
    methods: [
      {
        id: "api-token",
        label: "API token (read-only scope)",
        description:
          "Create a scoped token in the Deriv dashboard with read permissions only.",
        fields: [
          { id: "login", label: "Account login", type: "text", placeholder: "e.g. CR4821", required: true, hint: null },
          { id: "token", label: "API token", type: "password", placeholder: "Read-only token", required: true, hint: null },
        ],
        note: "The token scope is verified during the connection test — write scopes are rejected.",
      },
    ],
    capabilities: [...READ_CAPABILITIES],
    tagline: "Synthetics, forex and crypto under one account.",
  },
  {
    id: "ctrader",
    name: "cTrader",
    platform: "CTRADER",
    broker: "CTRADER",
    availability: "COMING_SOON",
    environments: ["DEMO", "LIVE"],
    methods: [],
    capabilities: [...READ_CAPABILITIES],
    tagline: "Open API connectivity is on the roadmap.",
  },
  {
    id: "binance",
    name: "Binance",
    platform: "BINANCE",
    broker: "BINANCE",
    availability: "COMING_SOON",
    environments: ["LIVE"],
    methods: [],
    capabilities: [...READ_CAPABILITIES],
    tagline: "Exchange accounts will join the same read model.",
  },
  {
    id: "broker-api",
    name: "Broker API (custom)",
    platform: "OTHER",
    broker: "OTHER",
    availability: "COMING_SOON",
    environments: ["DEMO", "LIVE"],
    methods: [],
    capabilities: [...READ_CAPABILITIES],
    tagline: "Bring your own broker's REST API.",
  },
];

// ── Lifecycle timing (ms) — deterministic, advanced lazily on read ──────────

const CONNECT_DURATION_MS = 1_200;
const INITIAL_SYNC_MS = 2_800;
const MANUAL_SYNC_MS = 1_500;

// ── Runtime state ────────────────────────────────────────────────────────────

interface AccountRuntime {
  providerId: string;
  accountNumberMasked: string | null;
  connection: ConnectedAccountView["connection"];
  sync: ConnectedAccountView["sync"];
  snapshot: TradingAccountSnapshot;
  positions: BrokerPosition[];
  orders: BrokerOrder[];
  history: TradingAccountHistoryEntry[];
  /** Phase anchor for lazily-advanced lifecycle transitions. */
  phaseStartedAt: number;
  /** One-shot demo scenario: the first reconnect fails authentication. */
  authFailOnce: boolean;
  authFailArmed: boolean;
}

type HistoryEntry = TradingAccountHistoryEntry;

const bootAt = Date.now();
const ago = (ms: number) => new Date(bootAt - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const emptySnapshot = (): TradingAccountSnapshot => ({
  balance: null,
  equity: null,
  usedMargin: null,
  freeMargin: null,
  marginLevel: null,
  leverage: null,
  unrealizedPnl: null,
  capturedAt: null,
});

/** Normalized history seed — deals, orders and balance ops stay distinct. */
function seedHistory(accountSeed: "deriv-live" | "ftmo" | "demo"): HistoryEntry[] {
  if (accountSeed === "deriv-live") {
    return [
      { id: "h-401", kind: "BALANCE", time: ago(26 * HOUR), symbol: null, direction: null, volume: null, price: null, amount: "5000.00", balanceAfter: "10000.00", comment: "Deposit — card ••••4218" },
      { id: "h-402", kind: "DEAL", time: ago(25.9 * HOUR), symbol: "XAUUSD", direction: "BUY", volume: "0.10", price: "3850.20", amount: null, balanceAfter: null, comment: "Position opened" },
      { id: "h-403", kind: "DEAL", time: ago(24.4 * HOUR), symbol: "EURUSD", direction: "SELL", volume: "0.50", price: "1.08740", amount: null, balanceAfter: null, comment: "Position opened" },
      { id: "h-404", kind: "ORDER", time: ago(3 * HOUR), symbol: "CRASH500", direction: "SELL", volume: "0.10", price: "8320.00", amount: null, balanceAfter: null, comment: "SELL_STOP placed" },
      { id: "h-405", kind: "DEAL", time: ago(2.6 * HOUR), symbol: "EURUSD", direction: "SELL", volume: "0.50", price: "1.08510", amount: "+115.00", balanceAfter: "10115.00", comment: "Closed — partial" },
      { id: "h-406", kind: "ORDER", time: ago(40 * MIN), symbol: "XAUUSD", direction: "BUY", volume: "0.20", price: "3845.00", amount: null, balanceAfter: null, comment: "BUY_LIMIT placed" },
      { id: "h-407", kind: "DEAL", time: ago(2.2 * HOUR), symbol: "BTCUSDT", direction: "BUY", volume: "0.05", price: "61240.00", amount: null, balanceAfter: null, comment: "Position opened" },
      { id: "h-408", kind: "DEAL", time: ago(1.1 * HOUR), symbol: "BOOM500", direction: "BUY", volume: "0.20", price: "9812.40", amount: "-38.60", balanceAfter: "10076.40", comment: "Closed — spike fade" },
      { id: "h-409", kind: "BALANCE", time: ago(50 * MIN), symbol: null, direction: null, volume: null, price: null, amount: "-38.60", balanceAfter: "10037.80", comment: "Commission adjustment" },
      { id: "h-410", kind: "DEAL", time: ago(22 * MIN), symbol: "VOL75(1s)", direction: "SELL", volume: "0.10", price: "128366.0", amount: "+202.20", balanceAfter: "10240.00", comment: "Closed — mean reversion" },
    ];
  }
  if (accountSeed === "ftmo") {
    return [
      { id: "h-501", kind: "BALANCE", time: ago(9 * 24 * HOUR), symbol: null, direction: null, volume: null, price: null, amount: "100000.00", balanceAfter: "100000.00", comment: "Challenge initial balance" },
      { id: "h-502", kind: "DEAL", time: ago(28 * HOUR), symbol: "GBPUSD", direction: "BUY", volume: "1.00", price: "1.27010", amount: null, balanceAfter: null, comment: "Position opened" },
      { id: "h-503", kind: "DEAL", time: ago(26 * HOUR), symbol: "GBPUSD", direction: "BUY", volume: "1.00", price: "1.27290", amount: "+280.00", balanceAfter: "100280.00", comment: "Closed — target" },
      { id: "h-504", kind: "DEAL", time: ago(5 * HOUR), symbol: "EURUSD", direction: "BUY", volume: "1.00", price: "1.08610", amount: null, balanceAfter: null, comment: "Position opened" },
      { id: "h-505", kind: "BALANCE", time: ago(4.9 * HOUR), symbol: null, direction: null, volume: null, price: null, amount: "+132.50", balanceAfter: "100412.50", comment: "Swap adjustment" },
      { id: "h-506", kind: "ORDER", time: ago(2 * HOUR), symbol: "XAUUSD", direction: "SELL", volume: "0.50", price: "2392.00", amount: null, balanceAfter: null, comment: "SELL_LIMIT placed" },
    ];
  }
  return [
    { id: "h-601", kind: "BALANCE", time: ago(14 * 24 * HOUR), symbol: null, direction: null, volume: null, price: null, amount: "5000.00", balanceAfter: "5000.00", comment: "Demo initial balance" },
    { id: "h-602", kind: "DEAL", time: ago(9 * HOUR), symbol: "BOOM500", direction: "BUY", volume: "0.10", price: "9814.20", amount: null, balanceAfter: null, comment: "Position opened" },
    { id: "h-603", kind: "DEAL", time: ago(8.6 * HOUR), symbol: "BOOM500", direction: "BUY", volume: "0.10", price: "9830.80", amount: "-16.60", balanceAfter: "4983.40", comment: "Closed — stop out" },
    { id: "h-604", kind: "BALANCE", time: ago(8 * MIN), symbol: null, direction: null, volume: null, price: null, amount: "+16.60", balanceAfter: "5000.00", comment: "Demo reset" },
  ];
}

function seedPositions(accountSeed: "deriv-live" | "ftmo" | "demo"): BrokerPosition[] {
  if (accountSeed === "deriv-live") {
    return [
      { id: "pos-701", symbol: "XAUUSD", direction: "BUY", volume: "0.10", entryPrice: "3850.20", currentPrice: "3861.40", stopLoss: "3840.00", takeProfit: "3875.00", unrealizedPnl: "112.00", openedAt: ago(2.2 * HOUR) },
      { id: "pos-702", symbol: "EURUSD", direction: "SELL", volume: "0.50", entryPrice: "1.08740", currentPrice: "1.08695", stopLoss: "1.08900", takeProfit: "1.08450", unrealizedPnl: "22.50", openedAt: ago(5 * HOUR) },
      { id: "pos-703", symbol: "BTCUSDT", direction: "BUY", volume: "0.05", entryPrice: "61240.00", currentPrice: "61105.00", stopLoss: "60500.00", takeProfit: "63000.00", unrealizedPnl: "-6.75", openedAt: ago(26 * HOUR) },
    ];
  }
  if (accountSeed === "ftmo") {
    return [
      { id: "pos-711", symbol: "EURUSD", direction: "BUY", volume: "1.00", entryPrice: "1.08610", currentPrice: "1.08695", stopLoss: "1.08480", takeProfit: "1.08900", unrealizedPnl: "85.00", openedAt: ago(5 * HOUR) },
    ];
  }
  return [];
}

function seedOrders(accountSeed: "deriv-live" | "ftmo" | "demo"): BrokerOrder[] {
  if (accountSeed === "deriv-live") {
    return [
      { id: "ord-801", symbol: "XAUUSD", type: "BUY_LIMIT", price: "3845.00", stopLoss: "3835.00", takeProfit: "3870.00", volume: "0.20", createdAt: ago(40 * MIN) },
      { id: "ord-802", symbol: "CRASH500", type: "SELL_STOP", price: "8320.00", stopLoss: null, takeProfit: "8250.00", volume: "0.10", createdAt: ago(3 * HOUR) },
    ];
  }
  if (accountSeed === "ftmo") {
    return [
      { id: "ord-811", symbol: "XAUUSD", type: "SELL_LIMIT", price: "2392.00", stopLoss: "2398.00", takeProfit: "2378.00", volume: "0.50", createdAt: ago(2 * HOUR) },
    ];
  }
  return [];
}

interface SeedSpec {
  providerId: string;
  accountNumberMasked: string;
  server: string;
  methodId: string;
  methodLabel: string;
  credentialsHint: string;
  state: ConnectedAccountView["connection"]["state"];
  lastError: string | null;
  errorCode: string | null;
  connectedAt: string;
  lastSyncedAt: string;
  snapshot: TradingAccountSnapshot;
  positions: BrokerPosition[];
  orders: BrokerOrder[];
  history: HistoryEntry[];
  authFailOnce: boolean;
}

/**
 * Seed scenarios (prompt §39) — one connected LIVE account, one connected
 * DELAYED account, one DISCONNECTED account. The ERROR state is reachable
 * through the deterministic reconnect scenario on the Demo account.
 */
const SEEDS: Record<string, SeedSpec> = {
  "Deriv Live": {
    providerId: "deriv",
    accountNumberMasked: "••••••4821",
    server: "Deriv-SVR04",
    methodId: "api-token",
    methodLabel: "API token (read-only scope)",
    credentialsHint: "••••••••••3f2a",
    state: "CONNECTED",
    lastError: null,
    errorCode: null,
    connectedAt: ago(30 * 24 * HOUR),
    lastSyncedAt: ago(4_000),
    snapshot: {
      balance: "10240.00",
      equity: "10180.00",
      usedMargin: "420.00",
      freeMargin: "9760.00",
      marginLevel: "2423.81",
      leverage: "1:500",
      unrealizedPnl: "-60.00",
      capturedAt: ago(4_000),
    },
    positions: seedPositions("deriv-live"),
    orders: seedOrders("deriv-live"),
    history: seedHistory("deriv-live"),
    authFailOnce: false,
  },
  "FTMO Challenge": {
    providerId: "mt5",
    accountNumberMasked: "••••••9930",
    server: "FTMO-Server2",
    methodId: "investor-credentials",
    methodLabel: "Investor password (read-only)",
    credentialsHint: "••••••••2b7c",
    state: "CONNECTED",
    lastError: null,
    errorCode: null,
    connectedAt: ago(21 * 24 * HOUR),
    // 95 s old → DELAYED (past the 60 s LIVE window, under the 5 min STALE one)
    lastSyncedAt: ago(95_000),
    snapshot: {
      balance: "100412.50",
      equity: "100497.50",
      usedMargin: "543.50",
      freeMargin: "99954.00",
      marginLevel: "18492.36",
      leverage: "1:100",
      unrealizedPnl: "85.00",
      capturedAt: ago(95_000),
    },
    positions: seedPositions("ftmo"),
    orders: seedOrders("ftmo"),
    history: seedHistory("ftmo"),
    authFailOnce: false,
  },
  Demo: {
    providerId: "deriv",
    accountNumberMasked: "••••••7714",
    server: "Deriv-Demo-02",
    methodId: "api-token",
    methodLabel: "API token (read-only scope)",
    credentialsHint: "••••••••••9a01",
    state: "DISCONNECTED",
    lastError: "Connection interrupted — the provider stopped responding.",
    errorCode: "CONNECTION_TIMEOUT",
    connectedAt: ago(60 * 24 * HOUR),
    lastSyncedAt: ago(8 * MIN),
    snapshot: {
      balance: "5000.00",
      equity: "5000.00",
      usedMargin: "0.00",
      freeMargin: "5000.00",
      marginLevel: null,
      leverage: "1:500",
      unrealizedPnl: "0.00",
      capturedAt: ago(8 * MIN),
    },
    positions: seedPositions("demo"),
    orders: seedOrders("demo"),
    history: seedHistory("demo"),
    // Deterministic demo scenario: the FIRST reconnect fails, the second succeeds.
    authFailOnce: true,
  },
};

/** Lazily-bound runtime per journal account id. */
const runtimes = new Map<string, AccountRuntime>();

function providerById(providerId: string) {
  return ACCOUNT_PROVIDERS.find((provider) => provider.id === providerId) ?? null;
}

function methodOf(providerId: string, methodId: string) {
  return providerById(providerId)?.methods.find((m) => m.id === methodId) ?? null;
}

/** Ensure every journal account has a runtime; bind by seed name. */
function runtimeOf(accountId: string): AccountRuntime {
  const existing = runtimes.get(accountId);
  if (existing) return existing;
  const account = mockStore
    .listAccounts()
    .find((a) => a.id === accountId);
  if (!account) throw new MockError(404, "Account not found");
  const seed = SEEDS[account.name];
  if (seed) {
    const runtime: AccountRuntime = {
      providerId: seed.providerId,
      accountNumberMasked: seed.accountNumberMasked,
      connection: {
        state: seed.state,
        methodId: seed.methodId,
        methodLabel: seed.methodLabel,
        server: seed.server,
        credentialsHint: seed.credentialsHint,
        connectedAt: seed.connectedAt,
        lastError: seed.lastError,
        errorCode: seed.errorCode,
      },
      sync: {
        status: "UNKNOWN",
        lastSyncedAt: seed.lastSyncedAt,
        lastAttemptedAt: seed.lastSyncedAt,
        recordsSynced: seed.history.length + seed.positions.length + seed.orders.length,
      },
      snapshot: seed.snapshot,
      positions: seed.positions,
      orders: seed.orders,
      history: seed.history,
      phaseStartedAt: bootAt,
      authFailOnce: seed.authFailOnce,
      authFailArmed: seed.authFailOnce,
    };
    runtimes.set(accountId, runtime);
    return runtime;
  }
  // Journal account without connectivity (created manually) — honest UNKNOWN.
  const runtime: AccountRuntime = {
    providerId: account.broker === "OTHER" ? "broker-api" : "mt5",
    accountNumberMasked: null,
    connection: {
      state: "DISCONNECTED",
      methodId: null,
      methodLabel: null,
      server: null,
      credentialsHint: null,
      connectedAt: null,
      lastError: null,
      errorCode: null,
    },
    sync: {
      status: "UNKNOWN",
      lastSyncedAt: null,
      lastAttemptedAt: null,
      recordsSynced: null,
    },
    snapshot: emptySnapshot(),
    positions: [],
    orders: [],
    history: [],
    phaseStartedAt: bootAt,
    authFailOnce: false,
    authFailArmed: false,
  };
  runtimes.set(accountId, runtime);
  return runtime;
}

/**
 * Lazily advance the lifecycle — CONNECTING → CONNECTED(+SYNCING) → LIVE.
 * No timers: every read first settles overdue transitions, so the state is
 * a pure function of elapsed time (prompt §40 — the state machine lives
 * behind the service abstraction, never in UI components).
 */
function settle(runtime: AccountRuntime, now: number = Date.now()): void {
  const connection = runtime.connection;
  if (
    connection.state === "CONNECTING" &&
    now - runtime.phaseStartedAt >= CONNECT_DURATION_MS
  ) {
    if (runtime.authFailArmed) {
      runtime.authFailArmed = false;
      connection.state = "ERROR";
      connection.lastError =
        "Authentication failed — check the connection details and try again.";
      connection.errorCode = "AUTHENTICATION_FAILED";
      runtime.sync.status = "ERROR";
      runtime.sync.lastAttemptedAt = new Date(now).toISOString();
      return;
    }
    connection.state = "CONNECTED";
    connection.lastError = null;
    connection.errorCode = null;
    if (!connection.connectedAt) connection.connectedAt = new Date(now).toISOString();
    runtime.sync.status = "SYNCING";
    runtime.sync.lastAttemptedAt = new Date(now).toISOString();
    runtime.phaseStartedAt = now;
  }
  if (
    connection.state === "CONNECTED" &&
    runtime.sync.status === "SYNCING" &&
    now - runtime.phaseStartedAt >= INITIAL_SYNC_MS
  ) {
    completeSync(runtime, now);
  }
}

/** Finalize a sync: stamp freshness + capture the snapshot. */
function completeSync(runtime: AccountRuntime, now: number): void {
  const iso = new Date(now).toISOString();
  runtime.sync.status = "LIVE";
  runtime.sync.lastSyncedAt = iso;
  runtime.sync.lastAttemptedAt = iso;
  runtime.sync.recordsSynced =
    runtime.history.length + runtime.positions.length + runtime.orders.length;
  if (runtime.snapshot.balance !== null) {
    runtime.snapshot = { ...runtime.snapshot, capturedAt: iso };
  }
}

function viewOf(accountId: string, now: number = Date.now()): ConnectedAccountView {
  const account = mockStore
    .listAccounts()
    .find((a) => a.id === accountId);
  if (!account) throw new MockError(404, "Account not found");
  const runtime = runtimeOf(accountId);
  settle(runtime, now);
  const provider = providerById(runtime.providerId);
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    broker: account.broker,
    providerId: runtime.providerId,
    platform: provider?.platform ?? null,
    currency: account.currency,
    startingBalance: account.startingBalance,
    isDefault: account.isDefault,
    propConfig: account.propConfig,
    accountNumberMasked: runtime.accountNumberMasked,
    server: runtime.connection.server,
    connection: { ...runtime.connection },
    sync: {
      ...runtime.sync,
      // An in-flight sync (runtime state) outranks recency derivation.
      status:
        runtime.sync.status === "SYNCING"
          ? "SYNCING"
          : deriveSyncStatus(runtime.connection.state, runtime.sync.lastSyncedAt, now),
    },
    snapshot: { ...runtime.snapshot },
    permissions: {
      granted: provider ? [...provider.capabilities] : [],
      readOnly: true,
    },
    createdAt: account.createdAt,
  };
}

function assertConnected(accountId: string): AccountRuntime {
  const runtime = runtimeOf(accountId);
  if (
    runtime.connection.state === "DISCONNECTED" ||
    runtime.connection.state === "ERROR"
  ) {
    throw new MockError(409, "Account is not connected");
  }
  return runtime;
}

// ── Engine API ───────────────────────────────────────────────────────────────

export const accountEngine = {
  providers(): AccountProvidersResponse {
    return { providers: ACCOUNT_PROVIDERS };
  },

  overview(): ConnectedAccountsOverviewResponse {
    const now = Date.now();
    const accounts = mockStore.listAccounts();
    const views = accounts.map((account) => viewOf(account.id, now));
    const summary = {
      total: views.length,
      connected: views.filter(
        (v) =>
          v.connection.state === "CONNECTED" || v.connection.state === "CONNECTING",
      ).length,
      liveSync: views.filter((v) => v.sync.status === "LIVE").length,
      needsAttention: views.filter(
        (v) =>
          v.connection.state === "ERROR" ||
          v.connection.state === "DISCONNECTED" ||
          v.sync.status === "STALE",
      ).length,
    };
    return { accounts: views, summary };
  },

  detail(accountId: string): ConnectedAccountDetailResponse {
    return { account: viewOf(accountId) };
  },

  positions(accountId: string): AccountPositionsResponse {
    // Read models serve the LAST KNOWN data even while disconnected — the
    // detail banner labels them as such (honest staleness, never invented).
    const runtime = runtimeOf(accountId);
    settle(runtime);
    return { positions: runtime.positions };
  },

  orders(accountId: string): AccountOrdersResponse {
    const runtime = runtimeOf(accountId);
    settle(runtime);
    return { orders: runtime.orders };
  },

  history(accountId: string): AccountHistoryResponse {
    const runtime = runtimeOf(accountId);
    settle(runtime);
    return { entries: runtime.history };
  },

  /**
   * POST /accounts/test — connection validation BEFORE creating anything
   * (prompt §19). Deterministic; credentials never leave this boundary.
   */
  test(input: AccountTestInput): AccountTestResponse {
    const parsed = accountTestInputSchema.parse(input);
    const provider = providerById(parsed.providerId);
    if (!provider || provider.availability !== "AVAILABLE") {
      return {
        ok: false,
        errorCode: "PROVIDER_UNAVAILABLE",
        steps: [
          {
            id: "provider-recognized",
            label: "Provider recognized",
            status: "FAILED",
            detail: "This provider is not available yet.",
          },
        ],
      };
    }
    const method = methodOf(parsed.providerId, parsed.methodId);
    if (!method) {
      return {
        ok: false,
        errorCode: "PROVIDER_UNAVAILABLE",
        steps: [
          {
            id: "provider-recognized",
            label: "Provider recognized",
            status: "FAILED",
            detail: "This connection method is not supported.",
          },
        ],
      };
    }
    const outcome = simulateConnectionTest(method.fields, parsed.credentials);
    const base: AccountTestStep[] = [
      { id: "provider-recognized", label: "Provider recognized", status: "OK", detail: provider.name },
      {
        id: "account-authenticated",
        label: "Account authenticated",
        status: outcome.ok ? "OK" : "FAILED",
        detail: outcome.ok
          ? "Read-only access granted"
          : outcome.errorCode === "INVALID_SERVER"
            ? "The server name does not match any broker server"
            : "The provider rejected these credentials",
      },
      {
        id: "account-information",
        label: "Account information available",
        status: outcome.ok ? "OK" : "PENDING",
        detail: outcome.ok ? "Balance, equity and margins reachable" : null,
      },
      {
        id: "permissions-confirmed",
        label: "Read-only permissions confirmed",
        status: outcome.ok ? "OK" : "PENDING",
        detail: outcome.ok ? "No execution scope granted" : null,
      },
    ];
    if (outcome.ok) {
      return { ok: true, errorCode: null, steps: base };
    }
    return {
      ok: false,
      errorCode: outcome.errorCode,
      steps: base.map((step) =>
        step.status === "PENDING" ? { ...step, status: "FAILED" as const, detail: "Not reached" } : step,
      ),
    };
  },

  /**
   * POST /accounts/connect — creates the journal Account AND its
   * connection. Returns the created view in CONNECTING; the wizard polls
   * the detail endpoint through SYNCING → LIVE.
   */
  connect(input: AccountConnectInput): AccountConnectResponse {
    const parsed = accountConnectInputSchema.parse(input);
    const provider = providerById(parsed.providerId);
    if (!provider || provider.availability !== "AVAILABLE") {
      throw new MockError(422, "Provider is not available");
    }
    const method = methodOf(parsed.providerId, parsed.methodId);
    if (!method) throw new MockError(422, "Connection method is not supported");
    const outcome = simulateConnectionTest(method.fields, parsed.credentials);
    if (!outcome.ok) {
      throw new MockError(422, `Connection failed: ${outcome.errorCode}`);
    }
    const login = (parsed.credentials.login ?? "").trim();
    const name =
      parsed.name?.trim() ||
      `${provider.name} ${parsed.environment === "DEMO" ? "Demo" : "Live"}`;
    const startingBalance = initialSnapshotBalance(parsed.environment);
    const account = mockStore.createAccount({
      name,
      type: parsed.environment === "DEMO" ? "DEMO" : "LIVE",
      broker: provider.broker,
      currency: "USD",
      startingBalance,
      isDefault: false,
      propConfig: null,
    });
    const now = Date.now();
    const runtime: AccountRuntime = {
      providerId: provider.id,
      accountNumberMasked: login ? maskTail(login) : null,
      connection: {
        state: "CONNECTING",
        methodId: method.id,
        methodLabel: method.label,
        server: parsed.credentials.server?.trim() || provider.name,
        credentialsHint: maskTail(
          parsed.credentials.token ?? parsed.credentials.password ?? login ?? "?",
          4,
          10,
        ),
        connectedAt: null,
        lastError: null,
        errorCode: null,
      },
      sync: {
        status: "SYNCING",
        lastSyncedAt: null,
        lastAttemptedAt: new Date(now).toISOString(),
        recordsSynced: null,
      },
      snapshot: {
        ...emptySnapshot(),
        balance: startingBalance,
        equity: startingBalance,
        usedMargin: "0.00",
        freeMargin: startingBalance,
        marginLevel: null,
        leverage: "1:100",
        unrealizedPnl: "0.00",
      },
      positions: [
        {
          id: "pos-new-1",
          symbol: "EURUSD",
          direction: "BUY",
          volume: "0.20",
          entryPrice: "1.08650",
          currentPrice: "1.08695",
          stopLoss: "1.08520",
          takeProfit: "1.08910",
          unrealizedPnl: "9.00",
          openedAt: new Date(now - 12 * MIN).toISOString(),
        },
      ],
      orders: [],
      history: [
        {
          id: "h-new-1",
          kind: "BALANCE",
          time: new Date(now - 30 * MIN).toISOString(),
          symbol: null,
          direction: null,
          volume: null,
          price: null,
          amount: startingBalance,
          balanceAfter: startingBalance,
          comment: "Initial synchronization",
        },
        {
          id: "h-new-2",
          kind: "DEAL",
          time: new Date(now - 12 * MIN).toISOString(),
          symbol: "EURUSD",
          direction: "BUY",
          volume: "0.20",
          price: "1.08650",
          amount: null,
          balanceAfter: null,
          comment: "Position opened",
        },
      ],
      phaseStartedAt: now,
      authFailOnce: false,
      authFailArmed: false,
    };
    runtimes.set(account.id, runtime);
    return { account: viewOf(account.id, now) };
  },

  /** POST /accounts/:id/sync — manual refresh of one account. */
  sync(accountId: string): AccountSyncResponse {
    const runtime = assertConnected(accountId);
    const now = Date.now();
    if (runtime.sync.status !== "SYNCING") {
      runtime.sync.status = "SYNCING";
      runtime.sync.lastAttemptedAt = new Date(now).toISOString();
      runtime.phaseStartedAt = now - (INITIAL_SYNC_MS - MANUAL_SYNC_MS);
    }
    settle(runtime, now);
    return { account: viewOf(accountId, now) };
  },

  /** POST /accounts/:id/reconnect — with the one-shot demo failure on Demo. */
  reconnect(accountId: string): AccountSyncResponse {
    const runtime = runtimeOf(accountId);
    const now = Date.now();
    runtime.connection.state = "CONNECTING";
    runtime.connection.lastError = null;
    runtime.connection.errorCode = null;
    runtime.sync.status = "SYNCING";
    runtime.sync.lastAttemptedAt = new Date(now).toISOString();
    runtime.phaseStartedAt = now;
    settle(runtime, now);
    return { account: viewOf(accountId, now) };
  },

  /**
   * POST /accounts/:id/disconnect — stops synchronization. The journal
   * account, its trades, reviews and journal data are NEVER touched
   * (prompt §31/§32) — only the live link is dropped.
   */
  disconnect(accountId: string): AccountDisconnectResponse {
    const runtime = runtimeOf(accountId);
    const now = new Date().toISOString();
    runtime.connection.state = "DISCONNECTED";
    runtime.connection.lastError = null;
    runtime.connection.errorCode = null;
    runtime.sync.status = "DISCONNECTED";
    runtime.sync.lastAttemptedAt = now;
    return {
      ok: true,
      note: "Synchronization stopped. Your Cosmoz journal data for this account is preserved.",
    };
  },

  /** PATCH /accounts/:id — rename / set default (journal identity). */
  update(accountId: string, patch: AccountUpdateInput): AccountSyncResponse {
    accountUpdateInputSchema.parse(patch);
    mockStore.updateAccount(accountId, patch);
    return { account: viewOf(accountId) };
  },
};

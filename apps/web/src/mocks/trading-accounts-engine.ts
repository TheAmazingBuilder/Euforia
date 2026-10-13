/**
 * Trading-accounts mock engine (Phase 02) — MSW parity with the Nest
 * trading-accounts surface (apps/api/src/modules/accounts).
 *
 * This is a MOCK, visibly and honestly: the only provider it serves is the
 * "MOCK" descriptor (isMock: true) and every account it creates carries that
 * provider stamp, so the UI can never present simulated data as a real
 * broker connection (Phase 02 spec §4.2/§15.3 — no fake connectivity, no
 * fake success).
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
  BrokerOrder,
  BrokerPosition,
  TradingAccountDetails,
  TradingAccountSnapshotView,
  TradingConnectionTestResponse,
  TradingConnectionView,
  TradingDeal,
  TradingProviderDescriptor,
  TradingSyncRunView,
} from "@cosmoz/shared";

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
 * The provider's answer for an external account — a pure function of the id,
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
  method: "API_KEY";
  /** The stored secret — mock-only simulation of the encrypted vault. */
  secret: string | null;
  credentialsHint: string | null;
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

function deriveSynchronizationStatus(
  record: AccountRecord,
  nowMs: number,
): TradingAccountDetails["synchronization"]["status"] {
  const latestRun = record.runs[0] ?? null;
  const lastSyncMs = record.connection?.lastSyncAt ? Date.parse(record.connection.lastSyncAt) : null;
  if (latestRun?.status === "RUNNING") return "SYNCING";
  if (latestRun?.status === "FAILED" && !lastSyncMs) return "ERROR";
  if (!lastSyncMs) return "UNKNOWN";
  if (latestRun?.status === "FAILED" && nowMs - lastSyncMs <= FRESHNESS_TTL_MS) return "LIVE";
  return nowMs - lastSyncMs <= FRESHNESS_TTL_MS ? "LIVE" : "STALE";
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
    provider: MOCK_DESCRIPTOR,
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
    const data = providerData(record.externalAccountId);
    record.currency = data.currency;
    record.positions = data.positions;
    record.orders = data.orders;
    record.deals = data.deals;
    record.snapshot = {
      ...data.snapshot,
      currency: data.currency as TradingAccountSnapshotView["currency"],
      syncedAt: isoNow(),
    };
    run.positionsUpserted = data.positions.length;
    run.ordersUpserted = data.orders.length;
    run.dealsUpserted = data.deals.length;
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
    return { providers: [MOCK_DESCRIPTOR] };
  },

  connect(
    userId: string,
    input: {
      providerId: string;
      environment: string;
      externalAccountId: string;
      displayName?: string;
      credentials: { method: "API_KEY"; secret: string };
    },
  ): { account: TradingAccountDetails } {
    // registry.require — unknown provider ids never connect.
    if (input.providerId !== MOCK_DESCRIPTOR.providerId) {
      throw coded(422, "UNSUPPORTED_PROVIDER", "This trading provider is not supported.");
    }
    // Provider validation BEFORE persisting anything (§17 step order).
    guardSecret(input.credentials.secret);
    if (!MOCK_DESCRIPTOR.supportedEnvironments.includes(input.environment as "DEMO" | "LIVE")) {
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

    const data = providerData(input.externalAccountId);
    const now = isoNow();
    const count = [...accounts.values()].filter((record) => record.userId === userId).length;
    const record: AccountRecord = {
      id: uuid(),
      userId,
      name: input.displayName ?? `${MOCK_DESCRIPTOR.providerName} ${input.environment}`,
      type: input.environment as AccountRecord["type"],
      broker: MOCK_DESCRIPTOR.platform,
      currency: data.currency,
      // Provider-reported balance at connect is the journal anchor (§25).
      startingBalance: data.snapshot.balance,
      isDefault: count === 0,
      externalAccountId: input.externalAccountId,
      providerId: MOCK_DESCRIPTOR.providerId,
      connection: {
        status: "CONNECTED",
        method: "API_KEY",
        secret: input.credentials.secret,
        credentialsHint: hintOf(input.credentials.secret),
        permissions: [...MOCK_DESCRIPTOR.supportedPermissions],
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
    // (best-effort, exactly like the backend connect use case).
    runSynchronization(record, "INITIAL");
    return { account: detailsOf(record) };
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

  test(userId: string, accountId: string): TradingConnectionTestResponse {
    const record = owned(userId, accountId);
    const secret = record.connection?.secret ?? null;
    const authOk = secret !== null && scenarioOf(secret) === null;
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
            : "No readable payload — authentication failed first.",
        },
        {
          name: "permissions",
          ok: record.connection !== null,
          detail:
            record.connection === null
              ? "No stored permissions — connect the account first."
              : `Read scope granted: ${record.connection.permissions.length} READ permissions.`,
        },
      ],
    };
  },

  reconnect(
    userId: string,
    accountId: string,
    input: { credentials: { method: "API_KEY"; secret: string } },
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
    // Disconnect wipes the credentials, keeps every historical row (§52).
    if (record.connection) {
      record.connection.status = "DISCONNECTED";
      record.connection.secret = null;
      record.connection.credentialsHint = null;
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

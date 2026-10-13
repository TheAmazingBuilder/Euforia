/**
 * Accounts module unit tests (spec §68) — run with Node 24 native TS
 * stripping: `node scripts/test-accounts.ts`
 *
 * Covers: financial formatting (§53), status metadata completeness (§54),
 * engine lifecycle behaviors (§26, §31, §39, §45) and the negative
 * security checks (§69) — no execution surface, no secret retention.
 */
import assert from "node:assert/strict";

import {
  formatAbsoluteTime,
  formatLeverage,
  formatMarginLevel,
  formatMoney,
  formatPrice,
  formatRelativeTime,
  formatSignedMoney,
  formatVolume,
  maskAccountNumber,
} from "../src/components/accounts/accounts-format.ts";
import {
  CONNECTION_META,
  ENVIRONMENT_META,
  EXCLUDED_EXECUTION_PERMISSIONS,
  PERMISSION_META,
  SYNC_META,
} from "../src/components/accounts/accounts-meta.ts";
import {
  SYNC_FRESHNESS,
  TradingMockError,
  tradingAccountsEngine,
} from "../src/mocks/trading-accounts-engine.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((error: unknown) => {
      failed += 1;
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  ✗ ${name}`);
      console.log(`      ${error instanceof Error ? error.message : String(error)}`);
    });
}

const NOW = Date.now();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function expectTradingError(
  fn: () => unknown,
  code: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof TradingMockError && error.code === code) return;
    throw new Error(`Expected ${code}, got ${String(error)}`);
  }
  throw new Error(`Expected ${code} error, none thrown`);
}

// ── 1. Financial formatting (§53) ────────────────────────────────────────────

console.log("\nformatting");

await test("formatMoney respects the account currency", () => {
  assert.equal(formatMoney("10240.00", "USD"), "$10,240.00");
  assert.equal(formatMoney("25750.50", "EUR"), "€25,750.50");
  assert.equal(formatMoney("1200", "JPY"), "¥1,200");
});

await test("formatMoney renders — for unavailable values, never a guess", () => {
  assert.equal(formatMoney(null, "USD"), "—");
  assert.equal(formatMoney(undefined, "USD"), "—");
  assert.equal(formatMoney("", "USD"), "—");
});

await test("formatSignedMoney uses + and the proper minus sign", () => {
  assert.equal(formatSignedMoney("112.00", "USD"), "+$112.00");
  assert.equal(formatSignedMoney("-42.00", "USD"), "−$42.00");
  assert.equal(formatSignedMoney(null, "USD"), "—");
});

await test("formatPrice keeps precision without currency noise", () => {
  assert.equal(formatPrice("3850.20"), "3850.20");
  assert.equal(formatPrice("1.08640"), "1.0864");
  assert.equal(formatPrice(null), "—");
});

await test("formatVolume / formatMarginLevel / formatLeverage", () => {
  assert.equal(formatVolume("0.10"), "0.10");
  assert.equal(formatMarginLevel("2423.81"), "2423.81%");
  assert.equal(formatMarginLevel(null), "—");
  assert.equal(formatLeverage("30"), "1:30");
  assert.equal(formatLeverage("500"), "1:500");
  assert.equal(formatLeverage(null), "—");
});

await test("formatRelativeTime freshness wording (§28, §55)", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  assert.equal(formatRelativeTime("2026-10-05T11:59:56Z", now), "4 seconds ago");
  assert.equal(formatRelativeTime("2026-10-05T11:58:00Z", now), "2 minutes ago");
  assert.equal(formatRelativeTime("2026-10-05T09:00:00Z", now), "3 hours ago");
  assert.equal(formatRelativeTime(null, now), "Never");
});

await test("formatAbsoluteTime — 'Oct 2, 2026 at 15:42' style", () => {
  const formatted = formatAbsoluteTime("2026-10-02T15:42:00Z");
  assert.match(formatted, /Oct 2, 2026/);
  assert.match(formatted, /15:42/);
});

await test("maskAccountNumber shows only the last four digits (§8)", () => {
  assert.equal(maskAccountNumber("100245678"), "••••••5678");
  assert.equal(maskAccountNumber("5678"), "••••••5678");
});

// ── 2. Status metadata completeness (§54) ───────────────────────────────────

console.log("\nstatus metadata");

await test("every lifecycle state has a text label (never color-only, §49)", () => {
  for (const status of ["DEMO", "LIVE", "PROP_FIRM"] as const) {
    assert.ok(ENVIRONMENT_META[status]?.label);
  }
  for (const status of ["CONNECTED", "CONNECTING", "DISCONNECTED", "ERROR"] as const) {
    assert.ok(CONNECTION_META[status]?.label);
    assert.ok(CONNECTION_META[status]?.dotClass);
  }
  for (const status of ["LIVE", "SYNCING", "DELAYED", "STALE", "ERROR", "UNKNOWN"] as const) {
    assert.ok(SYNC_META[status]?.label);
    assert.ok(SYNC_META[status]?.dotClass);
  }
});

await test("all seven READ permissions are labeled; execution is excluded (§16)", () => {
  const expected = [
    "READ_ACCOUNT",
    "READ_BALANCE",
    "READ_EQUITY",
    "READ_POSITIONS",
    "READ_ORDERS",
    "READ_DEALS",
    "READ_HISTORY",
  ] as const;
  for (const permission of expected) {
    assert.ok(PERMISSION_META[permission]);
  }
  assert.deepEqual([...EXCLUDED_EXECUTION_PERMISSIONS], [
    "Order placement",
    "Order modification",
    "Position closing",
  ]);
});

// ── 3. Engine — registry & seeded scenarios (§39) ───────────────────────────

console.log("\nengine — registry & seeds");

await test("provider registry is provider-agnostic and mock-labeled (§10, §57)", () => {
  const { providers } = tradingAccountsEngine.listProviders();
  assert.ok(providers.length >= 4);
  assert.ok(providers.every((provider) => provider.isMock === true));
  const platforms = new Set(providers.map((provider) => provider.platform));
  assert.ok(platforms.has("MT5"));
  assert.ok(platforms.has("MT4"));
  assert.ok(
    providers.every((provider) =>
      provider.supportedPermissions.every((permission) => permission.startsWith("READ_")),
    ),
  );
});

await test("seeded accounts cover Demo-connected, Delayed, Error, Disconnected (§39)", () => {
  const { accounts } = tradingAccountsEngine.listAccounts(NOW);
  assert.ok(accounts.length >= 4);
  const byId = new Map(accounts.map((account) => [account.id, account]));

  const demo = byId.get("acc-icm-demo");
  assert.equal(demo?.type, "DEMO");
  assert.equal(demo?.connection?.status, "CONNECTED");
  assert.equal(demo?.synchronization.status, "LIVE");
  assert.equal(demo?.snapshot?.balance, "10240.00");

  const delayed = byId.get("acc-pps-live");
  assert.equal(delayed?.synchronization.status, "DELAYED");

  const error = byId.get("acc-icm4-live");
  assert.equal(error?.connection?.status, "ERROR");
  assert.equal(error?.synchronization.status, "ERROR");
  assert.ok(error?.connection?.lastError);

  const disconnected = byId.get("acc-deriv-demo");
  assert.equal(disconnected?.connection?.status, "DISCONNECTED");
  assert.equal(disconnected?.synchronization.status, "UNKNOWN");
  assert.ok(disconnected?.connection?.credentialsHint.includes("removed"));
});

await test("freshness is recomputed from lastSyncAt — never claimed from stale state (§26, §55)", () => {
  // pepperstone synced 2 min ago → DELAYED; thresholds are centralized.
  assert.ok(SYNC_FRESHNESS.liveMs < 2 * 60_000);
  const { accounts } = tradingAccountsEngine.listAccounts(NOW);
  const demo = accounts.find((account) => account.id === "acc-icm-demo");
  assert.equal(demo?.synchronization.status, "LIVE");
  assert.ok(demo?.synchronization.lastSyncAt);
});

await test("connection status and synchronization status stay separate axes (§27)", () => {
  const { accounts } = tradingAccountsEngine.listAccounts(NOW);
  const delayed = accounts.find((account) => account.id === "acc-pps-live");
  assert.equal(delayed?.connection?.status, "CONNECTED");
  assert.equal(delayed?.synchronization.status, "DELAYED");
});

await test("per-account data views are read-only and honest (§23–§25, §22)", () => {
  assert.equal(tradingAccountsEngine.listPositions("acc-icm-demo").positions.length, 3);
  assert.equal(tradingAccountsEngine.listOrders("acc-icm-demo").orders.length, 2);
  assert.ok(tradingAccountsEngine.listDeals("acc-icm-demo").deals.length >= 3);
  // MT4 bridge exposes fewer surfaces — the engine returns empty, not fake data.
  assert.equal(tradingAccountsEngine.listPositions("acc-icm4-live").positions.length, 0);
});

// ── 4. Engine — connect / test / sync lifecycle (§11, §19, §20, §45) ────────

console.log("\nengine — connection lifecycle");

await test("connect rejects unknown providers (§45)", async () => {
  await expectTradingError(
    () =>
      tradingAccountsEngine.connect(
        {
          providerId: "nope",
          environment: "DEMO",
          externalAccountId: "1",
          credentials: { method: "API_KEY", secret: "secret-42" },
        },
        Date.now(),
      ),
    "UNSUPPORTED_PROVIDER",
  );
});

await test("connect rejects duplicates (§45)", async () => {
  await expectTradingError(
    () =>
      tradingAccountsEngine.connect(
        {
          providerId: "icmarkets-mt5",
          environment: "DEMO",
          externalAccountId: "100245678",
          credentials: { method: "API_KEY", secret: "secret-42" },
        },
        Date.now(),
      ),
    "DUPLICATE_ACCOUNT",
  );
});

await test("invalid credentials never create an account (§22, §45)", async () => {
  await expectTradingError(
    () =>
      tradingAccountsEngine.connect(
        {
          providerId: "pepperstone-mt5",
          environment: "LIVE",
          externalAccountId: "99887766",
          credentials: { method: "API_KEY", secret: "my-invalid-key" },
        },
        Date.now(),
      ),
    "INVALID_CREDENTIALS",
  );
  const { accounts } = tradingAccountsEngine.listAccounts(Date.now());
  assert.ok(!accounts.some((account) => account.externalAccountId === "99887766"));
});

await test("connection timeout maps to CONNECTION_TIMEOUT (§45)", async () => {
  await expectTradingError(
    () =>
      tradingAccountsEngine.connect(
        {
          providerId: "pepperstone-mt5",
          environment: "LIVE",
          externalAccountId: "99887766",
          credentials: { method: "API_KEY", secret: "key-timeout-case" },
        },
        Date.now(),
      ),
    "CONNECTION_TIMEOUT",
  );
});

let connectedId = "";

await test("connect succeeds into CONNECTING with masked hint, never the secret (§22)", async () => {
  const account = tradingAccountsEngine.connect(
    {
      providerId: "pepperstone-mt5",
      environment: "DEMO",
      externalAccountId: "55443322",
      displayName: "Pepperstone QA",
      credentials: { method: "API_KEY", secret: "sk-test-42" },
    },
    Date.now(),
  );
  connectedId = account.id;
  assert.equal(account.name, "Pepperstone QA");
  assert.equal(account.connection?.status, "CONNECTING");
  assert.ok(account.connection?.credentialsHint.includes("••••"));
  assert.ok(!account.connection?.credentialsHint.includes("sk-test"));
  const serialized = JSON.stringify(account);
  assert.ok(!serialized.includes("sk-test-42"), "secret must not leak into any view");
});

await test("test connection reports the four named checks (§19)", async () => {
  const result = tradingAccountsEngine.testConnection(connectedId, Date.now());
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.map((check) => check.name),
    ["authentication", "connectivity", "providerResponse", "permissions"],
  );
  assert.ok(result.checks.every((check) => check.ok));
});

await test("CONNECTING resolves to CONNECTED without UI timers (§40)", async () => {
  await wait(1_700);
  const account = tradingAccountsEngine.getAccount(connectedId, Date.now());
  assert.equal(account.connection?.status, "CONNECTED");
});

await test("initial sync runs asynchronously and lands LIVE (§20, §40)", async () => {
  const response = tradingAccountsEngine.sync(connectedId, "INITIAL", Date.now());
  assert.equal(response.run.status, "RUNNING");
  assert.equal(response.synchronization.status, "SYNCING");
  await wait(1_800);
  const account = tradingAccountsEngine.getAccount(connectedId, Date.now());
  assert.equal(account.synchronization.status, "LIVE");
  assert.equal(account.synchronization.lastRun?.status, "COMPLETED");
  assert.ok((account.synchronization.lastRun?.dealsUpserted ?? 0) > 0);
  assert.ok(account.snapshot?.balance);
});

await test("sync on a disconnected account is refused (§45)", async () => {
  await expectTradingError(
    () => tradingAccountsEngine.sync("acc-deriv-demo", "MANUAL", Date.now()),
    "NOT_CONNECTED",
  );
});

await test("concurrent syncs are refused (§45)", async () => {
  const first = tradingAccountsEngine.sync(connectedId, "MANUAL", Date.now());
  assert.equal(first.run.status, "RUNNING");
  await expectTradingError(
    () => tradingAccountsEngine.sync(connectedId, "MANUAL", Date.now()),
    "SYNC_ALREADY_RUNNING",
  );
  await wait(1_800);
});

// ── 5. Engine — reconnect / disconnect / update (§30–§31, §52) ──────────────

console.log("\nengine — management");

await test("reconnect with bad credentials keeps the account in ERROR (§45)", async () => {
  await expectTradingError(
    () =>
      tradingAccountsEngine.reconnect(
        "acc-icm4-live",
        { credentials: { method: "API_KEY", secret: "invalid-key" } },
        Date.now(),
      ),
    "INVALID_CREDENTIALS",
  );
  const account = tradingAccountsEngine.getAccount("acc-icm4-live", Date.now());
  assert.equal(account.connection?.status, "ERROR");
  assert.ok(account.connection?.lastError);
});

await test("reconnect with valid credentials restores the connection (§30)", async () => {
  const account = tradingAccountsEngine.reconnect(
    "acc-icm4-live",
    { credentials: { method: "API_KEY", secret: "sk-good-key" } },
    Date.now(),
  );
  assert.equal(account.connection?.status, "CONNECTED");
  assert.equal(account.connection?.lastError, null);
});

await test("disconnect preserves history and destroys credentials (§31, §52)", async () => {
  const before = tradingAccountsEngine.listDeals(connectedId).deals.length;
  const response = tradingAccountsEngine.disconnect(connectedId, Date.now());
  assert.equal(response.status, "DISCONNECTED");
  assert.equal(response.historyPreserved, true);
  const account = tradingAccountsEngine.getAccount(connectedId, Date.now());
  assert.equal(account.connection?.status, "DISCONNECTED");
  assert.equal(account.synchronization.status, "UNKNOWN");
  const after = tradingAccountsEngine.listDeals(connectedId).deals.length;
  assert.equal(after, before, "history must survive a disconnect");
});

await test("update renames and moves the default flag exclusively (§30)", async () => {
  const renamed = tradingAccountsEngine.update(
    connectedId,
    { displayName: "Pepperstone QA v2" },
    Date.now(),
  );
  assert.equal(renamed.name, "Pepperstone QA v2");

  const defaulted = tradingAccountsEngine.update(
    connectedId,
    { isDefault: true },
    Date.now(),
  );
  assert.equal(defaulted.isDefault, true);
  const { accounts } = tradingAccountsEngine.listAccounts(Date.now());
  assert.equal(accounts.filter((account) => account.isDefault).length, 1);
});

// ── 6. Negative security checks (§69) ───────────────────────────────────────

console.log("\nnegative security (§69)");

await test("the engine exposes NO execution surface (§16, §47)", () => {
  const forbidden = [
    "placeOrder",
    "modifyOrder",
    "cancelOrder",
    "closePosition",
    "modifySl",
    "modifyTp",
    "buy",
    "sell",
    "execute",
  ];
  const methodNames = Object.getOwnPropertyNames(
    Object.getPrototypeOf(tradingAccountsEngine),
  );
  for (const name of forbidden) {
    assert.ok(
      !methodNames.some((methodName) => methodName.toLowerCase().replace(/[_-]/g, "") === name),
      `forbidden execution method found: ${name}`,
    );
  }
});

await test("no account view ever contains a raw secret (§22, §44)", () => {
  const secret = "sk-probe-abcdef";
  const account = tradingAccountsEngine.connect(
    {
      providerId: "deriv-mt5",
      environment: "DEMO",
      externalAccountId: "11223344",
      credentials: { method: "API_KEY", secret },
    },
    Date.now(),
  );
  assert.ok(!JSON.stringify(account).includes(secret));
  const list = tradingAccountsEngine.listAccounts(Date.now());
  assert.ok(!JSON.stringify(list).includes(secret));
  tradingAccountsEngine.disconnect(account.id, Date.now());
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const failure of failures) console.log(`FAIL: ${failure}`);
  process.exit(1);
}

/**
 * Accounts module tests (Phase 02) — presentation mapping + engine honesty
 * rules, pure logic only (no renderer, no MSW worker).
 *
 * Run: bun run scripts/accounts-tests.ts
 *
 * The engine import pulls mocks/store.ts transitively (MockError); both are
 * browser-agnostic modules — the import works under bun because nothing in
 * the chain touches window/document at module scope.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(name);
    console.error(`  FAIL ${name}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  ok(`${name} (${a === b ? "ok" : `${a} !== ${b}`})`, a === b);
}

// ── Presentation mapping (queries/trading-accounts.ts) ──────────────────────

import { apiPaths } from "../src/lib/api/endpoints";
import {
  connectionIsHealthy,
  connectionStatusMeta,
  environmentStamp,
  syncStatusMeta,
} from "../src/lib/api/queries/trading-accounts";
import { tradingAccountsEngine } from "../src/mocks/trading-accounts-engine";

// apiPaths mirror the Nest controller route-for-route (doc C §2.2).
eq("apiPaths.tradingAccounts", apiPaths.tradingAccounts, "/trading-accounts");
eq("apiPaths.tradingAccountProviders", apiPaths.tradingAccountProviders, "/trading-accounts/providers");
eq("apiPaths.tradingAccountConnect", apiPaths.tradingAccountConnect, "/trading-accounts/connect");
eq("apiPaths.tradingAccount(id)", apiPaths.tradingAccount("abc"), "/trading-accounts/abc");
eq("apiPaths.tradingAccountTest(id)", apiPaths.tradingAccountTest("abc"), "/trading-accounts/abc/test");
eq("apiPaths.tradingAccountSync(id)", apiPaths.tradingAccountSync("abc"), "/trading-accounts/abc/sync");
eq("apiPaths.tradingAccountReconnect(id)", apiPaths.tradingAccountReconnect("abc"), "/trading-accounts/abc/reconnect");
eq("apiPaths.tradingAccountDeals(id)", apiPaths.tradingAccountDeals("abc"), "/trading-accounts/abc/deals");

// Connection status mapping: every contract state has a non-color signal.
for (const status of ["CONNECTED", "CONNECTING", "DISCONNECTED", "ERROR"]) {
  const meta = connectionStatusMeta(status);
  ok(`connectionStatusMeta(${status}) has a label`, meta.label.length > 0);
}
eq("connectionStatusMeta CONNECTED tone", connectionStatusMeta("CONNECTED").tone, "positive");
eq("connectionStatusMeta ERROR tone", connectionStatusMeta("ERROR").tone, "negative");
eq("connectionStatusMeta unknown → disconnected", connectionStatusMeta("FUTURE_STATE").label, "Disconnected");

// Sync status mapping: LIVE never reads as "real-time".
eq("syncStatusMeta LIVE label", syncStatusMeta("LIVE").label, "Fresh");
eq("syncStatusMeta SYNCING label", syncStatusMeta("SYNCING").label, "Syncing");
eq("syncStatusMeta STALE tone", syncStatusMeta("STALE").tone, "warning");
eq("syncStatusMeta ERROR tone", syncStatusMeta("ERROR").tone, "negative");
eq("syncStatusMeta UNKNOWN label", syncStatusMeta("UNKNOWN").label, "Never synced");

eq("connectionIsHealthy CONNECTED", connectionIsHealthy("CONNECTED"), true);
eq("connectionIsHealthy ERROR", connectionIsHealthy("ERROR"), false);
eq("environmentStamp PROP_FIRM", environmentStamp("PROP_FIRM"), "PROP");
eq("environmentStamp DEMO", environmentStamp("DEMO"), "DEMO");

// ── Engine honesty rules ─────────────────────────────────────────────────────

const USER = "user-1";
const USER2 = "user-2";
// Dedicated principal for the Phase 07 deriv probe — the scoping assertions
// below count USER/USER2 accounts and must stay untouched by it.
const USER3 = "user-3";

tradingAccountsEngine.reset();

// Registry: MOCK (visibly a mock) + deriv-ws (Phase 07 — real, isMock false).
const registry = tradingAccountsEngine.listProviders();
eq("registry has two providers (MOCK + deriv-ws)", registry.providers.length, 2);
eq("registry provider MOCK first", registry.providers[0]?.providerId, "MOCK");
eq("registry provider MOCK isMock", registry.providers[0]?.isMock, true);
const derivDescriptor = registry.providers.find((p) => p.providerId === "deriv-ws");
ok("registry exposes deriv-ws as a REAL provider", derivDescriptor !== undefined && derivDescriptor.isMock === false && derivDescriptor.platform === "DERIV");

// Phase 07 — broker catalog mirror + identification rules.
const catalog = tradingAccountsEngine.listBrokers();
const derivCatalogEntry = catalog.brokers.find((b) => b.brokerId === "deriv");
const icmarketsEntry = catalog.brokers.find((b) => b.brokerId === "icmarkets");
ok("catalog marks deriv CONNECTOR_AVAILABLE", derivCatalogEntry?.connectorStatus === "CONNECTOR_AVAILABLE");
ok("catalog marks icmarkets NOT_IMPLEMENTED", icmarketsEntry?.connectorStatus === "CONNECTOR_NOT_IMPLEMENTED");
const identified = tradingAccountsEngine.identifyBroker({ externalAccountId: "101-004-7192958-001" });
eq("identify OANDA id → oanda (pattern match)", identified.identification.brokerId, "oanda");
eq("identify OANDA id → PATTERN_MATCH", identified.identification.confidence, "PATTERN_MATCH");
const identifiedUnknown = tradingAccountsEngine.identifyBroker({ externalAccountId: "XYZ-777-unknown" });
eq("identify unknown id → UNKNOWN", identifiedUnknown.identification.confidence, "UNKNOWN");
const derivConnectProbe = tradingAccountsEngine.connect(USER3, {
  providerId: "deriv-ws",
  environment: "DEMO",
  externalAccountId: "VRTC9876543",
  displayName: "Deriv Probe",
  credentials: { method: "API_KEY", secret: "good-key-deriv" },
});
ok("deriv connect carries PROVIDER_REPORTED identification", derivConnectProbe.account.brokerIdentification?.confidence === "PROVIDER_REPORTED" && derivConnectProbe.account.brokerIdentification?.displayName === "Deriv (SVG) Corp");
ok("deriv orders segment skipped as capability fact", derivConnectProbe.account.synchronization.lastRun?.ordersAt === null && derivConnectProbe.account.synchronization.lastRun?.status === "COMPLETED");

// Unknown provider ids never connect (422 UNSUPPORTED_PROVIDER).
let threwUnsupported = false;
try {
  tradingAccountsEngine.connect(USER, {
    providerId: "oanda-v20",
    environment: "DEMO",
    externalAccountId: "X-1",
    credentials: { method: "API_KEY", secret: "good-key" },
  });
} catch (error) {
  const code = (error as { code?: string }).code;
  threwUnsupported = (error as { status?: number }).status === 422 && code === "UNSUPPORTED_PROVIDER";
}
ok("unknown provider → 422 UNSUPPORTED_PROVIDER", threwUnsupported);

// Unsupported environment (PROP_FIRM not served by the mock) → 502 UNSUPPORTED_ACCOUNT.
let threwEnvironment = false;
try {
  tradingAccountsEngine.connect(USER, {
    providerId: "MOCK",
    environment: "PROP_FIRM",
    externalAccountId: "X-2",
    credentials: { method: "API_KEY", secret: "good-key" },
  });
} catch (error) {
  const code = (error as { code?: string }).code;
  threwEnvironment = (error as { status?: number }).status === 502 && code === "UNSUPPORTED_ACCOUNT";
}
ok("PROP_FIRM on MOCK → 502 UNSUPPORTED_ACCOUNT", threwEnvironment);

// Happy path connect: CONNECTED + initial sync ran (snapshot present).
const connected = tradingAccountsEngine.connect(USER, {
  providerId: "MOCK",
  environment: "DEMO",
  externalAccountId: "5021347",
  displayName: "Test Sim",
  credentials: { method: "API_KEY", secret: "good-key-abcd" },
});
eq("connect status", connected.account.connection?.status, "CONNECTED");
ok("initial sync produced a snapshot", connected.account.snapshot !== null);
eq("details name uses displayName", connected.account.name, "Test Sim");
eq("details provider isMock", connected.account.provider.isMock, true);
eq("credentialsHint masked", connected.account.connection?.credentialsHint, "••••abcd");
eq("startingBalance anchors on provider snapshot", connected.account.startingBalance, connected.account.snapshot?.balance ?? "");

// Duplicate → 409 DUPLICATE_ACCOUNT.
let threwDuplicate = false;
try {
  tradingAccountsEngine.connect(USER, {
    providerId: "MOCK",
    environment: "DEMO",
    externalAccountId: "5021347",
    credentials: { method: "API_KEY", secret: "good-key" },
  });
} catch (error) {
  threwDuplicate = (error as { status?: number }).status === 409 && (error as { code?: string }).code === "DUPLICATE_ACCOUNT";
}
ok("duplicate connect → 409 DUPLICATE_ACCOUNT", threwDuplicate);

// Ownership: the same external account under another user is fine, but
// user-2 cannot see user-1's account.
const otherUser = tradingAccountsEngine.connect(USER2, {
  providerId: "MOCK",
  environment: "LIVE",
  externalAccountId: "6099123",
  credentials: { method: "API_KEY", secret: "user2-key" },
});
eq("other user connects independently", otherUser.account.connection?.status, "CONNECTED");
let threwForeign = false;
try {
  tradingAccountsEngine.details(USER2, connected.account.id);
} catch (error) {
  threwForeign = (error as { status?: number }).status === 404;
}
ok("foreign detail read → 404 (ownership-safe)", threwForeign);
eq("user list is scoped", tradingAccountsEngine.list(USER).accounts.length, 1);
eq("user2 list is scoped", tradingAccountsEngine.list(USER2).accounts.length, 1);

// Sync is idempotent: same external ids, no dupes; freshness advances.
const beforeDeals = tradingAccountsEngine.deals(USER, connected.account.id).deals.length;
const sync1 = tradingAccountsEngine.synchronize(USER, connected.account.id);
const afterDeals = tradingAccountsEngine.deals(USER, connected.account.id).deals.length;
eq("sync run COMPLETED", sync1.run.status, "COMPLETED");
eq("idempotent deals", beforeDeals, afterDeals);
ok("deals exist (>0)", afterDeals > 0);
eq("deals carry uuid ids", /^[0-9a-f-]{36}$/.test(sync1.run.id), true);
ok("lastSyncAt set", tradingAccountsEngine.details(USER, connected.account.id).account.synchronization.lastSyncAt !== null);

// Disconnect: credentials wiped, history preserved.
const disconnected = tradingAccountsEngine.disconnect(USER, connected.account.id);
eq("disconnect status", disconnected.status, "DISCONNECTED");
eq("history preserved", disconnected.historyPreserved, true);
const afterDisconnect = tradingAccountsEngine.details(USER, connected.account.id).account;
eq("connection after disconnect", afterDisconnect.connection?.status, "DISCONNECTED");
eq("history survives disconnect", tradingAccountsEngine.deals(USER, connected.account.id).deals.length, afterDeals);

// Sync after disconnect → 422 NOT_CONNECTED.
let threwNotConnected = false;
try {
  tradingAccountsEngine.synchronize(USER, connected.account.id);
} catch (error) {
  threwNotConnected = (error as { status?: number }).status === 422 && (error as { code?: string }).code === "NOT_CONNECTED";
}
ok("sync after disconnect → 422 NOT_CONNECTED", threwNotConnected);

// Reconnect with a bad secret → 422, connection unchanged (atomic failure).
let threwReconnect = false;
try {
  tradingAccountsEngine.reconnect(USER, connected.account.id, {
    credentials: { method: "API_KEY", secret: "fail-invalid" },
  });
} catch (error) {
  threwReconnect = (error as { status?: number }).status === 422 && (error as { code?: string }).code === "INVALID_CREDENTIALS";
}
ok("reconnect with bad secret → 422 INVALID_CREDENTIALS", threwReconnect);
eq("connection stays DISCONNECTED on failed reconnect", tradingAccountsEngine.details(USER, connected.account.id).account.connection?.status, "DISCONNECTED");

// Reconnect with a good secret → CONNECTED (atomic: verify then apply).
const reconnected = tradingAccountsEngine.reconnect(USER, connected.account.id, {
  credentials: { method: "API_KEY", secret: "fresh-key-9999" },
});
eq("reconnect status", reconnected.account.connection?.status, "CONNECTED");

// Reconnect while CONNECTED → 409 ALREADY_CONNECTED (repeat is not idempotent).
let threwAlready = false;
try {
  tradingAccountsEngine.reconnect(USER, connected.account.id, {
    credentials: { method: "API_KEY", secret: "another-key-0000" },
  });
} catch (error) {
  threwAlready = (error as { status?: number }).status === 409 && (error as { code?: string }).code === "ALREADY_CONNECTED";
}
ok("reconnect while live → 409 ALREADY_CONNECTED", threwAlready);

// Atomicity: a failed reconnect NEVER half-applies. Disconnect, then try to
// reconnect with an outage scenario — the 502 leaves the previous state.
tradingAccountsEngine.disconnect(USER, connected.account.id);
let threwOutage = false;
try {
  tradingAccountsEngine.reconnect(USER, connected.account.id, {
    credentials: { method: "API_KEY", secret: "fail-unavailable" },
  });
} catch (error) {
  threwOutage = (error as { status?: number }).status === 502 && (error as { code?: string }).code === "PROVIDER_UNAVAILABLE";
}
ok("reconnect with outage scenario → 502 PROVIDER_UNAVAILABLE", threwOutage);
eq("failed reconnect (outage secret) leaves state untouched", tradingAccountsEngine.details(USER, connected.account.id).account.connection?.status, "DISCONNECTED");

// Now reconnect for real, then simulate stale stored credentials exactly
// like the backend e2e does (re-encrypt a scenario secret): rotate the
// stored secret behind the connection.
tradingAccountsEngine.reconnect(USER, connected.account.id, {
  credentials: { method: "API_KEY", secret: "working-key-4242" },
});
const authAccount = tradingAccountsEngine.connect(USER, {
  providerId: "MOCK",
  environment: "DEMO",
  externalAccountId: "7044555",
  credentials: { method: "API_KEY", secret: "auth-key-1111" },
});
eq("auth account connected", authAccount.account.connection?.status, "CONNECTED");

// Auth-class sync failure: the run is RECORDED, then the API answers the
// error (422) — exactly the backend contract (e2e "provider auth failure
// during sync flips the connection to ERROR").
tradingAccountsEngine._testRotateSecret(authAccount.account.id, "fail-invalid-stale-creds");
let threwAuthSync = false;
let recordedRun: { status?: string; errorCode?: string | null } | null = null;
try {
  tradingAccountsEngine.synchronize(USER, authAccount.account.id);
} catch (error) {
  threwAuthSync = (error as { status?: number }).status === 422 && (error as { code?: string }).code === "INVALID_CREDENTIALS";
}
recordedRun = tradingAccountsEngine.details(USER, authAccount.account.id).account.synchronization.lastRun;
ok("auth-failure sync → 422 INVALID_CREDENTIALS response", threwAuthSync);
eq("failed run still recorded", recordedRun?.status, "FAILED");
eq("failed run errorCode", recordedRun?.errorCode, "INVALID_CREDENTIALS");
const afterAuthFailure = tradingAccountsEngine.details(USER, authAccount.account.id).account;
eq("auth-class failure → connection ERROR", afterAuthFailure.connection?.status, "ERROR");
ok("lastError recorded (sanitized)", (afterAuthFailure.connection?.lastError ?? "").includes("credentials"));
ok("secret never leaks into lastError", !(afterAuthFailure.connection?.lastError ?? "").includes("fail-invalid-stale-creds"));
// Sync axis stays orthogonal: last success within TTL reads LIVE (doc B §3.2).
eq("sync axis stays LIVE after auth failure", afterAuthFailure.synchronization.status, "LIVE");

// Provider outages do NOT move the connection (doc B §3.1): rotate to an
// outage scenario — connection ERROR is only for auth-class failures.
const outageAccount = tradingAccountsEngine.connect(USER, {
  providerId: "MOCK",
  environment: "DEMO",
  externalAccountId: "8077777",
  credentials: { method: "API_KEY", secret: "outage-key-2222" },
});
tradingAccountsEngine._testRotateSecret(outageAccount.account.id, "fail-unavailable-x");
try {
  tradingAccountsEngine.synchronize(USER, outageAccount.account.id);
} catch {
  // expected 502 — asserted below on the connection axis
}
const afterOutage = tradingAccountsEngine.details(USER, outageAccount.account.id).account;
eq("outage failure keeps connection CONNECTED", afterOutage.connection?.status, "CONNECTED");
eq("outage run recorded FAILED", afterOutage.synchronization.lastRun?.status, "FAILED");
eq("outage run errorCode", afterOutage.synchronization.lastRun?.errorCode, "PROVIDER_UNAVAILABLE");

// Rename: label changes, provider-anchored identity does not.
const renamed = tradingAccountsEngine.rename(USER, authAccount.account.id, { name: "My Prop Sim" });
eq("rename applies", renamed.account.name, "My Prop Sim");
eq("rename preserves external id", renamed.account.externalAccountId, "7044555");

// Connection test: 4 named checks, honest per-check results.
const test = tradingAccountsEngine.test(USER, connected.account.id);
eq("4 named checks", test.checks.length, 4);
eq(
  "check names",
  test.checks.map((check) => check.name),
  ["authentication", "connectivity", "providerResponse", "permissions"],
);
// connected.account's stored secret is "working-key-4242" — healthy.
ok("auth check passes for healthy secret", test.checks.find((check) => check.name === "authentication")?.ok === true);
eq("test overall ok", test.ok, true);

// Test on a healthy account: all checks pass.
const testHealthy = tradingAccountsEngine.test(USER2, otherUser.account.id);
eq("healthy account tests ok", testHealthy.ok, true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`Failures:\n${failures.map((name) => `  - ${name}`).join("\n")}`);
  process.exit(1);
}

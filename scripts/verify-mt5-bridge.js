#!/usr/bin/env node
/**
 * verify-mt5-bridge.js — end-to-end probe of the MT5 terminal bridge (Phase 08).
 *
 * Simulates EXACTLY what the EuforiaBridge.mq5 EA does from the user's
 * terminal: signed pushes (HMAC-SHA256 over the canonical serialization) to
 * the public ingest endpoint, then exercises the full loop:
 *
 *   register → verify → login
 *   → connect (PLATFORM_BRIDGE pairing) → pairing sheet returned
 *   → rejection paths (missing header, bad signature, stale timestamp)
 *   → ACCOUNT_INFO / SNAPSHOT / POSITIONS / ORDERS / DEALS pushes (IC Markets demo shape)
 *   → POST /trading-accounts/:id/sync (pull orchestrator over the push log)
 *   → POST /trades/sync (deals → journal trades reconstruction)
 *   → details assertions (broker identified IC Markets, currency, snapshot)
 *   → pairing re-view + rotate → old secret rejected, new secret accepted
 *
 * Usage: node scripts/verify-mt5-bridge.js
 * Requires: the API running on :4000 (fresh enough to read its own log for
 * the dev-mailer verification token at scripts/api-run.log).
 */
const fs = require("node:fs");
const crypto = require("node:crypto");

const BASE = "http://localhost:4000/api/v1";
const LOG = "/home/z/my-project/scripts/api-run.log";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The EA's exact signing construction (mirrored 1:1 in MQL5). */
function sign(secret, timestampMs, envelope) {
  const canonical = `${timestampMs}.${JSON.stringify({
    eventId: envelope.eventId,
    kind: envelope.kind,
    payload: envelope.payload,
  })}`;
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

let eventIdCounter = 0;
function makeEventId(login) {
  eventIdCounter += 1;
  return `ea-${login}-${Date.now()}-${eventIdCounter}`;
}

async function push(secret, login, kind, payload, overrides = {}) {
  const eventId = overrides.eventId ?? makeEventId(login);
  const timestampMs = overrides.timestampMs ?? Date.now();
  const envelope = { eventId, kind, payload };
  const keyId = overrides.keyId;
  const signatureHex = overrides.signatureHex ?? sign(secret, timestampMs, envelope);
  const headers = {
    "content-type": "application/json",
    "x-bridge-key": keyId,
    "x-bridge-timestamp": String(timestampMs),
    "x-bridge-signature": signatureHex,
    "x-bridge-event-id": eventId,
  };
  if (headers["x-bridge-key"] === undefined) delete headers["x-bridge-key"];
  const res = await fetch(`${BASE}/trading-accounts/bridge/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(envelope),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  console.log("— MT5 terminal bridge e2e probe —");
  const email = `bridge-${Date.now()}@cosmoz.test`;
  const password = "Bridge!2026x";

  // 1. register → verify (dev mailer token in the API log) → login
  const reg = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: "Bridge Probe" }),
  });
  check("register", reg.status === 201 || reg.status === 200, `status ${reg.status}`);
  await sleep(3000); // pino async worker flush
  const log = fs.readFileSync(LOG, "utf8");
  const tokens = [...log.matchAll(/token=([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  const verifyToken = tokens[tokens.length - 1];
  const ver = await fetch(`${BASE}/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: verifyToken }),
  });
  check("verify email (dev mailer token)", ver.status === 200 || ver.status === 201);
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, remember: true }),
  });
  check("login", loginRes.status === 200, `status ${loginRes.status}`);
  const loginBody = await loginRes.json();
  const accessToken =
    loginBody.accessToken ?? loginBody?.tokens?.accessToken ?? loginBody?.access_token;
  const auth = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  check("access token present", Boolean(accessToken));

  // 2. connect — PLATFORM_BRIDGE pairing (no client credentials!)
  const MT5_LOGIN = "52988790";
  const connectRes = await fetch(`${BASE}/trading-accounts/connect`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      providerId: "mt5-bridge",
      environment: "DEMO",
      externalAccountId: MT5_LOGIN,
      displayName: "IC Markets Demo",
    }),
  });
  const connectBody = await connectRes.json().catch(() => ({}));
  check(
    "connect (bridge pairing)",
    connectRes.status === 200 || connectRes.status === 201,
    `status ${connectRes.status} ${JSON.stringify(connectBody).slice(0, 160)}`,
  );
  const account = connectBody.account;
  check("account registered", Boolean(account?.id));
  check(
    "connection CONNECTING (awaiting first push)",
    account?.connection?.status === "CONNECTING",
    `status ${account?.connection?.status}`,
  );
  check(
    "connection method PLATFORM_BRIDGE",
    account?.connection?.method === "PLATFORM_BRIDGE",
  );
  const pairing = account?.pairing;
  check("pairing sheet returned", Boolean(pairing?.secret && pairing?.bridgeKeyId));
  check(
    "initial identification honest UNKNOWN",
    account?.brokerIdentification?.confidence === "UNKNOWN",
    `${account?.brokerIdentification?.displayName}`,
  );
  const keyId = pairing.bridgeKeyId;
  const secret = pairing.secret;

  // 3. rejection paths
  const missingKey = await fetch(`${BASE}/trading-accounts/bridge/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: makeEventId(MT5_LOGIN), kind: "SNAPSHOT", payload: {} }),
  });
  check("reject: missing key header (401)", missingKey.status === 401);

  const badSig = await push("wrong-secret-entirely", MT5_LOGIN, "SNAPSHOT", {
    balance: "10000",
  }, { keyId, eventId: makeEventId(MT5_LOGIN) });
  check("reject: bad signature (401)", badSig.status === 401, `code ${badSig.body?.code}`);

  const stale = await push(secret, MT5_LOGIN, "SNAPSHOT", { balance: "10000" }, {
    keyId,
    timestampMs: Date.now() - 10 * 60 * 1000,
    eventId: makeEventId(MT5_LOGIN),
  });
  check("reject: stale timestamp (401)", stale.status === 401, `code ${stale.body?.code}`);

  const badPayload = await push(secret, MT5_LOGIN, "ACCOUNT_INFO", {
    externalAccountId: MT5_LOGIN,
    currency: "XXX_NOT_A_CURRENCY",
  }, { keyId, eventId: makeEventId(MT5_LOGIN) });
  check(
    "reject: malformed payload (400/422)",
    badPayload.status === 422 || badPayload.status === 400,
    `status ${badPayload.status}`,
  );

  // 4. the EA's cycle: ACCOUNT_INFO first (activation + identification)
  const info = await push(secret, MT5_LOGIN, "ACCOUNT_INFO", {
    externalAccountId: MT5_LOGIN,
    currency: "USD",
    leverage: "500",
    server: "ICMarketsSC-MT5",
    brokerName: "IC Markets (SC) Global",
    accountClass: "DEMO",
  }, { keyId });
  check("push ACCOUNT_INFO accepted", info.status === 200 && info.body?.accepted === true, JSON.stringify(info.body));
  check("first push activates pairing", info.body?.state === "CONNECTED");

  // 5. snapshot + positions + orders + deals (IC Markets demo shape)
  const snap = await push(secret, MT5_LOGIN, "SNAPSHOT", {
    balance: "10250.48",
    equity: "10412.16",
    margin: "318.22",
    freeMargin: "10093.94",
    marginLevel: "3271.81",
  }, { keyId });
  check("push SNAPSHOT accepted", snap.status === 200 && snap.body?.duplicate === false);

  const positions = await push(secret, MT5_LOGIN, "POSITIONS", {
    positions: [
      {
        externalPositionId: "7005312001",
        symbol: "XAUUSD",
        side: "BUY",
        volume: "0.10",
        entryPrice: "4187.350",
        currentPrice: "4201.120",
        stopLoss: "4165.000",
        takeProfit: "4240.000",
        profit: "13.77",
        swap: "-0.42",
        commission: "-0.65",
        openedAt: new Date(Date.now() - 3600_000).toISOString(),
      },
      {
        externalPositionId: "7005312002",
        symbol: "EURUSD",
        side: "SELL",
        volume: "0.50",
        entryPrice: "1.16240",
        currentPrice: "1.16110",
        stopLoss: null,
        takeProfit: "1.15800",
        profit: "6.50",
        swap: "0.18",
        commission: "-3.50",
        openedAt: new Date(Date.now() - 7200_000).toISOString(),
      },
    ],
  }, { keyId });
  check("push POSITIONS accepted", positions.status === 200);

  const orders = await push(secret, MT5_LOGIN, "ORDERS", {
    orders: [
      {
        externalOrderId: "7019983001",
        symbol: "US30",
        type: "BUY_LIMIT",
        volume: "0.20",
        price: "46850.0",
        stopLoss: "46700.0",
        takeProfit: "47200.0",
        status: "PLACED",
        createdAt: new Date(Date.now() - 600_000).toISOString(),
        updatedAt: null,
      },
    ],
  }, { keyId });
  check("push ORDERS accepted", orders.status === 200);

  const now = Date.now();
  const deals = await push(secret, MT5_LOGIN, "DEALS", {
    observedThrough: String(Math.floor(now / 1000) - 60),
    complete: true,
    deals: [
      // Position 1: XAUUSD BUY 0.10 — entry + exit (closed)
      { externalDealId: "TXN-900001", symbol: "XAUUSD", side: "BUY", volume: "0.10", price: "4150.100", profit: "0.00", commission: "-0.65", swap: "0.00", positionId: "7005310001", executedAt: new Date(now - 5 * 86400_000).toISOString() },
      { externalDealId: "TXN-900002", symbol: "XAUUSD", side: "SELL", volume: "0.10", price: "4188.300", profit: "38.20", commission: "-0.65", swap: "-1.20", positionId: "7005310001", executedAt: new Date(now - 5 * 86400_000 + 7200_000).toISOString() },
      // Position 2: EURUSD SELL 0.50 — entry + exit (closed)
      { externalDealId: "TXN-900003", symbol: "EURUSD", side: "SELL", volume: "0.50", price: "1.16500", profit: "0.00", commission: "-3.50", swap: "0.00", positionId: "7005310002", executedAt: new Date(now - 4 * 86400_000).toISOString() },
      { externalDealId: "TXN-900004", symbol: "EURUSD", side: "BUY", volume: "0.50", price: "1.16120", profit: "19.00", commission: "-3.50", swap: "0.85", positionId: "7005310002", executedAt: new Date(now - 4 * 86400_000 + 5400_000).toISOString() },
      // Position 3: BTCUSDT BUY 0.02 — entry + exit (closed, loser)
      { externalDealId: "TXN-900005", symbol: "BTCUSDT", side: "BUY", volume: "0.02", price: "121400.00", profit: "0.00", commission: "-1.80", swap: "0.00", positionId: "7005310003", executedAt: new Date(now - 3 * 86400_000).toISOString() },
      { externalDealId: "TXN-900006", symbol: "BTCUSDT", side: "SELL", volume: "0.02", price: "120870.00", profit: "-10.60", commission: "-1.80", swap: "-0.40", positionId: "7005310003", executedAt: new Date(now - 3 * 86400_000 + 9600_000).toISOString() },
    ],
  }, { keyId });
  check("push DEALS accepted (6 deals)", deals.status === 200);

  // 6. idempotency — same event id twice
  const fixedReplayId = `ea-${MT5_LOGIN}-${Date.now()}-replay-fixed-id`;
  const replay = await push(secret, MT5_LOGIN, "SNAPSHOT", {
    balance: "10250.48",
    equity: "10412.16",
    margin: "318.22",
    freeMargin: "10093.94",
    marginLevel: "3271.81",
  }, { keyId, eventId: fixedReplayId });
  const replayAgain = await push(secret, MT5_LOGIN, "SNAPSHOT", {
    balance: "10250.48",
    equity: "10412.16",
    margin: "318.22",
    freeMargin: "10093.94",
    marginLevel: "3271.81",
  }, { keyId, eventId: fixedReplayId });
  check(
    "replay acknowledged (duplicate=true, no double-apply)",
    replay.status === 200 && replayAgain.status === 200 && replayAgain.body?.duplicate === true,
    JSON.stringify(replayAgain.body),
  );

  // 7. orchestrator pull over the push log
  const syncRes = await fetch(`${BASE}/trading-accounts/${account.id}/sync`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({}),
  });
  const syncBody = await syncRes.json().catch(() => ({}));
  check(
    "sync run COMPLETED",
    syncRes.status === 200 && syncBody?.run?.status === "COMPLETED",
    `status ${syncRes.status} run=${syncBody?.run?.status} errorCode=${syncBody?.run?.errorCode ?? "-"}`,
  );
  check("deals segment upserted 6", syncBody?.run?.dealsUpserted === 6, `${syncBody?.run?.dealsUpserted}`);
  check("positions segment upserted 2", syncBody?.run?.positionsUpserted === 2, `${syncBody?.run?.positionsUpserted}`);
  check("orders segment upserted 1", syncBody?.run?.ordersUpserted === 1, `${syncBody?.run?.ordersUpserted}`);

  // 8. deals → journal trades reconstruction (LAZY — runs on list serving)
  const tradesRes = await fetch(`${BASE}/trades?accountId=${account.id}&limit=50`, { headers: auth });
  const tradesBody = await tradesRes.json().catch(() => ({}));
  const tradeList = tradesBody?.trades ?? tradesBody?.items ?? [];
  check("trades list reachable (lazy reconcile ran)", tradesRes.status === 200, `status ${tradesRes.status}`);
  check(
    "3 closed journal trades reconstructed from MT5 deals",
    Array.isArray(tradeList) && tradeList.length >= 3,
    `${tradeList.length} trades`,
  );
  // The journal trade view carries instrumentId (fixed seed UUIDs), not symbol.
  const XAUUSD_ID = "5b9c3e4a-9d86-4f4c-9b3a-4e0d7c9f1003";
  const xau = tradeList.find((t) => t.instrumentId === XAUUSD_ID);
  check(
    "XAUUSD trade reconstructed as EXTERNAL_SYNC closed BUY",
    Boolean(xau) && xau?.source === "EXTERNAL_SYNC" && xau?.status === "CLOSED",
    xau ? `dir=${xau.direction} pnlNet=${xau.pnlNet}` : "not found",
  );

  // 9. details: identification, currency, snapshot, freshness
  const detailsRes = await fetch(`${BASE}/trading-accounts/${account.id}`, { headers: auth });
  const detailsBody = await detailsRes.json().catch(() => ({}));
  const det = detailsBody?.account;
  check("details reachable", det?.id === account.id);
  check(
    "broker identified: IC Markets (PROVIDER_REPORTED from terminal company)",
    det?.brokerIdentification?.brokerId === "icmarkets" &&
      (det?.brokerIdentification?.confidence === "PROVIDER_REPORTED" ||
        det?.brokerIdentification?.confidence === "PATTERN_MATCH"),
    `${det?.brokerIdentification?.displayName} / ${det?.brokerIdentification?.confidence}`,
  );
  check("currency refreshed from push (USD)", det?.currency === "USD");
  check(
    "snapshot persisted (balance 10250.48)",
    det?.snapshot?.balance === "10250.48",
    `${det?.snapshot?.balance}`,
  );
  check("connection CONNECTED", det?.connection?.status === "CONNECTED");
  check(
    "pairing NOT leaked on read views",
    det?.pairing === undefined || det?.pairing === null,
  );

  // 10. pairing re-view + rotation
  const pairingView = await fetch(`${BASE}/trading-accounts/${account.id}/bridge/pairing`, { headers: auth });
  const pairingBody = await pairingView.json().catch(() => ({}));
  check("pairing re-view ok", pairingView.status === 200 && pairingBody?.pairing?.secret === secret);

  const rotate = await fetch(`${BASE}/trading-accounts/${account.id}/bridge/rotate`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({}),
  });
  const rotateBody = await rotate.json().catch(() => ({}));
  const newSecret = rotateBody?.account?.pairing?.secret;
  const newKeyId = rotateBody?.account?.pairing?.bridgeKeyId;
  check(
    "rotate returns a NEW secret + NEW key",
    rotate.status === 200 && Boolean(newSecret) && newSecret !== secret && Boolean(newKeyId) && newKeyId !== keyId,
  );
  const oldSecretPush = await push(secret, MT5_LOGIN, "SNAPSHOT", { balance: "1" }, {
    keyId: newKeyId,
    eventId: makeEventId(MT5_LOGIN),
  });
  check("old secret rejected after rotation (401)", oldSecretPush.status === 401);
  const newSecretPush = await push(newSecret, MT5_LOGIN, "SNAPSHOT", {
    balance: "10255.00",
    equity: "10416.00",
    margin: "318.22",
    freeMargin: "10097.78",
    marginLevel: "3272.90",
  }, { keyId: newKeyId, eventId: makeEventId(MT5_LOGIN) });
  check("new secret accepted after rotation", newSecretPush.status === 200, JSON.stringify(newSecretPush.body));

  console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("PROBE CRASH:", error);
  process.exit(1);
});

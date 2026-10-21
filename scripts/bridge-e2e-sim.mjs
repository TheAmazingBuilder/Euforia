#!/usr/bin/env node
/**
 * bridge-e2e-sim.mjs — EA-faithful MT5 terminal bridge simulator (Livrable 1).
 *
 * Replicates BYTE-FOR-BYTE what docs/bridge/EuforiaBridge.mq5 v1.0.1 pushes
 * (same JSON key order, same JDec/JStr semantics, same HMAC canonical string
 * `${ts}.${JSON.stringify({eventId,kind,payload})}`), against the LIVE API —
 * with the REAL IC Markets demo login (52988790) as the bridge account.
 *
 * The loop it proves (the same one the user's terminal will drive):
 *   connect(mt5-bridge, 52988790, DEMO) → pairing sheet
 *     → ACCOUNT_INFO (activates pairing, identifies "IC Markets (SC) Global")
 *     → SNAPSHOT → POSITIONS (open) → ORDERS (pending) → DEALS (3 closed
 *       netting positions + 1 balance op that must NOT become a trade)
 *     → POST sync (persist segments) → GET /trades (lazy reconcile) →
 *       3 closed trades + 1 open trade, exact net P&L.
 *
 * Read-only red line: this script NEVER places an order — it emulates the
 * EA's READ verbs only. It contains NO broker password: the bridge design
 * means Euforia never sees it.
 */
const BASE = "http://localhost:4000/api/v1";
const EMAIL = "trader@cosmoz.app";
const PASSWORD = "Cosmoz!Demo2026";
const MT5_LOGIN = "52988790";
const { createHmac } = await import("node:crypto");

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** EA JDec: DoubleToString(value, 5) — fixed 5-decimal STRING. */
const JDec = (value) => value.toFixed(5);
/** EA IsoUtc. */
const IsoUtc = (iso) => `${iso.slice(0, 19)}Z`;
/** EA MakeEventId — ea-<login>-<tick>-<counter>. */
let counter = 0;
let lastTick = 0;
function makeEventId() {
  const tick = Date.now();
  if (tick !== lastTick) {
    lastTick = tick;
    counter = 0;
  }
  counter += 1;
  return `ea-${MT5_LOGIN}-${tick}-${counter}`;
}

/**
 * EA PushEvent — envelope + canonical + HMAC + headers, byte-exact.
 * Returns { status, body } and prints the server verdict.
 */
async function pushEvent(endpoint, bridgeKey, bridgeSecret, kind, payloadJson) {
  const eventId = makeEventId();
  const ts = Date.now(); // v1.0.1: MILLISECOND epoch ((long)TimeGMT() * 1000)
  const envelope = `{"eventId":"${eventId}","kind":"${kind}","payload":${payloadJson}}`;
  const canonical = `${ts}.${envelope}`;
  const signature = createHmac("sha256", bridgeSecret).update(canonical).digest("hex");
  const res = await fetch(`${BASE}/trading-accounts/bridge/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bridge-key": bridgeKey,
      "x-bridge-timestamp": String(ts),
      "x-bridge-signature": signature,
      "x-bridge-event-id": eventId,
    },
    body: envelope,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ── 0. Auth (the seeded demo trader, real login flow) ────────────────────────
console.log("\n[0] auth — demo trader login");
const loginRes = await fetch(`${BASE}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, remember: true }),
});
const login = await loginRes.json();
check("login trader@cosmoz.app", loginRes.status === 200 && Boolean(login.accessToken), `status ${loginRes.status}`);
const auth = { authorization: `Bearer ${login.accessToken}`, "content-type": "application/json" };

// ── 1. Preflight — seed state (Livrable 2) + instrument catalog ─────────────
console.log("\n[1] preflight — seed state + instruments");
const accountsRes = await fetch(`${BASE}/accounts`, { headers: auth });
const accountsBody = await accountsRes.json();
const journalAccounts = accountsBody.accounts ?? [];
check("seeded journal account(s) present", journalAccounts.length >= 1, `${journalAccounts.length}`);
console.log(`        journal accounts: ${journalAccounts.map((a) => `${a.name} (${a.broker}, ${a.currency})`).join(" | ")}`);

const tradesRes = await fetch(`${BASE}/trades`, { headers: auth });
const tradesBody = await tradesRes.json();
console.log(`        seeded trades in journal: ${tradesBody.total ?? (tradesBody.trades ?? []).length}`);
check("seeded trades present (Livrable 2 loop)", (tradesBody.trades ?? []).length >= 1, `${(tradesBody.trades ?? []).length}`);

const neededSymbols = ["EURUSD", "XAUUSD", "GBPUSD"];
const instrumentsRes = await fetch(`${BASE}/instruments`, { headers: auth });
const instrumentsBody = await instrumentsRes.json();
const catalog = (instrumentsBody.instruments ?? []).map((i) => i.symbol);
const missing = neededSymbols.filter((s) => !catalog.includes(s));
check("bridge symbols in catalog (EURUSD/XAUUSD/GBPUSD)", missing.length === 0, `missing: ${missing.join(",") || "none"}`);
console.log(`        catalog: ${catalog.slice(0, 12).join(", ")}${catalog.length > 12 ? ` … (${catalog.length})` : ""}`);

// ── 2. Connect the bridge account (the REAL IC Markets demo login) ───────────
console.log("\n[2] connect — mt5-bridge, externalAccountId 52988790 (DEMO)");
let accountId = null;
let pairing = null;
const connectRes = await fetch(`${BASE}/trading-accounts/connect`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    providerId: "mt5-bridge",
    environment: "DEMO",
    externalAccountId: MT5_LOGIN,
    displayName: "IC Markets Demo 52988790",
  }),
});
const connectBody = await connectRes.json();
if (connectRes.status === 201) {
  accountId = connectBody.account.id;
  pairing = connectBody.account.pairing;
  check("connect 201 + pairing sheet", Boolean(accountId && pairing?.bridgeKeyId && pairing?.secret));
} else if (connectRes.status === 409) {
  // Idempotent re-run: locate the existing bridge account.
  const listRes = await fetch(`${BASE}/trading-accounts`, { headers: auth });
  const list = (await listRes.json()).accounts ?? [];
  const existing = list.find((a) => a.provider?.providerId === "mt5-bridge" && a.externalAccountId === MT5_LOGIN);
  accountId = existing?.id;
  const pairRes = await fetch(`${BASE}/trading-accounts/${accountId}/bridge/pairing`, { headers: auth });
  pairing = (await pairRes.json()).pairing;
  check("re-run: existing bridge account + pairing re-view", Boolean(accountId && pairing?.secret), `status ${connectRes.status}`);
} else {
  check("connect mt5-bridge", false, `status ${connectRes.status} ${JSON.stringify(connectBody)}`);
}
if (!accountId || !pairing?.secret) {
  console.log("\nABORT — no bridge account to push to.");
  process.exit(1);
}
console.log(`        accountId: ${accountId}`);
console.log(`        bridgeKey: ${pairing.bridgeKeyId}`);
console.log(`        ingest:    ${pairing.ingestPath} (every ${pairing.pushIntervalSeconds}s)`);
console.log(`        EA:        ${pairing.ea.fileName} v${pairing.ea.version}`);

// ── 3. The pushes (EA v1.0.1 byte-exact payloads) ────────────────────────────
console.log("\n[3] pushes — ACCOUNT_INFO / SNAPSHOT / POSITIONS / ORDERS / DEALS");

// ACCOUNT_INFO — activates the pairing + identifies the broker.
const info = await pushEvent(pairing, pairing.bridgeKeyId, pairing.secret, "ACCOUNT_INFO",
  `{"externalAccountId":"${MT5_LOGIN}"` +
  `,"currency":"USD"` +
  `,"leverage":"500"` +
  `,"server":"ICMarketsSC-MT5"` +
  `,"brokerName":"IC Markets (SC) Global"` +
  `,"accountClass":"DEMO"}`);
check("ACCOUNT_INFO accepted → CONNECTED", info.status === 200 && info.body.accepted === true && info.body.state === "CONNECTED", JSON.stringify(info.body));

// SNAPSHOT — balance/equity/margin (JDec strings).
const snap = await pushEvent(pairing, pairing.bridgeKeyId, pairing.secret, "SNAPSHOT",
  `{"balance":"${JDec(10000.0)}"` +
  `,"equity":"${JDec(10043.17)}"` +
  `,"margin":"${JDec(132.56)}"` +
  `,"freeMargin":"${JDec(9910.61)}"` +
  `,"marginLevel":"${JDec(7572.44)}"}`);
check("SNAPSHOT accepted", snap.status === 200 && snap.body.accepted === true, JSON.stringify(snap.body));

// POSITIONS — the COMPLETE open set (one live XAUUSD long).
const positions = await pushEvent(pairing, pairing.bridgeKeyId, pairing.secret, "POSITIONS",
  `{"positions":[{"externalPositionId":"700200"` +
  `,"symbol":"XAUUSD","side":"BUY"` +
  `,"volume":"${JDec(0.1)}"` +
  `,"entryPrice":"${JDec(2651.25)}"` +
  `,"currentPrice":"${JDec(2654.8)}"` +
  `,"stopLoss":null,"takeProfit":null` +
  `,"profit":"${JDec(3.55)}","swap":"${JDec(0)}","commission":"${JDec(-1.75)}"` +
  `,"openedAt":"${IsoUtc("2026-10-15T07:12:44Z")}"}]}`);
check("POSITIONS accepted (1 open)", positions.status === 200, JSON.stringify(positions.body));

// ORDERS — one pending BUY_LIMIT.
const orders = await pushEvent(pairing, pairing.bridgeKeyId, pairing.secret, "ORDERS",
  `{"orders":[{"externalOrderId":"800100"` +
  `,"symbol":"EURUSD","type":"BUY_LIMIT"` +
  `,"volume":"${JDec(0.2)}"` +
  `,"price":"${JDec(1.0812)}"` +
  `,"stopLoss":"${JDec(1.0785)}","takeProfit":"${JDec(1.0893)}"` +
  `,"status":"PLACED"` +
  `,"createdAt":"${IsoUtc("2026-10-15T07:40:02Z")}","updatedAt":null}]}`);
check("ORDERS accepted (1 pending)", orders.status === 200, JSON.stringify(orders.body));

// DEALS — incremental history: 3 closed netting positions, 1 OPEN position's
// entry leg (the EA pushes history — DEAL_ENTRY_IN of the live XAUUSD long),
// and 1 balance op (deposit) that must NOT become a trade.
const deals = [
  // 700101 EURUSD long 0.10 — winner
  { id: "600101", symbol: "EURUSD", side: "BUY", volume: 0.1, price: 1.085, profit: 0, comm: -3.5, swap: 0, pos: "700101", at: "2026-10-13T09:30:12Z" },
  { id: "600102", symbol: "EURUSD", side: "SELL", volume: 0.1, price: 1.0885, profit: 35.0, comm: -3.5, swap: 0, pos: "700101", at: "2026-10-13T11:45:27Z" },
  // 700102 XAUUSD short 0.05 — winner with swap (signed COST −0.5)
  { id: "600103", symbol: "XAUUSD", side: "SELL", volume: 0.05, price: 2658.4, profit: 0, comm: -1.75, swap: 0, pos: "700102", at: "2026-10-13T14:05:51Z" },
  { id: "600104", symbol: "XAUUSD", side: "BUY", volume: 0.05, price: 2652.1, profit: 31.5, comm: -1.75, swap: -0.5, pos: "700102", at: "2026-10-14T10:22:08Z" },
  // 700103 GBPUSD long 0.10 — loser
  { id: "600105", symbol: "GBPUSD", side: "BUY", volume: 0.1, price: 1.2685, profit: 0, comm: -2.6, swap: 0, pos: "700103", at: "2026-10-14T13:18:03Z" },
  { id: "600106", symbol: "GBPUSD", side: "SELL", volume: 0.1, price: 1.267, profit: -15.06, comm: -2.6, swap: 0, pos: "700103", at: "2026-10-14T16:02:39Z" },
  // 700200 — ENTRY leg of the still-open XAUUSD long (POSITIONS carries the live state)
  { id: "600108", symbol: "XAUUSD", side: "BUY", volume: 0.1, price: 2651.25, profit: 0, comm: -1.75, swap: 0, pos: "700200", at: "2026-10-15T07:12:44Z" },
  // balance op — deposit, symbol null, positionId null → NEVER a trade
  { id: "600107", symbol: null, side: "BUY", volume: 0, price: null, profit: 5000, comm: 0, swap: 0, pos: null, at: "2026-10-14T08:00:00Z" },
];
const dealsJson = deals
  .map((d) =>
    `{"externalDealId":"${d.id}"` +
    `,"symbol":${d.symbol ? `"${d.symbol}"` : "null"}` +
    `,"side":"${d.side}"` +
    `,"volume":"${JDec(d.volume)}"` +
    `,"price":${d.price !== null ? `"${JDec(d.price)}"` : "null"}` +
    `,"profit":"${JDec(d.profit)}"` +
    `,"commission":"${JDec(d.comm)}"` +
    `,"swap":"${JDec(d.swap)}"` +
    `,"positionId":${d.pos ? `"${d.pos}"` : "null"}` +
    `,"executedAt":"${IsoUtc(d.at)}"}`)
  .join(",");
const maxDealEpoch = Math.max(...deals.map((d) => Math.floor(Date.parse(d.at) / 1000)));
const dealsPush = await pushEvent(pairing, pairing.bridgeKeyId, pairing.secret, "DEALS",
  `{"deals":[${dealsJson}],"observedThrough":"${maxDealEpoch}","complete":true}`);
check("DEALS accepted (7 legs + 1 balance op)", dealsPush.status === 200, JSON.stringify(dealsPush.body));

// ── 4. Sync — the pull orchestrator reads the persisted events ───────────────
console.log("\n[4] sync — segments from the persisted bridge log");
const syncRes = await fetch(`${BASE}/trading-accounts/${accountId}/sync`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({}),
});
const syncBody = await syncRes.json();
check("account sync COMPLETED", syncRes.status === 200 && syncBody.run?.status === "COMPLETED", JSON.stringify(syncBody.run ?? syncBody));

// ── 5. Journal reconciliation (lazy on GET /trades) + assertions ─────────────
console.log("\n[5] journal — lazy reconcile + trade assertions");
const listRes = await fetch(`${BASE}/trades?accountId=${accountId}`, { headers: auth });
const listBody = await listRes.json();
const trades = listBody.trades ?? [];
check("4 journal trades reconstructed (3 closed + 1 open)", trades.length === 4, `${trades.length}`);

const idToSymbol = new Map((instrumentsBody.instruments ?? []).map((i) => [i.id, i.symbol]));
const byStatus = (status) => trades.filter((t) => t.status === status);
const closed = byStatus("CLOSED");
const open = byStatus("OPEN");
check("3 CLOSED trades", closed.length === 3, `${closed.length}`);
check("1 OPEN trade (the live XAUUSD position)", open.length === 1, `${open.length}`);

const nets = closed.map((t) => Number(t.pnlNet)).sort((a, b) => b - a);
const expectedNets = [28.0, 27.5, -20.26].sort((a, b) => b - a);
const netsMatch = nets.length === 3 && nets.every((v, i) => Math.abs(v - expectedNets[i]) < 0.005);
check("net P&L exact (28.00 / 27.50 / −20.26)", netsMatch, `got ${nets.join(", ")}`);

const closedSymbols = closed.map((t) => idToSymbol.get(t.instrumentId)).sort();
check("symbols EURUSD/GBPUSD/XAUUSD", JSON.stringify(closedSymbols) === JSON.stringify(["EURUSD", "GBPUSD", "XAUUSD"]), closedSymbols.join(","));
check("open trade is the live XAUUSD long", open.length === 1 && idToSymbol.get(open[0]?.instrumentId) === "XAUUSD", "");
// Signed-cost convention: the XAUUSD short's MT5 swap −0.50 stores as 0.50 cost.
const xauClosed = closed.find((t) => idToSymbol.get(t.instrumentId) === "XAUUSD");
check("signed MT5 swap stored as cost magnitude (0.50)", Number(xauClosed?.swap) === 0.5, `swap ${xauClosed?.swap}`);
check("balance op excluded", !trades.some((t) => Number(t.pnlNet) === 5000), "");

// ── 6. Identity — the account now KNOWS its broker ───────────────────────────
console.log("\n[6] identity — broker identification from the terminal report");
const detailRes = await fetch(`${BASE}/trading-accounts/${accountId}`, { headers: auth });
const detailBody = await detailRes.json();
const detail = detailBody.account ?? detailBody;
const connectionStatus = detail.connection?.status;
check("connection CONNECTED", connectionStatus === "CONNECTED", String(connectionStatus));
const identity = detail.brokerIdentification ?? {};
check("broker identified: IC Markets (SC) Global", identity.displayName === "IC Markets (SC) Global", `${identity.displayName} (confidence ${identity.confidence})`);
check("currency corrected by the push (USD)", detail.currency === "USD", detail.currency);
check("snapshot from the push (balance 10000)", Number(detail.snapshot?.balance) === 10000, String(detail.snapshot?.balance));

// ── Verdict ──────────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════`);
console.log(`  bridge E2E sim: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`  failures: ${failures.join(" | ")}`);
  process.exit(1);
}
console.log(`  La boucle terminal→bridge→journal est PROUVÉE pour le compte`);
console.log(`  IC Markets démo ${MT5_LOGIN} — le vrai EA produira exactement ce flux.`);

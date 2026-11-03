#!/usr/bin/env node
/**
 * live-discipline-probe.mjs - proves the "Émotions & violations en base"
 * deliverable against the LIVE API (not MSW):
 *   [A] login trader@cosmoz.app (seeded by seed-demo-data.mjs)
 *   [B] rules: seed a MAX_LOSSES_PER_DAY rule (limit 2)
 *   [C] breach: close 2 losing MANUAL trades same day (SL exit) → rule
 *       engine (subscribed to trade.closed) fires
 *   [D] violations: GET /violations lists the breach, persisted (uuid + context)
 *   [E] acknowledge: PATCH /violations/:id/acknowledge persists note
 *   [F] emotions: PATCH /trades/:id/psychology (emotionAfter) →
 *       GET /discipline/emotion-matrix serves real rows (no longer empty)
 *   [G] cleanup: soft-delete the probe trades so the seeded demo stays clean
 *       (orphaned violations keep their frozen context by design §57/§292)
 */
const BASE = "http://localhost:4000/api/v1";
const EMAIL = "trader@cosmoz.app";
const PASSWORD = "Cosmoz!Demo2026";

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`); }
  else { failed += 1; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`); }
}

let token;
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

const INSTRUMENT = "EURUSD";
function todayIso(hh) {
  return `${new Date().toISOString().slice(0, 10)}T${hh}:00:00.000Z`;
}

(async () => {
  // [A] login
  const login = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD, remember: false });
  check("[A] login seeded demo user", login.status === 200 || login.status === 201, `status ${login.status}`);
  token = login.json?.accessToken ?? login.json?.token;
  if (!token) { console.log("FATAL: no token", login.text.slice(0, 200)); process.exit(1); }

  // account + instrument
  const accounts = await api("GET", "/trading-accounts");
  const account = (accounts.json?.accounts ?? accounts.json?.items ?? []).find((a) => (a.name ?? "").includes("IC Markets Demo"));
  check("[A] seeded journal account found", Boolean(account), account?.name ?? "none");

  const instruments = await api("GET", "/instruments?q=EURUSD");
  const instrument = (instruments.json?.instruments ?? instruments.json?.items ?? []).find((i) => i.symbol === INSTRUMENT);
  check("[A] EURUSD instrument resolved", Boolean(instrument), instrument?.symbol ?? "none");

  // [B] rules - idempotent seed of a MAX_LOSSES_PER_DAY rule (limit 2)
  const rulesList = await api("GET", "/rules");
  const existing = (rulesList.json?.rules ?? rulesList.json ?? []).find(
    (r) => r.type === "MAX_LOSSES_PER_DAY" && r.isActive,
  );
  let ruleId = existing?.id;
  if (!ruleId) {
    const created = await api("POST", "/rules", {
      type: "MAX_LOSSES_PER_DAY",
      params: { limit: 2 },
      severity: "WARN",
      isActive: true,
    });
    ruleId = created.json?.rule?.id ?? created.json?.id;
    check("[B] rule created (MAX_LOSSES_PER_DAY, limit 2)", created.status === 200 || created.status === 201, `status ${created.status}`);
  } else {
    check("[B] rule already active (MAX_LOSSES_PER_DAY, limit 2)", true, ruleId);
  }

  // [C] breach - 2 losing CLOSED trades today (SL exit), psychology after
  const probeExternal = `probe-viol-${Date.now()}`;
  const mk = (i) => ({
    variant: "closed",
    accountId: account.id,
    instrumentId: instrument.id,
    direction: i % 2 === 0 ? "BUY" : "SELL",
    entryPrice: "1.08500",
    entryAt: todayIso("09"),
    size: { mode: "quantity", quantity: "0.1" },
    initialStop: "1.08600",
    initialTP: "1.08000",
    exitPrice: "1.08400",
    exitAt: todayIso("10"),
    exitReason: "SL",
    fees: "0.5",
    swap: "0",
    emotionBefore: i === 0 ? "CALM" : "ANXIOUS",
    confidence: i === 0 ? 2 : 4,
    outOfPlaybook: true,
    externalRef: `${probeExternal}-${i}`,
  });
  const createdTrades = [];
  for (let i = 0; i < 2; i += 1) {
    const res = await api("POST", "/trades", mk(i));
    const id = res.json?.trade?.id ?? res.json?.id;
    const ok = (res.status === 200 || res.status === 201) && Boolean(id);
    if (ok) createdTrades.push(id);
    check(`[C] losing trade ${i + 1}/2 closed (SL exit)`, ok, `status ${res.status} ${ok ? "" : res.text.slice(0, 160)}`);
  }
  // emotion-after via the reflect seam (PATCH /trades/:id/psychology)
  const psy = await api("PATCH", `/trades/${createdTrades[0]}/psychology`, { emotionAfter: "FRUSTRATED" });
  const psy2 = await api("PATCH", `/trades/${createdTrades[1]}/psychology`, { emotionAfter: "CONFIDENT" });
  check("[C] emotion-after persisted (reflect seam)", (psy.status === 200 || psy.status === 201) && (psy2.status === 200 || psy2.status === 201), `status ${psy.status}/${psy2.status}`);

  // rule engine listens to trade.closed - give the async event a beat
  await new Promise((r) => setTimeout(r, 1500));

  // [D] violations persisted
  const violations = await api("GET", "/violations");
  const rows = violations.json?.violations ?? violations.json ?? [];
  const probeViolation = rows.find((v) => v.tradeId === createdTrades[0] || v.tradeId === createdTrades[1]);
  check("[D] GET /violations serves the breach", Boolean(probeViolation), rows.length ? `${rows.length} rows` : "empty");
  check("[D] violation context frozen (lossesToday ≥ 2)", Boolean(probeViolation?.context?.lossesToday >= 2 || probeViolation?.context?.tradesToday >= 2), JSON.stringify(probeViolation?.context ?? {}));

  // [E] acknowledge persists
  if (probeViolation) {
    const ack = await api("PATCH", `/violations/${probeViolation.id}/acknowledge`, { note: "probe acknowledge" });
    const acked = ack.json?.violation?.acknowledgedAt ?? ack.json?.acknowledgedAt;
    check("[E] violation acknowledged + persisted", ack.status === 200 && Boolean(acked), `status ${ack.status}`);
  } else {
    check("[E] violation acknowledged + persisted", false, "no violation to acknowledge");
  }

  // [F] emotion matrix serves real psychology rows (keyed by emotionBefore -
  // the heatmap is "emotion at entry → outcome" by design) + the reflect
  // seam (emotionAfter) persists on the trade view itself.
  const matrix = await api("GET", "/discipline/emotion-matrix");
  const mrows = matrix.json?.rows ?? [];
  const calm = mrows.find((r) => r.emotion === "CALM");
  const anxious = mrows.find((r) => r.emotion === "ANXIOUS");
  check("[F] emotion-matrix serves real rows", mrows.length > 0, `${mrows.length} rows`);
  check("[F] CALM + ANXIOUS entry emotions visible", Boolean(calm && anxious), `${mrows.map((r) => r.emotion).join(",")}`);
  const list = await api("GET", "/trades?limit=500");
  const lrows = list.json?.trades ?? [];
  const tv = lrows.find((t) => t.id === createdTrades[0]);
  check("[F] emotion-after persisted on the trade (reflect seam)", tv?.emotionAfter === "FRUSTRATED", `emotionAfter=${tv?.emotionAfter ?? "?"} confidence=${tv?.confidence ?? "?"}`);

  // [G] cleanup - soft-delete probe trades (undo possible by design §57)
  let cleaned = 0;
  for (const id of createdTrades) {
    const del = await api("DELETE", `/trades/${id}`);
    if (del.status === 200 || del.status === 201) cleaned += 1;
  }
  check("[G] probe trades cleaned (soft-delete)", cleaned === createdTrades.length, `${cleaned}/${createdTrades.length}`);

  console.log(`\n  live discipline probe: ${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("  FAILURES:", failures.join(" | ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });

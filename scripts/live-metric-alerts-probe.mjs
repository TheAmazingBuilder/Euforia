#!/usr/bin/env node
/**
 * live-metric-alerts-probe.mjs - proves Phase 07 (metric alert rules)
 * against the LIVE API (not MSW), mirroring live-discipline-probe.mjs:
 *   [A] login trader@cosmoz.app (seeded by seed-demo-data.mjs)
 *   [B] idempotent cleanup of previous probe rules ("[probe] …")
 *   [C] create THRESHOLD rule: NET_PNL THIS_MONTH ≥ 1
 *   [D] close a winning trade → trade.closed → DEBOUNCED auto-evaluation →
 *       METRIC_THRESHOLD event in the shared inbox (payload frozen context)
 *   [E] manual re-evaluate → NO duplicate (transition semantics)
 *   [F] threshold flip: raise → evaluate (quiet) → restore → evaluate
 *       (false→true fires again, evaluationKey t2)
 *   [G] GET /alert-rules/:id/events - rule-scoped history, newest first
 *   [H] dismiss the newest event → dismissedAt set, audit history kept
 *   [I] GOAL rule (ACHIEVED on a fresh WIN_RATE goal) → evaluate → fires
 *   [J] disabled rule is not evaluated
 *   [K] cleanup - delete the probe rules (events survive by design)
 */
const BASE = process.env.API_BASE ?? "http://localhost:4000/api/v1";
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  // [A] login
  const login = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD, remember: false });
  check("[A] login seeded demo user", login.status === 200 || login.status === 201, `status ${login.status}`);
  token = login.json?.accessToken ?? login.json?.token;
  if (!token) { console.log("FATAL: no token", login.text.slice(0, 200)); process.exit(1); }

  const accounts = await api("GET", "/accounts");
  const account = (accounts.json?.accounts ?? []).find((a) => (a.name ?? "").includes("IC Markets")) ?? accounts.json?.accounts?.[0];
  check("[A] journal account found", Boolean(account), account?.name ?? "none");

  const instruments = await api("GET", "/instruments?q=EURUSD");
  const instrument = (instruments.json?.instruments ?? []).find((i) => i.symbol === "EURUSD");
  check("[A] EURUSD instrument resolved", Boolean(instrument), instrument?.symbol ?? "none");
  if (!account || !instrument) process.exit(1);

  // [B] idempotent cleanup
  const existing = await api("GET", "/alert-rules");
  check("[B] GET /alert-rules", existing.status === 200, `status ${existing.status}`);
  for (const rule of existing.json?.rules ?? []) {
    if (rule.name?.startsWith("[probe]")) {
      await api("DELETE", `/alert-rules/${rule.id}`);
    }
  }

  // [C] threshold rule
  const created = await api("POST", "/alert-rules", {
    kind: "THRESHOLD",
    name: "[probe] Monthly P&L",
    metric: "NET_PNL",
    condition: "GREATER_THAN_OR_EQUAL",
    threshold: 1,
    period: "THIS_MONTH",
  });
  check("[C] THRESHOLD rule created", created.status === 201, `status ${created.status}`);
  const ruleId = created.json?.id;

  // [D] winning trade → debounced auto-evaluation
  const now = Date.now();
  const openRes = await api("POST", "/trades", {
    variant: "open",
    accountId: account.id,
    instrumentId: instrument.id,
    direction: "BUY",
    entryPrice: "1.0850",
    entryAt: new Date(now - 60 * 60_000).toISOString(),
    size: { mode: "quantity", quantity: "0.10" },
    initialStop: "1.0800",
    outOfPlaybook: true,
  });
  check("[D] probe trade captured", openRes.status === 201, `status ${openRes.status}`);
  const tradeId = openRes.json?.id;
  const closeRes = await api("POST", `/trades/${tradeId}/close`, {
    mode: "single",
    exitPrice: "1.0900",
    exitAt: new Date(now - 30 * 60_000).toISOString(),
    exitReason: "TP",
  });
  check("[D] probe trade closed (TP)", closeRes.status === 200, `status ${closeRes.status}`);

  let event = null;
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline && event === null) {
    await sleep(400);
    const alerts = await api("GET", "/alerts");
    // Array.find yields undefined when absent - normalize to null so the
    // loop actually waits for the debounced evaluation.
    event = (alerts.json?.alerts ?? []).find(
      (a) => a.type === "METRIC_THRESHOLD" && a.payload?.ruleId === ruleId,
    ) ?? null;
  }
  check("[D] auto-evaluation fired after trade.closed (debounced)", event !== null);
  if (event) {
    check("[D] frozen payload carries the trigger context",
      event.payload?.evaluationKey === "t1" &&
      event.payload?.metric === "NET_PNL" &&
      typeof event.payload?.observedValue === "number" &&
      event.payload?.observedValue > 0,
      `observed ${event.payload?.observedValue}`);
  }

  // [E] no duplicate on re-evaluation
  const reEval = await api("POST", "/alert-rules/evaluate");
  const alertsAfterReEval = await api("GET", "/alerts");
  const countAfterReEval = (alertsAfterReEval.json?.alerts ?? []).filter(
    (a) => a.type === "METRIC_THRESHOLD" && a.payload?.ruleId === ruleId,
  ).length;
  check("[E] re-evaluation creates NO duplicate",
    reEval.status === 200 && reEval.json?.triggeredEvents === 0 && countAfterReEval === 1,
    `triggered ${reEval.json?.triggeredEvents}, events ${countAfterReEval}`);

  // [F] transition both ways
  await api("PATCH", `/alert-rules/${ruleId}`, { threshold: 100_000_000 });
  const drop = await api("POST", "/alert-rules/evaluate");
  await api("PATCH", `/alert-rules/${ruleId}`, { threshold: 1 });
  const recover = await api("POST", "/alert-rules/evaluate");
  check("[F] false→true transition fires again",
    drop.json?.triggeredEvents === 0 && recover.json?.triggeredEvents === 1,
    `drop ${drop.json?.triggeredEvents}, recover ${recover.json?.triggeredEvents}`);

  // [G] rule-scoped event history
  const events = await api("GET", `/alert-rules/${ruleId}/events`);
  const eventKeys = (events.json?.events ?? []).map((e) => e.payload?.evaluationKey);
  check("[G] rule events scoped + newest first",
    events.status === 200 && eventKeys.length === 2 && eventKeys[0] === "t2",
    `keys ${eventKeys.join(",")}`);

  // [H] dismiss keeps audit history
  const newest = (events.json?.events ?? [])[0];
  const dismissed = await api("PATCH", `/alerts/${newest.id}/dismiss`);
  const afterDismiss = await api("GET", `/alert-rules/${ruleId}/events`);
  check("[H] dismiss sets the state, history survives",
    dismissed.status === 200 && dismissed.json?.dismissedAt !== null &&
    (afterDismiss.json?.events ?? []).length === 2,
    `status ${dismissed.status}`);

  // [I] goal rule - ACHIEVED via the authoritative goal engine
  const goal = await api("POST", "/goals", {
    title: "[probe] Win rate goal",
    metric: "WIN_RATE",
    target: 10,
    period: "MONTH",
    color: "CYAN",
  });
  check("[I] goal created", goal.status === 201, `status ${goal.status}`);
  const goalId = goal.json?.goal?.id;
  const goalRule = await api("POST", "/alert-rules", {
    kind: "GOAL",
    name: "[probe] Goal achieved",
    goalId,
    goalCondition: "ACHIEVED",
  });
  check("[I] GOAL rule created", goalRule.status === 201, `status ${goalRule.status}`);
  const goalEval = await api("POST", "/alert-rules/evaluate");
  const goalEvents = await api("GET", `/alert-rules/${goalRule.json?.id}/events`);
  check("[I] goal ACHIEVED fires from real progress",
    goalEval.json?.triggeredEvents >= 1 && (goalEvents.json?.events ?? []).length === 1,
    `triggered ${goalEval.json?.triggeredEvents}`);

  // [J] disabled rules are not evaluated
  await api("PATCH", `/alert-rules/${ruleId}`, { enabled: false });
  const disabledEval = await api("POST", "/alert-rules/evaluate");
  check("[J] disabled rule not evaluated", disabledEval.json?.evaluatedRules >= 1 && disabledEval.json?.triggeredEvents === 0,
    `evaluated ${disabledEval.json?.evaluatedRules}, triggered ${disabledEval.json?.triggeredEvents}`);

  // [K] cleanup - rules deleted, events survive
  await api("DELETE", `/alert-rules/${ruleId}`);
  await api("DELETE", `/alert-rules/${goalRule.json?.id}`);
  await api("DELETE", `/goals/${goalId}`);
  await api("DELETE", `/trades/${tradeId}`);
  const postCleanup = await api("GET", "/alert-rules");
  const leftovers = (postCleanup.json?.rules ?? []).filter((r) => r.name?.startsWith("[probe]"));
  check("[K] cleanup leaves no probe rules", leftovers.length === 0, `left ${leftovers.length}`);

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) {
    console.log("FAILED:", failures.join(" | "));
    process.exit(1);
  }
})().catch((error) => {
  console.error("PROBE CRASHED:", error);
  process.exit(1);
});

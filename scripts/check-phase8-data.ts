/* Quick data sanity check for Phase 8 aggregates (dev-only, rolling 30d window). */
import { buildFixtureData, USER_TZ } from "../apps/web/src/mocks/fixtures/generate";
import { toTradingDateKey } from "@cosmoz/shared";

const data = buildFixtureData();
const shift = (offset: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return toTradingDateKey(d.toISOString(), USER_TZ);
};
const since = shift(-29);
const today = shift(0);
console.log("window:", since, "→", today);

// Strategy stats replay
for (const s of data.strategies) {
  const own = data.trades
    .filter((t) => t.status === "CLOSED" && t.strategyId === s.id)
    .sort((a, b) => (a.tradingDate + a.exitAt).localeCompare(b.tradingDate + b.exitAt));
  const last = own.slice(-20);
  const e = last.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0) / Math.max(1, last.length);
  console.log(`${s.name.padEnd(16)} trades=${String(own.length).padStart(2)} last20Expectancy=${e.toFixed(3)} (n=${last.length})`);
}

// Violations in window
const inWindow = data.ruleViolations.filter((v) => toTradingDateKey(v.occurredAt, USER_TZ) >= since);
console.log("\nviolations total:", data.ruleViolations.length, "| in window:", inWindow.length, "| pending:", data.ruleViolations.filter((v) => v.acknowledgedAt === null).length);

// Ledger in window
console.log("\nmistake ledger (30d):");
for (const m of data.mistakes) {
  const rows = data.tradeMistakes.filter((tm) => tm.mistakeId === m.id)
    .map((tm) => data.trades.find((t) => t.id === tm.tradeId))
    .filter((t) => t && t.tradingDate >= since);
  if (rows.length === 0) continue;
  const cost = rows.reduce((sum, t) => sum + (Number(t?.rMultiple) ?? 0), 0);
  console.log(`  ${m.label.padEnd(24)} count=${String(rows.length).padStart(2)} rCost=${cost.toFixed(2)}R`);
}

// Journaling in window
const winClosed = data.trades.filter((t) => t.status === "CLOSED" && t.tradingDate >= since);
const days = new Set(winClosed.map((t) => t.tradingDate));
const journaled = new Set(winClosed.filter((t) => t.lessons || t.notes).map((t) => t.tradingDate));
console.log("\njournaling: days=", days.size, "journaled=", journaled.size, "pct=", (journaled.size / Math.max(1, days.size) * 100).toFixed(1));

const graded = winClosed.filter((t) => t.decisionGrade !== null);
const complete = graded.filter((t) => {
  const snap = t.checklistSnap;
  return snap !== null && typeof snap === "object" && !Array.isArray(snap) && Object.values(snap).every((v) => v === true);
});
console.log("checklist: graded=", graded.length, "complete=", complete.length, "pct=", (complete.length / Math.max(1, graded.length) * 100).toFixed(1));
const followed = graded.filter((t) => t.followedPlan === true).length;
console.log("plan adherence:", followed, "/", graded.length, "=", (followed / Math.max(1, graded.length) * 100).toFixed(1));

// Violations per rule (for rule card month counts)
console.log("\nviolations per rule (30d):");
for (const r of data.rules) {
  const n = inWindow.filter((v) => v.ruleId === r.id).length;
  console.log(`  ${r.type.padEnd(24)} ${n}`);
}

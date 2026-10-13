/**
 * Unit tests for the pure TOOLS calculation modules.
 * Runs on Node >= 24 native type stripping:  node scripts/test-tools-calculations.ts
 * Excluded from the Next.js tsconfig (imports use explicit .ts extensions).
 */
import assert from "node:assert/strict";

import {
  calculateCompounding,
  COMPOUNDING_LIMITS,
  type CompoundingCalculatorInput,
} from "../src/lib/calculations/compounding.ts";
import {
  calculateLotSize,
  INSTRUMENT_PRESETS,
  type LotSizeCalculatorInput,
} from "../src/lib/calculations/lot-size.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}\n      ${err instanceof Error ? err.message : err}`);
  }
}

function approx(actual: number, expected: number, eps = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `expected ~${expected}, got ${actual}`,
  );
}

const eur = INSTRUMENT_PRESETS.find((p) => p.symbol === "EURUSD")!;
const gold = INSTRUMENT_PRESETS.find((p) => p.symbol === "XAUUSD")!;

const lotBase: LotSizeCalculatorInput = {
  balance: 10_000,
  riskPercent: 1,
  direction: "long",
  entry: 1.1,
  stopLoss: 1.095,
  takeProfit: null,
  symbol: "EURUSD",
  pipSize: eur.pipSize,
  contractSize: eur.contractSize,
  pipValuePerLot: null,
  tickSize: eur.tickSize,
  pointSize: eur.pointSize,
};

const compBase: CompoundingCalculatorInput = {
  initialBalance: 1000,
  periods: 10,
  gainPerPeriodPercent: 5,
};

// ── Compounding ──────────────────────────────────────────────────────────────
console.log("\nCompounding:");

test("1000 + 5% + 1 period → 1050", () => {
  const out = calculateCompounding({ ...compBase, periods: 1 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.finalBalance, 1050);
  approx(out.result.totalProfit, 50);
  approx(out.result.totalGainPercent, 5);
});

test("1000 + 5% + 2 periods → 1102.50 (iterative, not annual)", () => {
  const out = calculateCompounding({ ...compBase, periods: 2 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.finalBalance, 1102.5);
  approx(out.result.rows[1].startingBalance, 1050);
});

test("0% leaves the balance unchanged", () => {
  const out = calculateCompounding({ ...compBase, gainPerPeriodPercent: 0, periods: 25 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.finalBalance, 1000);
  approx(out.result.totalProfit, 0);
});

test("negative return shrinks the balance (1000, −10%, 3 → 729)", () => {
  const out = calculateCompounding({ ...compBase, gainPerPeriodPercent: -10, periods: 3 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.finalBalance, 729);
  approx(out.result.totalProfit, -271);
  approx(out.result.totalGainPercent, -27.1);
});

test("decimal gain (1000.50, 2.5%, 2) compounds precisely", () => {
  const out = calculateCompounding({ initialBalance: 1000.5, periods: 2, gainPerPeriodPercent: 2.5 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.finalBalance, 1000.5 * 1.025 * 1.025);
});

test("cumulative columns are consistent with the initial balance", () => {
  const out = calculateCompounding({ ...compBase, periods: 7 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  for (const row of out.result.rows) {
    approx(row.totalProfit, row.endingBalance - out.result.initialBalance, 1e-6);
    approx(row.totalGainPercent, (row.endingBalance / out.result.initialBalance - 1) * 100, 1e-6);
  }
});

test("best/worst period detection", () => {
  const out = calculateCompounding({ ...compBase, periods: 4 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.bestPeriod.period, 4);
  approx(out.result.worstPeriod.period, 1);
});

test("zero balance → rejected", () => {
  const out = calculateCompounding({ ...compBase, initialBalance: 0 });
  assert.equal(out.ok, false);
});

test("negative balance → rejected", () => {
  const out = calculateCompounding({ ...compBase, initialBalance: -500 });
  assert.equal(out.ok, false);
});

test("period bounds enforced (0 and max+1 rejected)", () => {
  assert.equal(calculateCompounding({ ...compBase, periods: 0 }).ok, false);
  assert.equal(
    calculateCompounding({ ...compBase, periods: COMPOUNDING_LIMITS.maxPeriods + 1 }).ok,
    false,
  );
});

test("gain below −99% rejected, −99% accepted", () => {
  assert.equal(calculateCompounding({ ...compBase, gainPerPeriodPercent: -99.5 }).ok, false);
  assert.equal(calculateCompounding({ ...compBase, gainPerPeriodPercent: -99 }).ok, true);
});

// ── Lot Size ─────────────────────────────────────────────────────────────────
console.log("\nLot Size:");

test("EURUSD long: 10k balance, 1% risk, 50-pip stop → 0.20 lots / 20 000 units", () => {
  const out = calculateLotSize(lotBase);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.lotsExact, 0.2);
  assert.equal(out.result.lots, 0.2);
  approx(out.result.units, 20_000);
  approx(out.result.riskAmount, 100);
  approx(out.result.stopPips, 50);
  approx(out.result.pipValuePerLot, 10);
  approx(out.result.riskPerLot, 500);
});

test("RR = 1:2 with TP 100 pips away, potential profit 200", () => {
  const out = calculateLotSize({ ...lotBase, takeProfit: 1.11 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.reward!.rr, 2);
  approx(out.result.reward!.distancePips, 100);
  approx(out.result.reward!.potentialProfit, 200);
});

test("size is FLOORED to the 0.01 step and risk amount matches the floored size", () => {
  // exact size = 9.99 / 330 = 0.030272… → floor 0.03 → risk 9.90 ≤ budget 9.99
  const out = calculateLotSize({ ...lotBase, balance: 999, stopLoss: 1.0967 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.lotsExact, 0.030272727, 1e-6);
  assert.equal(out.result.lots, 0.03);
  approx(out.result.riskAmount, 9.9, 1e-9);
});

test("mini/micro equivalents derive from the floored size", () => {
  const out = calculateLotSize(lotBase);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.miniLots, 2);
  approx(out.result.microLots, 20);
});

test("long with SL above entry → rejected (never silently zero)", () => {
  const out = calculateLotSize({ ...lotBase, stopLoss: 1.105 });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.ok(out.issues.some((i) => i.field === "stopLoss"));
});

test("short with SL below entry → rejected", () => {
  const out = calculateLotSize({ ...lotBase, direction: "short", stopLoss: 1.095 });
  assert.equal(out.ok, false);
});

test("entry == SL (zero stop distance) → rejected", () => {
  const out = calculateLotSize({ ...lotBase, stopLoss: 1.1 });
  assert.equal(out.ok, false);
});

test("TP on the wrong side of entry → rejected", () => {
  const longBad = calculateLotSize({ ...lotBase, takeProfit: 1.05 });
  assert.equal(longBad.ok, false);
  const shortBad = calculateLotSize({ ...lotBase, direction: "short", stopLoss: 1.105, takeProfit: 1.15 });
  assert.equal(shortBad.ok, false);
});

test("risk 0% and negative risk → rejected", () => {
  assert.equal(calculateLotSize({ ...lotBase, riskPercent: 0 }).ok, false);
  assert.equal(calculateLotSize({ ...lotBase, riskPercent: -1 }).ok, false);
});

test("zero/negative balance → rejected (no div-by-zero path)", () => {
  assert.equal(calculateLotSize({ ...lotBase, balance: 0 }).ok, false);
  assert.equal(calculateLotSize({ ...lotBase, balance: -100 }).ok, false);
});

test("zero pip value → rejected by schema (div-by-zero structurally impossible)", () => {
  assert.equal(calculateLotSize({ ...lotBase, pipValuePerLot: 0 }).ok, false);
  assert.equal(calculateLotSize({ ...lotBase, pipSize: 0 }).ok, false);
  assert.equal(calculateLotSize({ ...lotBase, contractSize: 0 }).ok, false);
});

test("manual pip value override drives the math", () => {
  const out = calculateLotSize({ ...lotBase, pipValuePerLot: 5 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.pipValuePerLot, 5);
  approx(out.result.lotsExact, 0.4);
});

test("XAUUSD sanity: 10k, 1%, 1000-cent stop → 0.10 lots / 10 oz", () => {
  const out = calculateLotSize({
    ...lotBase,
    symbol: "XAUUSD",
    entry: 2650,
    stopLoss: 2640,
    pipSize: gold.pipSize,
    contractSize: gold.contractSize,
    tickSize: gold.tickSize,
    pointSize: gold.pointSize,
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  approx(out.result.stopPips, 1000);
  approx(out.result.pipValuePerLot, 1);
  assert.equal(out.result.lots, 0.1);
  approx(out.result.units, 10);
});

test("breakdown is populated for the result", () => {
  const out = calculateLotSize(lotBase);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.ok(out.result.breakdown.length >= 10);
  assert.ok(out.result.breakdown.every((b) => b.label.length > 0 && b.value.length > 0));
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`FAILED: ${failures.join(" | ")}`);
  process.exit(1);
}

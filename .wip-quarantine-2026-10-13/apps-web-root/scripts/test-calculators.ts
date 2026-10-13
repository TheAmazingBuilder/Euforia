/**
 * Unit tests — calculator math (MASTER PROMPT §47/§48).
 * Pure-function assertions via node:assert; run with:
 *   npx tsx --tsconfig tsconfig.json scripts/test-calculators.ts
 *
 * Compounding (§47): single/multiple periods, 0%, negative returns, decimal
 * percentages, large values, schedule semantics (cumulative totals).
 * Lot size (§48): zero/negative balance, invalid risk, zero stop distance,
 * invalid long/short setups, valid forex/metal/index setups via explicit
 * specifications, RR calculation, decimal values — no division by zero.
 */

import assert from "node:assert/strict";

import {
  calculateCompounding,
  generateCompoundingSchedule,
  projectFinalBalance,
  MAX_COMPOUNDING_PERIODS,
} from "@/lib/calculators/compounding";
import {
  calculateLotSize,
  calculateRiskAmount,
  calculateRiskReward,
  LOT_SIZE_STEP,
} from "@/lib/calculators/lot-size";
import {
  compoundingCalculatorInputSchema,
  lotSizeCalculatorInputSchema,
  pipValueCalculatorInputSchema,
} from "@/lib/calculators/schemas";
import { calculatePipValue } from "@/lib/calculators/pip-value";
import { resolveSpecification } from "@/lib/calculators/instruments";
import type { LotSizeInput } from "@/lib/calculators/types";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`PASS — ${name}`);
};

// ── Compounding (§20: A = P(1+r)^n, per-period gain) ─────────────────────────

test("compounding: $1,000 at 5% for 1 period → $1,050", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 1, gainPerPeriod: 5 });
  assert.equal(result.finalBalance, 1050);
  assert.equal(result.totalProfit, 50);
  assert.equal(result.schedule.length, 1);
  assert.equal(result.schedule[0]?.startingBalance, 1000);
  assert.equal(result.schedule[0]?.endingBalance, 1050);
  assert.equal(result.schedule[0]?.totalProfit, 50);
  assert.ok(Math.abs(result.schedule[0]!.totalGain - 5) < 1e-9, String(result.schedule[0]?.totalGain));
});

test("compounding: $1,000 at 5% for 20 periods → $2,653.30 (§23 example)", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 20, gainPerPeriod: 5 });
  assert.ok(Math.abs(result.finalBalance - 2653.2977051444223) < 1e-6, String(result.finalBalance));
  assert.equal(Math.round(result.totalProfit * 100) / 100, 1653.3);
  assert.equal(Math.round(result.totalGainPct * 100) / 100, 165.33);
  assert.ok(Math.abs(projectFinalBalance({ startingBalance: 1000, periods: 20, gainPerPeriod: 5 }) - result.finalBalance) < 1e-9);
});

test("compounding: 0% keeps the balance flat", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 15, gainPerPeriod: 0 });
  assert.equal(result.finalBalance, 1000);
  assert.equal(result.totalProfit, 0);
  assert.equal(result.totalGainPct, 0);
});

test("compounding: total gain is CUMULATIVE from the initial balance (§22)", () => {
  const schedule = generateCompoundingSchedule({ startingBalance: 1000, periods: 3, gainPerPeriod: 5 });
  assert.equal(Math.round(schedule[1]!.totalProfit * 100) / 100, 102.5);
  assert.equal(Math.round(schedule[1]!.totalGain * 100) / 100, 10.25);
  assert.equal(Math.round(schedule[2]!.totalProfit * 100) / 100, 157.63);
  assert.equal(Math.round(schedule[2]!.totalGain * 100) / 100, 15.76);
});

test("compounding: negative return reduces the balance (§26)", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 5, gainPerPeriod: -2 });
  assert.ok(Math.abs(result.finalBalance - 903.9207968) < 1e-6, String(result.finalBalance));
  assert.ok(result.totalProfit < 0);
  assert.ok(result.schedule.every((row) => row.endingBalance > 0));
});

test("compounding: −100% ends at zero without going negative", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 4, gainPerPeriod: -100 });
  assert.equal(result.finalBalance, 0);
  assert.equal(result.totalProfit, -1000);
  assert.equal(result.totalGainPct, -100);
});

test("compounding: decimal percentages", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 2, gainPerPeriod: 2.5 });
  assert.ok(Math.abs(result.finalBalance - 1050.625) < 1e-9, String(result.finalBalance));
});

test("compounding: large but valid values stay finite", () => {
  const result = calculateCompounding({ startingBalance: 1_000_000_000, periods: MAX_COMPOUNDING_PERIODS, gainPerPeriod: 100 });
  assert.ok(Number.isFinite(result.finalBalance));
  assert.equal(result.schedule.length, MAX_COMPOUNDING_PERIODS);
});

// ── Compounding V1.1 — periodic deposits (end of period, after growth) ──

test("compounding: deposits land at period END, after that period's growth", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 3, gainPerPeriod: 5, depositPerPeriod: 100 });
  // B1 = 1000×1.05 + 100 = 1150 ; B2 = 1150×1.05 + 100 = 1307.50 ; B3 = +100 = 1472.875
  assert.ok(Math.abs(result.schedule[0]!.endingBalance - 1150) < 1e-9, String(result.schedule[0]?.endingBalance));
  assert.ok(Math.abs(result.schedule[1]!.endingBalance - 1307.5) < 1e-9, String(result.schedule[1]?.endingBalance));
  assert.ok(Math.abs(result.schedule[2]!.endingBalance - 1472.875) < 1e-9, String(result.schedule[2]?.endingBalance));
  assert.ok(result.schedule.every((row) => row.deposit === 100));
  assert.equal(result.totalDeposits, 300);
  // Earned profit excludes deposits: 1472.875 − (1000 + 300)
  assert.ok(Math.abs(result.totalProfit - 172.875) < 1e-9, String(result.totalProfit));
  assert.ok(Math.abs(result.totalGainPct - (1472.875 / 1300 - 1) * 100) < 1e-9, String(result.totalGainPct));
  // Per-row cumulative figures also exclude deposits
  assert.ok(Math.abs(result.schedule[2]!.totalProfit - 172.875) < 1e-9);
  assert.ok(Math.abs(result.schedule[1]!.totalProfit - (1307.5 - 1200)) < 1e-9);
});

test("compounding: zero deposits reproduce the V1 projections exactly", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 20, gainPerPeriod: 5, depositPerPeriod: 0 });
  assert.ok(Math.abs(result.finalBalance - 2653.2977051444223) < 1e-6, String(result.finalBalance));
  assert.equal(result.totalDeposits, 0);
  assert.equal(Math.round(result.totalProfit * 100) / 100, 1653.3);
  assert.equal(Math.round(result.totalGainPct * 100) / 100, 165.33);
  assert.ok(result.schedule.every((row) => row.deposit === 0));
});

test("compounding: closed form with deposits matches the schedule (incl. 0% gain)", () => {
  const growing = { startingBalance: 500, periods: 12, gainPerPeriod: 3, depositPerPeriod: 25 };
  assert.ok(Math.abs(projectFinalBalance(growing) - calculateCompounding(growing).finalBalance) < 1e-8,
    `${projectFinalBalance(growing)} vs ${calculateCompounding(growing).finalBalance}`);
  const flat = { startingBalance: 1000, periods: 10, gainPerPeriod: 0, depositPerPeriod: 50 };
  assert.ok(Math.abs(projectFinalBalance(flat) - 1500) < 1e-9, String(projectFinalBalance(flat)));
  assert.ok(Math.abs(projectFinalBalance(flat) - calculateCompounding(flat).finalBalance) < 1e-9);
});

test("compounding: −100% gain with a deposit still lands the deposit", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 2, gainPerPeriod: -100, depositPerPeriod: 40 });
  // B1 = 0×1000 + 40 = 40 ; B2 = 0×40 + 40 = 40 — the deposit survives.
  assert.equal(result.schedule[0]!.endingBalance, 40);
  assert.equal(result.schedule[1]!.endingBalance, 40);
  assert.equal(result.totalDeposits, 80);
  assert.ok(Math.abs(result.totalProfit - (40 - 1080)) < 1e-9);
});

// ── Compounding V1.1 — annual rate mode (compound-consistent) ──────────

test("annual mode: 12% annual over 12 monthly periods multiplies by exactly 1.12", () => {
  const result = calculateCompounding({
    startingBalance: 1000,
    periods: 12,
    gainPerPeriod: 0,
    rateMode: "ANNUAL",
    periodUnit: "MONTHLY",
    annualGain: 12,
  });
  assert.ok(Math.abs(result.finalBalance - 1120) < 1e-6, String(result.finalBalance));
  assert.equal(result.periodsPerYear, 12);
  assert.ok(Math.abs(result.effectiveGainPerPeriod - (1.12 ** (1 / 12) - 1) * 100) < 1e-9, String(result.effectiveGainPerPeriod));
  assert.equal(result.annualGain, 12);
  assert.equal(result.rateMode, "ANNUAL");
});

test("annual mode: PER_PERIOD mode ignores the annual figure entirely", () => {
  const result = calculateCompounding({
    startingBalance: 1000,
    periods: 4,
    gainPerPeriod: 5,
    rateMode: "PER_PERIOD",
    annualGain: 50,
  });
  assert.ok(Math.abs(result.finalBalance - 1215.50625) < 1e-6, String(result.finalBalance));
  assert.equal(result.effectiveGainPerPeriod, 5);
  assert.equal(result.annualGain, null);
  assert.equal(result.rateMode, "PER_PERIOD");
  assert.equal(result.periodsPerYear, 12); // default MONTHLY
});

test("annual mode: the unit determines the conversion basis", () => {
  const quarterly = calculateCompounding({ startingBalance: 1000, periods: 4, gainPerPeriod: 0, rateMode: "ANNUAL", periodUnit: "QUARTERLY", annualGain: 12 });
  assert.ok(Math.abs(quarterly.finalBalance - 1120) < 1e-6, String(quarterly.finalBalance));
  assert.equal(quarterly.periodsPerYear, 4);
  const yearly = calculateCompounding({ startingBalance: 1000, periods: 1, gainPerPeriod: 0, rateMode: "ANNUAL", periodUnit: "YEARLY", annualGain: 12 });
  assert.ok(Math.abs(yearly.finalBalance - 1120) < 1e-9, String(yearly.finalBalance));
  const weekly = calculateCompounding({ startingBalance: 1000, periods: 52, gainPerPeriod: 0, rateMode: "ANNUAL", periodUnit: "WEEKLY", annualGain: 12 });
  assert.ok(Math.abs(weekly.finalBalance - 1120) < 1e-6, String(weekly.finalBalance));
  assert.equal(weekly.periodsPerYear, 52);
  const daily = calculateCompounding({ startingBalance: 1000, periods: 365, gainPerPeriod: 0, rateMode: "ANNUAL", periodUnit: "DAILY", annualGain: 12 });
  assert.ok(Math.abs(daily.finalBalance - 1120) < 1e-6, String(daily.finalBalance));
});

test("annual mode: −100% annual zeroes every period; deposits still land", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 3, gainPerPeriod: 0, rateMode: "ANNUAL", periodUnit: "MONTHLY", annualGain: -100 });
  assert.ok(result.schedule.every((row) => row.endingBalance === 0));
  const withDeposit = calculateCompounding({ startingBalance: 1000, periods: 3, gainPerPeriod: 0, rateMode: "ANNUAL", periodUnit: "MONTHLY", annualGain: -100, depositPerPeriod: 10 });
  assert.ok(Math.abs(withDeposit.finalBalance - 10) < 1e-9, String(withDeposit.finalBalance));
});

test("annual mode schema: required/invalid/out-of-range only in ANNUAL mode", () => {
  const base = { startingBalance: "1000", periods: "12", gainPerPeriod: "0" };
  // PER_PERIOD (and default): the annual figure is not validated
  assert.equal(compoundingCalculatorInputSchema.safeParse(base).success, true);
  assert.equal(compoundingCalculatorInputSchema.safeParse({ ...base, rateMode: "PER_PERIOD", annualGain: "abc" }).success, true);
  // ANNUAL: required
  const empty = compoundingCalculatorInputSchema.safeParse({ ...base, rateMode: "ANNUAL" });
  assert.ok(!empty.success && empty.error.issues.some((issue) => issue.message === "REQUIRED"));
  // ANNUAL: invalid decimal
  const garbage = compoundingCalculatorInputSchema.safeParse({ ...base, rateMode: "ANNUAL", annualGain: "abc" });
  assert.ok(!garbage.success && garbage.error.issues.some((issue) => issue.message === "INVALID_DECIMAL"));
  // ANNUAL: out of range
  const out = compoundingCalculatorInputSchema.safeParse({ ...base, rateMode: "ANNUAL", annualGain: "150" });
  assert.ok(!out.success && out.error.issues.some((issue) => issue.message === "ANNUAL_GAIN_RANGE"));
  // ANNUAL valid
  assert.equal(compoundingCalculatorInputSchema.safeParse({ ...base, rateMode: "ANNUAL", annualGain: "12" }).success, true);
});

test("compounding schema: rejects periods 0, 201, non-integer, gain below −100, negative deposit", () => {
  assert.equal(compoundingCalculatorInputSchema.safeParse({ startingBalance: "1000", periods: "0", gainPerPeriod: "5" }).success, false);
  assert.equal(compoundingCalculatorInputSchema.safeParse({ startingBalance: "1000", periods: String(MAX_COMPOUNDING_PERIODS + 1), gainPerPeriod: "5" }).success, false);
  assert.equal(compoundingCalculatorInputSchema.safeParse({ startingBalance: "1000", periods: "2.5", gainPerPeriod: "5" }).success, false);
  assert.equal(compoundingCalculatorInputSchema.safeParse({ startingBalance: "1000", periods: "20", gainPerPeriod: "-150" }).success, false);
  assert.equal(compoundingCalculatorInputSchema.safeParse({ startingBalance: "0", periods: "20", gainPerPeriod: "5" }).success, false);
  assert.equal(
    compoundingCalculatorInputSchema.safeParse({ startingBalance: "1000", periods: "20", gainPerPeriod: "5" }).success,
    true,
  );
  // Deposits: empty / undefined accepted, negatives rejected
  assert.equal(compoundingCalculatorInputSchema.safeParse({ startingBalance: "1000", periods: "5", gainPerPeriod: "5", depositPerPeriod: "" }).success, true);
  assert.equal(compoundingCalculatorInputSchema.safeParse({ startingBalance: "1000", periods: "5", gainPerPeriod: "5", depositPerPeriod: "100" }).success, true);
  assert.equal(compoundingCalculatorInputSchema.safeParse({ startingBalance: "1000", periods: "5", gainPerPeriod: "5", depositPerPeriod: "-10" }).success, false);
});

// ── Lot size (§9-§17 model + §48 cases) ──────────────────────────────────────

const FOREX_INPUT: LotSizeInput = {
  balance: 10_000,
  riskPercent: 1,
  direction: "LONG",
  entry: 1.085,
  stopLoss: 1.075,
  spec: resolveSpecification("EURUSD"),
  accountCurrency: "USD",
};

test("lot size: risk amount is balance × risk% (§9)", () => {
  assert.equal(calculateRiskAmount(10_000, 1), 100);
  assert.equal(calculateRiskAmount(5_000, 2), 100);
});

test("lot size: valid forex setup — 10 000 $ / 1% / 100 pips → 0.10 lots (§16)", () => {
  const calc = calculateLotSize(FOREX_INPUT);
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.equal(calc.value.riskAmount, 100);
  assert.ok(Math.abs(calc.value.stopPips! - 100) < 1e-9);
  assert.ok(Math.abs(calc.value.pipValuePerLot! - 10) < 1e-9);
  assert.ok(Math.abs(calc.value.riskPerLot! - 1000) < 1e-9);
  assert.ok(Math.abs(calc.value.lotsExact! - 0.1) < 1e-9);
  assert.equal(calc.value.lots, 0.1);
  assert.ok(Math.abs(calc.value.actualRisk! - 100) < 1e-9);
  assert.equal(calc.value.units, 10_000);
});

test("lot size: USDJPY converts the pip value at the entry price (§35 identity)", () => {
  const calc = calculateLotSize({
    balance: 10_000,
    riskPercent: 1,
    direction: "SHORT",
    entry: 150,
    stopLoss: 151,
    spec: resolveSpecification("USDJPY"),
    accountCurrency: "USD",
  });
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.equal(calc.value.pipValueSource, "ENTRY_CONVERTED");
  assert.ok(Math.abs(calc.value.pipValuePerLot! - 1000 / 150) < 1e-9, String(calc.value.pipValuePerLot));
  assert.ok(Math.abs(calc.value.lotsExact! - 100 / (100 * (1000 / 150))) < 1e-9);
});

test("lot size: metal setup via explicit specifications — XAUUSD 10.00 stop → 0.10 lots (§10)", () => {
  const calc = calculateLotSize({
    balance: 10_000,
    riskPercent: 1,
    direction: "LONG",
    entry: 2650,
    stopLoss: 2640,
    spec: resolveSpecification("XAUUSD"),
    accountCurrency: "USD",
  });
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.equal(calc.value.riskAmount, 100);
  assert.equal(calc.value.stopDistance, 10);
  assert.ok(Math.abs(calc.value.stopPips! - 1000) < 1e-9);
  assert.ok(Math.abs(calc.value.pipValuePerLot! - 1) < 1e-9);
  assert.equal(calc.value.lots, 0.1);
});

test("lot size: index setup via explicit specifications — NAS100 10-point stop → 10 lots", () => {
  const calc = calculateLotSize({
    balance: 10_000,
    riskPercent: 1,
    direction: "LONG",
    entry: 18_000,
    stopLoss: 17_990,
    spec: resolveSpecification("NAS100"),
    accountCurrency: "USD",
  });
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.equal(calc.value.lots, 10);
  assert.equal(calc.value.units, 10);
});

test("lot size: pip value override wins over every derivation (§15)", () => {
  const calc = calculateLotSize({ ...FOREX_INPUT, overrides: { pipValuePerLot: 5 } });
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.equal(calc.value.pipValueSource, "OVERRIDE");
  assert.ok(Math.abs(calc.value.lotsExact! - 100 / (100 * 5)) < 1e-9);
});

test("lot size: lots floor DOWN to the 0.01 step — never risk more (§27)", () => {
  const calc = calculateLotSize({ ...FOREX_INPUT, balance: 9_950 });
  assert.ok(calc.ok);
  if (!calc.ok) return;
  assert.equal(calc.value.riskAmount, 99.5);
  assert.ok(Math.abs(calc.value.lotsExact! - 0.0995) < 1e-9);
  assert.equal(calc.value.lots, 0.09);
  assert.ok(calc.value.actualRisk! <= calc.value.riskAmount);
  assert.equal(Math.round(calc.value.lots / LOT_SIZE_STEP), calc.value.lots / LOT_SIZE_STEP);
});

// ── Lot size V1.1 — costs (commission / spread) ──────────────────────────

test("lot size: zero costs reproduce the V1 result bit-for-bit", () => {
  const calc = calculateLotSize({ ...FOREX_INPUT, costs: { commissionPerLot: 0, spread: 0 } });
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.equal(calc.value.lots, 0.1);
  assert.ok(Math.abs(calc.value.riskPerLotWithCosts! - 1000) < 1e-9);
  assert.equal(calc.value.effectiveStopDistance, calc.value.stopDistance);
  assert.ok(Math.abs(calc.value.effectiveStopPips! - 100) < 1e-9);
  assert.equal(calc.value.spreadPips, 0);
  assert.equal(calc.value.spreadCostPerLot, 0);
  assert.equal(calc.value.commissionPerLot, 0);
  assert.equal(calc.value.totalCosts.total, 0);
  assert.ok(Math.abs(calc.value.actualRisk! - 100) < 1e-9);
});

test("lot size: spread widens the effective stop distance in BOTH directions", () => {
  const costs = { commissionPerLot: 0, spread: 0.0005 }; // 5 pips on EURUSD
  const long = calculateLotSize({ ...FOREX_INPUT, costs });
  assert.ok(long.ok, JSON.stringify(long));
  if (!long.ok) return;
  assert.ok(Math.abs(long.value.effectiveStopDistance! - 0.0105) < 1e-12);
  assert.ok(Math.abs(long.value.effectiveStopPips! - 105) < 1e-9);
  assert.ok(Math.abs(long.value.spreadPips! - 5) < 1e-9);
  assert.ok(Math.abs(long.value.spreadCostPerLot! - 50) < 1e-9);
  assert.ok(Math.abs(long.value.riskPerLotWithCosts! - 1050) < 1e-9);
  assert.ok(Math.abs(long.value.lotsExact! - 100 / 1050) < 1e-12);
  assert.equal(long.value.lots, 0.09);
  assert.ok(Math.abs(long.value.totalCosts.spread! - 0.09 * 50) < 1e-9);
  assert.ok(long.value.actualRisk! <= long.value.riskAmount);
  // Short mirror — same sizing (the spread is lost either way).
  const short = calculateLotSize({
    ...FOREX_INPUT,
    direction: "SHORT",
    entry: 1.075,
    stopLoss: 1.085,
    costs,
  });
  assert.ok(short.ok, JSON.stringify(short));
  assert.ok(short.ok && short.value.lots === 0.09);
});

test("lot size: round-turn commission per lot reduces the size", () => {
  const calc = calculateLotSize({ ...FOREX_INPUT, costs: { commissionPerLot: 30, spread: 0 } });
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.ok(Math.abs(calc.value.riskPerLotWithCosts! - 1030) < 1e-9);
  assert.ok(Math.abs(calc.value.lotsExact! - 100 / 1030) < 1e-12);
  assert.equal(calc.value.lots, 0.09);
  assert.ok(Math.abs(calc.value.totalCosts.commission! - 0.09 * 30) < 1e-9);
  assert.equal(calc.value.totalCosts.spread, 0);
  assert.ok(calc.value.actualRisk! <= calc.value.riskAmount);
});

test("lot size: spread + commission combine; the floor never exceeds the budget", () => {
  const calc = calculateLotSize({ ...FOREX_INPUT, costs: { commissionPerLot: 30, spread: 0.0005 } });
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.ok(Math.abs(calc.value.riskPerLotWithCosts! - 1080) < 1e-9);
  assert.equal(calc.value.lots, 0.09);
  assert.ok(calc.value.actualRisk! <= 100);
  assert.ok(Math.abs(calc.value.totalCosts.total! - (0.09 * 50 + 0.09 * 30)) < 1e-9);
  assert.ok(Math.abs(calc.value.totalCosts.total! - calc.value.totalCosts.spread! - calc.value.totalCosts.commission!) < 1e-12);
});

test("lot size: RR calculation — 10 risk / 20 reward → 1 : 2 (§14)", () => {
  const rr = calculateRiskReward({ entry: 2650, stopLoss: 2640, takeProfit: 2670, direction: "LONG" });
  assert.ok(rr.ok);
  if (!rr.ok) return;
  assert.equal(rr.value.riskDistance, 10);
  assert.equal(rr.value.rewardDistance, 20);
  assert.equal(rr.value.ratio, 2);
});

test("lot size: RR rejects a take profit on the wrong side (§13)", () => {
  assert.equal(calculateRiskReward({ entry: 2650, stopLoss: 2640, takeProfit: 2600, direction: "LONG" }).ok, false);
  assert.equal(calculateRiskReward({ entry: 2650, stopLoss: 2660, takeProfit: 2700, direction: "SHORT" }).ok, false);
});

test("lot size: zero stop distance → typed error, never a division by zero (§48)", () => {
  const calc = calculateLotSize({ ...FOREX_INPUT, stopLoss: FOREX_INPUT.entry });
  assert.equal(calc.ok, false);
  assert.ok(!calc.ok && calc.code === "ZERO_STOP_DISTANCE");
});

test("lot size: short setup mirrors the long math via absolute distance (§13)", () => {
  // Direction coherence is a FORM concern (schema test below); the pure math
  // must be direction-symmetric: |entry − stop|.
  const calc = calculateLotSize({ ...FOREX_INPUT, direction: "SHORT", entry: 1.075, stopLoss: 1.085 });
  assert.ok(calc.ok, JSON.stringify(calc));
  if (!calc.ok) return;
  assert.equal(calc.value.lots, 0.1);
  assert.equal(calc.value.units, 10_000);
});

test("lot size schema: zero/negative balance, invalid risk, wrong sides, identical stops", () => {
  const base = { balance: "10000", riskPercent: "1", direction: "LONG", entry: "2650", stopLoss: "2640", takeProfit: "", instrumentSymbol: "XAUUSD", commissionPerLot: "", spread: "", overrides: { contractSize: "", pipSize: "", pipValuePerLot: "" } };
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, balance: "0" }).success, false);
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, balance: "-100" }).success, false);
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, riskPercent: "0" }).success, false);
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, riskPercent: "150" }).success, false);
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, instrumentSymbol: "" }).success, false);
  // Identical entry/stop
  const identical = lotSizeCalculatorInputSchema.safeParse({ ...base, stopLoss: "2650" });
  assert.equal(identical.success, false);
  assert.ok(!identical.success && identical.error.issues.some((issue) => issue.message === "ENTRY_STOP_IDENTICAL"));
  // Long with the stop ABOVE entry
  const wrongLong = lotSizeCalculatorInputSchema.safeParse({ ...base, stopLoss: "2660" });
  assert.ok(!wrongLong.success && wrongLong.error.issues.some((issue) => issue.message === "STOP_WRONG_SIDE"));
  // Short with the stop BELOW entry
  const wrongShort = lotSizeCalculatorInputSchema.safeParse({ ...base, direction: "SHORT", stopLoss: "2600" });
  assert.ok(!wrongShort.success && wrongShort.error.issues.some((issue) => issue.message === "STOP_WRONG_SIDE"));
  // Take profit on the wrong side
  const wrongTP = lotSizeCalculatorInputSchema.safeParse({ ...base, takeProfit: "2600" });
  assert.ok(!wrongTP.success && wrongTP.error.issues.some((issue) => issue.message === "TP_WRONG_SIDE"));
  // Valid + TP on the right side passes
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, takeProfit: "2700" }).success, true);
  // Costs: empty (no cost), valid decimals — but negatives rejected
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, commissionPerLot: "", spread: "" }).success, true);
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, commissionPerLot: "30", spread: "0.5" }).success, true);
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, commissionPerLot: "-3" }).success, false);
  assert.equal(lotSizeCalculatorInputSchema.safeParse({ ...base, spread: "-0.5" }).success, false);
});


// ── Compounding V1.2 — periodic withdrawals ────────────────────────────────

test("compounding: withdrawals taken at period END — 1000/5%/3/W100 → 842.375", () => {
  const input = { startingBalance: 1000, periods: 3, gainPerPeriod: 5, withdrawalPerPeriod: 100 };
  const result = calculateCompounding(input);
  // Closed form: 1000×1.157625 − 100×(0.157625/0.05) = 1157.625 − 315.25
  assert.ok(Math.abs(result.finalBalance - 842.375) < 1e-9, String(result.finalBalance));
  assert.ok(Math.abs(projectFinalBalance(input) - result.finalBalance) < 1e-9);
  assert.ok(result.schedule.every((row) => row.withdrawal === 100));
  // Earned accounting: 842.375 + 300 withdrawn − 1000 = 142.375
  assert.ok(Math.abs(result.totalProfit - 142.375) < 1e-9, String(result.totalProfit));
  assert.equal(result.totalWithdrawals, 300);
  assert.ok(Math.abs(result.totalGainPct - 14.2375) < 1e-9, String(result.totalGainPct));
});

test("compounding: zero withdrawals reproduce the V1 projections exactly", () => {
  const without = calculateCompounding({ startingBalance: 1000, periods: 20, gainPerPeriod: 5 });
  const withZero = calculateCompounding({ startingBalance: 1000, periods: 20, gainPerPeriod: 5, withdrawalPerPeriod: 0 });
  assert.equal(withZero.finalBalance, without.finalBalance);
  assert.equal(withZero.totalProfit, without.totalProfit);
  assert.equal(withZero.totalWithdrawals, 0);
  assert.ok(withZero.schedule.every((row) => row.withdrawal === 0));
});

test("compounding: deposit + withdrawal combine into one net end-of-period flow", () => {
  const input = { startingBalance: 1000, periods: 3, gainPerPeriod: 5, depositPerPeriod: 100, withdrawalPerPeriod: 50 };
  const result = calculateCompounding(input);
  // 1000×1.157625 + 50×3.1525 = 1157.625 + 157.625
  assert.ok(Math.abs(result.finalBalance - 1315.25) < 1e-9, String(result.finalBalance));
  // Earned: 1315.25 + 150 withdrawn − 1300 contributed = 165.25
  assert.ok(Math.abs(result.totalProfit - 165.25) < 1e-9, String(result.totalProfit));
  assert.equal(result.totalDeposits, 300);
  assert.equal(result.totalWithdrawals, 150);
});

test("compounding: withdrawal beyond the balance goes negative honestly (no silent clamp)", () => {
  const result = calculateCompounding({ startingBalance: 100, periods: 2, gainPerPeriod: 1, withdrawalPerPeriod: 1000 });
  assert.ok(result.finalBalance < 0, String(result.finalBalance));
});

// ── Compounding V1.2 — variable-return scenarios ───────────────────────────

test("compounding: scenarios run the same engine under other gains", () => {
  const result = calculateCompounding({
    startingBalance: 1000, periods: 3, gainPerPeriod: 5,
    scenarios: { pessimistic: 3, optimistic: 7 },
  });
  assert.ok(result.scenarios !== null);
  assert.ok(Math.abs(result.finalBalance - 1157.625) < 1e-9, "base untouched");
  const p = result.scenarios!.pessimistic!;
  const o = result.scenarios!.optimistic!;
  assert.ok(Math.abs(p.finalBalance - 1000 * 1.03 ** 3) < 1e-9, String(p.finalBalance));
  assert.ok(Math.abs(o.finalBalance - 1000 * 1.07 ** 3) < 1e-9, String(o.finalBalance));
  assert.ok(p.schedule.length === 3 && o.schedule.length === 3);
  // Scenarios include the flows when present (closed form: P·g³ + D·(g³−1)/(g−1))
  const withFlows = calculateCompounding({
    startingBalance: 1000, periods: 3, gainPerPeriod: 5, depositPerPeriod: 100,
    scenarios: { optimistic: 7 },
  });
  const expectedOptimistic = 1000 * 1.07 ** 3 + 100 * ((1.07 ** 3 - 1) / 0.07);
  assert.ok(Math.abs(withFlows.scenarios!.optimistic!.finalBalance - expectedOptimistic) < 1e-9);
});

test("compounding: no scenarios → scenarios stays null (V1 shape intact)", () => {
  const result = calculateCompounding({ startingBalance: 1000, periods: 3, gainPerPeriod: 5 });
  assert.equal(result.scenarios, null);
});

test("compounding schema: scenario order + range validation", () => {
  const base = { startingBalance: "1000", periods: "3", gainPerPeriod: "5", depositPerPeriod: "", withdrawalPerPeriod: "", rateMode: "PER_PERIOD" as const, periodUnit: "MONTHLY" as const, annualGain: "" };
  const withScenarios = (scenarios: object) => ({ ...base, scenarios });
  // pessimistic above base → SCENARIO_ORDER
  const badPessimistic = compoundingCalculatorInputSchema.safeParse(withScenarios({ pessimistic: "8", optimistic: "" }));
  assert.ok(!badPessimistic.success && badPessimistic.error.issues.some((issue) => issue.message === "SCENARIO_ORDER"));
  // optimistic below base → SCENARIO_ORDER
  const badOptimistic = compoundingCalculatorInputSchema.safeParse(withScenarios({ pessimistic: "", optimistic: "2" }));
  assert.ok(!badOptimistic.success && badOptimistic.error.issues.some((issue) => issue.message === "SCENARIO_ORDER"));
  // Out of range → SCENARIO_GAIN_RANGE
  const outOfRange = compoundingCalculatorInputSchema.safeParse(withScenarios({ pessimistic: "-120", optimistic: "" }));
  assert.ok(!outOfRange.success && outOfRange.error.issues.some((issue) => issue.message === "SCENARIO_GAIN_RANGE"));
  // Valid order passes; empty scenarios pass
  assert.equal(compoundingCalculatorInputSchema.safeParse(withScenarios({ pessimistic: "3", optimistic: "7" })).success, true);
  assert.equal(compoundingCalculatorInputSchema.safeParse(withScenarios({ pessimistic: "", optimistic: "" })).success, true);
  // Withdrawals: negatives rejected, decimals accepted
  assert.equal(compoundingCalculatorInputSchema.safeParse({ ...base, withdrawalPerPeriod: "-10" }).success, false);
  assert.equal(compoundingCalculatorInputSchema.safeParse({ ...base, withdrawalPerPeriod: "12.5" }).success, true);
});

// ── Pip & Tick Value (TOOLS) ────────────────────────────────────────────────

test("pip value: EURUSD on a USD account — derived, $10/pip, $1/tick", () => {
  const spec = resolveSpecification("EURUSD");
  const result = calculatePipValue({ spec, lots: 1, price: 0, accountCurrency: "USD" });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.value.pipValuePerLot, 10);
  assert.equal(result.value.tickValuePerLot, 1);
  assert.equal(result.value.pipValuePosition, 10);
  assert.equal(result.value.tickValuePosition, 1);
  assert.equal(result.value.units, 100000);
  assert.equal(result.value.pipValueSource, "DERIVED");
  assert.equal(result.value.priceUsedForConversion, false);
});

test("pip value: USDJPY on a USD account — converted at the price", () => {
  const spec = resolveSpecification("USDJPY");
  const result = calculatePipValue({ spec, lots: 2, price: 150, accountCurrency: "USD" });
  assert.ok(result.ok);
  if (!result.ok) return;
  // pip = 0.01 × 100000 / 150 = 6.666…
  assert.ok(Math.abs(result.value.pipValuePerLot - (0.01 * 100000) / 150) < 1e-9, String(result.value.pipValuePerLot));
  assert.equal(result.value.pipValueSource, "ENTRY_CONVERTED");
  assert.equal(result.value.priceUsedForConversion, true);
  assert.ok(Math.abs(result.value.pipValuePosition - result.value.pipValuePerLot * 2) < 1e-9);
  // Tick = pip/10 → tick value = pip value / 10
  assert.ok(Math.abs(result.value.tickValuePerLot - result.value.pipValuePerLot / 10) < 1e-9);
});

test("pip value: tick override + pip value override win over derivations", () => {
  const spec = resolveSpecification("XAUUSD");
  const withTick = calculatePipValue({ spec, lots: 1, price: 0, accountCurrency: "USD", overrides: { tickSize: 0.1 } });
  assert.ok(withTick.ok);
  if (!withTick.ok) return;
  // XAUUSD: pip 0.01 × 100 oz = $1/lot; tick 0.10 → 10 ticks/pip → $10
  assert.equal(withTick.value.pipValuePerLot, 1);
  assert.equal(withTick.value.tickValuePerLot, 10);
  assert.equal(withTick.value.tickSize, 0.1);
  const overridden = calculatePipValue({ spec, lots: 1, price: 0, accountCurrency: "USD", overrides: { pipValuePerLot: 2.5 } });
  assert.ok(overridden.ok);
  if (!overridden.ok) return;
  assert.equal(overridden.value.pipValuePerLot, 2.5);
  assert.equal(overridden.value.pipValueSource, "OVERRIDE");
});

test("pip value: degenerate inputs return typed codes, never throw", () => {
  const spec = resolveSpecification("EURUSD");
  assert.equal(calculatePipValue({ spec, lots: -1, price: 0, accountCurrency: "USD" }).ok, false);
  assert.equal(calculatePipValue({ spec: { ...spec, pipSize: 0 }, lots: 1, price: 0, accountCurrency: "USD" }).ok, false);
  // JPY-style pair without a price and without an override → PIP_VALUE_REQUIRED
  const jpy = resolveSpecification("USDJPY");
  const missing = calculatePipValue({ spec: jpy, lots: 1, price: 0, accountCurrency: "USD" });
  assert.ok(!missing.ok && missing.code === "PIP_VALUE_REQUIRED");
});

test("pip value schema: lots required positive, advanced must be positive when provided", () => {
  const base = { lots: "1", price: "", overrides: { tickSize: "", pipValuePerLot: "" } };
  assert.equal(pipValueCalculatorInputSchema.safeParse(base).success, true);
  assert.equal(pipValueCalculatorInputSchema.safeParse({ ...base, lots: "0" }).success, false);
  assert.equal(pipValueCalculatorInputSchema.safeParse({ ...base, lots: "-1" }).success, false);
  assert.equal(pipValueCalculatorInputSchema.safeParse({ ...base, lots: "" }).success, false);
  assert.equal(pipValueCalculatorInputSchema.safeParse({ ...base, price: "150.25" }).success, true);
  assert.equal(pipValueCalculatorInputSchema.safeParse({ ...base, overrides: { tickSize: "0", pipValuePerLot: "" } }).success, false);
  assert.equal(pipValueCalculatorInputSchema.safeParse({ ...base, overrides: { tickSize: "", pipValuePerLot: "-2" } }).success, false);
  assert.equal(pipValueCalculatorInputSchema.safeParse({ ...base, overrides: { tickSize: "0.05", pipValuePerLot: "9" } }).success, true);
});

console.log(`\n${passed}/${passed} unit tests PASS`);

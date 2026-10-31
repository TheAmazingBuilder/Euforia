/**
 * Tools calculators - unit tests (Tools brief §47/§48).
 * Run: bun /home/z/my-project/scripts/test-calculators.ts
 * Pure functions only - no React, no network.
 */
import {
  calculateLotSize,
  calculateRiskAmount,
  calculateRiskReward,
  effectivePipValuePerLot,
  getInstrumentSpec,
  INSTRUMENT_PRESETS,
  validateLotSizeRelationships,
  lotSizeNumbersSchema,
  type LotSizeInput,
} from "../apps/web/src/lib/utils/calculators/lot-size";
import {
  calculateCompounding,
  compoundingInputSchema,
  COMPOUNDING_LIMITS,
} from "../apps/web/src/lib/utils/calculators/compounding";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

// ═══════════════════════════════ COMPOUNDING ════════════════════════════════

console.log("Compounding");

// §47: $1,000 / 5% / 1 period → $1,050
{
  const r = calculateCompounding({ startingBalance: 1000, periods: 1, gainPerPeriod: 5 });
  check("1 period ends at 1050", r !== null && approx(r.finalBalance, 1050));
  check("1 period profit +50", r !== null && approx(r.totalProfit, 50));
  check("1 period gain +5%", r !== null && approx(r.totalGain, 5));
}

// §23: $1,000 / 5% / 20 periods → $2,653.30 (+165.33%)
{
  const r = calculateCompounding({ startingBalance: 1000, periods: 20, gainPerPeriod: 5 });
  check("20 periods end at 2653.2977…", r !== null && approx(r.finalBalance, 2653.2977051444223));
  check("20 periods gain +165.33%", r !== null && approx(r.totalGain, 165.32977051444223));
  const row3 = r?.schedule[2];
  check("row3 start 1102.50", row3 !== undefined && approx(row3.startingBalance, 1102.5));
  check("row3 end 1157.625", row3 !== undefined && approx(row3.endingBalance, 1157.625));
  check("row3 cumulative profit 157.625", row3 !== undefined && approx(row3.totalProfit, 157.625));
  check("row3 cumulative gain 15.76%", row3 !== undefined && approx(row3.totalGain, 15.7625));
  // §22: Total Profit is cumulative from INITIAL, not the row's own gain
  check("row5 profit > row2 gain (cumulative semantics)", r !== undefined && r.schedule[4].totalProfit > r.schedule[1].totalProfit);
}

// 0% → flat
{
  const r = calculateCompounding({ startingBalance: 2500, periods: 12, gainPerPeriod: 0 });
  check("0% keeps balance flat", r !== null && approx(r.finalBalance, 2500));
  check("0% total profit 0", r !== null && approx(r.totalProfit, 0));
}

// Negative returns (§26): -2% × 10 → 1000 × 0.98^10
{
  const r = calculateCompounding({ startingBalance: 1000, periods: 10, gainPerPeriod: -2 });
  check("-2%×10 ends at 817.07…", r !== null && approx(r.finalBalance, 1000 * Math.pow(0.98, 10)));
  check("-2%×10 total gain negative", r !== null && r.totalGain < 0);
}

// Decimal percentage: 2.5% × 4
{
  const r = calculateCompounding({ startingBalance: 8000, periods: 4, gainPerPeriod: 2.5 });
  check("2.5%×4 ends at 8828.03…", r !== null && approx(r.finalBalance, 8000 * Math.pow(1.025, 4)));
}

// Schema guards (§25/§26)
{
  check("periods 0 rejected", !compoundingInputSchema.safeParse({ startingBalance: 1000, periods: 0, gainPerPeriod: 5 }).success);
  check("periods 501 rejected", !compoundingInputSchema.safeParse({ startingBalance: 1000, periods: COMPOUNDING_LIMITS.maxPeriods + 1, gainPerPeriod: 5 }).success);
  check("balance 0 rejected", !compoundingInputSchema.safeParse({ startingBalance: 0, periods: 5, gainPerPeriod: 5 }).success);
  check("gain -150 rejected", !compoundingInputSchema.safeParse({ startingBalance: 1000, periods: 5, gainPerPeriod: -150 }).success);
  check("fractional periods rejected", !compoundingInputSchema.safeParse({ startingBalance: 1000, periods: 2.5, gainPerPeriod: 5 }).success);
  check("calculateCompounding null on invalid", calculateCompounding({ startingBalance: -5, periods: 3, gainPerPeriod: 5 }) === null);
}

// ═══════════════════════════════ LOT SIZE ═══════════════════════════════════

console.log("Lot Size");

// §10 worked example - XAUUSD: $10,000, 1%, entry 2650, SL 2640
{
  const spec = getInstrumentSpec("XAUUSD");
  const r = calculateLotSize({
    balance: 10_000, riskPercent: 1, direction: "LONG",
    entryPrice: 2650, stopLoss: 2640, takeProfit: null, spec,
  });
  check("risk amount $100", r !== null && approx(r.riskAmount, 100));
  check("stop distance 10.00", r !== null && approx(r.stopDistance, 10));
  check("stop pips 1000", r !== null && approx(r.stopPips ?? 0, 1000));
  check("pip value $1/lot", r !== null && approx(r.pipValuePerLot ?? 0, 1));
  check("exact lots 0.10", r !== null && approx(r.lotsExact, 0.1));
  check("rounded lots 0.10", r !== null && approx(r.lotsRounded, 0.1));
  check("units = 10 oz", r !== null && approx(r.units, 10));
  check("actual risk ≤ target", r !== null && r.actualRiskAtRounded <= r.riskAmount + 1e-9);
}

// Forex standard: EURUSD $10,000, 1%, 1.0850 / 1.0800 → 50 pips → 0.20 lots
{
  const spec = getInstrumentSpec("EURUSD");
  const r = calculateLotSize({
    balance: 10_000, riskPercent: 1, direction: "LONG",
    entryPrice: 1.085, stopLoss: 1.08, takeProfit: 1.095, spec,
  });
  check("EURUSD 0.20 lots", r !== null && approx(r.lotsRounded, 0.2));
  check("EURUSD 20 000 units", r !== null && approx(r.units, 20_000));
  check("EURUSD stop 50 pips", r !== null && approx(r.stopPips ?? 0, 50));
  // §14 RR: TP 1.0950 → risk 0.0050, reward 0.0100 → 1 : 2.00
  const rr = calculateRiskReward(1.085, 1.08, 1.095);
  check("RR 1:2.00", rr !== null && approx(rr.ratio, 2));
}

// Quote-currency pair: USDJPY at 150.00 → pip value 1000/150 ≈ 6.6667
{
  const spec = getInstrumentSpec("USDJPY");
  const pip = effectivePipValuePerLot(spec, 150);
  check("USDJPY pip value ≈ 6.6667", approx(pip, 1000 / 150));
  const r = calculateLotSize({
    balance: 10_000, riskPercent: 1, direction: "SHORT",
    entryPrice: 150, stopLoss: 150.5, takeProfit: null, spec,
  });
  check("USDJPY 50 stop pips", r !== null && approx(r.stopPips ?? 0, 50));
  check("USDJPY ≈ 0.30 lots", r !== null && approx(r.lotsExact, 100 / (50 * (1000 / 150)), 1e-9));
  // Short: SL ABOVE entry is valid
  check("USDJPY short SL above entry valid", r !== null);
}

// CONTRACT method - NAS100: 10 000, 1%, 18500 / 18490 → 10 units
{
  const spec = getInstrumentSpec("NAS100");
  const r = calculateLotSize({
    balance: 10_000, riskPercent: 1, direction: "LONG",
    entryPrice: 18_500, stopLoss: 18_490, takeProfit: null, spec,
  });
  check("NAS100 contract method", r !== null && r.method === "CONTRACT");
  check("NAS100 10 units", r !== null && approx(r.units, 10));
  check("NAS100 lotsRounded = units (size 1)", r !== null && approx(r.lotsRounded, 10));
}

// CONTRACT method - BTCUSD: 0.5% of 20,000 = $100 risk, stop $500 → 0.20 BTC
{
  const spec = getInstrumentSpec("BTCUSD");
  const r = calculateLotSize({
    balance: 20_000, riskPercent: 0.5, direction: "LONG",
    entryPrice: 60_000, stopLoss: 59_500, takeProfit: null, spec,
  });
  check("BTCUSD 0.20 units", r !== null && approx(r.units, 0.2));
}

// Rounding floors DOWN (risk never exceeds target)
{
  const spec = getInstrumentSpec("EURUSD");
  const r = calculateLotSize({
    balance: 10_000, riskPercent: 1, direction: "LONG",
    entryPrice: 1.085, stopLoss: 1.0823, takeProfit: null, spec,
  });
  // risk 100, stop 27 pips, riskPerLot 270 → 0.3703… → floor 0.37
  check("floor to 0.37", r !== null && approx(r.lotsRounded, 0.37));
  check("actual risk 99.90 ≤ 100", r !== null && approx(r.actualRiskAtRounded, 99.9));
}

// Degenerate inputs - no division-by-zero, no silent zero (§12/§48)
{
  const spec = getInstrumentSpec("EURUSD");
  check("zero stop distance → null", calculateLotSize({
    balance: 10_000, riskPercent: 1, direction: "LONG",
    entryPrice: 1.085, stopLoss: 1.085, takeProfit: null, spec,
  }) === null);
  check("zero balance → schema error", !lotSizeNumbersSchema.safeParse({
    balance: 0, riskPercent: 1, entryPrice: 1.085, stopLoss: 1.08, takeProfit: null,
  }).success);
  check("negative balance → schema error", !lotSizeNumbersSchema.safeParse({
    balance: -100, riskPercent: 1, entryPrice: 1.085, stopLoss: 1.08, takeProfit: null,
  }).success);
  check("risk 0 → schema error", !lotSizeNumbersSchema.safeParse({
    balance: 10_000, riskPercent: 0, entryPrice: 1.085, stopLoss: 1.08, takeProfit: null,
  }).success);
  check("risk 150 → schema error", !lotSizeNumbersSchema.safeParse({
    balance: 10_000, riskPercent: 150, entryPrice: 1.085, stopLoss: 1.08, takeProfit: null,
  }).success);
  check("risk amount pure fn", approx(calculateRiskAmount(5000, 2), 100));
}

// Direction relationships (§13/§48)
{
  check("long SL above entry → error", "stopLoss" in validateLotSizeRelationships({
    direction: "LONG", entryPrice: 2650, stopLoss: 2660, takeProfit: null,
  }));
  check("short SL below entry → error", "stopLoss" in validateLotSizeRelationships({
    direction: "SHORT", entryPrice: 2650, stopLoss: 2640, takeProfit: null,
  }));
  check("SL = entry → explicit error", "stopLoss" in validateLotSizeRelationships({
    direction: "LONG", entryPrice: 2650, stopLoss: 2650, takeProfit: null,
  }));
  check("long TP below entry → error", "takeProfit" in validateLotSizeRelationships({
    direction: "LONG", entryPrice: 2650, stopLoss: 2640, takeProfit: 2645,
  }));
  check("short TP above entry → error", "takeProfit" in validateLotSizeRelationships({
    direction: "SHORT", entryPrice: 2650, stopLoss: 2660, takeProfit: 2655,
  }));
  check("valid long → no errors", Object.keys(validateLotSizeRelationships({
    direction: "LONG", entryPrice: 2650, stopLoss: 2640, takeProfit: 2670,
  })).length === 0);
  check("valid short TP → no errors", Object.keys(validateLotSizeRelationships({
    direction: "SHORT", entryPrice: 2650, stopLoss: 2660, takeProfit: 2630,
  })).length === 0);
}

// Decimal-heavy forex values stay precise
{
  const spec = getInstrumentSpec("GBPUSD");
  const r = calculateLotSize({
    balance: 2_500, riskPercent: 0.75, direction: "LONG",
    entryPrice: 1.26543, stopLoss: 1.26093, takeProfit: null, spec,
  });
  // risk 18.75, stop 45 pips, riskPerLot 450 → 0.041666…
  check("GBPUSD decimal lots 0.0416…", r !== null && approx(r.lotsExact, 18.75 / 450));
  check("GBPUSD floors to 0.04", r !== null && approx(r.lotsRounded, 0.04));
}

// Every preset must produce a finite, positive size for a sane setup (§36)
{
  for (const spec of INSTRUMENT_PRESETS) {
    if (spec.symbol === "CUSTOM") continue;
    const r = calculateLotSize({
      balance: 10_000, riskPercent: 1, direction: "LONG",
      entryPrice: spec.symbol === "USDJPY" ? 150 : spec.symbol === "BTCUSD" ? 60_000 : spec.symbol === "NAS100" ? 18_500 : spec.symbol === "XAUUSD" ? 2650 : 1.085,
      stopLoss: spec.symbol === "USDJPY" ? 149.5 : spec.symbol === "BTCUSD" ? 59_500 : spec.symbol === "NAS100" ? 18_490 : spec.symbol === "XAUUSD" ? 2640 : 1.08,
      takeProfit: null, spec,
    });
    check(`${spec.symbol} produces finite positive size`, r !== null && r.lotsExact > 0 && Number.isFinite(r.lotsExact));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

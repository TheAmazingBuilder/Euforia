/**
 * Oryon indicator engine — unit tests (bun).
 *
 * Same honest convention as oryon-drawing-tests.ts: the repository has NO
 * JS unit-test runner, so these are bun-run TypeScript with plain
 * assertions. Coverage follows the Phase 3 spec §13 (calculation tests):
 *   - SMA values, warm-up, insufficient data
 *   - EMA SMA-seed initialization + recursion against hand-computed values
 *   - RSI Wilder smoothing, flat markets, rising/falling sequences
 *   - MACD components + histogram, fast<slow validation
 *   - Bollinger basis/σ, ATR true range + Wilder recursion
 *   - Volume, candle normalization (ordering, duplicates, non-finite)
 *   - Instance store invariants (isolation, rejected invalid configs,
 *     last-valid-config retention)
 *   - Persistence: seed default template, round-trip, corruption, per-instance
 *     rule filtering
 *
 * Run: bun run scripts/oryon-indicator-tests.ts
 */

import {
  oryonIndicatorSchema,
  type Candle,
  type OryonIndicatorInstance,
} from "@cosmoz/shared";

import { calculateIndicator, latestValues } from "../src/lib/oryon/indicators/calculate";
import {
  emaKernel,
  emaSparseKernel,
  smaKernel,
  stddevKernel,
  trueRangeKernel,
  wilderKernel,
} from "../src/lib/oryon/indicators/math";
import { normalizeCandles } from "../src/lib/oryon/indicators/normalize";
import {
  defaultIndicatorInstance,
  indicatorLabel,
  INDICATOR_ORDER,
  INDICATOR_REGISTRY,
} from "../src/lib/oryon/indicators/registry";
import {
  flushIndicators,
  loadIndicators,
} from "../src/lib/oryon/indicators/persistence";
import { OryonIndicatorStore } from "../src/lib/oryon/indicators/store";
import { indicatorRuleError } from "../src/lib/oryon/indicators/validation";
import { formatIndicatorValue } from "../src/lib/oryon/indicators/format";

let passed = 0;
let failed = 0;
function ok(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
  }
}
function eq(label: string, actual: unknown, expected: unknown, eps = 1e-9): void {
  const close =
    typeof actual === "number" && typeof expected === "number"
      ? Math.abs(actual - expected) <= eps
      : actual === expected;
  ok(`${label} (got ${String(actual)})`, close);
}
function seriesEq(label: string, actual: (number | null)[], expected: (number | null)[], eps = 1e-9): void {
  let match = actual.length === expected.length;
  if (match) {
    for (let i = 0; i < expected.length; i += 1) {
      const a = actual[i];
      const b = expected[i];
      if (a === null || a === undefined) {
        if (b !== null) { match = false; break; }
      } else if (b === null || Math.abs(a - b) > eps) {
        match = false;
        break;
      }
    }
  }
  ok(`${label} (got [${actual.map((v) => (v === null ? "null" : Number(v.toFixed(6)))).join(", ")}])`, match);
}

function instance(type: OryonIndicatorInstance["type"], overrides: Record<string, unknown> = {}): OryonIndicatorInstance {
  return { ...defaultIndicatorInstance(type), ...overrides } as OryonIndicatorInstance;
}

function candle(t: number, o: number, h: number, l: number, c: number, v = 100): Candle {
  return { t, o, h, l, c, v };
}

// ── 1. SMA ───────────────────────────────────────────────────────────────────

console.log("\n[sma kernel]");
{
  seriesEq("window of 3 over 1..5", smaKernel([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  seriesEq("insufficient data → all null", smaKernel([1, 2], 5), [null, null]);
  seriesEq("period 1 equals identity", smaKernel([4, 7], 1), [4, 7]);
  seriesEq("constant series", smaKernel([5, 5, 5, 5], 2), [null, 5, 5, 5]);
  const drift = smaKernel(new Array(200).fill(10), 3);
  eq("sliding sum drift refreshed (long constant series)", drift[199]!, 10, 1e-12);
}

// ── 2. EMA ───────────────────────────────────────────────────────────────────

console.log("\n[ema kernel]");
{
  // Hand-computed: seed = SMA(3) of [2,4,6] = 4; k = 2/(3+1) = 0.5;
  // next = 8·0.5 + 4·0.5 = 6; then 12·0.5 + 6·0.5 = 9.
  seriesEq("SMA seed + documented recursion", emaKernel([2, 4, 6, 8, 12], 3), [null, null, 4, 6, 9]);
  seriesEq("insufficient data → all null", emaKernel([1], 3), [null]);
  // Warm-up NULL, never a fabricated 0.
  ok("warm-up is null (not 0)", emaKernel([2, 4, 6, 8], 3)[0] === null);
}

console.log("\n[ema sparse kernel]");
{
  // Dense sub-sequence [1, 2, 3] starting at index 2, period 2.
  const sparse = emaSparseKernel([null, null, 1, 2, 3], 2);
  seriesEq("anchored at first defined value", sparse, [null, null, null, 1.5, 2.5]);
}

// ── 3. RSI (Wilder) ──────────────────────────────────────────────────────────

console.log("\n[rsi]");
{
  const rising = instance("rsi", { period: 2, upper: 70, lower: 30 });
  const risingCandles = [1, 2, 3, 4, 5, 6].map((c, i) => candle(i * 60_000, c, c, c, c));
  const rsiRising = calculateIndicator(rising, risingCandles);
  seriesEq("pure rally → 100 (zero average loss)", rsiRising.outputs.line!, [null, null, 100, 100, 100, 100]);

  const fallingCandles = [6, 5, 4, 3, 2, 1].map((c, i) => candle(i * 60_000, c, c, c, c));
  const rsiFalling = calculateIndicator(instance("rsi", { period: 2 }), fallingCandles);
  seriesEq("pure decline → 0 (zero average gain)", rsiFalling.outputs.line!, [null, null, 0, 0, 0, 0]);

  const flatCandles = [5, 5, 5, 5, 5].map((c, i) => candle(i * 60_000, c, c, c, c));
  const rsiFlat = calculateIndicator(instance("rsi", { period: 2 }), flatCandles);
  seriesEq("flat market → neutral 50 (no NaN, no Infinity)", rsiFlat.outputs.line!, [null, null, 50, 50, 50]);

  // Wilder recursion, hand-computed (period 2):
  // deltas: +1, −0.5, +1, −1.5, +2, +1
  // avgG/avgL: (0.5, 0.25) → (0.75, 0.125) → (0.375, 0.8125) → (1.1875, 0.40625) → (1.09375, 0.203125)
  const mixed = [10, 11, 10.5, 11.5, 10, 12, 13].map((c, i) => candle(i * 60_000, c, c, c, c));
  const rsiMixed = calculateIndicator(instance("rsi", { period: 2 }), mixed);
  seriesEq(
    "Wilder smoothing hand-computed",
    rsiMixed.outputs.line!,
    [
      null,
      null,
      100 - 100 / 3,                    // 66.6667
      100 - 100 / 7,                    // 85.7143
      100 - 100 / (1 + 0.375 / 0.8125), // 31.5789
      100 - 100 / (1 + 1.1875 / 0.40625),
      100 - 100 / (1 + 1.09375 / 0.203125),
    ],
    1e-9,
  );
  ok(
    "no NaN / Infinity anywhere",
    rsiMixed.outputs.line!.every((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100)),
  );
}

// ── 4. MACD ──────────────────────────────────────────────────────────────────

console.log("\n[macd]");
{
  const macd = instance("macd", { fast: 2, slow: 3, signal: 2 });
  const closes = [2, 4, 6, 8, 12, 20, 30];
  const candles = closes.map((c, i) => candle(i * 60_000, c, c, c, c));
  const calc = calculateIndicator(macd, candles);

  // Hand-computed EMAs (fast k=2/3, slow k=1/2), MACD line from idx 2,
  // signal = EMA(2) of the defined MACD segment (seed at idx 3).
  seriesEq(
    "MACD line = EMA(fast) − EMA(slow)",
    calc.outputs.macd!,
    [null, null, 1, 1, 4 / 3, 41 / 18, 361 / 108],
    1e-9,
  );
  seriesEq(
    "signal = EMA over the defined segment",
    calc.outputs.signal!,
    [null, null, null, 1, 11 / 9, 52 / 27, 155 / 54],
    1e-9,
  );
  seriesEq(
    "histogram = macd − signal",
    calc.outputs.histogram!,
    [null, null, null, 0, 1 / 9, 19 / 54, 17 / 36],
    1e-9,
  );

  ok("fast ≥ slow rejected by business rule", indicatorRuleError(instance("macd", { fast: 26, slow: 12 })) === "macdFastBelowSlow");
  ok("fast = slow rejected", indicatorRuleError(instance("macd", { fast: 12, slow: 12 })) === "macdFastBelowSlow");
  let threw = false;
  try {
    calculateIndicator(instance("macd", { fast: 26, slow: 12 }), candles);
  } catch {
    threw = true;
  }
  ok("calculation throws on rule violation (programmer error)", threw);
}

// ── 5. Bollinger Bands ───────────────────────────────────────────────────────

console.log("\n[bbands]");
{
  seriesEq(
    "population σ, basis = SMA",
    stddevKernel([1, 2, 3, 4, 5], 3),
    [null, null, Math.sqrt(2 / 3), Math.sqrt(2 / 3), Math.sqrt(2 / 3)],
  );
  const bb = instance("bbands", { period: 3, stddev: 2 });
  const candles = [1, 2, 3, 4, 5].map((c, i) => candle(i * 60_000, c, c, c, c));
  const calc = calculateIndicator(bb, candles);
  const sd = Math.sqrt(2 / 3);
  eq("basis @2", calc.outputs.basis![2]!, 2);
  eq("upper @2 = basis + 2σ", calc.outputs.upper![2]!, 2 + 2 * sd, 1e-12);
  eq("lower @2 = basis − 2σ", calc.outputs.lower![2]!, 2 - 2 * sd, 1e-12);

  const flat = calculateIndicator(instance("bbands", { period: 3, stddev: 2 }), [2, 2, 2, 2].map((c, i) => candle(i * 60_000, c, c, c, c)));
  eq("flat market → σ = 0, bands collapse on basis", flat.outputs.upper![3]!, 2, 1e-12);
}

// ── 6. ATR ───────────────────────────────────────────────────────────────────

console.log("\n[atr]");
{
  const bars = [
    { h: 12, l: 10, c: 11 },
    { h: 13, l: 11, c: 12 },
    { h: 15, l: 12, c: 14 },
    { h: 14, l: 11, c: 12 },
    { h: 16, l: 13, c: 15 },
  ];
  seriesEq("true range kernel (incl. gaps vs prev close)", trueRangeKernel(bars), [2, 2, 3, 3, 4]);
  seriesEq("Wilder-smoothed ATR", wilderKernel([2, 2, 3, 3, 4], 3), [null, null, 7 / 3, 23 / 9, 82 / 27], 1e-12);
  const candles = bars.map((b, i) => candle(i * 60_000, b.c, b.h, b.l, b.c));
  const calc = calculateIndicator(instance("atr", { period: 3 }), candles);
  eq("ATR output @3", calc.outputs.line![3]!, 23 / 9, 1e-12);
}

// ── 7. Volume + normalization ────────────────────────────────────────────────

console.log("\n[volume + normalize]");
{
  const candles = [candle(3000, 1, 2, 1, 2, 500), candle(6000, 2, 3, 2, 3, 1500)];
  const calc = calculateIndicator(instance("volume"), candles);
  seriesEq("volume = candle volumes", calc.outputs.volume!, [500, 1500]);

  const shuffled = [
    candle(6000, 2, 3, 2, 3, 1500),
    candle(3000, 1, 2, 1, 2, 500),
    candle(9000, 3, 4, 3, 4, 2000),
    candle(3000, 1, 2, 1, 2.5, 700), // duplicate t — last wins
    candle(12000, Number.NaN, 5, 4, 5), // non-finite price — dropped
  ];
  const normalized = normalizeCandles(shuffled);
  eq("sorted ascending", normalized.length, 3);
  eq("duplicate timestamp keeps the LAST write", normalized[0]!.c, 2.5);
  eq("non-finite candle dropped", normalized.every((c) => Number.isFinite(c.c)), true);

  const smaAfterNormalize = calculateIndicator(instance("sma", { period: 2 }), shuffled);
  eq("calculations run on the normalized window (idx1)", smaAfterNormalize.outputs.line![1]!, (2.5 + 3) / 2, 1e-12);
  eq("calculations run on the normalized window (idx2)", smaAfterNormalize.outputs.line![2]!, (3 + 4) / 2, 1e-12);
}

// ── 8. latest values + formatting ────────────────────────────────────────────

console.log("\n[latest values + format]");
{
  const candles = [1, 2, 3, 4, 5].map((c, i) => candle(i * 60_000, c, c, c, c));
  const calc = calculateIndicator(instance("sma", { period: 2 }), candles);
  const latest = latestValues(calc);
  eq("latest SMA value", latest.values.line!, 4.5);
  eq("latest belongs to the last candle", latest.time!, candles[4]!.t / 1000);

  eq("rsi format", Number(formatIndicatorValue(56.324, instance("rsi"))), 56.32, 1e-9);
  ok("volume compact format", formatIndicatorValue(1_500_000, instance("volume")) === "1.5M");
  ok("price format", formatIndicatorValue(104_231.56, instance("sma")) === "104231.56");
  ok("non-finite → em dash", formatIndicatorValue(Number.NaN, instance("ema")) === "—");
}

// ── 9. registry + defaults ───────────────────────────────────────────────────

console.log("\n[registry]");
{
  for (const type of INDICATOR_ORDER) {
    ok(`registry entry complete: ${type}`, INDICATOR_REGISTRY[type].type === type);
    const def = defaultIndicatorInstance(type);
    ok(`default instance passes schema: ${type}`, oryonIndicatorSchema.safeParse(def).success);
    ok(`business rules satisfied: ${type}`, indicatorRuleError(def) === null);
  }
  ok("SMA default period is 20", (defaultIndicatorInstance("sma") as { period: number }).period === 20);
  ok("RSI default 14 with 30/70", (() => {
    const r = defaultIndicatorInstance("rsi") as { period: number; upper: number; lower: number };
    return r.period === 14 && r.upper === 70 && r.lower === 30;
  })());
  ok("MACD default 12/26/9", (() => {
    const m = defaultIndicatorInstance("macd") as { fast: number; slow: number; signal: number };
    return m.fast === 12 && m.slow === 26 && m.signal === 9;
  })());
  ok("labels distinguish twin instances", indicatorLabel(instance("sma", { period: 20 })) !== indicatorLabel(instance("sma", { period: 50 })));
  eq("SMA label", indicatorLabel(instance("sma", { period: 20 })), "SMA 20");
  eq("MACD label", indicatorLabel(instance("macd", { fast: 12, slow: 26, signal: 9 })), "MACD 12 26 9");
}

// ── 10. store ────────────────────────────────────────────────────────────────

console.log("\n[store]");
{
  const store = new OryonIndicatorStore();
  const sma1 = instance("sma", { period: 20 });
  const sma2 = instance("sma", { period: 50 });
  ok("add sma(20)", store.add(sma1).ok);
  ok("add sma(50)", store.add(sma2).ok);
  eq("collection size", store.indicators.length, 2);

  const isolated = {
    ...sma1,
    period: 10,
    updatedAt: Date.now(),
  } as OryonIndicatorInstance;
  ok("replace valid config", store.replace(isolated).ok);
  eq("instance 1 updated", (store.indicators[0] as { period: number }).period, 10);
  eq("instance 2 UNTOUCHED", (store.indicators[1] as { period: number }).period, 50);

  const badMacd = instance("macd", { fast: 26, slow: 12 });
  ok("add rejects fast ≥ slow", store.add(badMacd).ok === false);

  const badReplace = { ...sma1, period: 0 } as unknown as OryonIndicatorInstance;
  const before = store.indicators[0];
  ok("replace rejects invalid period", store.replace(badReplace).ok === false);
  eq("last VALID configuration retained", store.indicators[0], before);

  store.toggleVisible(sma2.id);
  eq("toggleVisible flips the flag", store.indicators[1]?.visible, false);
  store.remove(sma1.id);
  eq("remove deletes one instance", store.indicators.length, 1);

  const rsi = instance("rsi");
  store.loadAll([rsi]);
  eq("loadAll replaces the collection", store.indicators.length, 1);
}

// ── 11. persistence (mocked localStorage) ────────────────────────────────────

console.log("\n[persistence]");
{
  const backing = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
      removeItem: (key: string) => void backing.delete(key),
    },
  };

  // First visit — the PRD default template (volume + RSI 14), seeded + saved.
  const seeded = loadIndicators();
  eq("first visit seeds 2 indicators", seeded.indicators.length, 2);
  ok("seed flags itself", seeded.seeded);
  eq("template[0] is volume", seeded.indicators[0]!.type, "volume");
  eq("template[1] is rsi", seeded.indicators[1]!.type, "rsi");

  // Round trip.
  const stack = [instance("sma", { period: 20 }), instance("macd", { fast: 12, slow: 26, signal: 9 })];
  flushIndicators(stack);
  const loaded = loadIndicators();
  eq("round-trip preserves the stack", loaded.indicators.length, 2);
  eq("round-trip preserves type", loaded.indicators[1]!.type, "macd");
  ok("round-trip is not a seed", !loaded.seeded);

  // Explicitly empty stack is respected (no reseed).
  flushIndicators([]);
  eq("empty stack loads empty (user choice respected)", loadIndicators().indicators.length, 0);

  // Corrupt JSON → default template again.
  backing.set("euforia.oryon.indicators.v1", "{not json");
  const corrupt = loadIndicators();
  ok("corrupt JSON → seeded template", corrupt.seeded && corrupt.indicators.length === 2);

  // Wrong version → default template.
  backing.set("euforia.oryon.indicators.v1", JSON.stringify({ version: 9, savedAt: 1, indicators: [] }));
  ok("wrong version → seeded template", loadIndicators().seeded);

  // Rule-violating instance dropped INDIVIDUALLY; valid ones survive.
  const goodSma = instance("sma", { period: 20 });
  const badRsi = instance("rsi", { upper: 30, lower: 70 });
  flushIndicators([goodSma, badRsi]);
  const filtered = loadIndicators();
  eq("rule-violating instance dropped, valid kept", filtered.indicators.length, 1);
  eq("kept instance is the sma", filtered.indicators[0]!.type, "sma");
  ok("valid stack not flagged as seed", !filtered.seeded);
}

// ── report ───────────────────────────────────────────────────────────────────

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

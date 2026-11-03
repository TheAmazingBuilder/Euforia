/**
 * Oryon crosshair enhancement - unit tests (bun).
 *
 * Phase 5 spec §13 "crosshair tests" (pure layer):
 *   - legend time formatting (UTC - aligned with the chart time axis;
 *     intraday vs "1D"; invalid timestamps omitted)
 *   - legend volume gating (valid positive values ONLY - missing/non-finite/
 *     zero [forming candle] are omitted, never faked)
 *   - indicator values AT a bar time (exact-time lookup; warm-up and unknown
 *     times yield NO value - never an interpolation)
 *   - listener-free by construction: the lookups are pure reads over the
 *     calculation data (the real subscriptions live in the engine, covered
 *     by the E2E probe).
 *
 * Run: bun run scripts/oryon-crosshair-tests.ts
 */

import type { Candle } from "@cosmoz/shared";

import { calculateIndicator } from "../src/lib/oryon/indicators/calculate";
import {
  indicatorIndexOfTime,
  indicatorValuesAtIndex,
  indicatorValuesAtTime,
} from "../src/lib/oryon/indicators/lookup";
import { formatCandleTime, formatLegendVolume } from "../src/lib/oryon/crosshair/format";

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
  ok(`${name} (${a} === ${b})`, a === b);
}

// ── 1. Legend time (UTC, aligné sur l'axe du chart) ─────────────────────────

console.log("- heure de légende (UTC)");
// 2026-10-11 14:35 UTC.
const tsMs = Date.UTC(2026, 9, 11, 14, 35);
eq("intraday → « Oct 11, 14:35 » (UTC)", formatCandleTime(tsMs, "5m"), "Oct 11, 14:35");
eq("1D → date seule", formatCandleTime(tsMs, "1D"), "Oct 11, 2026");
ok("timestamp NaN → null (rien d'inventé)", formatCandleTime(NaN, "5m") === null);
ok("timestamp Infinity → null", formatCandleTime(Infinity, "1D") === null);

// ── 2. Volume de légende (valeurs valides uniquement) ───────────────────────

console.log("- volume de légende");
eq("volume réel compacté", formatLegendVolume(1234), "1.2K");
eq("volume unitaire", formatLegendVolume(7), "7");
eq("gros volume", formatLegendVolume(2_500_000), "2.5M");
ok("bougie en formation (0) → omis", formatLegendVolume(0) === null);
ok("volume manquant (null) → omis", formatLegendVolume(null) === null);
ok("volume non fini (NaN) → omis", formatLegendVolume(NaN) === null);
ok("volume négatif → omis", formatLegendVolume(-3) === null);

// ── 3. Lookup d'indicateur à une heure de barre ─────────────────────────────

console.log("- valeurs d'indicateur à l'heure survolée");

const candle = (t: number, c: number, v = 10): Candle => ({ t, o: c, h: c + 1, l: c - 1, c, v });
// 6 bougies 5m régulières, closes connus → SMA(3) défini à partir de l'index 2.
const candles: Candle[] = [0, 1, 2, 3, 4, 5].map((i) => candle(1_700_000_000_000 + i * 300_000, 10 + i));
const sma = calculateIndicator({ id: "sma-test-01", type: "sma", period: 3, visible: true, createdAt: 0, updatedAt: 0, style: { color: "accent", width: 1, dash: "solid" } }, candles);

eq("times en secondes (alignés aux ancres)", sma.times[0], candles[0]!.t / 1000);

const midIndex = 3;
const midTime = sma.times[midIndex]!;
eq("heure exacte de la barre 3 → index 3", indicatorIndexOfTime(sma, midTime), 3);
ok("heure inconnue (entre deux barres) → -1", indicatorIndexOfTime(sma, midTime + 60) === -1);
ok("heure inconnue (avant la 1re barre) → -1", indicatorIndexOfTime(sma, sma.times[0]! - 1) === -1);

// SMA(3) à l'index 3 = moyenne des closes 1, 2, 3 = (11 + 12 + 13) / 3.
const atMid = indicatorValuesAtTime(sma, midTime);
eq("SMA(3) à la barre 3 = 12", atMid?.line, 12);

// Warm-up : les deux premières barres n'ont PAS de valeur (null) - la
// légende ne doit rien afficher, jamais une interpolation.
ok("warm-up barre 0 → null (pas de fabrication)", indicatorValuesAtTime(sma, sma.times[0]!) === null);
ok("warm-up barre 1 → null", indicatorValuesAtTime(sma, sma.times[1]!) === null);
ok("index hors bornes → null", indicatorValuesAtIndex(sma, 99) === null);
ok("temps NaN → null", indicatorValuesAtTime(sma, NaN) === null);

// Dernière barre = valeur la plus récente (cohérence avec le flux live).
const lastIndex = sma.times.length - 1;
const expectedLast = (candles[3]!.c + candles[4]!.c + candles[5]!.c) / 3;
eq("SMA(3) dernière barre exacte", indicatorValuesAtTime(sma, sma.times[lastIndex]!)?.line, expectedLast);

// Multi-sorties (MACD) : toutes les sorties définies à l'index sont rendues.
const macd = calculateIndicator(
  {
    id: "macd-test-01",
    type: "macd",
    fast: 2,
    slow: 3,
    signal: 2,
    visible: true,
    createdAt: 0,
    updatedAt: 0,
    style: { color: "accent", width: 1, dash: "solid" },
    signalStyle: { color: "cat-ta", width: 1, dash: "solid" },
  },
  candles,
);
const macdAt = indicatorValuesAtTime(macd, sma.times[5]!);
ok("MACD : macd + signal + histogramme définis à la dernière barre", macdAt !== null && typeof macdAt.macd === "number" && typeof macdAt.signal === "number" && typeof macdAt.histogram === "number");
ok("MACD line = signal warm-up partiel géré (histogramme = macd − signal)", macdAt !== null && Math.abs((macdAt.histogram ?? 0) - ((macdAt.macd ?? 0) - (macdAt.signal ?? 0))) < 1e-9);

// ── Result ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

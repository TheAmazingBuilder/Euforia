/**
 * Oryon Phase 9 structure tests - pivot detection, HH/LH/HL/LL
 * classification, the BOS/CHoCH state machine, and the per-panel analysis
 * store/persistence surface (v4).
 *
 * Run: bun run scripts/oryon-structure-tests.ts
 *
 * The detection semantics under test (spec §4.1/§4.2/§4.4):
 *   - strict neighborhood comparisons (equal highs/lows never pivot);
 *   - right-side confirmation (a pivot is confirmed only when its full
 *     right window exists - confirmation never depends on future data);
 *   - provisional candidates are a DIFFERENT state, opt-in to display;
 *   - breaks fire once per level, causally (after the pivot's confirmation
 *     window), close- or wick-confirmed per configuration.
 */

import type { Candle, OryonPanelAnalysis } from "@cosmoz/shared";
import {
  ORYON_DEFAULT_PANEL_ANALYSIS,
  ORYON_DEFAULT_PANEL_CONTEXT,
  oryonPanelAnalysisSchema,
} from "@cosmoz/shared";

import { classifyPivots, detectPivots, normalizeCandles } from "../src/lib/oryon/structure/pivots";
import { detectStructureBreaks } from "../src/lib/oryon/structure/breaks";
import {
  ORYON_DEFAULT_SESSION,
  buildLayout,
  defaultPanelState,
} from "../src/lib/oryon/workspace/layouts";
import {
  flushLayouts,
  loadLayouts,
  saveLayouts,
} from "../src/lib/oryon/workspace/persistence";
import { OryonWorkspaceConfigStore } from "../src/lib/oryon/workspace/store";

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
  ok(`${name} (${a === b ? "ok" : `${a} !== ${b}`})`, a === b);
}

/** Fake localStorage - the store's persistence adapters need the DOM API. */
function installStorage(): Map<string, string> {
  const memory = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    },
  };
  return memory;
}

const MIN = 60_000;

/** Synthetic candle - opens at `t`, with given high/low (close defaults mid). */
function bar(t: number, h: number, l: number, o?: number, c?: number): Candle {
  return { t, o: o ?? (h + l) / 2, h, l, c: c ?? (o ?? (h + l) / 2), v: 1 };
}

/** Zigzag: alternating highs/lows around a base, one bar per swing step. */
function zigzag(steps: number[], startT: number, stepMs = MIN): Candle[] {
  return steps.map((price, i) => bar(startT + i * stepMs, price, price - 1));
}

const BASE = Date.UTC(2026, 8, 1, 0, 0); // 2026-09-01 00:00 UTC

// ── 1. Pivot detection ───────────────────────────────────────────────────────

console.log("- pivots (détection)");

// highs: 1 3 1 3 1 with left=right=1 → swing highs at index 1 and 3.
const zigCandles = zigzag([1, 3, 1, 3, 1], BASE);
const zigPivots = detectPivots({
  candles: zigCandles,
  config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
eq(
  "zigzag 1/1 → deux swing highs confirmés",
  zigPivots.filter((p) => p.kind === "high" && !p.provisional).map((p) => p.index),
  [1, 3],
);
eq("identité stable = kind + open time", zigPivots[0]!.id, `h-${(BASE + MIN) / 1000}`);
eq("ancre = prix réel de la bougie", zigPivots[0]!.price, 3);

// lows: mirror - lows 5 3 5 with left=right=1 → swing low at index 1.
const lowCandles = [bar(BASE, 5, 5), bar(BASE + MIN, 3, 3), bar(BASE + 2 * MIN, 5, 5)];
const lowPivots = detectPivots({
  candles: lowCandles,
  config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
eq(
  "zigzag bas → un swing low confirmé à l'index 1",
  lowPivots.filter((p) => p.kind === "low").map((p) => p.index),
  [1],
);

// Right-side confirmation: a high at index 2 needs 2 candles after it.
const confirmCandles = zigzag([1, 2, 4, 3, 2, 1], BASE);
const withRight2 = detectPivots({
  candles: confirmCandles.slice(0, 5), // index 2 high, only 2 bars after (3,4) - enough for right=2
  config: { leftBars: 1, rightBars: 2, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
eq(
  "right=2 : pivot confirmé dès que la fenêtre droite est complète",
  withRight2.filter((p) => p.kind === "high" && !p.provisional).map((p) => p.index),
  [2],
);
// One candle SHORT of the full right window → NOT confirmed.
const shortWindow = detectPivots({
  candles: confirmCandles.slice(0, 4), // high at index 2 has only 1 bar after
  config: { leftBars: 1, rightBars: 2, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
eq(
  "right=2 : fenêtre incomplète → aucun pivot confirmé",
  shortWindow.filter((p) => p.kind === "high" && !p.provisional).length,
  0,
);
ok("right=2 : le candidat est rapporté PROVISIONAL (état distinct)", shortWindow.some((p) => p.kind === "high" && p.provisional));

// Insufficient history.
eq(
  "historique insuffisant (n < left+right+1) → aucun pivot",
  detectPivots({
    candles: zigzag([1, 3, 1], BASE),
    config: { leftBars: 2, rightBars: 2, minDistancePips: null, minSeparationBars: null },
    pipSize: 0.0001,
  }),
  [],
);

// Equal highs never pivot (strict comparison, spec §4.4).
const equalHighs = [bar(BASE, 5, 1), bar(BASE + MIN, 5, 1), bar(BASE + 2 * MIN, 5, 1)];
eq(
  "hauts égaux → aucun pivot (comparaison stricte)",
  detectPivots({
    candles: equalHighs,
    config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
    pipSize: 0.0001,
  }).length,
  0,
);

// Consecutive pivots interleave.
const waveCandles = zigzag([1, 4, 1, 4, 1, 4, 1], BASE);
const wavePivots = detectPivots({
  candles: waveCandles,
  config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
eq(
  "onde → pivots alternés chronologiques",
  wavePivots.filter((p) => !p.provisional).map((p) => p.kind),
  ["high", "low", "high", "low", "high"],
);

// Min separation: same-kind pivots 2 bars apart rejected with separation 5.
const closeZig = zigzag([1, 4, 1, 4, 1], BASE); // highs at 1 and 3
eq(
  "séparation minimale : 2e pivot rejeté (< 5 barres)",
  detectPivots({
    candles: closeZig,
    config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: 5 },
    pipSize: 0.0001,
  }).filter((p) => p.kind === "high").length,
  1,
);

// Min distance in pips: second high 2 units away with distance 10 pips (= 1 unit at pip 0.1) - accepted.
const farZig = zigzag([1, 4, 1, 7, 1], BASE);
eq(
  "distance minimale : pivots éloignés conservés",
  detectPivots({
    candles: farZig,
    config: { leftBars: 1, rightBars: 1, minDistancePips: 10, minSeparationBars: null },
    pipSize: 0.1,
  }).filter((p) => p.kind === "high").length,
  2,
);
// Close pivots (1 unit apart) with 20-pip distance (= 2 units) → second rejected.
eq(
  "distance minimale : pivot trop proche rejeté",
  detectPivots({
    candles: closeZig,
    config: { leftBars: 1, rightBars: 1, minDistancePips: 20, minSeparationBars: null },
    pipSize: 0.1,
  }).filter((p) => p.kind === "high").length,
  1,
);

// Provisional candidates live near the right edge only.
const risingTail = zigzag([1, 2, 3, 4, 5, 6, 7], BASE);
const tailPivots = detectPivots({
  candles: risingTail,
  config: { leftBars: 2, rightBars: 2, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
const provisionalHighs = tailPivots.filter((p) => p.kind === "high" && p.provisional);
ok("queue montante → candidat provisional signalé", provisionalHighs.length >= 1);
ok(
  "provisional = uniquement en fin de fenêtre",
  provisionalHighs.every((p) => p.index >= risingTail.length - 2),
);

// Confirmation stability: confirmed pivots of a prefix survive in the
// extended window (never silently un-confirmed, spec §4.2).
const prefix = waveCandles.slice(0, 6);
const prefixPivots = detectPivots({
  candles: prefix,
  config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
const extendedPivots = detectPivots({
  candles: waveCandles,
  config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
const prefixConfirmedIds = prefixPivots.filter((p) => !p.provisional).map((p) => p.id);
const extendedConfirmedIds = new Set(extendedPivots.filter((p) => !p.provisional).map((p) => p.id));
ok(
  "stabilité : pivots confirmés du préfixe ⊆ confirmés de la fenêtre étendue",
  prefixConfirmedIds.every((id) => extendedConfirmedIds.has(id)),
);

// Duplicate timestamps: first wins; invalid (h < l) dropped.
const dirtyCandles = [
  bar(BASE, 2, 1),
  bar(BASE, 9, 8), // duplicate timestamp - dropped (first wins)
  bar(BASE + MIN, 5, 7), // invalid h < l - dropped
  bar(BASE + 2 * MIN, 3, 1),
];
eq(
  "normalisation : doublons first-wins, bougies invalides écartées",
  normalizeCandles(dirtyCandles).map((c) => c.t),
  [BASE, BASE + 2 * MIN],
);

// ── 2. Classification HH/LH/HL/LL ────────────────────────────────────────────

console.log("- classification (HH/LH/HL/LL)");

// Highs 3, 5, 4 → none, HH, LH. Lows 1, 2, 0.5 → none, HL, LL.
const classCandles: Candle[] = [
  bar(BASE + 0 * MIN, 3, 1),
  bar(BASE + 1 * MIN, 2, 0.5),
  bar(BASE + 2 * MIN, 5, 2),
  bar(BASE + 3 * MIN, 4, 1),
  bar(BASE + 4 * MIN, 4.5, 0.4),
  bar(BASE + 5 * MIN, 3, 1),
];
// With left=right=1: pivot highs at 2 (5) and 4 (4.5); pivot lows at 3? lows: 1,0.5,2,1,0.4,1 → pivot low at 1 (0.5, needs neighbors 1 and 2 > 0.5 ✓) and at 4 (0.4, neighbors 1 and 1 ✓).
const classified = classifyPivots(
  detectPivots({
    candles: classCandles,
    config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
    pipSize: 0.0001,
  }),
);
const highLabels = classified.filter((p) => p.kind === "high").map((p) => p.label ?? null);
eq("highs [5, 4.5] → [undefined→HH attendu HH puis LH]", highLabels, [null, "LH"]);
const lowLabels = classified.filter((p) => p.kind === "low").map((p) => p.label ?? null);
eq("lows [0.5, 0.4] → premier sans label, puis LL", lowLabels, [null, "LL"]);

// Higher-high sequence.
const hhCandles: Candle[] = [
  bar(BASE + 0 * MIN, 3, 1),
  bar(BASE + 1 * MIN, 2, 0.5),
  bar(BASE + 2 * MIN, 5, 2),
  bar(BASE + 3 * MIN, 4, 1.2),
  bar(BASE + 4 * MIN, 7, 3),
  bar(BASE + 5 * MIN, 4, 2),
];
const hhClassified = classifyPivots(
  detectPivots({
    candles: hhCandles,
    config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
    pipSize: 0.0001,
  }),
);
eq(
  "highs ascendants → HH sur le second",
  hhClassified.filter((p) => p.kind === "high").map((p) => p.label ?? null),
  [null, "HH"],
);
eq(
  "lows confirmés ascendants → HL sur le second",
  hhClassified.filter((p) => p.kind === "low" && !p.provisional).map((p) => p.label ?? null),
  [null, "HL"],
);

// A single pivot of a kind has NO label (no comparison point, §4.3).
eq(
  "pivot isolé → jamais classifié",
  classifyPivots([
    { id: "h-1", kind: "high", index: 0, timeSec: 1, price: 5, provisional: false },
  ]).map((p) => p.label ?? null),
  [null],
);

// ── 3. BOS / CHoCH ───────────────────────────────────────────────────────────

console.log("- cassures de structure (BOS/CHoCH)");

// Scenario: swing low at index 1 (price 2), then a close below it at index 4.
// lows: 3, 2, 3, 3, close 1.5 → first break with null trend = CHoCH (bearish).
const chochCandles: Candle[] = [
  bar(BASE + 0 * MIN, 4, 3),
  bar(BASE + 1 * MIN, 3, 2),
  bar(BASE + 2 * MIN, 5, 2.5),
  bar(BASE + 3 * MIN, 4, 3),
  bar(BASE + 4 * MIN, 3.5, 1.5, 3, 1.5),
];
const chochPivots = detectPivots({
  candles: chochCandles,
  config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
const chochBreaks = detectStructureBreaks({
  candles: chochCandles,
  pivots: chochPivots,
  rightBars: 1,
  mode: "close",
});
eq("première cassure = CHoCH", chochBreaks.map((b) => b.type), ["CHoCH"]);
eq("direction bearish", chochBreaks.map((b) => b.direction), ["bearish"]);
eq("niveau cassé = prix du pivot", chochBreaks.map((b) => b.level), [2]);
eq("ancre = bougie de cassure (index 4)", chochBreaks.map((b) => b.index), [4]);
eq("identité = type + pivot + temps de cassure", chochBreaks[0]!.id, `choch-${chochPivots.find((p) => p.kind === "low")!.id}-${(BASE + 4 * MIN) / 1000}`);

// No repeated firing on subsequent candles below the level.
const extendedDown: Candle[] = [
  ...chochCandles,
  bar(BASE + 5 * MIN, 3, 1.2, 1.5, 1.3),
  bar(BASE + 6 * MIN, 2.5, 1, 1.3, 1.1),
];
const extendedBreaks = detectStructureBreaks({
  candles: extendedDown,
  pivots: detectPivots({
    candles: extendedDown,
    config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
    pipSize: 0.0001,
  }),
  rightBars: 1,
  mode: "close",
});
eq(
  "cassure unique par niveau (pas de re-fire)",
  extendedBreaks.filter((b) => b.level === 2).length,
  1,
);

// BOS: within an established bearish trend, the next swing-low break is a BOS.
// After the CHoCH above, a new swing low forms (index 5 area) and breaks again.
// lows: index5 = 1.2 pivot? left neighbor 1.5(index4)? - craft explicitly:
const bosCandles: Candle[] = [
  ...chochCandles, // CHoCH at 4 (level 2)
  bar(BASE + 5 * MIN, 3, 1.6, 1.5, 2),   // small bounce closes at 2
  bar(BASE + 6 * MIN, 2.2, 1.4, 2, 1.8), // swing low candidate at 6 (1.4)
  bar(BASE + 7 * MIN, 2.4, 1.7, 1.8, 2), // right neighbor above 1.4 ✓
  bar(BASE + 8 * MIN, 2.2, 1.2, 2, 1.2), // close 1.2 < 1.4 → BOS bearish
];
const bosBreaks = detectStructureBreaks({
  candles: bosCandles,
  pivots: detectPivots({
    candles: bosCandles,
    config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
    pipSize: 0.0001,
  }),
  rightBars: 1,
  mode: "close",
});
eq("séquence [CHoCH puis BOS]", bosBreaks.map((b) => b.type), ["CHoCH", "BOS"]);
eq("BOS = bearish (continuation)", bosBreaks[1]!.direction, "bearish");

// Wick vs close modes.
const wickCandles: Candle[] = [
  bar(BASE + 0 * MIN, 4, 3),
  bar(BASE + 1 * MIN, 3, 2),
  bar(BASE + 2 * MIN, 5, 2.5),
  bar(BASE + 3 * MIN, 4, 3),
  // wick below the level but close above: l=1.9 < 2, c=2.4
  bar(BASE + 4 * MIN, 3.5, 1.9, 3, 2.4),
];
const wickPivots = detectPivots({
  candles: wickCandles,
  config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
  pipSize: 0.0001,
});
eq(
  "mode close : mèche sous le niveau ≠ cassure",
  detectStructureBreaks({ candles: wickCandles, pivots: wickPivots, rightBars: 1, mode: "close" }).length,
  0,
);
eq(
  "mode wick : mèche sous le niveau = cassure",
  detectStructureBreaks({ candles: wickCandles, pivots: wickPivots, rightBars: 1, mode: "wick" }).length,
  1,
);

// Equal touch is NOT a break (strict).
const touchCandles: Candle[] = [
  bar(BASE + 0 * MIN, 4, 3),
  bar(BASE + 1 * MIN, 3, 2),
  bar(BASE + 2 * MIN, 5, 2.5),
  bar(BASE + 3 * MIN, 4, 3),
  bar(BASE + 4 * MIN, 3.5, 2, 3, 2.6), // l === 2 exactly
];
eq(
  "toucher égal (l === niveau) ≠ cassure",
  detectStructureBreaks({
    candles: touchCandles,
    pivots: detectPivots({
      candles: touchCandles,
      config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
      pipSize: 0.0001,
    }),
    rightBars: 1,
    mode: "wick",
  }).length,
  0,
);

// Causality: a break can never precede the pivot's confirmation window.
// With right=3, the pivot low at index 1 confirms at candle 4; candles 2..3
// are INSIDE the window (lows > pivot low by construction) → the earliest
// possible break is at index ≥ 4.
const causalCandles: Candle[] = [
  bar(BASE + 0 * MIN, 4, 3),
  bar(BASE + 1 * MIN, 3, 2),      // pivot low (l=2)
  bar(BASE + 2 * MIN, 3.2, 2.4),
  bar(BASE + 3 * MIN, 3.1, 2.2),
  bar(BASE + 4 * MIN, 3.4, 2.6),  // confirmation closes here
  bar(BASE + 5 * MIN, 3, 1.5, 2.6, 1.5), // break candle
];
const causalBreaks = detectStructureBreaks({
  candles: causalCandles,
  pivots: detectPivots({
    candles: causalCandles,
    config: { leftBars: 1, rightBars: 3, minDistancePips: null, minSeparationBars: null },
    pipSize: 0.0001,
  }),
  rightBars: 3,
  mode: "close",
});
eq("causalité : cassure après la fenêtre de confirmation", causalBreaks.map((b) => b.index >= 4), [true]);
ok("causalité : l'événement existe bien", causalBreaks.length === 1);

// Level replacement: a newer swing high replaces the active one before any
// break - the replaced level never fires (most-recent-swing rule).
const replaceCandles: Candle[] = [
  bar(BASE + 0 * MIN, 3, 1),
  bar(BASE + 1 * MIN, 5, 2),      // swing high A (5)
  bar(BASE + 2 * MIN, 4, 2.5),
  bar(BASE + 3 * MIN, 7, 3),      // swing high B (7) - replaces A
  bar(BASE + 4 * MIN, 6, 4),
  bar(BASE + 5 * MIN, 8, 5, 6, 8),// close 8 > 7 → breaks B only
];
const replaceBreaks = detectStructureBreaks({
  candles: replaceCandles,
  pivots: detectPivots({
    candles: replaceCandles,
    config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
    pipSize: 0.0001,
  }),
  rightBars: 1,
  mode: "close",
});
eq("remplacement : seul le swing le plus récent casse", replaceBreaks.map((b) => b.level), [7]);
eq("première cassure haussière avec tendance nulle = CHoCH", replaceBreaks[0]!.type, "CHoCH");

// Gap over the level IS a break (same comparison, no special case).
const gapCandles: Candle[] = [
  bar(BASE + 0 * MIN, 4, 3),
  bar(BASE + 1 * MIN, 3, 2),
  bar(BASE + 2 * MIN, 5, 2.5),
  bar(BASE + 3 * MIN, 4, 3),
  bar(BASE + 4 * MIN, 1.8, 1.2, 2.9, 1.4), // gap down through 2
];
eq(
  "gap à travers le niveau = cassure",
  detectStructureBreaks({
    candles: gapCandles,
    pivots: detectPivots({
      candles: gapCandles,
      config: { leftBars: 1, rightBars: 1, minDistancePips: null, minSeparationBars: null },
      pipSize: 0.0001,
    }),
    rightBars: 1,
    mode: "wick",
  }).length,
  1,
);

// ── 4. Shared schema whitelist (persisted config can never be invalid) ──────

console.log("- schéma partagé (whitelist analyse)");

eq(
  "défauts : tout désactivé, fenêtre 3/3, OR NY 60",
  ORYON_DEFAULT_PANEL_ANALYSIS,
  {
    structure: {
      enabled: false,
      showSwingHighs: true,
      showSwingLows: true,
      showLabels: true,
      showProvisional: false,
      leftBars: 3,
      rightBars: 3,
      minDistancePips: null,
      minSeparationBars: null,
      breaksEnabled: false,
      breakMode: "close",
    },
    levels: {
      prevDayHighLow: false,
      prevDayOpenClose: false,
      prevWeekHighLow: false,
      prevWeekOpenClose: false,
      openingRange: false,
      orSessionId: "newyork",
      orDurationMinutes: 60,
      orShowDeveloping: true,
    },
  },
);
eq(
  "durée OR hors whitelist → rejetée",
  oryonPanelAnalysisSchema.safeParse({
    structure: ORYON_DEFAULT_PANEL_ANALYSIS.structure,
    levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels, orDurationMinutes: 45 },
  }).success,
  false,
);
eq(
  "leftBars 0 → rejeté (bornes)",
  oryonPanelAnalysisSchema.safeParse({
    structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure, leftBars: 0 },
    levels: ORYON_DEFAULT_PANEL_ANALYSIS.levels,
  }).success,
  false,
);
eq(
  "breakMode inconnu → rejeté",
  oryonPanelAnalysisSchema.safeParse({
    structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure, breakMode: "both" },
    levels: ORYON_DEFAULT_PANEL_ANALYSIS.levels,
  }).success,
  false,
);

// ── 5. Store + persistence v4 ────────────────────────────────────────────────

console.log("- store + persistance v4 (analyse par panneau)");

let memory = installStorage();

eq(
  "session par défaut : panneau avec analyse neutre",
  ORYON_DEFAULT_SESSION.panels[0]!.analysis,
  ORYON_DEFAULT_PANEL_ANALYSIS,
);

{
  const store = new OryonWorkspaceConfigStore();
  const panelId = store.getSnapshot().session.panels[0]!.id;
  const enabled: OryonPanelAnalysis = {
    structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure, enabled: true, leftBars: 5 },
    levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels, prevDayHighLow: true, orDurationMinutes: 30 },
  };
  store.setPanelAnalysis(panelId, enabled);
  eq("setPanelAnalysis applique la config", store.getSnapshot().session.panels[0]!.analysis, enabled);
  eq("setPanelAnalysis : pas de propagation (panneau unique)", store.getSnapshot().session.panels.length, 1);

  // Dirty tracking requires a saved active layout.
  memory = installStorage();
  store.saveAsNewLayout("Analysé");
  const other: OryonPanelAnalysis = {
    ...enabled,
    structure: { ...enabled.structure, rightBars: 2 },
  };
  store.setPanelAnalysis(panelId, other);
  eq("mutation analyse → layout marqué dirty", store.getSnapshot().dirty, true);
  store.saveActiveLayout();
  eq("saveActiveLayout → dirty retombe", store.getSnapshot().dirty, false);

  // Duplicate panel copies the analysis configuration.
  store.duplicatePanel(panelId);
  const panels = store.getSnapshot().session.panels;
  eq("duplicatePanel copie l'analyse", panels[1]!.analysis, other);
  ok("duplicatePanel : identité indépendante (copie profonde)", panels[1]!.analysis.structure !== panels[0]!.analysis.structure);

  // Unknown panel id - null-safe.
  store.setPanelAnalysis("panel-inconnu", enabled);
  eq("setPanelAnalysis : panneau inconnu ignoré", store.getSnapshot().session.panels.length, 2);
}

{
  // defaultPanelState inherits the analysis shape.
  const inherited = defaultPanelState("15m", "candles", ORYON_DEFAULT_PANEL_CONTEXT, {
    structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure, enabled: true },
    levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels, openingRange: true },
  });
  eq("defaultPanelState : analyse héritée", inherited.analysis.structure.enabled, true);
  ok("defaultPanelState : copie profonde", inherited.analysis.levels !== ORYON_DEFAULT_PANEL_ANALYSIS.levels);

  // buildLayout roundtrip preserves the analysis.
  const session = {
    ...ORYON_DEFAULT_SESSION,
    panels: [inherited],
  };
  const layout = buildLayout("layout-analyse1", "Analyse", session, {});
  eq("buildLayout : analyse persistée dans le record v4", layout.panels[0]!.analysis.levels.openingRange, true);
}

{
  // Persistence: v4 envelope on disk + v3 envelope migration.
  memory = installStorage();
  const store = new OryonWorkspaceConfigStore();
  const panelId = store.getSnapshot().session.panels[0]!.id;
  store.setPanelAnalysis(panelId, {
    structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure, enabled: true, breaksEnabled: true },
    levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels, prevWeekHighLow: true },
  });
  store.saveAsNewLayout("V4 check");
  saveLayouts(store.getSnapshot().layouts, store.getSnapshot().activeLayoutId);
  flushLayouts(store.getSnapshot().layouts, store.getSnapshot().activeLayoutId);
  const raw = JSON.parse(memory.get("euforia.oryon.layouts.v1")!) as { version: number };
  eq("enveloppe écrite = v4", raw.version, 4);

  const reloaded = loadLayouts();
  eq(
    "reload : analyse restaurée",
    reloaded.layouts[0]!.panels[0]!.analysis.structure.enabled,
    true,
  );
  eq(
    "reload : niveaux semaine restaurés",
    reloaded.layouts[0]!.panels[0]!.analysis.levels.prevWeekHighLow,
    true,
  );

  // A v3 envelope (Phase 8) migrates with the documented defaults.
  const v3Layout = buildLayout("layout-v3legacy", "Legacy", ORYON_DEFAULT_SESSION, {});
  const v3Envelope = {
    version: 3,
    savedAt: 1,
    layouts: [v3Layout],
    activeLayoutId: "layout-v3legacy",
  };
  memory.set("euforia.oryon.layouts.v1", JSON.stringify(v3Envelope));
  const migratedLoad = loadLayouts();
  eq(
    "enveloppe v3 → migration v4 (analyse par défaut, tout OFF)",
    migratedLoad.layouts[0]!.panels[0]!.analysis,
    ORYON_DEFAULT_PANEL_ANALYSIS,
  );
  eq("pointeur v3 conservé", migratedLoad.activeLayoutId, "layout-v3legacy");

  // A v4 record with an out-of-whitelist analysis is DROPPED (salvage).
  const poison = buildLayout("layout-poison99", "Poison", ORYON_DEFAULT_SESSION, {});
  (poison.panels[0]!.analysis.levels as { orDurationMinutes: number }).orDurationMinutes = 45;
  memory.set(
    "euforia.oryon.layouts.v1",
    JSON.stringify({ version: 4, savedAt: 1, layouts: [v3Layout, poison], activeLayoutId: "layout-poison99" }),
  );
  const salvaged = loadLayouts();
  eq("enveloppe v4 : enregistrement invalide écarté, les survivants restent", salvaged.layouts.map((l) => l.id), ["layout-v3legacy"]);
  eq("enveloppe v4 : pointeur pendant → null (défaut, jamais un crash)", salvaged.activeLayoutId, null);
}

// ── Rapport ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failures.length > 0) {
  console.error("Échecs:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

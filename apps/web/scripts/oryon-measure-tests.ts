/**
 * Oryon measure readout - unit tests (bun).
 *
 * Phase 5 spec §13 "measurement tests": positive and negative movements,
 * correct absolute difference, correct percentage calculation (spec formula
 * ((end − start) / start) × 100), invalid and zero starting prices, bar
 * counting (passed through from the chart pipeline), elapsed-time
 * calculation from ACTUAL anchor timestamps (never bars × interval - a
 * gapped market must not fake a duration), direction, and honest omission
 * of every unavailable part.
 *
 * Run: bun run scripts/oryon-measure-tests.ts
 */

import type { OryonDrawingAnchor } from "@cosmoz/shared";

import { computeMeasureReadout, formatElapsedDuration } from "../src/lib/oryon/drawings/measure";

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

const anchor = (t: number, p: number): OryonDrawingAnchor => ({ t, p });

// ── 1. Direction + absolute difference ──────────────────────────────────────

console.log("- direction et différence absolue");
const up = computeMeasureReadout(anchor(1000, 100), anchor(2000, 101.5), { digits: 2, pipSize: 0, bars: 10 });
ok("hausse → direction up", up.direction === "up");
ok("delta signé positif", up.delta === 1.5);
ok("ligne 1 : flèche ↑ + prix départ → arrivée", up.lines[0] === "↑ 100.00 → 101.50");
ok("ligne 2 contient Δ +1.50", up.lines[1]!.includes("Δ +1.50"));

const down = computeMeasureReadout(anchor(1000, 1.085), anchor(2000, 1.0812), { digits: 4, pipSize: 0.0001, bars: 8 });
ok("baisse → direction down", down.direction === "down");
ok("delta négatif exact (tolérance flottant)", down.delta !== null && Math.abs(down.delta - -0.0038) < 1e-9);
ok("ligne 1 : flèche ↓", down.lines[0] === "↓ 1.0850 → 1.0812");
ok("ligne 2 contient Δ -0.0038", down.lines[1]!.includes("Δ -0.0038"));

const flat = computeMeasureReadout(anchor(1000, 50), anchor(2000, 50), { digits: 2, pipSize: 0, bars: 3 });
ok("plat → direction flat + flèche →", flat.direction === "flat" && flat.lines[0] === "→ 50.00 → 50.00");
ok("plat → pct = 0 (dénominateur valide)", flat.pct === 0);

// ── 2. Percentage (formule spec, validation du dénominateur) ────────────────

console.log("- pourcentage");
const pctCase = computeMeasureReadout(anchor(0, 200), anchor(60, 205), { digits: 2, pipSize: 0, bars: 1 });
eq("((205-200)/200)*100 = 2.5", pctCase.pct, 2.5);
const negPct = computeMeasureReadout(anchor(0, 200), anchor(60, 195), { digits: 2, pipSize: 0, bars: 1 });
eq("baisse → -2.5 %", negPct.pct, -2.5);
const zeroStart = computeMeasureReadout(anchor(0, 0), anchor(60, 10), { digits: 2, pipSize: 0, bars: 1 });
ok("départ 0 → pct null, delta conservé", zeroStart.pct === null && zeroStart.delta === 10);
ok("départ 0 → ligne sans parenthèse de %", !zeroStart.lines[1]!.includes("%"));
ok("départ 0 → readout valide quand même", zeroStart.valid === true);

// ── 3. Pips (pipSize du contrat instrument) ─────────────────────────────────

console.log("- pips");
const pipsCase = computeMeasureReadout(anchor(0, 1.085), anchor(0, 1.0912), { digits: 4, pipSize: 0.0001, bars: null });
ok("Δ 0.0062 / 0.0001 = 62 pips (tolérance flottant)", pipsCase.pips !== null && Math.abs(pipsCase.pips - 62) < 1e-9);
ok("ligne 2 contient « 62.0 pips » (arrondi affichage)", pipsCase.lines[1]!.includes("62.0 pips"));
const noPips = computeMeasureReadout(anchor(0, 100), anchor(0, 110), { digits: 2, pipSize: 0, bars: null });
ok("pipSize 0 → pips omis (pas de division inventée)", noPips.pips === null && !noPips.lines[1]!.includes("pips"));

// ── 4. Barres (fournies par le pipeline logique du chart) ───────────────────

console.log("- barres");
const barsCase = computeMeasureReadout(anchor(0, 10), anchor(0, 12), { digits: 2, pipSize: 0, bars: 14 });
ok("14 bars affichées", barsCase.bars === 14 && barsCase.lines[1]!.includes("14 bars"));
const noBars = computeMeasureReadout(anchor(0, 10), anchor(0, 12), { digits: 2, pipSize: 0, bars: null });
ok("bars indisponibles → omises honnêtement", noBars.bars === null && !noBars.lines[1]!.includes("bars"));

// ── 5. Durée écoulée - TIMESTAMPS RÉELS, jamais bars × intervalle ───────────

console.log("- durée écoulée (timestamps réels)");
// 14 bougies 5m = 70 minutes d'axe ; les timestamps réels (avec trou de
// week-end simulé) donnent 2h30 - le readout doit afficher 2h 30m.
const gapped = computeMeasureReadout(
  anchor(1_760_000_000, 10),
  anchor(1_760_000_000 + 9_000, 11),
  { digits: 2, pipSize: 0, bars: 14 },
);
eq("durée = |Δt| réel = 9000 s = 2h 30m", gapped.elapsedSec, 9000);
ok("affichage « 2h 30m »", gapped.lines[1]!.includes("2h 30m"));

const noTime = computeMeasureReadout(anchor(NaN, 10), anchor(2000, 11), { digits: 2, pipSize: 0, bars: 1 });
ok("timestamp invalide → durée omise", noTime.elapsedSec === null && !noTime.lines[1]!.match(/\d+[hms]/));

eq("formatElapsedDuration(8) = « 8s »", formatElapsedDuration(8), "8s");
eq("formatElapsedDuration(42 * 60 + 10) = « 42m 10s »", formatElapsedDuration(42 * 60 + 10), "42m 10s");
eq("formatElapsedDuration(3 * 3600 + 12 * 60) = « 3h 12m »", formatElapsedDuration(3 * 3600 + 12 * 60), "3h 12m");
eq("formatElapsedDuration(1.5 * 86400) = « 1d 12h »", formatElapsedDuration(1.5 * 86_400), "1d 12h");
ok("formatElapsedDuration(NaN) = null", formatElapsedDuration(NaN) === null);
ok("formatElapsedDuration(négatif) = null", formatElapsedDuration(-5) === null);

// ── 6. Ancres invalides → readout honnêtement vide ─────────────────────────

console.log("- ancres invalides");
const badStart = computeMeasureReadout(anchor(0, NaN), anchor(60, 10), { digits: 2, pipSize: 0.1, bars: 1 });
ok("départ NaN → invalide, aucune ligne", badStart.valid === false && badStart.lines.length === 0);
const badEnd = computeMeasureReadout(anchor(0, 10), anchor(60, Infinity), { digits: 2, pipSize: 0.1, bars: 1 });
ok("arrivée Infinity → invalide", badEnd.valid === false);
eq("champs numériques null sur readout invalide", [badStart.delta, badStart.pct, badStart.pips], [null, null, null]);

// ── 7. Composé : ligne 2 complète (delta + pct + pips + bars + durée) ──────

console.log("- composition complète");
const full = computeMeasureReadout(anchor(1_000_000, 1.085), anchor(1_000_000 + 3_600, 1.0912), {
  digits: 4,
  pipSize: 0.0001,
  bars: 12,
});
ok(
  "ligne 2 = Δ (+%) · pips · bars · durée",
  full.lines[1] === "Δ +0.0062 (+0.57%) · 62.0 pips · 12 bars · 1h 0m",
);

// ── Result ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

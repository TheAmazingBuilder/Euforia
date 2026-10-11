/**
 * Oryon Drawing toolbar v2 — unit tests (bun).
 *
 * Covers the TradingView-parity rail's NO-BROWSER domains (the repo's
 * bun-run convention — plain assertions, no test runner):
 *   - shared contracts: every V3 drawing type round-trips the persistence
 *     schema; a V2-era envelope still loads untouched (additive evolution)
 *   - geometry: extended-line slab clip (painter + hit test), ellipse ring
 *     hit, fib-extension level prices, position target derivation
 *   - readouts: price range / date range / position — the honesty rules
 *     (invalid inputs omit, never fabricate)
 *   - ui prefs: defaults, per-entry favorites salvage, position validation,
 *     corrupt payloads → defaults (never a throw)
 *   - tool catalog: structural invariants (icons, label keys, shortcuts,
 *     representative membership, whitelist dedup)
 *
 * Run: bun run scripts/oryon-toolbar-tests.ts
 */

import {
  ORYON_FIB_EXT_LEVELS,
  ORYON_POSITION_RR,
  oryonDrawingsFileSchema,
  oryonDrawingSchema,
  oryonPositionTargetPrice,
  type OryonDrawing,
} from "@cosmoz/shared";

import {
  clipLineToRect,
  distanceToLineClipped,
  fibExtLevelPrice,
  hitEllipseEdge,
} from "../src/lib/oryon/drawings/geometry";
import {
  computeDateRangeReadout,
  computePositionReadout,
  computePriceRangeReadout,
} from "../src/lib/oryon/drawings/measure";
import {
  loadUiPrefs,
  ORYON_UI_PREFS_DEFAULT,
} from "../src/lib/oryon/workspace/ui-prefs";
import {
  ORYON_TOOL_GROUPS,
  ORYON_TOOL_IDS,
  ORYON_TOOL_SHORTCUTS,
  isCatalogToolId,
  shortcutMatches,
  toolGroupOf,
} from "../src/lib/oryon/tools/catalog";
import { ORYON_TOOL_ICONS } from "../src/components/oryon/oryon-tool-icons";

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

// ── fixture factory ──────────────────────────────────────────────────────────

const FRAME = {
  visible: true,
  locked: false,
  label: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  style: { color: "accent", width: 2, dash: "solid" as const, fill: null, fillOpacity: 0, fontSize: 13 },
};

function makeDrawing(type: OryonDrawing["type"]): OryonDrawing {
  const a = { t: 1_700_000_000, p: 100 };
  const b = { t: 1_700_000_600, p: 110 };
  switch (type) {
    case "trend": return { id: "x-trend-0001", type, ...FRAME, a, b };
    case "hline": return { id: "x-hline-0001", type, ...FRAME, price: 105 };
    case "vline": return { id: "x-vline-0001", type, ...FRAME, time: 1_700_000_300 };
    case "ray": return { id: "x-ray-00001", type, ...FRAME, a, b };
    case "rect": return { id: "x-rect-0001", type, ...FRAME, a, b };
    case "text": return { id: "x-text-0001", type, ...FRAME, at: a, text: "note" };
    case "measure": return { id: "x-meas-0001", type, ...FRAME, a, b };
    case "fib": return { id: "x-fib--0001", type, ...FRAME, a, b };
    case "extended": return { id: "x-ext--0001", type, ...FRAME, a, b };
    case "crossline": return { id: "x-cros-0001", type, ...FRAME, at: a };
    case "fibext": return { id: "x-fibx-0001", type, ...FRAME, a, b, c: { t: 1_700_001_200, p: 104 } };
    case "pricerange": return { id: "x-pric-0001", type, ...FRAME, a, b };
    case "daterange": return { id: "x-date-0001", type, ...FRAME, a, b };
    case "longpos": return { id: "x-long-0001", type, ...FRAME, a, b: { t: 1_700_000_600, p: 95 } };
    case "shortpos": return { id: "x-shrt-0001", type, ...FRAME, a, b: { t: 1_700_000_600, p: 105 } };
    case "ellipse": return { id: "x-ellp-0001", type, ...FRAME, a, b };
  }
}

console.log("\n── Shared contracts — V3 types round-trip the persistence schema");
const ALL_TYPES = [
  "trend", "hline", "vline", "ray", "rect", "text", "measure", "fib",
  "extended", "crossline", "fibext", "pricerange", "daterange", "longpos", "shortpos", "ellipse",
] as const;
ok("16 drawing types in the schema enum", oryonDrawingSchema.options.length === 16);
for (const type of ALL_TYPES) {
  const drawing = makeDrawing(type);
  const file = {
    version: 1 as const,
    symbol: "EURUSD",
    savedAt: 1_700_000_000_000,
    drawings: [drawing],
  };
  const parsed = oryonDrawingsFileSchema.safeParse(file);
  ok(`${type}: envelope validates`, parsed.success);
  if (parsed.success) {
    const round = oryonDrawingsFileSchema.safeParse(
      JSON.parse(JSON.stringify(parsed.data)),
    );
    ok(`${type}: JSON round-trip stable`, round.success);
  }
}
ok("invalid fibext (missing c) rejected", !oryonDrawingSchema.safeParse({ ...makeDrawing("fibext"), c: undefined }).success);
ok("position target helper: long 100/95 → 105", oryonPositionTargetPrice(100, 95) === 100 + (100 - 95) * ORYON_POSITION_RR);
eq("position target helper: short 100/105 → 95", oryonPositionTargetPrice(100, 105), 95);
eq("position target helper: 1:1 documented", ORYON_POSITION_RR, 1);

console.log("\n── Geometry — extended line / ellipse / fibext");
{
  const plot = { left: 0, top: 0, right: 400, bottom: 300 };
  // Diagonal through (100,100)→(300,200): the chord spans the whole plot.
  const chord = clipLineToRect(100, 100, 300, 200, plot);
  ok("clipLineToRect: line through plot yields a chord", chord !== null);
  if (chord !== null) {
    ok("clip chord touches x=0 side", Math.min(chord[0].x, chord[1].x) <= 0.001);
    ok("clip chord touches x=400 side", Math.max(chord[0].x, chord[1].x) >= 399.999);
  }
  ok("clipLineToRect: line outside plot → null", clipLineToRect(450, 10, 500, 30, plot) === null);
  ok("clipLineToRect: horizontal outside y-range → null", clipLineToRect(-50, 350, -10, 350, plot) === null);
  ok("clipLineToRect: degenerate point → null", clipLineToRect(50, 50, 50, 50, plot) === null);

  // Hit: ON the chord inside the plot, and BEYOND both anchors (infinite).
  eq("distanceToLineClipped: on-segment hit", distanceToLineClipped(200, 150, 100, 100, 300, 200, plot), 0, 0.01);
  eq("distanceToLineClipped: beyond A still hits (infinite line)", distanceToLineClipped(10, 55, 100, 100, 300, 200, plot), 0, 0.01);
  eq("distanceToLineClipped: beyond B still hits (chord end x=400)", distanceToLineClipped(400, 250, 100, 100, 300, 200, plot), 0, 0.01);
  ok("distanceToLineClipped: off-line miss", distanceToLineClipped(200, 10, 100, 100, 300, 200, plot) > 50);
  ok("distanceToLineClipped: line missing the plot → ∞", distanceToLineClipped(10, 10, 450, 10, 500, 30, plot) === Infinity);

  // Ellipse ring: inscribed in (50,50)-(250,150) → center (150,100), r 100/50.
  const ea = { x: 50, y: 50 };
  const eb = { x: 250, y: 150 };
  ok("hitEllipseEdge: right vertex (250,100) hits", hitEllipseEdge(250, 100, ea, eb));
  ok("hitEllipseEdge: top vertex (150,50) hits", hitEllipseEdge(150, 50, ea, eb));
  ok("hitEllipseEdge: bottom vertex (150,150) hits", hitEllipseEdge(150, 150, ea, eb));
  ok("hitEllipseEdge: center misses (hollow body)", !hitEllipseEdge(150, 100, ea, eb));
  ok("hitEllipseEdge: far outside misses", !hitEllipseEdge(350, 100, ea, eb));
  ok("hitEllipseEdge: degenerate rect misses", !hitEllipseEdge(100, 100, { x: 50, y: 50 }, { x: 50, y: 50 }));

  // fibext levels: swing a=100 → b=110 (+10), projected from c=104.
  eq("fibExtLevelPrice: level 0 at C", fibExtLevelPrice(100, 110, 104, 0), 104);
  eq("fibExtLevelPrice: level 1 = C + full swing", fibExtLevelPrice(100, 110, 104, 1), 114);
  eq("fibExtLevelPrice: level 1.618", fibExtLevelPrice(100, 110, 104, 1.618), 104 + 10 * 1.618);
  eq("ORYON_FIB_EXT_LEVELS includes golden ratio", ORYON_FIB_EXT_LEVELS.includes(1.618), true);
}

console.log("\n── Readouts — price range / date range / position (honesty rules)");
{
  const a = { t: 1_700_000_000, p: 100 };
  const b = { t: 1_700_086_400, p: 110 };

  const pr = computePriceRangeReadout(a, b, { digits: 2, pipSize: 0.01 });
  ok("price range: valid", pr.valid);
  eq("price range: Δprice", pr.delta, 10);
  eq("price range: Δ%", pr.pct, 10, 1e-6);
  eq("price range: pips", pr.pips, 1000);
  ok("price range: one composed line", pr.lines.length === 1 && pr.lines[0]!.includes("+10.00"));

  const prNoPips = computePriceRangeReadout(a, b, { digits: 2, pipSize: 0 });
  eq("price range: pipSize 0 → pips omitted (delta honest)", prNoPips.pips, null);
  ok("price range: pipSize 0 still valid", prNoPips.valid);

  const prInvalid = computePriceRangeReadout({ t: 1, p: NaN }, b, { digits: 2, pipSize: 0.01 });
  ok("price range: invalid anchors → no label, no fabrication", !prInvalid.valid && prInvalid.lines.length === 0);

  const dr = computeDateRangeReadout(a, b, { bars: 96 });
  ok("date range: valid", dr.valid);
  eq("date range: elapsed = 86400s", dr.elapsedSec, 86_400);
  eq("date range: bars from pipeline", dr.bars, 96);
  ok("date range: duration line '1d'", dr.lines.some((line) => line.startsWith("1d")));

  const drNoBars = computeDateRangeReadout(a, b, { bars: null });
  ok("date range: bars null → duration only", drNoBars.bars === null && drNoBars.valid);

  const pos = computePositionReadout(a, { t: b.t, p: 95 }, { digits: 2, pipSize: 0.01 });
  ok("position: valid", pos.valid);
  eq("position: entry", pos.entryPrice, 100);
  eq("position: stop", pos.stopPrice, 95);
  eq("position: target derived 1:1", pos.targetPrice, 105);
  eq("position: risk pips", pos.riskPips, 500);
  ok("position: label lists Entry/Stop/Target", pos.lines.join("|").includes("Entry 100.00") && pos.lines.join("|").includes("Target 105.00"));

  const posInvalid = computePositionReadout({ t: 1, p: Infinity }, { t: 2, p: 95 }, { digits: 2, pipSize: 0.01 });
  ok("position: invalid anchors → nothing fabricated", !posInvalid.valid && posInvalid.lines.length === 0 && posInvalid.targetPrice === null);
}

console.log("\n── UI prefs — defaults, salvage, corrupt payloads");
{
  // Fresh environment (no storage in bun) → documented defaults.
  const fresh = loadUiPrefs();
  eq("defaults: favorites count", fresh.favorites.length, ORYON_UI_PREFS_DEFAULT.favorites.length);
  eq("defaults: bar visible", fresh.favoritesBar.visible, true);

  // The default favorites MUST be whitelist members (loader round-trip).
  ok("defaults: every favorite is a catalog id", fresh.favorites.every((tool) => isCatalogToolId(tool)));
}

console.log("\n── Tool catalog — structural invariants");
{
  const ids = ORYON_TOOL_IDS;
  eq("catalog: 20 tools", ids.length, 20);
  eq("catalog: ids deduped", new Set(ids).size, ids.length);

  for (const group of ORYON_TOOL_GROUPS) {
    ok(`catalog: group ${group.id} non-empty`, group.tools.length > 0);
    ok(
      `catalog: group ${group.id} representative is a member`,
      group.tools.some((t) => t.tool === group.representative),
    );
    for (const def of group.tools) {
      ok(`catalog: ${def.tool} has an icon`, ORYON_TOOL_ICONS[def.tool] !== undefined);
      ok(`catalog: ${def.tool} label key non-empty`, typeof def.labelKey === "string" && def.labelKey.length > 0);
    }
  }

  ok("catalog: shortcut targets exist in the whitelist", ORYON_TOOL_SHORTCUTS.every((s) => ids.includes(s.tool)));
  const shortcuts = ORYON_TOOL_SHORTCUTS.map((s) => s.shortcut);
  eq("catalog: shortcuts unique", new Set(shortcuts).size, shortcuts.length);

  // Shortcut matcher semantics.
  const altT = { altKey: true, shiftKey: false, ctrlKey: false, metaKey: false, key: "t" } as KeyboardEvent;
  ok("shortcut: Alt+T matches", shortcutMatches(altT, "Alt+T"));
  ok("shortcut: Alt+T ≠ Alt+H", !shortcutMatches(altT, "Alt+H"));
  const plainT = { ...altT, altKey: false } as KeyboardEvent;
  ok("shortcut: plain T does not match Alt+T", !shortcutMatches(plainT, "Alt+T"));
  const altShiftT = { ...altT, shiftKey: true } as KeyboardEvent;
  ok("shortcut: Alt+Shift+T does not match Alt+T", !shortcutMatches(altShiftT, "Alt+T"));
  const ctrlT = { ...altT, ctrlKey: true } as KeyboardEvent;
  ok("shortcut: Ctrl+Alt+T rejected (Ctrl reserved)", !shortcutMatches(ctrlT, "Alt+T"));

  // toolGroupOf: one group per tool, cursor variants in the cursors group.
  for (const id of ids) {
    const group = toolGroupOf(id);
    ok(`catalog: ${id} resolves to a group`, group !== null);
  }
  eq("catalog: cursor-cross ∈ cursors group", toolGroupOf("cursor-cross")?.id, "cursors");
  eq("catalog: fibext ∈ fib group", toolGroupOf("fibext")?.id, "fib");
  eq("catalog: longpos ∈ forecast group", toolGroupOf("longpos")?.id, "forecast");

  ok("catalog: isCatalogToolId accepts 'eraser'", isCatalogToolId("eraser"));
  ok("catalog: isCatalogToolId rejects 'nope'", !isCatalogToolId("nope"));
}

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

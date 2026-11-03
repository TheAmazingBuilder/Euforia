/**
 * Oryon TradingView-style color palette - unit tests (bun).
 *
 * Covers the picker's pure layer (no DOM, no React):
 *   - grid shape: 7 rows × 10 columns, deterministic across calls;
 *   - row 0 is the grayscale ramp (r == g == b, ordered white → black);
 *   - row 1 is the vivid base set verbatim (lowercase);
 *   - every generated color is a valid 6-digit lowercase hex;
 *   - ramp rows keep each base's hue (±2°) and stay light→dark per column;
 *   - hex ↔ hsl round-trip on the base set (int tolerance ±2);
 *   - alpha composition: #RRGGBBAA bytes, opaque → short form, clamping,
 *     invalid input → null, hexAlpha defaults;
 *   - custom colors: add/dedup/cap against a FAKE localStorage.
 *
 * Run: bun run scripts/oryon-color-palette-tests.ts
 */

import {
  TV_BASE_ROW,
  TV_GRAY_ROW,
  addCustomColor,
  composeHexAlpha,
  hexAlpha,
  hexBase,
  hexToHsl,
  hslToHex,
  loadCustomColors,
  oryonTvPalette,
} from "../src/lib/oryon/workspace/color-palette";

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
function eq(label: string, actual: unknown, expected: unknown): void {
  ok(`${label} (got ${String(actual)})`, actual === expected);
}

const HEX_RE = /^#[0-9a-f]{6}$/;

// ── grid shape ───────────────────────────────────────────────────────────────
{
  console.log("\n── palette grid ──");
  const grid = oryonTvPalette();
  eq("7 rows", grid.length, 7);
  ok("10 columns per row", grid.every((row) => row.length === 10));
  const again = oryonTvPalette();
  ok("deterministic", JSON.stringify(grid) === JSON.stringify(again));
  ok("every cell a lowercase 6-digit hex", grid.flat().every((c) => HEX_RE.test(c)));
  eq("70 cells", new Set(grid.flat()).size, 70);

  // Row 0: grayscale - r == g == b, monotonic white → black.
  const grays = grid[0]!;
  ok("row 0 matches the documented gray ramp", JSON.stringify(grays) === JSON.stringify(TV_GRAY_ROW));
  ok("row 0 achromatic", grays.every((c) => {
    const v = parseInt(c.slice(1), 16);
    return ((v >> 16) & 0xff) === ((v >> 8) & 0xff) && ((v >> 8) & 0xff) === (v & 0xff);
  }));
  ok("row 0 white → black", grays[0] === "#ffffff" && grays[grays.length - 1] === "#000000");

  // Row 1: the vivid bases verbatim.
  ok("row 1 matches the documented bases", JSON.stringify(grid[1]) === JSON.stringify(TV_BASE_ROW));

  // Ramp: pastel→dark rows keep the base hue (±3°) and descend in lightness.
  // Row 1 is the vivid BASE (not the lightest) - the ramp starts AT row 2.
  let hueOk = true;
  let lightOk = true;
  for (let col = 0; col < 10; col += 1) {
    const baseHsl = hexToHsl(TV_BASE_ROW[col]!)!;
    let prevL = 101;
    for (let row = 2; row < 7; row += 1) {
      const hsl = hexToHsl(grid[row]![col]!)!;
      if (hsl === null) {
        hueOk = false;
        continue;
      }
      let dh = Math.abs(hsl.h - baseHsl.h);
      dh = Math.min(dh, 360 - dh);
      if (dh > 3) hueOk = false;
      if (hsl.l > prevL) lightOk = false;
      prevL = hsl.l;
    }
  }
  ok("ramp rows keep the base hue (±3°)", hueOk);
  ok("ramp lightness descends per column (pastel→dark)", lightOk);
}

// ── hex ↔ hsl round-trip ─────────────────────────────────────────────────────
{
  console.log("\n── hex ↔ hsl ──");
  for (const base of TV_BASE_ROW) {
    const hsl = hexToHsl(base);
    if (hsl === null) {
      ok(`hsl parse ${base}`, false);
      continue;
    }
    const back = hslToHex(hsl.h, hsl.s, hsl.l);
    const a = hexToHsl(base)!;
    const b = hexToHsl(back)!;
    const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
    ok(
      `round-trip ${base} (h±2 s±2 l±2) → ${back}`,
      dh <= 2 && Math.abs(a.s - b.s) <= 2 && Math.abs(a.l - b.l) <= 2,
    );
  }
  ok("invalid hex → null", hexToHsl("#12345") === null && hexToHsl("red") === null);
  ok("hsl clamps inputs", /^#[0-9a-f]{6}$/.test(hslToHex(999, 150, -20)));
}

// ── alpha composition ────────────────────────────────────────────────────────
{
  console.log("\n── alpha ──");
  eq("opaque → short form", composeHexAlpha("#FF0000", 1), "#ff0000");
  eq("50% → 80 byte", composeHexAlpha("#ff0000", 0.5), "#ff000080");
  eq("0% → 00", composeHexAlpha("#ff0000", 0), "#ff000000");
  eq("clamped >1 → short", composeHexAlpha("#ff0000", 4), "#ff0000");
  eq("clamped <0 → 00", composeHexAlpha("#ff0000", -1), "#ff000000");
  eq("input may already carry alpha", composeHexAlpha("#ff000080", 0.25), "#ff000040");
  ok("invalid input → null", composeHexAlpha("nope", 0.5) === null);
  eq("hexAlpha of 6-digit = 1", hexAlpha("#ff0000"), 1);
  ok("hexAlpha of 8-digit ≈ 0.502", Math.abs(hexAlpha("#ff000080") - 0.502) < 0.001);
  eq("hexBase strips alpha", hexBase("#FF000080"), "#ff0000");
  eq("hexBase keeps base", hexBase("#ff0000"), "#ff0000");
  ok("hexBase invalid → null", hexBase("#fff") === null);
}

// ── custom colors (fake localStorage) ────────────────────────────────────────
{
  console.log("\n── custom colors ──");
  const backing = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  };
  (globalThis as { window?: unknown }).window = { localStorage: fakeStorage };

  eq("empty storage → []", loadCustomColors().length, 0);
  addCustomColor("#ff0000");
  addCustomColor("#00FF00");
  eq("two adds", loadCustomColors().length, 2);
  eq("most recent first", loadCustomColors()[0], "#00ff00");
  addCustomColor("#FF0000");
  eq("dedup keeps one entry", loadCustomColors().filter((c) => c === "#ff0000").length, 1);
  eq("dedup re-fronts", loadCustomColors()[0], "#ff0000");
  for (let i = 0; i < 12; i += 1) addCustomColor(`#12345${i.toString(16).padStart(1, "0")}`.slice(0, 7));
  eq("capped at 8", loadCustomColors().length, 8);
  ok("invalid colors rejected", addCustomColor("nope").every((c) => HEX_RE.test(c)));

  backing.set("euforia.oryon.custom-colors.v1", "not json");
  eq("corrupt JSON → []", loadCustomColors().length, 0);
  backing.set("euforia.oryon.custom-colors.v1", JSON.stringify(["#abcdef", 42, "zzz"]));
  eq("salvage keeps valid entries", JSON.stringify(loadCustomColors()), '["#abcdef"]');

  delete (globalThis as { window?: unknown }).window;
  eq("no window → []", loadCustomColors().length, 0);
}

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

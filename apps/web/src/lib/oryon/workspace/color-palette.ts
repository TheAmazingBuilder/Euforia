/**
 * TradingView-style chart color palette - the picker grid behind the chart
 * settings (Symbol → candles) and any future direct-manipulation color chip.
 *
 * PURE: no React, no DOM. The generation is deterministic (fixed bases +
 * fixed lightness ramp) so the grid is stable across sessions and unit-test-
 * able under bun. All output colors are lowercase 6-digit hex; alpha is
 * composed separately (8-digit hex) so the grid stays an alpha-free lookup.
 *
 * Grid shape (matches the reference screenshot):
 *   row 0        - grayscale ramp white → black (10 steps)
 *   rows 1..6    - 10 base hues, each repeated with a lightness ramp:
 *                  vivid base, pastel, light, rich, deep, dark
 */

export const TV_GRAY_ROW: readonly string[] = [
  "#ffffff",
  "#e3e3e3",
  "#c9c9c9",
  "#afafaf",
  "#949494",
  "#7a7a7a",
  "#5f5f5f",
  "#454545",
  "#2b2b2b",
  "#000000",
];

/** The 10 vivid base hues of the reference picker (row 1). */
export const TV_BASE_ROW: readonly string[] = [
  "#f23645", // red
  "#ff9800", // orange
  "#ffeb3b", // yellow
  "#4caf50", // green
  "#00c49e", // teal
  "#26c6da", // cyan
  "#2962ff", // blue
  "#7b61ff", // indigo/violet
  "#9c27b0", // purple
  "#ec407a", // pink
];

/** Lightness/saturation offsets per hue row, relative to the base color. */
const RAMP: ReadonlyArray<{ dl: number; ds: number }> = [
  { dl: 0, ds: 1 }, // vivid base
  { dl: 30, ds: 0.72 }, // pastel
  { dl: 18, ds: 0.86 }, // light
  { dl: 6, ds: 1 }, // rich
  { dl: -13, ds: 1 }, // deep
  { dl: -26, ds: 0.95 }, // dark
];

// ── hex ↔ hsl (pure, int-rounded - the ramp needs no floating output) ────────

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (m === null) return null;
  const int = parseInt(m[1]!, 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const ln = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hn < 60) [r, g, b] = [c, x, 0];
  else if (hn < 120) [r, g, b] = [x, c, 0];
  else if (hn < 180) [r, g, b] = [0, c, x];
  else if (hn < 240) [r, g, b] = [0, x, c];
  else if (hn < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ── alpha composition (the picker's opacity slider) ──────────────────────────

/** #RRGGBB (+ optional AA) → alpha in 0..1. Opaque when no alpha pair. */
export function hexAlpha(hex: string): number {
  const m = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.exec(hex);
  if (m === null || m[1] === undefined) return 1;
  return parseInt(m[1], 16) / 255;
}

/** Strips an alpha pair - the RGB base of a stored color. */
export function hexBase(hex: string): string | null {
  const m = /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(hex);
  return m === null ? null : `#${m[1]!.toLowerCase()}`;
}

/** RGB + alpha 0..1 → lowercase #RRGGBBAA (canvas/LWC-consumable). */
export function composeHexAlpha(hex: string, alpha: number): string | null {
  const base = hexBase(hex);
  if (base === null) return null;
  const a = Math.min(1, Math.max(0, alpha));
  if (a >= 0.999) return base; // Fully opaque → the short form (canonical).
  const byte = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0");
  return `${base}${byte}`;
}

// ── the grid ─────────────────────────────────────────────────────────────────

/**
 * The full picker grid - 7 rows × 10 columns, row-major. Deterministic:
 * grayscale row verbatim, then each RAMP step applied across ALL base hues
 * (one row per step - vivid, pastel, light, rich, deep, dark).
 */
export function oryonTvPalette(): string[][] {
  const rows: string[][] = [[...TV_GRAY_ROW]];
  for (const { dl, ds } of RAMP) {
    // The vivid row is the designed base set VERBATIM (hsl round-trip would
    // drift the curated hexes by ±1 channel); every derived row goes through
    // the conversion.
    rows.push(
      TV_BASE_ROW.map((base) => {
        if (dl === 0 && ds === 1) return base;
        const hsl = hexToHsl(base);
        // Lightness capped at 92: beyond that the chroma collapses toward
        // white and the hue becomes numerically meaningless (a pastel of
        // the indigo base drifted 10° at l=99 - the hue is preserved here).
        return hsl === null ? base : hslToHex(hsl.h, hsl.s * ds, Math.min(92, hsl.l + dl));
      }),
    );
  }
  return rows;
}

// ── custom (recent) swatches - browser-local, tiny, honest ───────────────────

const CUSTOM_KEY = "euforia.oryon.custom-colors.v1";
const CUSTOM_MAX = 8;

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false;
  }
}

/** The user's recently added custom colors (most recent first). Never throws. */
export function loadCustomColors(): string[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    if (raw === null || raw === "") return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is string => typeof c === "string" && hexBase(c) !== null)
      .slice(0, CUSTOM_MAX);
  } catch {
    return [];
  }
}

/** Adds a color to the front of the custom list (deduped, capped). Never throws. */
export function addCustomColor(hex: string): string[] {
  const base = hexBase(hex);
  if (base === null || !isStorageAvailable()) return loadCustomColors();
  const next = [base, ...loadCustomColors().filter((c) => c !== base)].slice(0, CUSTOM_MAX);
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
  } catch {
    // Quota/eviction - the session keeps the list in memory.
  }
  return next;
}

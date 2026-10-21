import type { OryonDrawingStyle } from "@cosmoz/shared";

/**
 * Shared style presets for BOTH drawing style surfaces — the object-list
 * inline editor AND the right-click property editor. One source: the two
 * surfaces can never offer different palettes/widths again (the same drift
 * class the tool catalog eliminated for tool ids).
 */

/** Theme-token swatches — NO raw hex inputs (AGENTS.md golden rule). */
export const ORYON_COLOR_CHOICES: readonly { key: string; cssVar: string }[] = [
  { key: "accent", cssVar: "--accent" },
  { key: "profit", cssVar: "--profit" },
  { key: "loss", cssVar: "--loss" },
  { key: "warning", cssVar: "--warning" },
  { key: "cat-0", cssVar: "--cat-ta" },
  { key: "cat-1", cssVar: "--cat-strategies" },
  { key: "cat-3", cssVar: "--cat-patterns" },
  { key: "text-primary", cssVar: "--text-primary" },
];

/** Stroke widths (schema-bounded 1..4). */
export const ORYON_WIDTH_CHOICES: readonly number[] = [1, 2, 3, 4];

/** Dash styles (schema enum). */
export const ORYON_DASH_CHOICES: readonly OryonDrawingStyle["dash"][] = [
  "solid",
  "dashed",
  "dotted",
];

/** Text annotation font sizes (schema-bounded 10..28). */
export const ORYON_FONT_SIZE_CHOICES: readonly number[] = [11, 13, 16, 20];

/** Types whose painter honors style.fill (background areas). */
const FILL_TYPES: ReadonlySet<string> = new Set([
  "rect",
  "fib",
  "fibext",
  "measure",
  "ellipse",
]);

export function drawingSupportsFill(type: string): boolean {
  return FILL_TYPES.has(type);
}

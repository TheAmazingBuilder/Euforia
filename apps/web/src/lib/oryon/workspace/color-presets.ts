import { z } from "zod";

/**
 * Oryon chart color presets - curated candle-color themes (Symbol tab).
 *
 * A preset is a DOCUMENTED { up, down } pair applied to the EXISTING
 * appearance contract (OryonChartAppearance.upColor / downColor). It is
 * NOT a new persistence domain: applying a preset writes the same two
 * fields the TradingView-style picker writes, so presets ride the existing
 * per-panel chart-prefs persistence and honor "Theme" (null) clearing.
 *
 * PURE module - no storage, no React. The hex values are DISPLAY overrides
 * resolved directly by the chart engine (the engine accepts literal hex for
 * series colors - the "never hardcode hex" golden rule applies to THEME
 * token lookups in chart code; a user-chosen palette value is data, not a
 * theme lookup).
 */

export const oryonColorPresetSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(40),
  /** Bullish body color (#RRGGBB). */
  up: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Bearish body color (#RRGGBB). */
  down: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export type OryonColorPreset = z.infer<typeof oryonColorPresetSchema>;

/** Curated presets - first entry is the TradingView reference palette. */
export const ORYON_COLOR_PRESETS: readonly OryonColorPreset[] = [
  { id: "tradingview", name: "TradingView", up: "#089981", down: "#f23645" },
  { id: "classic", name: "Classic", up: "#26a69a", down: "#ef5350" },
  { id: "neon", name: "Neon", up: "#00e676", down: "#ff1744" },
  { id: "ocean", name: "Ocean", up: "#29b6f6", down: "#ff7043" },
  { id: "violet", name: "Violet", up: "#7e57c2", down: "#ec407a" },
  { id: "mono", name: "Monochrome", up: "#e0e0e0", down: "#616161" },
  { id: "gold", name: "Gold", up: "#d4a017", down: "#5c6bc0" },
] as const;

/** Finds a preset by id - null when unknown (never a silent fallback). */
export function colorPresetById(id: string): OryonColorPreset | null {
  return ORYON_COLOR_PRESETS.find((preset) => preset.id === id) ?? null;
}

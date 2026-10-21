import type { OryonDrawingTool } from "@/lib/oryon/drawings/interaction";
import type { oryonDict } from "@/i18n/dictionaries/en/oryon";

/**
 * Oryon tool catalog — the SINGLE source for the drawing toolbar v2
 * (TradingView-parity rail): group structure, per-tool metadata, flyout
 * membership and keyboard shortcuts. The rail, the favorites bar and the
 * ui-prefs whitelist all read from HERE — a tool cannot appear in one
 * surface and be rejected by another (the whitelist drift that plagues
 * hand-maintained lists is structurally impossible).
 *
 * Every listed tool is FUNCTIONAL (rendered + interactable + persisted);
 * the catalog deliberately contains no decorative placeholder rows.
 */

/** i18n keys are TYPE-checked against the English rail dictionary — a
 *  catalog row referencing a missing key is a compile error, not a
 *  blank menu label at runtime. */
type RailDict = typeof oryonDict.rail;

export interface OryonToolDef {
  tool: OryonDrawingTool;
  /** i18n key inside dict.oryon.rail (label + interaction hint). */
  labelKey: keyof RailDict;
  /** Keyboard shortcut shown in the flyout (i18n label key) AND wired
   *  globally — `shortcut` carries the REAL combo the matcher tests. */
  shortcutKey?: keyof RailDict;
  /** Actual keyboard combo ("Alt+T") — the matcher's source of truth. */
  shortcut?: string;
}

export interface OryonToolGroup {
  id: "cursors" | "trend" | "fib" | "forecast" | "shapes" | "text";
  /** i18n key inside dict.oryon.rail (flyout section header). */
  labelKey: keyof RailDict;
  /** Tool armed when the group's main icon is clicked (TV behavior). */
  representative: OryonDrawingTool;
  tools: readonly OryonToolDef[];
}

export const ORYON_TOOL_GROUPS: readonly OryonToolGroup[] = [
  {
    id: "cursors",
    labelKey: "groupCursors",
    representative: "cursor",
    tools: [
      { tool: "cursor", labelKey: "cursorArrow" },
      { tool: "cursor-cross", labelKey: "cursorCross" },
      { tool: "cursor-dot", labelKey: "cursorDot" },
      { tool: "eraser", labelKey: "eraser", shortcutKey: "shortcutEraser", shortcut: "Alt+E" },
    ],
  },
  {
    id: "trend",
    labelKey: "groupTrend",
    representative: "trend",
    tools: [
      { tool: "trend", labelKey: "trendline", shortcutKey: "shortcutTrend", shortcut: "Alt+T" },
      { tool: "ray", labelKey: "ray" },
      { tool: "extended", labelKey: "extended" },
      { tool: "hline", labelKey: "hline", shortcutKey: "shortcutHline", shortcut: "Alt+H" },
      { tool: "vline", labelKey: "vline", shortcutKey: "shortcutVline", shortcut: "Alt+V" },
      { tool: "crossline", labelKey: "crossline" },
    ],
  },
  {
    id: "fib",
    labelKey: "groupFib",
    representative: "fib",
    tools: [
      { tool: "fib", labelKey: "fib", shortcutKey: "shortcutFib", shortcut: "Alt+F" },
      { tool: "fibext", labelKey: "fibext" },
    ],
  },
  {
    id: "forecast",
    labelKey: "groupForecast",
    representative: "measure",
    tools: [
      { tool: "measure", labelKey: "measure" },
      { tool: "pricerange", labelKey: "pricerange" },
      { tool: "daterange", labelKey: "daterange" },
      { tool: "longpos", labelKey: "longpos" },
      { tool: "shortpos", labelKey: "shortpos" },
    ],
  },
  {
    id: "shapes",
    labelKey: "groupShapes",
    representative: "rect",
    tools: [
      { tool: "rect", labelKey: "rect", shortcutKey: "shortcutRect", shortcut: "Alt+R" },
      { tool: "ellipse", labelKey: "ellipse" },
      { tool: "brush", labelKey: "brush" },
    ],
  },
  {
    id: "text",
    labelKey: "groupText",
    representative: "text",
    tools: [
      { tool: "text", labelKey: "text" },
      { tool: "arrow-up", labelKey: "arrowUp" },
      { tool: "arrow-down", labelKey: "arrowDown" },
      { tool: "arrow-left", labelKey: "arrowLeft" },
      { tool: "arrow-right", labelKey: "arrowRight" },
    ],
  },
];

/** Every catalogued tool id — the favorites persistence whitelist. */
export const ORYON_TOOL_IDS: readonly OryonDrawingTool[] = [
  ...new Set(ORYON_TOOL_GROUPS.flatMap((group) => group.tools.map((t) => t.tool))),
];

/** A catalogued tool id — every interaction tool (cursors included) is
 *  starable, mirroring TradingView where the cursor flyout carries stars. */
export type OryonCatalogToolId = OryonDrawingTool;

export function isCatalogToolId(value: string): value is OryonCatalogToolId {
  return ORYON_TOOL_IDS.includes(value as OryonDrawingTool);
}

/** Group lookup for the active-tool highlight (structural, not a scan). */
export function toolGroupOf(tool: OryonDrawingTool): OryonToolGroup | null {
  for (const group of ORYON_TOOL_GROUPS) {
    if (group.tools.some((t) => t.tool === tool)) return group;
  }
  return null;
}

/** Catalog-driven shortcut table — REAL combos (rail wires listeners once). */
export const ORYON_TOOL_SHORTCUTS: readonly {
  shortcut: string;
  tool: OryonDrawingTool;
}[] = ORYON_TOOL_GROUPS.flatMap((group) =>
  group.tools
    .filter((t): t is OryonToolDef & { shortcut: string } => t.shortcut !== undefined)
    .map((t) => ({ shortcut: t.shortcut, tool: t.tool })),
);

/** Shortcut definition → actual KeyboardEvent matcher ("Alt+T" etc.). */
export function shortcutMatches(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1]!;
  const needAlt = parts.includes("alt");
  const needShift = parts.includes("shift");
  return (
    event.altKey === needAlt &&
    event.shiftKey === needShift &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key.toLowerCase() === key
  );
}

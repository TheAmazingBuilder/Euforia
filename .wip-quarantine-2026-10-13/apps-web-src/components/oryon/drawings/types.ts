import type { ChartTheme } from "@/lib/utils/chart-theme";

/**
 * Oryon drawing domain model (docs/specs/oryon-prd.md §8.3/§8.5).
 *
 * Anchors are stored in MARKET coordinates — `{time, price}` — never in
 * screen pixels: zoom/pan/resize/timeframe changes must leave drawings
 * attached to their chart-domain position (PRD ACC-4). `time` is the
 * bucket-open epoch milliseconds (internal UTC rule, same as Candle.t);
 * `price` is a market price (finite, > 0).
 *
 * Styles store TOKEN NAMES + numeric values only (AGENTS.md: canvas code
 * never hardcodes hex). Colors are resolved at render time through the
 * active ChartTheme, so drawings follow light/dark themes for free.
 *
 * The union is discriminated by `kind` with exact-length anchor tuples —
 * a horizontal line cannot accidentally gain a second anchor.
 */

/** Where a drawing attaches: chart-domain coordinates (market space). */
export interface DrawingAnchor {
  /** Bucket-open epoch milliseconds (UTC). */
  time: number;
  /** Market price (finite, > 0). */
  price: number;
}

/**
 * Semantic color tokens a drawing style may reference. Resolved through
 * ChartTheme at render time — theme changes recolor drawings automatically.
 * `cat0..cat6` map to the categorical indicator palette (distinct hues for
 * distinguishable objects without inventing new colors).
 */
export type DrawingColorToken =
  | "accent"
  | "profit"
  | "loss"
  | "warning"
  | "textPrimary"
  | "textMuted"
  | "cat0"
  | "cat1"
  | "cat2"
  | "cat3"
  | "cat4"
  | "cat5"
  | "cat6";

export const DRAWING_COLOR_TOKENS: readonly DrawingColorToken[] = [
  "accent",
  "profit",
  "loss",
  "warning",
  "textPrimary",
  "textMuted",
  "cat0",
  "cat1",
  "cat2",
  "cat3",
  "cat4",
  "cat5",
  "cat6",
];

/** Resolve a style token to the concrete canvas color for the active theme. */
export function resolveDrawingColor(
  token: DrawingColorToken,
  theme: ChartTheme,
): string {
  switch (token) {
    case "accent":
      return theme.accent;
    case "profit":
      return theme.profit;
    case "loss":
      return theme.loss;
    case "warning":
      return theme.warning;
    case "textPrimary":
      return theme.textPrimary;
    case "textMuted":
      return theme.textMuted;
    case "cat0":
    case "cat1":
    case "cat2":
    case "cat3":
    case "cat4":
    case "cat5":
    case "cat6":
      return theme.indicatorPalette[Number(token.slice(3))] ?? theme.accent;
  }
}

export type DrawingLineWidth = 1 | 2 | 3;
export type DrawingDash = "solid" | "dashed" | "dotted";

/** Line style of a drawing (stroke-side; fill lives on shape kinds). */
export interface DrawingLineStyle {
  color: DrawingColorToken;
  width: DrawingLineWidth;
  dash: DrawingDash;
}

/** Shape style (rectangle, fibonacci bands). */
export interface DrawingShapeStyle extends DrawingLineStyle {
  /** Fill token + opacity (0..1) — undefined token = no fill. */
  fill: DrawingColorToken;
  fillOpacity: number;
}

/** Text annotation typography + color (font follows the chart mono stack). */
export interface DrawingTextStyle extends DrawingLineStyle {
  fontSize: 11 | 12 | 14;
}

interface DrawingObjectBase {
  /** Stable identifier (uuid v4) — survives persistence and reloads. */
  id: string;
  style: DrawingLineStyle;
  /** Locked objects cannot be moved, edited or deleted from the chart. */
  locked: boolean;
  /** Hidden objects are neither rendered nor hit-testable nor selectable. */
  hidden: boolean;
  /** Optional user label shown in the objects panel. */
  label?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TrendLineDrawing extends DrawingObjectBase {
  kind: "trendLine";
  anchors: [DrawingAnchor, DrawingAnchor];
}

/** One price anchor — spans the whole plot area horizontally. */
export interface HorizontalLineDrawing extends DrawingObjectBase {
  kind: "horizontalLine";
  anchors: [DrawingAnchor];
}

/** One time anchor — spans the whole plot area vertically. */
export interface VerticalLineDrawing extends DrawingObjectBase {
  kind: "verticalLine";
  anchors: [DrawingAnchor];
}

/** Two anchors; the line extends infinitely from A through B. */
export interface RayDrawing extends DrawingObjectBase {
  kind: "ray";
  anchors: [DrawingAnchor, DrawingAnchor];
}

/** Two opposing corners. */
export interface RectangleDrawing extends DrawingObjectBase {
  kind: "rectangle";
  anchors: [DrawingAnchor, DrawingAnchor];
  style: DrawingShapeStyle;
}

/** One anchor + user text (plain text only — no rich editing in this phase). */
export interface TextDrawing extends DrawingObjectBase {
  kind: "text";
  anchors: [DrawingAnchor];
  text: string;
  style: DrawingTextStyle;
}

/**
 * Fixed retracement levels (PRD §8.1 P0): 0 / 0.236 / 0.382 / 0.5 / 0.618 /
 * 0.786 / 1. Level EDITING is a later milestone — documented, not pretended.
 * Level price = anchorB.price + (anchorA.price - anchorB.price) * level
 * → level 0 sits on anchor B (second pick), level 1 on anchor A (first).
 */
export const FIBONACCI_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export interface FibonacciDrawing extends DrawingObjectBase {
  kind: "fibonacci";
  anchors: [DrawingAnchor, DrawingAnchor];
  style: DrawingShapeStyle;
}

export type DrawingObject =
  | TrendLineDrawing
  | HorizontalLineDrawing
  | VerticalLineDrawing
  | RayDrawing
  | RectangleDrawing
  | TextDrawing
  | FibonacciDrawing;

export type DrawingKind = DrawingObject["kind"];

export const DRAWING_KINDS: readonly DrawingKind[] = [
  "trendLine",
  "horizontalLine",
  "verticalLine",
  "ray",
  "rectangle",
  "text",
  "fibonacci",
];

/** Anchor count required by each kind (drives the creation state machine). */
export function requiredAnchors(kind: DrawingKind): 1 | 2 {
  return kind === "trendLine" ||
    kind === "ray" ||
    kind === "rectangle" ||
    kind === "fibonacci"
    ? 2
    : 1;
}

/**
 * Rail tools. `cursor` = selection/navigation, `crosshair` = native chart
 * inspection with no selection. Drawing tools follow. The measure tool and
 * the PRD's parallel channel / arrow stay deferred (not rendered at all —
 * no dead buttons).
 */
export type OryonTool = "cursor" | "crosshair" | DrawingKind;

export const DRAWING_TOOLS: readonly OryonTool[] = [
  "cursor",
  "crosshair",
  "trendLine",
  "horizontalLine",
  "verticalLine",
  "ray",
  "rectangle",
  "fibonacci",
  "text",
];

export function isDrawingKind(tool: OryonTool): tool is DrawingKind {
  return tool !== "cursor" && tool !== "crosshair";
}

/** Human-facing default label (objects panel) per kind. */
export function describeKind(kind: DrawingKind): string {
  return kind;
}

// ── Style defaults (token-driven; applied to newly created objects) ─────────

export const DEFAULT_LINE_STYLE: DrawingLineStyle = {
  color: "accent",
  width: 2,
  dash: "solid",
};

export const DEFAULT_SHAPE_STYLE: DrawingShapeStyle = {
  color: "accent",
  width: 1,
  dash: "solid",
  fill: "accent",
  fillOpacity: 0.12,
};

export const DEFAULT_TEXT_STYLE: DrawingTextStyle = {
  color: "textPrimary",
  width: 1,
  dash: "solid",
  fontSize: 12,
};

export const DEFAULT_FIBONACCI_STYLE: DrawingShapeStyle = {
  color: "accent",
  width: 1,
  dash: "solid",
  fill: "accent",
  fillOpacity: 0.08,
};

/** True when the object supports a fill (shape kinds). */
export function hasFill(
  object: DrawingObject,
): object is RectangleDrawing | FibonacciDrawing {
  return object.kind === "rectangle" || object.kind === "fibonacci";
}

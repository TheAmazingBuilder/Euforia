import type { DrawingKind, DrawingObject, DrawingPoint } from "@cosmoz/shared";

/**
 * Drawing-tool metadata + geometry helpers for the Session Live chart
 * (MASTER PROMPT §14, Phase 4). Drawings anchor to (bucket-open time, price)
 * so they move with the data — never with pixels. Placement is click-based:
 * one click for single-point tools, two clicks for two-point tools.
 */

export interface DrawingToolMeta {
  kind: DrawingKind;
  label: string;
  /** Short hint shown while the tool is armed. */
  hint: string;
  /** How many chart clicks place the drawing. */
  points: 1 | 2;
}

export const DRAWING_TOOLS: readonly DrawingToolMeta[] = [
  { kind: "HLINE", label: "Horizontal line", hint: "Click a price to place the horizontal line", points: 1 },
  { kind: "TREND", label: "Trend line", hint: "Click two points to draw the trend line", points: 2 },
  { kind: "RAY", label: "Ray", hint: "Click two points — the ray extends forward", points: 2 },
  { kind: "RECT", label: "Rectangle", hint: "Click two corners to draw the rectangle", points: 2 },
  { kind: "TEXT", label: "Text note", hint: "Click a point, then type the note", points: 1 },
  { kind: "MEASURE", label: "Measure", hint: "Click two points to measure price range", points: 2 },
  { kind: "FIB", label: "Fib retracement", hint: "Click the swing start, then the swing end", points: 2 },
] as const;

export function drawingTool(kind: DrawingKind): DrawingToolMeta {
  const meta = DRAWING_TOOLS.find((tool) => tool.kind === kind);
  if (!meta) throw new Error(`Unknown drawing kind: ${kind}`);
  return meta;
}

/** Standard Fibonacci retracement ratios (§14). */
export const FIB_RATIOS: readonly number[] = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** Fibonacci level prices between point A (ratio 0) and point B (ratio 1). */
export function fibLevels(a: number, b: number): number[] {
  return FIB_RATIOS.map((ratio) => a + (b - a) * ratio);
}

export function fibLabel(ratio: number): string {
  return `${(ratio * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

/** Collision-safe id for client-generated chart objects (pure at render). */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `obj-${Math.random().toString(36).slice(2, 10)}`;
}

/** Create a drawing object from placed points (id/createdAt filled here). */
export function makeDrawing(kind: DrawingKind, points: DrawingPoint[], text: string | null = null): DrawingObject {
  return {
    id: newId(),
    kind,
    points,
    text,
  };
}

/** Projection of a drawing anchor onto the displayed candle window. */
export interface DrawingAnchor {
  /** Nearest displayed candle index (clamped) — null when off-window. */
  index: number | null;
  price: number;
}

/**
 * Map a drawing point (time, price) to a candle index in the displayed
 * window via nearest-bucket lookup. Returns null when the anchor is outside
 * the displayed window (e.g. replay hides the future) — the chart skips
 * those elements instead of guessing a position.
 */
export function anchorIndex(times: number[], t: number): number | null {
  if (times.length === 0) return null;
  // Exact/near match on bucket-open time; the window is ~300 buckets so a
  // linear scan is fine and avoids a binary-search edge cases budget.
  let best = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i += 1) {
    const delta = Math.abs(times[i] - t);
    if (delta < bestDelta) {
      best = i;
      bestDelta = delta;
    }
  }
  // 1.5 buckets of tolerance — anchors never drift across panes.
  const bucket = times.length > 1 ? Math.abs(times[1] - times[0]) : Number.POSITIVE_INFINITY;
  return bestDelta <= bucket * 1.5 ? best : null;
}

/** Y extent of a two-point drawing (normalized so top <= bottom). */
export function drawingExtent(points: DrawingPoint[]): { t1: number; y1: number; t2: number; y2: number } {
  const [a, b] = points;
  if (!b) return { t1: a.t, y1: a.y, t2: a.t, y2: a.y };
  return { t1: a.t, y1: a.y, t2: b.t, y2: b.y };
}

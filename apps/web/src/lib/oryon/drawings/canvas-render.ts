import type { OryonDrawing, OryonDrawingStyle, OryonLineDash } from "@cosmoz/shared";

import {
  HANDLE_RADIUS,
  type ScreenPoint,
  type ScreenRect,
  normalizeRect,
  rayExitParameter,
} from "./geometry";

/**
 * Oryon drawing canvas renderer — pure paint functions.
 *
 * Inputs are PROJECTED screen geometry (CSS px, pane-relative) + the
 * resolved theme palette; outputs are canvas calls. No chart-library type
 * appears here: the primitive projects, this layer paints. The projection
 * layer precomputes EVERYTHING screen-space (including fib level positions
 * and measure readouts) — this file never converts coordinates.
 *
 * Color discipline (AGENTS.md golden rule): persisted styles store THEME
 * TOKEN KEYS, never hex. The palette is resolved at paint time from
 * getChartTheme() — a theme switch repaints drawings with new tokens.
 */

/** Style color = a theme token key resolved through this palette. */
export type DrawingPalette = Readonly<Record<string, string>>;

export interface DrawingVisualState {
  selected: boolean;
  locked: boolean;
  hover: boolean;
}

export interface FibLevelView {
  level: number;
  /** Screen Y of the level line (CSS px). */
  y: number;
  /** Domain price of the level (for the label). */
  price: number;
}

export type ProjectedDrawing =
  | { kind: "trend" | "ray"; drawing: OryonDrawing & { type: "trend" | "ray" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState }
  | { kind: "hline"; drawing: OryonDrawing & { type: "hline" }; y: number; state: DrawingVisualState }
  | { kind: "vline"; drawing: OryonDrawing & { type: "vline" }; x: number; state: DrawingVisualState }
  | { kind: "rect"; drawing: OryonDrawing & { type: "rect" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState }
  | { kind: "measure"; drawing: OryonDrawing & { type: "measure" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState; label: string | null }
  | { kind: "fib"; drawing: OryonDrawing & { type: "fib" }; a: ScreenPoint; b: ScreenPoint; levels: readonly FibLevelView[]; state: DrawingVisualState; digits: number }
  | { kind: "text"; drawing: OryonDrawing & { type: "text" }; at: ScreenPoint; state: DrawingVisualState };

/** Canvas draw context handed to every paint function (already DPR-scaled). */
export interface PaintContext {
  ctx: CanvasRenderingContext2D;
  /** Plot area bounds in CSS px (pane-relative) — clips infinite lines. */
  plot: ScreenRect;
  palette: DrawingPalette;
  monoFont: string;
  textPrimary: string;
  accent: string;
}

const DASH_PATTERNS: Record<OryonLineDash, readonly number[]> = {
  solid: [],
  dashed: [7, 5],
  dotted: [2, 4],
};

function resolveColor(palette: DrawingPalette, tokenKey: string, fallback: string): string {
  return palette[tokenKey] ?? fallback;
}

function applyStroke(
  paint: PaintContext,
  style: OryonDrawingStyle,
  extraWidth = 0,
): void {
  paint.ctx.strokeStyle = resolveColor(paint.palette, style.color, paint.accent);
  paint.ctx.lineWidth = style.width + extraWidth;
  paint.ctx.lineCap = "round";
  paint.ctx.lineJoin = "round";
  const pattern = DASH_PATTERNS[style.dash] ?? DASH_PATTERNS.solid!;
  paint.ctx.setLineDash(pattern as number[]);
}

/** Converts "#rrggbb" / "#rgb" to rgba with alpha; other formats pass through. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (hex.startsWith("#") && hex.length === 4) {
    const r = parseInt(hex[1]! + hex[1]!, 16);
    const g = parseInt(hex[2]! + hex[2]!, 16);
    const b = parseInt(hex[3]! + hex[3]!, 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (hex.startsWith("#") && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

function fillStyleFor(paint: PaintContext, style: OryonDrawingStyle): string | null {
  if (style.fill === null || style.fill === undefined || style.fillOpacity <= 0) {
    return null;
  }
  return withAlpha(resolveColor(paint.palette, style.fill, paint.accent), style.fillOpacity);
}

function strokeSegment(paint: PaintContext, a: ScreenPoint, b: ScreenPoint): void {
  paint.ctx.beginPath();
  paint.ctx.moveTo(a.x, a.y);
  paint.ctx.lineTo(b.x, b.y);
  paint.ctx.stroke();
}

// ── per-type painters ───────────────────────────────────────────────────────

function paintTrendOrRay(
  paint: PaintContext,
  view: { a: ScreenPoint; b: ScreenPoint; type: "trend" | "ray"; style: OryonDrawingStyle },
): void {
  const { a, b } = view;
  if (view.type === "trend") {
    applyStroke(paint, view.style);
    strokeSegment(paint, a, b);
    return;
  }
  // Ray: from a THROUGH b, extended to the plot boundary.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = rayExitParameter(dx, dy, a.x, a.y, paint.plot);
  applyStroke(paint, view.style);
  strokeSegment(paint, a, { x: a.x + dx * t, y: a.y + dy * t });
}

function paintHLine(paint: PaintContext, y: number, style: OryonDrawingStyle): void {
  applyStroke(paint, style);
  strokeSegment(paint, { x: paint.plot.left, y }, { x: paint.plot.right, y });
}

function paintVLine(paint: PaintContext, x: number, style: OryonDrawingStyle): void {
  applyStroke(paint, style);
  strokeSegment(paint, { x, y: paint.plot.top }, { x, y: paint.plot.bottom });
}

function paintRectBody(
  paint: PaintContext,
  a: ScreenPoint,
  b: ScreenPoint,
  style: OryonDrawingStyle,
): void {
  const r = normalizeRect(a, b);
  const fill = fillStyleFor(paint, style);
  if (fill !== null) {
    paint.ctx.fillStyle = fill;
    paint.ctx.fillRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
  }
  applyStroke(paint, style);
  paint.ctx.strokeRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
}

function paintFib(paint: PaintContext, view: {
  a: ScreenPoint;
  b: ScreenPoint;
  levels: readonly FibLevelView[];
  style: OryonDrawingStyle;
  digits: number;
}): void {
  const left = Math.min(view.a.x, view.b.x);
  const right = Math.max(view.a.x, view.b.x);
  const fill = fillStyleFor(paint, view.style);
  paint.ctx.font = `10px ${paint.monoFont}`;
  paint.ctx.textBaseline = "middle";
  paint.ctx.textAlign = "left";

  for (let i = 0; i < view.levels.length; i += 1) {
    const level = view.levels[i]!;
    // Band fill down to the next level (lower on screen = larger price).
    if (fill !== null && i < view.levels.length - 1) {
      const nextLevel = view.levels[i + 1]!;
      paint.ctx.fillStyle = fill;
      paint.ctx.fillRect(
        left,
        Math.min(level.y, nextLevel.y),
        Math.max(right - left, 1),
        Math.abs(nextLevel.y - level.y),
      );
    }
    applyStroke(paint, view.style);
    strokeSegment(paint, { x: left, y: level.y }, { x: right, y: level.y });
    const label = `${Math.round(level.level * 1000) / 10}%  ${level.price.toFixed(view.digits)}`;
    paint.ctx.fillStyle = paint.textPrimary;
    paint.ctx.fillText(label, Math.min(right + 6, paint.plot.right - 110), level.y);
  }
}

function paintMeasure(paint: PaintContext, view: {
  a: ScreenPoint;
  b: ScreenPoint;
  style: OryonDrawingStyle;
  label: string | null;
}): void {
  paintRectBody(paint, view.a, view.b, view.style);
  if (view.label === null) return;
  paint.ctx.font = `11px ${paint.monoFont}`;
  const textWidth = paint.ctx.measureText(view.label).width;
  const boxX = Math.min(Math.max(view.a.x, view.b.x) + 8, paint.plot.right - textWidth - 14);
  const boxY = Math.max(Math.min(view.a.y, view.b.y) + 8, paint.plot.top + 4);
  paint.ctx.fillStyle = "rgba(0,0,0,0.62)";
  paint.ctx.beginPath();
  paint.ctx.roundRect(boxX, boxY, textWidth + 12, 18, 4);
  paint.ctx.fill();
  paint.ctx.fillStyle = paint.textPrimary;
  paint.ctx.textBaseline = "middle";
  paint.ctx.textAlign = "left";
  paint.ctx.fillText(view.label, boxX + 6, boxY + 9);
}

function paintText(paint: PaintContext, view: {
  at: ScreenPoint;
  style: OryonDrawingStyle;
  text: string;
}): void {
  const color = resolveColor(paint.palette, view.style.color, paint.textPrimary);
  paint.ctx.font = `${view.style.fontSize}px ${paint.monoFont}`;
  paint.ctx.textAlign = "center";
  paint.ctx.textBaseline = "middle";
  if (view.text === "") {
    // Empty text — a subtle marker dot keeps the object findable/selectable.
    paint.ctx.fillStyle = color;
    paint.ctx.beginPath();
    paint.ctx.arc(view.at.x, view.at.y, 3, 0, Math.PI * 2);
    paint.ctx.fill();
    return;
  }
  const lines = view.text.split("\n").slice(0, 6);
  const lineHeight = view.style.fontSize * 1.3;
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, paint.ctx.measureText(line).width);
  const boxW = maxW + 12;
  const boxH = lines.length * lineHeight + 8;
  paint.ctx.fillStyle = "rgba(0,0,0,0.45)";
  paint.ctx.beginPath();
  paint.ctx.roundRect(view.at.x - boxW / 2, view.at.y - boxH / 2, boxW, boxH, 4);
  paint.ctx.fill();
  paint.ctx.fillStyle = color;
  const startY = view.at.y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    paint.ctx.fillText(line, view.at.x, startY + i * lineHeight);
  });
}

/** Anchor handles — drawn ONLY for the selected object (spec §7 Tool 1). */
export function paintHandles(paint: PaintContext, points: readonly ScreenPoint[]): void {
  paint.ctx.setLineDash([]);
  for (const p of points) {
    paint.ctx.beginPath();
    paint.ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
    paint.ctx.fillStyle = paint.accent;
    paint.ctx.fill();
    paint.ctx.lineWidth = 1.5;
    paint.ctx.strokeStyle = "rgba(0,0,0,0.6)";
    paint.ctx.stroke();
  }
}

/** Paints ONE projected drawing (dispatch by kind) + selection affordances. */
export function paintProjectedDrawing(paint: PaintContext, view: ProjectedDrawing): void {
  const { state } = view;
  const style = view.drawing.style;
  switch (view.kind) {
    case "trend":
    case "ray":
      paintTrendOrRay(paint, { a: view.a, b: view.b, type: view.kind, style });
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "hline":
      paintHLine(paint, view.y, style);
      if (state.selected) {
        paintHandles(paint, [{ x: (paint.plot.left + paint.plot.right) / 2, y: view.y }]);
      }
      break;
    case "vline":
      paintVLine(paint, view.x, style);
      if (state.selected) {
        paintHandles(paint, [{ x: view.x, y: (paint.plot.top + paint.plot.bottom) / 2 }]);
      }
      break;
    case "rect":
      paintRectBody(paint, view.a, view.b, style);
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "measure":
      paintMeasure(paint, { a: view.a, b: view.b, style, label: view.label });
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "fib":
      paintFib(paint, {
        a: view.a,
        b: view.b,
        levels: view.levels,
        style,
        digits: view.digits,
      });
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "text":
      paintText(paint, { at: view.at, style, text: view.drawing.text });
      if (state.selected) {
        paint.ctx.setLineDash([]);
        paint.ctx.strokeStyle = paint.accent;
        paint.ctx.lineWidth = 1;
        paint.ctx.beginPath();
        paint.ctx.arc(view.at.x, view.at.y, HANDLE_RADIUS + 3, 0, Math.PI * 2);
        paint.ctx.stroke();
      }
      break;
  }
}

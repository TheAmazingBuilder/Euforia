import type { OryonDrawing, OryonDrawingStyle, OryonLineDash } from "@cosmoz/shared";

import {
  HANDLE_RADIUS,
  ARROW_MARK_SIZE,
  ARROW_TAIL_OFFSET,
  type ScreenPoint,
  type ScreenRect,
  clipLineToRect,
  ellipseFromRect,
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
  | { kind: "trend" | "ray" | "extended"; drawing: OryonDrawing & { type: "trend" | "ray" | "extended" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState }
  | { kind: "hline"; drawing: OryonDrawing & { type: "hline" }; y: number; state: DrawingVisualState }
  | { kind: "vline"; drawing: OryonDrawing & { type: "vline" }; x: number; state: DrawingVisualState }
  | { kind: "crossline"; drawing: OryonDrawing & { type: "crossline" }; at: ScreenPoint; state: DrawingVisualState }
  | { kind: "rect"; drawing: OryonDrawing & { type: "rect" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState }
  | { kind: "ellipse"; drawing: OryonDrawing & { type: "ellipse" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState }
  | { kind: "measure"; drawing: OryonDrawing & { type: "measure" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState; label: string | null }
  | { kind: "pricerange"; drawing: OryonDrawing & { type: "pricerange" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState; label: string | null }
  | { kind: "daterange"; drawing: OryonDrawing & { type: "daterange" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState; label: string | null }
  | { kind: "position"; drawing: OryonDrawing & { type: "longpos" | "shortpos" }; a: ScreenPoint; b: ScreenPoint; state: DrawingVisualState; targetY: number | null; label: string | null }
  | { kind: "fib"; drawing: OryonDrawing & { type: "fib" }; a: ScreenPoint; b: ScreenPoint; levels: readonly FibLevelView[]; state: DrawingVisualState; digits: number }
  | { kind: "fibext"; drawing: OryonDrawing & { type: "fibext" }; a: ScreenPoint; b: ScreenPoint; c: ScreenPoint; levels: readonly FibLevelView[]; state: DrawingVisualState; digits: number }
  | { kind: "text"; drawing: OryonDrawing & { type: "text" }; at: ScreenPoint; state: DrawingVisualState }
  | { kind: "brush"; drawing: OryonDrawing & { type: "brush" }; points: readonly ScreenPoint[]; state: DrawingVisualState }
  | { kind: "arrowmark"; drawing: OryonDrawing & { type: "arrowmark" }; at: ScreenPoint; state: DrawingVisualState };

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
  view: { a: ScreenPoint; b: ScreenPoint; type: "trend" | "ray" | "extended"; style: OryonDrawingStyle },
): void {
  const { a, b } = view;
  if (view.type === "trend") {
    applyStroke(paint, view.style);
    strokeSegment(paint, a, b);
    return;
  }
  if (view.type === "extended") {
    // Infinite line BOTH directions — clipped to the plot (the hit test
    // uses the same chord, so what you can see is what you can hit).
    const chord = clipLineToRect(a.x, a.y, b.x, b.y, paint.plot);
    if (chord === null) return;
    applyStroke(paint, view.style);
    strokeSegment(paint, chord[0], chord[1]);
    return;
  }
  // Ray: from a THROUGH b, extended to the plot boundary.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = rayExitParameter(dx, dy, a.x, a.y, paint.plot);
  applyStroke(paint, view.style);
  strokeSegment(paint, a, { x: a.x + dx * t, y: a.y + dy * t });
}

function paintCrossline(paint: PaintContext, at: ScreenPoint, style: OryonDrawingStyle): void {
  applyStroke(paint, style);
  strokeSegment(paint, { x: paint.plot.left, y: at.y }, { x: paint.plot.right, y: at.y });
  strokeSegment(paint, { x: at.x, y: paint.plot.top }, { x: at.x, y: paint.plot.bottom });
  // Intersection dot — the one-click anchor stays findable/selectable.
  paint.ctx.setLineDash([]);
  paint.ctx.fillStyle = resolveColor(paint.palette, style.color, paint.accent);
  paint.ctx.beginPath();
  paint.ctx.arc(at.x, at.y, 3, 0, Math.PI * 2);
  paint.ctx.fill();
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

function paintEllipse(paint: PaintContext, a: ScreenPoint, b: ScreenPoint, style: OryonDrawingStyle): void {
  const { cx, cy, rx, ry } = ellipseFromRect(a, b);
  if (rx <= 0 || ry <= 0) return;
  const fill = fillStyleFor(paint, style);
  paint.ctx.beginPath();
  paint.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (fill !== null) {
    paint.ctx.fillStyle = fill;
    paint.ctx.fill();
  }
  applyStroke(paint, style);
  paint.ctx.stroke();
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

/**
 * Measure readout — Phase 5: the label may carry MULTIPLE lines (newline
 * split, composed by the pure measure module). The box grows with the row
 * count and stays clamped inside the plot area; nothing here computes
 * financial values.
 */
function paintMeasure(paint: PaintContext, view: {
  a: ScreenPoint;
  b: ScreenPoint;
  style: OryonDrawingStyle;
  label: string | null;
}): void {
  paintRectBody(paint, view.a, view.b, view.style);
  if (view.label === null) return;
  paintLabelBox(paint, view.label.split("\n").slice(0, 4), Math.max(view.a.x, view.b.x) + 8, Math.min(view.a.y, view.b.y) + 8);
}

/**
 * Shared readout label box (measure / price range / date range / position
 * tools) — dark translucent panel, clamped INSIDE the plot, mono rows.
 * Pure presentation: the lines arrive composed by the pure modules.
 */
function paintLabelBox(paint: PaintContext, lines: readonly string[], x: number, y: number): void {
  paint.ctx.font = `11px ${paint.monoFont}`;
  let textWidth = 0;
  for (const line of lines) {
    textWidth = Math.max(textWidth, paint.ctx.measureText(line).width);
  }
  const lineHeight = 15;
  const boxW = textWidth + 12;
  const boxH = lines.length * lineHeight + 8;
  const boxX = Math.min(Math.max(x, paint.plot.left + 2), paint.plot.right - boxW - 2);
  const boxY = Math.min(Math.max(y, paint.plot.top + 4), paint.plot.bottom - boxH - 2);
  paint.ctx.fillStyle = "rgba(0,0,0,0.62)";
  paint.ctx.beginPath();
  paint.ctx.roundRect(boxX, boxY, boxW, boxH, 4);
  paint.ctx.fill();
  paint.ctx.fillStyle = paint.textPrimary;
  paint.ctx.textBaseline = "middle";
  paint.ctx.textAlign = "left";
  lines.forEach((line, i) => {
    paint.ctx.fillText(line, boxX + 6, boxY + 8 + i * lineHeight);
  });
}

/** Small filled arrowhead pointing along (from→to) — ruler end caps. */
function paintArrowCap(paint: PaintContext, tip: ScreenPoint, from: ScreenPoint, color: string): void {
  const angle = Math.atan2(from.y - tip.y, from.x - tip.x);
  const wing = Math.PI / 6;
  const len = 8;
  paint.ctx.setLineDash([]);
  paint.ctx.fillStyle = color;
  paint.ctx.beginPath();
  paint.ctx.moveTo(tip.x, tip.y);
  paint.ctx.lineTo(tip.x + len * Math.cos(angle - wing), tip.y + len * Math.sin(angle - wing));
  paint.ctx.lineTo(tip.x + len * Math.cos(angle + wing), tip.y + len * Math.sin(angle + wing));
  paint.ctx.closePath();
  paint.ctx.fill();
}

/** Price range ruler — vertical segment AT a.x with arrow caps + readout. */
function paintPriceRange(paint: PaintContext, view: {
  a: ScreenPoint;
  b: ScreenPoint;
  style: OryonDrawingStyle;
  label: string | null;
}): void {
  const color = resolveColor(paint.palette, view.style.color, paint.accent);
  applyStroke(paint, view.style);
  strokeSegment(paint, { x: view.a.x, y: view.a.y }, { x: view.a.x, y: view.b.y });
  paintArrowCap(paint, { x: view.a.x, y: view.a.y }, { x: view.a.x, y: view.b.y }, color);
  paintArrowCap(paint, { x: view.a.x, y: view.b.y }, { x: view.a.x, y: view.a.y }, color);
  if (view.label !== null) {
    paintLabelBox(
      paint,
      view.label.split("\n"),
      view.a.x + 8,
      (view.a.y + view.b.y) / 2 - 10,
    );
  }
}

/** Date range ruler — horizontal segment AT a.y with arrow caps + readout. */
function paintDateRange(paint: PaintContext, view: {
  a: ScreenPoint;
  b: ScreenPoint;
  style: OryonDrawingStyle;
  label: string | null;
}): void {
  const color = resolveColor(paint.palette, view.style.color, paint.accent);
  applyStroke(paint, view.style);
  strokeSegment(paint, { x: view.a.x, y: view.a.y }, { x: view.b.x, y: view.a.y });
  paintArrowCap(paint, { x: view.a.x, y: view.a.y }, { x: view.b.x, y: view.a.y }, color);
  paintArrowCap(paint, { x: view.b.x, y: view.a.y }, { x: view.a.x, y: view.a.y }, color);
  if (view.label !== null) {
    paintLabelBox(
      paint,
      view.label.split("\n"),
      (view.a.x + view.b.x) / 2,
      view.a.y + 10,
    );
  }
}

/**
 * Position tool (long/short) — risk box (entry↔stop, loss token) + reward
 * box (entry↔derived target, profit token) across the a.t→b.t span. The
 * target is DERIVED (never stored); the label lists Entry/Stop/Target.
 */
function paintPosition(paint: PaintContext, view: {
  a: ScreenPoint;
  b: ScreenPoint;
  targetY: number | null;
  style: OryonDrawingStyle;
  label: string | null;
}): void {
  const left = Math.min(view.a.x, view.b.x);
  const right = Math.max(view.a.x, view.b.x);
  const riskColor = withAlpha(resolveColor(paint.palette, "loss", "#ef4444"), 0.14);
  const rewardColor = withAlpha(resolveColor(paint.palette, "profit", "#22c55e"), 0.14);
  if (view.targetY !== null) {
    // Reward zone spans entry↔target, risk zone entry↔stop — whichever
    // side each price lands is derived from the actual Y coordinates.
    const entryY = view.a.y;
    paint.ctx.fillStyle = rewardColor;
    paint.ctx.fillRect(left, Math.min(entryY, view.targetY), Math.max(right - left, 1), Math.abs(view.targetY - entryY));
    paint.ctx.fillStyle = riskColor;
    paint.ctx.fillRect(left, Math.min(entryY, view.b.y), Math.max(right - left, 1), Math.abs(view.b.y - entryY));
    // Boundary lines: entry (style color), stop + target (zone-colored).
    applyStroke(paint, view.style);
    strokeSegment(paint, { x: left, y: entryY }, { x: right, y: entryY });
    paint.ctx.setLineDash([4, 3]);
    paint.ctx.lineWidth = 1;
    paint.ctx.strokeStyle = resolveColor(paint.palette, "loss", "#ef4444");
    strokeSegment(paint, { x: left, y: view.b.y }, { x: right, y: view.b.y });
    paint.ctx.strokeStyle = resolveColor(paint.palette, "profit", "#22c55e");
    strokeSegment(paint, { x: left, y: view.targetY }, { x: right, y: view.targetY });
    paint.ctx.setLineDash([]);
  } else {
    paintRectBody(paint, view.a, view.b, view.style);
  }
  if (view.label !== null) {
    paintLabelBox(paint, view.label.split("\n"), right + 8, Math.min(view.a.y, view.b.y, view.targetY ?? view.b.y));
  }
}

/**
 * Trend-based Fibonacci extension — the A→B and B→C swing legs + the
 * extension levels projected from C, drawn from the LAST anchor rightward.
 */
function paintFibExt(paint: PaintContext, view: {
  a: ScreenPoint;
  b: ScreenPoint;
  c: ScreenPoint;
  levels: readonly FibLevelView[];
  style: OryonDrawingStyle;
  digits: number;
}): void {
  const xStart = Math.max(view.a.x, view.b.x, view.c.x);
  const right = paint.plot.right;
  paint.ctx.font = `10px ${paint.monoFont}`;
  paint.ctx.textBaseline = "middle";
  paint.ctx.textAlign = "left";

  // Swing legs (A→B, B→C) — the measured move.
  applyStroke(paint, view.style);
  strokeSegment(paint, view.a, view.b);
  strokeSegment(paint, view.b, view.c);

  const fill = fillStyleFor(paint, view.style);
  for (let i = 0; i < view.levels.length; i += 1) {
    const level = view.levels[i]!;
    if (fill !== null && i < view.levels.length - 1) {
      const nextLevel = view.levels[i + 1]!;
      paint.ctx.fillStyle = fill;
      paint.ctx.fillRect(
        xStart,
        Math.min(level.y, nextLevel.y),
        Math.max(right - xStart, 1),
        Math.abs(nextLevel.y - level.y),
      );
    }
    applyStroke(paint, view.style);
    strokeSegment(paint, { x: xStart, y: level.y }, { x: right, y: level.y });
    const label = `${Math.round(level.level * 1000) / 10}%  ${level.price.toFixed(view.digits)}`;
    paint.ctx.fillStyle = paint.textPrimary;
    paint.ctx.fillText(label, Math.min(xStart + 6, right - 110), level.y);
  }
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

/**
 * Brush — the captured polyline stroked with the object style (color,
 * width and dash all apply; no fill — a stroke is a stroke).
 */
function paintBrush(paint: PaintContext, points: readonly ScreenPoint[], style: OryonDrawingStyle): void {
  if (points.length < 2) return;
  applyStroke(paint, style);
  paint.ctx.beginPath();
  paint.ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i += 1) {
    paint.ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  paint.ctx.stroke();
}

/**
 * Arrow mark — filled glyph whose TIP sits at the anchor, tail extending
 * toward the opposite of `dir` (screen y down). Shaft = style width,
 * head = fixed proportions of ARROW_MARK_SIZE. Color = style.color.
 */
function paintArrowMark(paint: PaintContext, at: ScreenPoint, dir: "up" | "down" | "left" | "right", style: OryonDrawingStyle): void {
  const color = resolveColor(paint.palette, style.color, paint.accent);
  const [tx, ty] = ARROW_TAIL_OFFSET[dir];
  const tailX = at.x + tx * ARROW_MARK_SIZE;
  const tailY = at.y + ty * ARROW_MARK_SIZE;
  // Perpendicular unit vector for the head half-width.
  const px = -ty;
  const py = tx;
  const head = ARROW_MARK_SIZE * 0.42;
  const headBaseX = at.x + tx * head;
  const headBaseY = at.y + ty * head;
  paint.ctx.setLineDash([]);
  paint.ctx.lineCap = "round";
  // Shaft: tail → head base.
  paint.ctx.strokeStyle = color;
  paint.ctx.lineWidth = Math.max(1.5, style.width * 1.5);
  paint.ctx.beginPath();
  paint.ctx.moveTo(tailX, tailY);
  paint.ctx.lineTo(headBaseX, headBaseY);
  paint.ctx.stroke();
  // Head: filled triangle tip at the anchor.
  paint.ctx.fillStyle = color;
  paint.ctx.beginPath();
  paint.ctx.moveTo(at.x, at.y);
  paint.ctx.lineTo(headBaseX + px * head, headBaseY + py * head);
  paint.ctx.lineTo(headBaseX - px * head, headBaseY - py * head);
  paint.ctx.closePath();
  paint.ctx.fill();
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
    case "extended":
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
    case "crossline":
      paintCrossline(paint, view.at, style);
      if (state.selected) paintHandles(paint, [view.at]);
      break;
    case "rect":
      paintRectBody(paint, view.a, view.b, style);
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "ellipse":
      paintEllipse(paint, view.a, view.b, style);
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "measure":
      paintMeasure(paint, { a: view.a, b: view.b, style, label: view.label });
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "pricerange":
      paintPriceRange(paint, { a: view.a, b: view.b, style, label: view.label });
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "daterange":
      paintDateRange(paint, { a: view.a, b: view.b, style, label: view.label });
      if (state.selected) paintHandles(paint, [view.a, view.b]);
      break;
    case "position": {
      paintPosition(paint, {
        a: view.a,
        b: view.b,
        targetY: view.targetY,
        style,
        label: view.label,
      });
      if (state.selected) {
        // FOUR handles in the interaction's slot order: a/b corners + the
        // TARGET line (rr) + the STOP line (stop price), both mid-line.
        // The target handle drops out when the target cannot project —
        // the same condition under which the controller leaves an unhittable
        // NaN slot (painter and hit-test agree).
        const midX = (view.a.x + view.b.x) / 2;
        const handles = [view.a, view.b];
        if (view.targetY !== null) handles.push({ x: midX, y: view.targetY });
        handles.push({ x: midX, y: view.b.y });
        paintHandles(paint, handles);
      }
      break;
    }
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
    case "fibext":
      paintFibExt(paint, {
        a: view.a,
        b: view.b,
        c: view.c,
        levels: view.levels,
        style,
        digits: view.digits,
      });
      if (state.selected) paintHandles(paint, [view.a, view.b, view.c]);
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
    case "brush":
      paintBrush(paint, view.points, style);
      break;
    case "arrowmark":
      paintArrowMark(paint, view.at, view.drawing.dir, style);
      if (state.selected) {
        paintHandles(paint, [view.at]);
      }
      break;
  }
}

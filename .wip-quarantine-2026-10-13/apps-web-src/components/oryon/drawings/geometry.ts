import {
  FIBONACCI_LEVELS,
  type DrawingObject,
} from "@/components/oryon/drawings/types";

/**
 * Pure screen-space geometry for Oryon drawings — hit-testing, handles and
 * per-kind projection helpers (PRD §8.4: centralized hit-testing, 6 px
 * tolerance, newest-object priority). Inputs are the object's anchors
 * ALREADY projected to screen space (the caller uses projection.ts / the
 * chart engine); nothing here knows about Lightweight Charts.
 */

/** Screen point in plot/canvas coordinates (CSS px). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Plot area rect — {left, top} + size (CSS px, wrapper coordinates). */
export interface PlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Hit-testing tolerance in screen pixels (PRD §8.4). */
export const HIT_TOLERANCE_PX = 6;
/** Selection-handle grab radius in screen pixels. */
export const HANDLE_RADIUS_PX = 7;

/** Minimum distance from point P to segment AB (0 when degenerate). */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Extend the ray A→B beyond B until it leaves the plot rect. Returns the
 * far endpoint to draw to, or null when A→B is degenerate. The extension is
 * clipped to the plot: the ray always stays inside the chart area.
 */
export function rayFarEndpoint(
  a: ScreenPoint,
  b: ScreenPoint,
  plot: PlotRect,
): ScreenPoint | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b.x >= plot.left && b.x <= plot.left + plot.width ? b : null;
  let tMax = Infinity;
  if (dx > 0) tMax = Math.min(tMax, (plot.left + plot.width - b.x) / dx);
  if (dx < 0) tMax = Math.min(tMax, (plot.left - b.x) / dx);
  if (dy > 0) tMax = Math.min(tMax, (plot.top + plot.height - b.y) / dy);
  if (dy < 0) tMax = Math.min(tMax, (plot.top - b.y) / dy);
  if (!Number.isFinite(tMax) || tMax < 0) return null;
  return { x: b.x + dx * tMax, y: b.y + dy * tMax };
}

/** Normalized bounds of the two opposing rectangle corners. */
export function rectBounds(
  a: ScreenPoint,
  b: ScreenPoint,
): { left: number; top: number; width: number; height: number } {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    left,
    top,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** The rectangle's four corners (TL, TR, BR, BL) from its two anchors. */
export function rectCorners(a: ScreenPoint, b: ScreenPoint): [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] {
  const { left, top } = rectBounds(a, b);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/**
 * Fibonacci level price: level 0 sits on anchor B, level 1 on anchor A
 * (types.ts convention) — price(level) = pB + (pA − pB) × level.
 */
export function fibLevelPrice(pA: number, pB: number, level: number): number {
  return pB + (pA - pB) * level;
}

/** Screen x-range the fibonacci spans (min/max of the two anchors). */
export function fibSpanX(a: ScreenPoint, b: ScreenPoint): { from: number; to: number } {
  return { from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) };
}

/** Where a text annotation's bounding box sits (anchor = top-left + pad). */
export function textBBox(
  anchor: ScreenPoint,
  measured: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  const padX = 6;
  const padY = 4;
  return {
    left: anchor.x + padX,
    top: anchor.y - measured.height - padY,
    width: measured.width + padX * 2,
    height: measured.height + padY * 2,
  };
}

export type DrawingHitPart =
  | { part: "body" }
  | { part: "anchor"; anchorIndex: number }
  /** Rectangle resize handle — corner 0..3 (TL, TR, BR, BL). */
  | { part: "corner"; corner: 0 | 1 | 2 | 3 };

export interface DrawingHit {
  id: string;
  target: DrawingHitPart;
}

function near(p: ScreenPoint, q: ScreenPoint, tol: number): boolean {
  return Math.hypot(p.x - q.x, p.y - q.y) <= tol;
}

function withinPlotX(x: number, plot: PlotRect): boolean {
  return x >= plot.left - 1 && x <= plot.left + plot.width + 1;
}

function withinPlotY(y: number, plot: PlotRect): boolean {
  return y >= plot.top - 1 && y <= plot.top + plot.height + 1;
}

/**
 * Hit-test one object at screen point `pt`. `screenAnchors` are the
 * object's projected anchors (same order as the domain anchors). Returns a
 * hit part with ANCHOR/corner hits taking priority over body hits, so
 * handles win when they overlap the geometry.
 */
export function hitTestDrawing(
  object: DrawingObject,
  screenAnchors: readonly ScreenPoint[],
  plot: PlotRect,
  pt: ScreenPoint,
  tolerance: number = HIT_TOLERANCE_PX,
  measuredText?: { width: number; height: number },
): DrawingHit | null {
  const tol = tolerance;
  switch (object.kind) {
    case "trendLine": {
      const [a, b] = screenAnchors;
      if (!a || !b) return null;
      if (near(pt, a, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 0 } };
      if (near(pt, b, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 1 } };
      if (distanceToSegment(pt.x, pt.y, a.x, a.y, b.x, b.y) <= tol) {
        return { id: object.id, target: { part: "body" } };
      }
      return null;
    }
    case "ray": {
      const [a, b] = screenAnchors;
      if (!a || !b) return null;
      if (near(pt, a, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 0 } };
      if (near(pt, b, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 1 } };
      const far = rayFarEndpoint(a, b, plot);
      if (far && distanceToSegment(pt.x, pt.y, a.x, a.y, far.x, far.y) <= tol) {
        return { id: object.id, target: { part: "body" } };
      }
      return null;
    }
    case "horizontalLine": {
      const [a] = screenAnchors;
      if (!a || !withinPlotY(a.y, plot)) return null;
      if (near(pt, a, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 0 } };
      if (Math.abs(pt.y - a.y) <= tol && withinPlotX(pt.x, plot)) {
        return { id: object.id, target: { part: "body" } };
      }
      return null;
    }
    case "verticalLine": {
      const [a] = screenAnchors;
      if (!a || !withinPlotX(a.x, plot)) return null;
      if (near(pt, a, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 0 } };
      if (Math.abs(pt.x - a.x) <= tol && withinPlotY(pt.y, plot)) {
        return { id: object.id, target: { part: "body" } };
      }
      return null;
    }
    case "rectangle": {
      const [a, b] = screenAnchors;
      if (!a || !b) return null;
      const corners = rectCorners(a, b);
      for (let i = 0; i < corners.length; i += 1) {
        if (near(pt, corners[i]!, HANDLE_RADIUS_PX)) {
          return { id: object.id, target: { part: "corner", corner: i as 0 | 1 | 2 | 3 } };
        }
      }
      const bounds = rectBounds(a, b);
      const inside =
        pt.x >= bounds.left - tol &&
        pt.x <= bounds.left + bounds.width + tol &&
        pt.y >= bounds.top - tol &&
        pt.y <= bounds.top + bounds.height + tol;
      if (inside) return { id: object.id, target: { part: "body" } };
      return null;
    }
    case "text": {
      const [a] = screenAnchors;
      if (!a) return null;
      if (near(pt, a, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 0 } };
      if (measuredText) {
        const box = textBBox(a, measuredText);
        if (
          pt.x >= box.left - tol &&
          pt.x <= box.left + box.width + tol &&
          pt.y >= box.top - tol &&
          pt.y <= box.top + box.height + tol
        ) {
          return { id: object.id, target: { part: "body" } };
        }
      }
      return null;
    }
    case "fibonacci": {
      const [a, b] = screenAnchors;
      if (!a || !b) return null;
      if (near(pt, a, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 0 } };
      if (near(pt, b, HANDLE_RADIUS_PX)) return { id: object.id, target: { part: "anchor", anchorIndex: 1 } };
      const span = fibSpanX(a, b);
      for (const level of FIBONACCI_LEVELS) {
        const y = fibLevelPrice(a.y, b.y, level);
        if (
          pt.y >= y - tol &&
          pt.y <= y + tol &&
          pt.x >= span.from - tol &&
          pt.x <= span.to + tol
        ) {
          return { id: object.id, target: { part: "body" } };
        }
      }
      return null;
    }
  }
}

/**
 * Handle points rendered for the SELECTED object (renderer) — also the
 * grabbable set for anchor editing.
 */
export function selectionHandles(
  object: DrawingObject,
  screenAnchors: readonly ScreenPoint[],
): ScreenPoint[] {
  switch (object.kind) {
    case "trendLine":
    case "ray":
      return screenAnchors.slice(0, 2);
    case "rectangle": {
      const [a, b] = screenAnchors;
      return a && b ? rectCorners(a, b) : [];
    }
    case "fibonacci":
      return screenAnchors.slice(0, 2);
    case "horizontalLine":
    case "verticalLine":
    case "text":
      return screenAnchors.slice(0, 1);
  }
}

/**
 * Movement helper — the domain delta for whole-object drags is expressed in
 * chart-domain terms by the controller; this pure function applies a time
 * shift and/or price shift to every anchor of an object (horizontal lines
 * ignore time shifts, vertical lines ignore price shifts, applied by the
 * controller choosing which deltas to pass).
 */
export function shiftAnchors< A extends { time: number; price: number }>(
  anchors: readonly A[],
  dTime: number,
  dPrice: number,
): A[] {
  return anchors.map((anchor) => ({
    ...anchor,
    time: anchor.time + dTime,
    price: anchor.price + dPrice,
  }));
}

/**
 * Oryon drawing geometry — pure screen-space math.
 *
 * ZERO framework imports: every function operates on plain numbers so it is
 * trivially unit-testable (bun) and reusable by BOTH the canvas renderer and
 * the interaction controller. Domain↔screen projection happens in the chart
 * engine boundary (oryon-chart-engine.ts) — this layer never talks to the
 * chart library.
 *
 * Screen space: CSS pixels relative to the chart pane's top-left corner
 * (y grows downward, like the canvas API).
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRect {
  /** Plot area bounds (CSS px) used to clip infinite lines. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Default hit tolerance in CSS px (comfortable for pointer work). */
export const HIT_TOLERANCE = 6;

/** Selection handle radius (CSS px) — hit area slightly larger. */
export const HANDLE_RADIUS = 4.5;
export const HANDLE_HIT_RADIUS = 9;

/** Distance from point P to segment AB (standard projection clamp). */
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
    // Degenerate segment — treat as a point.
    return Math.hypot(px - ax, py - ay);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Distance from point P to the ray A→B extended past B, within plot bounds.
 * Returns the distance to the DRAWN portion only (from A to the point where
 * the ray exits the plot rect).
 */
export function distanceToRay(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  plot: ScreenRect,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  // Parametrize along the ray; find where it exits the plot rect.
  const tExit = rayExitParameter(dx, dy, ax, ay, plot);
  const ex = ax + dx * tExit;
  const ey = ay + dy * tExit;
  // Segment A→(exit point) is the visible portion.
  return distanceToSegment(px, py, ax, ay, ex, ey);
}

/**
 * Positive parameter t along direction (dx, dy) starting at (ax, ay) where
 * the ray leaves the plot rect (t ≥ 0). Uses slab clipping; returns 0 when
 * the direction never enters the rect.
 */
export function rayExitParameter(
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  plot: ScreenRect,
): number {
  let tMax = Infinity;
  if (dx > 0) tMax = Math.min(tMax, (plot.right - ax) / dx);
  else if (dx < 0) tMax = Math.min(tMax, (plot.left - ax) / dx);
  if (dy > 0) tMax = Math.min(tMax, (plot.bottom - ay) / dy);
  else if (dy < 0) tMax = Math.min(tMax, (plot.top - ay) / dy);
  if (!Number.isFinite(tMax)) tMax = 0; // Direction fully outside → nothing drawn.
  return Math.max(0, tMax);
}

/** Rect helper: normalized bounds from two opposing corners. */
export function normalizeRect(a: ScreenPoint, b: ScreenPoint): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/**
 * Rect hit: inside the body (within tolerance). Interior hits make the whole
 * zone draggable — matches professional chart UX.
 */
export function hitRect(
  px: number,
  py: number,
  a: ScreenPoint,
  b: ScreenPoint,
  tolerance = HIT_TOLERANCE,
): boolean {
  const r = normalizeRect(a, b);
  return (
    px >= r.left - tolerance &&
    px <= r.right + tolerance &&
    py >= r.top - tolerance &&
    py <= r.bottom + tolerance
  );
}

/** Text annotation hit: a generous box around the anchor point. */
export function hitTextBox(
  px: number,
  py: number,
  anchor: ScreenPoint,
  textWidth: number,
  textHeight: number,
): boolean {
  const halfW = textWidth / 2 + 6;
  const halfH = textHeight / 2 + 6;
  return (
    px >= anchor.x - halfW &&
    px <= anchor.x + halfW &&
    py >= anchor.y - halfH &&
    py <= anchor.y + halfH
  );
}

/** Anchor handle hit (endpoints of two-anchor objects, hline/vline position). */
export function hitHandle(
  px: number,
  py: number,
  handle: ScreenPoint,
  radius = HANDLE_HIT_RADIUS,
): boolean {
  return Math.hypot(px - handle.x, py - handle.y) <= radius;
}

/**
 * Fibonacci level price for anchor pair (a → b): level 0 at b, level 1 at a
 * (the retracement is measured from b back toward a).
 */
export function fibLevelPrice(
  priceA: number,
  priceB: number,
  level: number,
): number {
  return priceB + (priceA - priceB) * level;
}

/** Clamp a value into a range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

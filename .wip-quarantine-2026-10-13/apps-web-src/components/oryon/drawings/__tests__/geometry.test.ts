import { describe, expect, it } from "vitest";

import {
  distanceToSegment,
  fibLevelPrice,
  hitTestDrawing,
  rayFarEndpoint,
  rectBounds,
  rectCorners,
  selectionHandles,
  shiftAnchors,
  textBBox,
  HIT_TOLERANCE_PX,
  type PlotRect,
  type ScreenPoint,
} from "@/components/oryon/drawings/geometry";
import {
  DEFAULT_LINE_STYLE,
  DEFAULT_SHAPE_STYLE,
  DEFAULT_TEXT_STYLE,
  type DrawingObject,
} from "@/components/oryon/drawings/types";

/**
 * Screen-space geometry + hit-testing tests (PRD §8.4: 6 px tolerance,
 * anchors/corners take priority over body hits, hidden objects handled by
 * the renderer before hit-testing).
 */

const PLOT: PlotRect = { left: 0, top: 0, width: 800, height: 400 };

function makeLine(overrides: Partial<DrawingObject> = {}): DrawingObject {
  return {
    id: "line-1",
    kind: "trendLine",
    anchors: [
      { time: 1000, price: 100 },
      { time: 2000, price: 200 },
    ],
    style: DEFAULT_LINE_STYLE,
    locked: false,
    hidden: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as DrawingObject;
}

describe("distanceToSegment", () => {
  it("measures the perpendicular distance inside the segment", () => {
    expect(distanceToSegment(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(distanceToSegment(0, 0, 0, 0, 10, 0)).toBe(0);
  });

  it("falls back to endpoint distance beyond the ends", () => {
    expect(distanceToSegment(-3, 0, 0, 0, 10, 0)).toBe(3);
    expect(distanceToSegment(13, 4, 0, 0, 10, 0)).toBe(5);
  });

  it("handles degenerate (point) segments", () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });
});

describe("rayFarEndpoint", () => {
  it("extends A→B beyond B until the plot edge", () => {
    // Slope 0.5 from (100,100) → (200,150): the ray reaches the BOTTOM edge
    // (y=400) at x = 200 + (400−150)/0.5 = 700 — before the right edge.
    const far = rayFarEndpoint(
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      PLOT,
    )!;
    expect(far.x).toBeCloseTo(700, 6);
    expect(far.y).toBe(400);
  });

  it("extends backwards direction to the left/top edges", () => {
    const far = rayFarEndpoint(
      { x: 300, y: 200 },
      { x: 100, y: 200 },
      PLOT,
    )!;
    expect(far.x).toBe(0);
    expect(far.y).toBe(200);
  });

  it("returns null when the ray points out of the plot immediately", () => {
    expect(
      rayFarEndpoint({ x: 800, y: 200 }, { x: 900, y: 200 }, PLOT),
    ).toBeNull();
  });
});

describe("rectangle helpers", () => {
  it("normalizes opposing anchors into bounds", () => {
    const bounds = rectBounds({ x: 300, y: 100 }, { x: 100, y: 250 });
    expect(bounds).toEqual({ left: 100, top: 100, width: 200, height: 150 });
  });

  it("returns the four corners in TL/TR/BR/BL order", () => {
    const corners = rectCorners({ x: 300, y: 250 }, { x: 100, y: 100 });
    expect(corners).toEqual([
      { x: 100, y: 100 }, // TL
      { x: 300, y: 100 }, // TR
      { x: 300, y: 250 }, // BR
      { x: 100, y: 250 }, // BL
    ]);
  });
});

describe("fibLevelPrice", () => {
  it("sits level 0 on anchor B and level 1 on anchor A", () => {
    expect(fibLevelPrice(300, 100, 0)).toBe(100);
    expect(fibLevelPrice(300, 100, 1)).toBe(300);
  });

  it("interpolates the canonical levels", () => {
    expect(fibLevelPrice(300, 100, 0.5)).toBeCloseTo(200, 10);
    // level 0.618 sits 61.8% of the way from B (100) toward A (300).
    expect(fibLevelPrice(300, 100, 0.618)).toBeCloseTo(100 + 200 * 0.618, 10);
  });
});

describe("hitTestDrawing", () => {
  const anchors: ScreenPoint[] = [
    { x: 100, y: 100 },
    { x: 300, y: 300 },
  ];

  it("hits the trend line body within tolerance", () => {
    const hit = hitTestDrawing(makeLine(), anchors, PLOT, { x: 202, y: 202 });
    expect(hit?.target).toEqual({ part: "body" });
  });

  it("misses beyond the tolerance", () => {
    expect(
      hitTestDrawing(makeLine(), anchors, PLOT, { x: 202, y: 220 }),
    ).toBeNull();
  });

  it("prioritizes anchor handles over the body", () => {
    const hit = hitTestDrawing(makeLine(), anchors, PLOT, { x: 101, y: 101 });
    expect(hit?.target).toEqual({ part: "anchor", anchorIndex: 0 });
  });

  it("hits the horizontal line across the whole plot width", () => {
    const object: DrawingObject = {
      id: "h-1",
      kind: "horizontalLine",
      anchors: [{ time: 1500, price: 250 }],
      style: DEFAULT_LINE_STYLE,
      locked: false,
      hidden: false,
      createdAt: 1,
      updatedAt: 1,
    } as DrawingObject;
    const points = [{ x: 400, y: 150 }];
    expect(hitTestDrawing(object, points, PLOT, { x: 700, y: 152 })?.target).toEqual({ part: "body" });
    expect(hitTestDrawing(object, points, PLOT, { x: 700, y: 200 })).toBeNull();
    // Anchor handle sits at the anchor position.
    expect(hitTestDrawing(object, points, PLOT, { x: 401, y: 150 })?.target).toEqual({
      part: "anchor",
      anchorIndex: 0,
    });
  });

  it("hits the vertical line within |dx| tolerance only", () => {
    const object: DrawingObject = {
      id: "v-1",
      kind: "verticalLine",
      anchors: [{ time: 1500, price: 250 }],
      style: DEFAULT_LINE_STYLE,
      locked: false,
      hidden: false,
      createdAt: 1,
      updatedAt: 1,
    } as DrawingObject;
    const points = [{ x: 400, y: 0 }];
    expect(hitTestDrawing(object, points, PLOT, { x: 396, y: 300 })?.target).toEqual({ part: "body" });
    expect(hitTestDrawing(object, points, PLOT, { x: 410, y: 300 })).toBeNull();
  });

  it("hits rectangle corners with priority and the body inside", () => {
    const object: DrawingObject = {
      id: "r-1",
      kind: "rectangle",
      anchors: [
        { time: 1000, price: 300 },
        { time: 2000, price: 100 },
      ],
      style: DEFAULT_SHAPE_STYLE,
      locked: false,
      hidden: false,
      createdAt: 1,
      updatedAt: 1,
    } as DrawingObject;
    const cornerHit = hitTestDrawing(object, anchors, PLOT, { x: 102, y: 102 });
    expect(cornerHit?.target).toEqual({ part: "corner", corner: 0 });
    const inside = hitTestDrawing(object, anchors, PLOT, { x: 200, y: 200 });
    expect(inside?.target).toEqual({ part: "body" });
    const outside = hitTestDrawing(object, anchors, PLOT, { x: 700, y: 50 });
    expect(outside).toBeNull();
  });

  it("hits the ray along its EXTENDED geometry, not just the A→B segment", () => {
    const object: DrawingObject = {
      id: "ray-1",
      kind: "ray",
      anchors: [
        { time: 1000, price: 100 },
        { time: 2000, price: 200 },
      ],
      style: DEFAULT_LINE_STYLE,
      locked: false,
      hidden: false,
      createdAt: 1,
      updatedAt: 1,
    } as DrawingObject;
    // The A→B segment ends at (300, 300); the extension continues to the
    // plot edge at (400, 400) — a point at (380, 380) is ON the extension.
    const extended = hitTestDrawing(object, anchors, PLOT, { x: 380, y: 380 });
    expect(extended?.target).toEqual({ part: "body" });
    // Beyond the plot-clipped endpoint → no hit (ray is clipped to the plot).
    expect(hitTestDrawing(object, anchors, PLOT, { x: 500, y: 500 })).toBeNull();
  });

  it("hits text via its measured bounding box", () => {
    const object: DrawingObject = {
      id: "t-1",
      kind: "text",
      anchors: [{ time: 1000, price: 100 }],
      text: "hello",
      style: DEFAULT_TEXT_STYLE,
      locked: false,
      hidden: false,
      createdAt: 1,
      updatedAt: 1,
    } as DrawingObject;
    const points = [{ x: 200, y: 200 }];
    const measured = { width: 40, height: 12 };
    const box = textBBox(points[0]!, measured);
    const insidePoint = { x: box.left + 5, y: box.top + 5 };
    expect(
      hitTestDrawing(object, points, PLOT, insidePoint, HIT_TOLERANCE_PX, measured)?.target,
    ).toEqual({ part: "body" });
    expect(
      hitTestDrawing(object, points, PLOT, { x: 700, y: 300 }, HIT_TOLERANCE_PX, measured),
    ).toBeNull();
  });

  it("hits fibonacci levels inside the anchor span", () => {
    const object: DrawingObject = {
      id: "fib-1",
      kind: "fibonacci",
      anchors: [
        { time: 1000, price: 300 },
        { time: 2000, price: 100 },
      ],
      style: DEFAULT_SHAPE_STYLE,
      locked: false,
      hidden: false,
      createdAt: 1,
      updatedAt: 1,
    } as DrawingObject;
    // Level 0.5 sits halfway between the anchors' SCREEN y (100+300)/2=200.
    const hit = hitTestDrawing(object, anchors, PLOT, { x: 200, y: 201 });
    expect(hit?.target).toEqual({ part: "body" });
    // Outside the horizontal span → no hit even at the level's y.
    expect(hitTestDrawing(object, anchors, PLOT, { x: 600, y: 200 })).toBeNull();
  });

  it("returns null before any projection exists (empty anchors)", () => {
    expect(hitTestDrawing(makeLine(), [], PLOT, { x: 100, y: 100 })).toBeNull();
  });
});

describe("selectionHandles", () => {
  it("exposes both endpoints for trend lines and rays", () => {
    const line = makeLine();
    expect(selectionHandles(line, [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])).toHaveLength(2);
  });

  it("exposes four corners for rectangles", () => {
    const rect = makeLine({ kind: "rectangle", style: DEFAULT_SHAPE_STYLE });
    expect(selectionHandles(rect, [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ])).toHaveLength(4);
  });

  it("exposes a single anchor for one-point kinds", () => {
    const horizontal = makeLine({ kind: "horizontalLine", anchors: [{ time: 1, price: 1 }] });
    expect(selectionHandles(horizontal, [{ x: 5, y: 5 }])).toHaveLength(1);
  });
});

describe("shiftAnchors", () => {
  it("shifts every anchor by the given domain deltas", () => {
    const shifted = shiftAnchors(
      [
        { time: 1000, price: 100 },
        { time: 2000, price: 200 },
      ],
      500,
      -10,
    );
    expect(shifted).toEqual([
      { time: 1500, price: 90 },
      { time: 2500, price: 190 },
    ]);
  });
});

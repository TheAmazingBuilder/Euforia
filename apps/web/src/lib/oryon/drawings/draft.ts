import type { OryonDrawing, OryonDrawingAnchor, OryonDrawingStyle } from "@cosmoz/shared";

/**
 * Live, uncommitted drawing geometry - the bridge between the interaction
 * controller and the rendering primitive (spec §4C ↔ §4D).
 *
 * A draft NEVER enters the drawing store: it is pushed straight into the
 * primitive so a drag re-paints the canvas with ZERO React renders. The
 * store is mutated exactly once, when the interaction commits.
 *
 * Toolbar-v2: the two-anchor preview gains the full V3 two-anchor set, and
 * the three-anchor preview (fibext) carries OPTIONAL b/c - the renderer
 * draws the A→B leg as soon as b exists and the extension the moment c
 * does, so every stage of the 3-click gesture is visible.
 */
export type DraftTwoAnchorType =
  | "trend"
  | "ray"
  | "extended"
  | "rect"
  | "ellipse"
  | "measure"
  | "pricerange"
  | "daterange"
  | "fib"
  | "longpos"
  | "shortpos";

export type DraftOverlay =
  | {
      /** Two-anchor tool preview while drawing. */
      kind: "create";
      type: DraftTwoAnchorType;
      a: OryonDrawingAnchor;
      /** null until the pointer defines the second anchor. */
      b: OryonDrawingAnchor | null;
      style: OryonDrawingStyle;
    }
  | {
      /** Three-anchor preview (fibext) - b/c null until placed. */
      kind: "create3";
      type: "fibext";
      a: OryonDrawingAnchor;
      b: OryonDrawingAnchor | null;
      c: OryonDrawingAnchor | null;
      style: OryonDrawingStyle;
    }
  | {
      /** Live freehand capture (brush) - the points captured so far. */
      kind: "brush";
      points: OryonDrawingAnchor[];
      style: OryonDrawingStyle;
    }
  | {
      /** Move / anchor-edit preview - the modified object, not yet committed. */
      kind: "edit";
      drawing: OryonDrawing;
    };

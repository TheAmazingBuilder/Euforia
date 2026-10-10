import type { OryonDrawing, OryonDrawingAnchor, OryonDrawingStyle } from "@cosmoz/shared";

/**
 * Live, uncommitted drawing geometry — the bridge between the interaction
 * controller and the rendering primitive (spec §4C ↔ §4D).
 *
 * A draft NEVER enters the drawing store: it is pushed straight into the
 * primitive so a drag re-paints the canvas with ZERO React renders. The
 * store is mutated exactly once, when the interaction commits.
 */
export type DraftOverlay =
  | {
      /** Two-anchor tool preview (trend/ray/rect/measure/fib) while drawing. */
      kind: "create";
      type: "trend" | "ray" | "rect" | "measure" | "fib";
      a: OryonDrawingAnchor;
      /** null until the pointer defines the second anchor. */
      b: OryonDrawingAnchor | null;
      style: OryonDrawingStyle;
    }
  | {
      /** Move / anchor-edit preview — the modified object, not yet committed. */
      kind: "edit";
      drawing: OryonDrawing;
    };

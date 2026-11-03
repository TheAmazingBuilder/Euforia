"use client";

import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  UTCTimestamp,
} from "lightweight-charts";

import type {
  OryonDrawing,
  OryonDrawingAnchor,
} from "@cosmoz/shared";

import {
  ORYON_FIB_EXT_LEVELS,
  ORYON_FIB_LEVELS,
  oryonPositionRr,
  oryonPositionTargetPrice,
} from "@cosmoz/shared";

import {
  fibExtLevelPrice,
  fibLevelPrice,
  type ScreenRect,
} from "@/lib/oryon/drawings/geometry";
import {
  computeDateRangeReadout,
  computeMeasureReadout,
  computePositionReadout,
  computePriceRangeReadout,
} from "@/lib/oryon/drawings/measure";
import type { DraftOverlay } from "@/lib/oryon/drawings/draft";
import {
  paintProjectedDrawing,
  paintHandles,
  type DrawingPalette,
  type FibLevelView,
  type PaintContext,
  type ProjectedDrawing,
} from "@/lib/oryon/drawings/canvas-render";

import type { OryonDrawingConversions } from "./oryon-chart-engine";

/**
 * Oryon drawing primitive - the rendering half of the drawing engine.
 *
 * WHY a series primitive (spec §4D): Lightweight Charts calls
 * updateAllViews() + the pane renderer before EVERY internal repaint -
 * pan, zoom, autoscale, resize (autoSize), data updates and live ticks.
 * The overlay therefore cannot drift from the candles: alignment is
 * maintained by the library's own paint loop instead of a parallel
 * subscription web. This is the sanctioned v5 extension point
 * (series.attachPrimitive - verified against the installed 5.2.1 typings).
 *
 * Coordinates: everything is projected through the engine's conversion
 * facade (logical-index pipeline - see oryon-chart-engine.ts) into CSS px
 * relative to the pane, then painted on the bitmap canvas scaled by the
 * device pixel ratios (fancy-canvas contract).
 *
 * The primitive is a PURE renderer: no pointer events, no state mutations.
 * Interaction lives in the controller (lib/oryon/drawings/interaction.ts);
 * they exchange data through this file's DraftOverlay contract.
 */

/**
 * Live draft geometry contract lives in the drawing domain (draft.ts) -
 * this primitive is a pure renderer of committed + draft state.
 */

export type { DraftOverlay } from "@/lib/oryon/drawings/draft";

export interface DrawingsPrimitiveDeps {
  getDrawings(): readonly OryonDrawing[];
  getSelectedId(): string | null;
  getHoverId(): string | null;
  getDraft(): DraftOverlay | null;
  getPalette(): DrawingPalette;
  getMonoFont(): string;
  getTextPrimary(): string;
  getAccent(): string;
  getDigits(): number;
  getPipSize(): number;
  conversions: OryonDrawingConversions;
}

/** Two-anchor drawing union (V2 + V3 pairs). */
type TwoAnchorDrawing = Extract<OryonDrawing, { a: OryonDrawingAnchor; b: OryonDrawingAnchor }>;
type ThreeAnchorDrawing = Extract<OryonDrawing, { a: OryonDrawingAnchor; b: OryonDrawingAnchor; c: OryonDrawingAnchor }>;

class OryonDrawingsPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly views: readonly ProjectedDrawing[],
    private readonly handles: readonly { x: number; y: number }[],
    private readonly paint: Omit<PaintContext, "ctx">,
  ) {}

  draw(target: { useBitmapCoordinateSpace: (cb: (scope: { context: CanvasRenderingContext2D; horizontalPixelRatio: number; verticalPixelRatio: number }) => void) => void }): void {
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio } = scope;
      // Paint in CSS px - the transform applies the device pixel ratios.
      context.setTransform(horizontalPixelRatio, 0, 0, verticalPixelRatio, 0, 0);
      const paintContext: PaintContext = { ...this.paint, ctx: context };
      for (const view of this.views) {
        paintProjectedDrawing(paintContext, view);
      }
      if (this.handles.length > 0) paintHandles(paintContext, this.handles);
    });
  }
}

export class OryonDrawingsPrimitive implements ISeriesPrimitive<UTCTimestamp> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<never> | null = null;
  private requestUpdateFn: (() => void) | null = null;
  private bodyViews: readonly ProjectedDrawing[] = [];
  private handlePoints: readonly { x: number; y: number }[] = [];

  constructor(private readonly deps: DrawingsPrimitiveDeps) {}

  // ── ISeriesPrimitive lifecycle ─────────────────────────────────────────────

  attached(param: SeriesAttachedParameter<UTCTimestamp>): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<never>;
    this.requestUpdateFn = param.requestUpdate;
    this.updateAllViews();
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdateFn = null;
  }

  updateAllViews(): void {
    const projected = this.projectAll();
    this.bodyViews = projected.views;
    this.handlePoints = projected.handles;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.bodyPaneView, this.handlePaneView];
  }

  /** External repaint trigger (store commit, draft update, theme change). */
  requestRedraw(): void {
    this.requestUpdateFn?.();
  }

  /** Plot bounds in CSS px (pane-relative) - shared with the controller. */
  plotRect(): ScreenRect | null {
    if (this.chart === null) return null;
    const size = this.chart.paneSize();
    if (size.width <= 0 || size.height <= 0) return null;
    return { left: 0, top: 0, right: size.width, bottom: size.height };
  }

  // ── pane views ─────────────────────────────────────────────────────────────

  private bodyPaneView: IPrimitivePaneView = {
    zOrder: () => "normal",
    renderer: () => {
      if (this.chart === null) return null;
      const plot = this.plotRect();
      if (plot === null) return null;
      return new OryonDrawingsPaneRenderer(this.bodyViews, [], this.paintContext(plot));
    },
  };

  /** Handles ride ABOVE the series (zOrder top) - never hidden under candles. */
  private handlePaneView: IPrimitivePaneView = {
    zOrder: () => "top",
    renderer: () => {
      if (this.chart === null) return null;
      const plot = this.plotRect();
      if (plot === null) return null;
      return new OryonDrawingsPaneRenderer([], this.handlePoints, this.paintContext(plot));
    },
  };

  private paintContext(plot: ScreenRect): Omit<PaintContext, "ctx"> {
    const deps = this.deps;
    return {
      plot,
      palette: deps.getPalette(),
      monoFont: deps.getMonoFont(),
      textPrimary: deps.getTextPrimary(),
      accent: deps.getAccent(),
    };
  }

  // ── projection ─────────────────────────────────────────────────────────────

  /**
   * Projects the committed collection + the live draft into screen space.
   * Anchors that cannot be projected (no data, degenerate scale) SKIP the
   * drawing entirely - no arbitrary substitutes (spec §6).
   */
  private projectAll(): {
    views: ProjectedDrawing[];
    handles: { x: number; y: number }[];
  } {
    const { conversions, getDrawings, getSelectedId, getHoverId, getDraft } = this.deps;
    const selectedId = getSelectedId();
    const hoverId = getHoverId();
    const views: ProjectedDrawing[] = [];
    const handles: { x: number; y: number }[] = [];

    const projectDrawing = (drawing: OryonDrawing, isDraft: boolean): void => {
      if (!drawing.visible) return;
      const state = {
        selected: drawing.id === selectedId,
        locked: drawing.locked,
        hover: drawing.id === hoverId,
      };
      switch (drawing.type) {
        case "trend":
        case "ray":
        case "extended":
        case "rect":
        case "ellipse":
        case "measure":
        case "pricerange":
        case "daterange":
        case "longpos":
        case "shortpos":
        case "fib": {
          const two = drawing as TwoAnchorDrawing;
          const a = this.projectAnchor(two.a);
          const b = this.projectAnchor(two.b);
          if (a === null || b === null) return;
          if (drawing.type === "trend" || drawing.type === "ray" || drawing.type === "extended") {
            views.push({ kind: drawing.type, drawing, a, b, state });
          } else if (drawing.type === "rect") {
            views.push({ kind: "rect", drawing, a, b, state });
          } else if (drawing.type === "ellipse") {
            views.push({ kind: "ellipse", drawing, a, b, state });
          } else if (drawing.type === "measure") {
            views.push({ kind: "measure", drawing, a, b, state, label: this.measureLabel(two) });
          } else if (drawing.type === "pricerange") {
            views.push({ kind: "pricerange", drawing, a, b, state, label: this.priceRangeLabel(two) });
          } else if (drawing.type === "daterange") {
            views.push({ kind: "daterange", drawing, a, b, state, label: this.dateRangeLabel(two) });
          } else if (drawing.type === "longpos" || drawing.type === "shortpos") {
            const rr = oryonPositionRr(drawing);
            const targetPrice = oryonPositionTargetPrice(two.a.p, two.b.p, rr);
            const targetY = this.deps.conversions.priceToY(targetPrice);
            views.push({
              kind: "position",
              drawing,
              a,
              b,
              state,
              targetY,
              label: this.positionLabel(two),
            });
          } else {
            const levels = this.fibLevels(two);
            if (levels === null) return;
            views.push({ kind: "fib", drawing, a, b, levels, state, digits: this.deps.getDigits() });
          }
          if (state.selected && !isDraft) {
            handles.push(a, b);
          }
          return;
        }
        case "fibext": {
          const three = drawing as ThreeAnchorDrawing;
          const a = this.projectAnchor(three.a);
          const b = this.projectAnchor(three.b);
          const c = this.projectAnchor(three.c);
          if (a === null || b === null || c === null) return;
          const levels = this.fibExtLevels(three);
          if (levels === null) return;
          views.push({ kind: "fibext", drawing, a, b, c, levels, state, digits: this.deps.getDigits() });
          if (state.selected && !isDraft) {
            handles.push(a, b, c);
          }
          return;
        }
        case "hline": {
          const y = conversions.priceToY(drawing.price);
          if (y === null) return;
          views.push({ kind: "hline", drawing, y, state });
          if (state.selected && !isDraft) {
            const plot = this.plotRect();
            handles.push({ x: plot === null ? 0 : (plot.left + plot.right) / 2, y });
          }
          return;
        }
        case "vline": {
          const x = conversions.timeToX(drawing.time);
          if (x === null) return;
          views.push({ kind: "vline", drawing, x, state });
          if (state.selected && !isDraft) {
            const plot = this.plotRect();
            handles.push({ x, y: plot === null ? 0 : (plot.top + plot.bottom) / 2 });
          }
          return;
        }
        case "crossline": {
          const at = this.projectAnchor(drawing.at);
          if (at === null) return;
          views.push({ kind: "crossline", drawing, at, state });
          if (state.selected && !isDraft) {
            handles.push(at);
          }
          return;
        }
        case "text": {
          const at = this.projectAnchor(drawing.at);
          if (at === null) return;
          views.push({ kind: "text", drawing, at, state });
          return;
        }
        case "brush": {
          const points: { x: number; y: number }[] = [];
          for (const anchor of drawing.points) {
            const p = this.projectAnchor(anchor);
            if (p === null) return; // Any unprojectable point → skip the stroke.
            points.push(p);
          }
          if (points.length < 2) return;
          views.push({ kind: "brush", drawing, points, state });
          return;
        }
        case "arrowmark": {
          const at = this.projectAnchor(drawing.at);
          if (at === null) return;
          views.push({ kind: "arrowmark", drawing, at, state });
          if (state.selected && !isDraft) {
            handles.push(at);
          }
          return;
        }
      }
    };

    for (const drawing of getDrawings()) projectDrawing(drawing, false);

    const draft = getDraft();
    if (draft !== null) {
      if (draft.kind === "create") {
        if (draft.b !== null) {
          const preview = {
            id: "__draft__",
            type: draft.type,
            visible: true,
            locked: false,
            label: null,
            createdAt: 0,
            updatedAt: 0,
            style: draft.style,
            a: draft.a,
            b: draft.b,
          } as TwoAnchorDrawing;
          projectDrawing(preview, true);
        } else {
          const a = this.projectAnchor(draft.a);
          if (a !== null) {
            // First anchor placed - render a marker so the user sees the start.
            handles.push(a);
          }
        }
      } else if (draft.kind === "create3") {
        // fibext stages: A alone → start dot; A+B → leg preview (levels
        // appear only once C exists - the extension is undefined before).
        if (draft.b !== null && draft.c !== null) {
          const preview = {
            id: "__draft__",
            type: "fibext",
            visible: true,
            locked: false,
            label: null,
            createdAt: 0,
            updatedAt: 0,
            style: draft.style,
            a: draft.a,
            b: draft.b,
            c: draft.c,
          } as ThreeAnchorDrawing;
          projectDrawing(preview, true);
        } else {
          const a = this.projectAnchor(draft.a);
          if (a !== null) handles.push(a);
          if (draft.b !== null) {
            const b = this.projectAnchor(draft.b);
            if (b !== null) handles.push(b);
            const aPt = this.projectAnchor(draft.a);
            if (aPt !== null && b !== null) {
              // Leg preview via a degenerate trend view (screen-only - the
              // frame fields below are never persisted or hit-tested).
              views.push({
                kind: "trend",
                drawing: {
                  id: "__draft-leg__",
                  type: "trend",
                  visible: true,
                  locked: false,
                  label: null,
                  createdAt: 0,
                  updatedAt: 0,
                  style: draft.style,
                  a: draft.a,
                  b: draft.b,
                },
                a: aPt,
                b,
                state: { selected: false, locked: false, hover: false },
              });
            }
          }
        }
      } else if (draft.kind === "brush") {
        // Live freehand preview - projected directly (no store object yet).
        const points: { x: number; y: number }[] = [];
        let ok = true;
        for (const anchor of draft.points) {
          const p = this.projectAnchor(anchor);
          if (p === null) {
            ok = false;
            break;
          }
          points.push(p);
        }
        if (ok && points.length >= 2) {
          views.push({
            kind: "brush",
            drawing: {
              id: "__draft-brush__",
              type: "brush",
              visible: true,
              locked: false,
              label: null,
              createdAt: 0,
              updatedAt: 0,
              style: draft.style,
              points: draft.points,
            },
            points,
            state: { selected: false, locked: false, hover: false },
          });
        } else if (draft.points.length >= 1) {
          const a = this.projectAnchor(draft.points[0]!);
          if (a !== null) handles.push(a);
        }
      } else {
        projectDrawing(draft.drawing, true);
      }
    }

    return { views, handles };
  }

  private projectAnchor(anchor: OryonDrawingAnchor): { x: number; y: number } | null {
    const { conversions } = this.deps;
    const x = conversions.timeToX(anchor.t);
    const y = conversions.priceToY(anchor.p);
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  /** Fibonacci level positions (screen) - null when any level fails to project. */
  private fibLevels(drawing: TwoAnchorDrawing): readonly FibLevelView[] | null {
    const priceToY = this.deps.conversions.priceToY;
    const levels: FibLevelView[] = [];
    for (const level of ORYON_FIB_LEVELS) {
      const price = fibLevelPrice(drawing.a.p, drawing.b.p, level);
      const y = priceToY(price);
      if (y === null) return null;
      levels.push({ level, y, price });
    }
    return levels;
  }

  /**
   * Measure readout (Phase 5) - delegated to the PURE measure module
   * (lib/oryon/drawings/measure.ts): start/end prices, direction, Δprice,
   * Δ%, pips, bars and elapsed time from the ACTUAL anchor timestamps.
   * Only the bar count is computed here (the chart's logical pipeline);
   * every financial value, validation and composition lives in the pure
   * module (unit-tested without a chart). Invalid inputs → no label.
   */
  private measureLabel(drawing: TwoAnchorDrawing): string | null {
    const logicalA = this.deps.conversions.timeSecToLogical(drawing.a.t);
    const logicalB = this.deps.conversions.timeSecToLogical(drawing.b.t);
    const bars =
      logicalA === null || logicalB === null
        ? null
        : Math.abs(Math.round(logicalB) - Math.round(logicalA));
    const readout = computeMeasureReadout(drawing.a, drawing.b, {
      digits: this.deps.getDigits(),
      pipSize: this.deps.getPipSize(),
      bars,
    });
    if (!readout.valid || readout.lines.length === 0) return null;
    return readout.lines.join("\n");
  }

  /** Price-range readout label (pure module; bars are irrelevant here). */
  private priceRangeLabel(drawing: TwoAnchorDrawing): string | null {
    const readout = computePriceRangeReadout(drawing.a, drawing.b, {
      digits: this.deps.getDigits(),
      pipSize: this.deps.getPipSize(),
    });
    if (!readout.valid || readout.lines.length === 0) return null;
    return readout.lines.join("\n");
  }

  /** Date-range readout label (bar count from the chart's logical pipeline). */
  private dateRangeLabel(drawing: TwoAnchorDrawing): string | null {
    const logicalA = this.deps.conversions.timeSecToLogical(drawing.a.t);
    const logicalB = this.deps.conversions.timeSecToLogical(drawing.b.t);
    const bars =
      logicalA === null || logicalB === null
        ? null
        : Math.abs(Math.round(logicalB) - Math.round(logicalA));
    const readout = computeDateRangeReadout(drawing.a, drawing.b, { bars });
    if (!readout.valid || readout.lines.length === 0) return null;
    return readout.lines.join("\n");
  }

  /** Position tool label - Entry/Stop/Target (target DERIVED at the object's
   *  own rr - the property editor's per-object risk:reward, never stored). */
  private positionLabel(drawing: TwoAnchorDrawing): string | null {
    const readout = computePositionReadout(drawing.a, drawing.b, {
      digits: this.deps.getDigits(),
      pipSize: this.deps.getPipSize(),
      rr: oryonPositionRr(drawing),
    });
    if (!readout.valid || readout.lines.length === 0) return null;
    return readout.lines.join("\n");
  }

  /** Fib extension level positions - null when ANY level fails to project. */
  private fibExtLevels(drawing: ThreeAnchorDrawing): readonly FibLevelView[] | null {
    const priceToY = this.deps.conversions.priceToY;
    const levels: FibLevelView[] = [];
    for (const level of ORYON_FIB_EXT_LEVELS) {
      const price = fibExtLevelPrice(drawing.a.p, drawing.b.p, drawing.c.p, level);
      const y = priceToY(price);
      if (y === null) return null;
      levels.push({ level, y, price });
    }
    return levels;
  }
}

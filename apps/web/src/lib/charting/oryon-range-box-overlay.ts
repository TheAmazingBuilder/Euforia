"use client";

import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  UTCTimestamp,
} from "lightweight-charts";

import type { OryonDrawingConversions } from "./oryon-chart-engine";

/**
 * Oryon range-box overlay primitive (Phase 9 spec §6.1) - a bounded
 * price/time rectangle (the opening-range shading), rendered BEHIND the
 * series like the Phase 8 session bands.
 *
 * Same architecture argument as the session overlay (audit-verified
 * against the installed 5.2.1 typings): LWC calls updateAllViews() + the
 * pane renderer before EVERY internal repaint (pan, zoom, autoscale,
 * autoSize resize, data updates, live ticks) - a box anchored to real
 * times + real prices cannot drift from the candles because the library's
 * own paint loop projects it. NO per-candle DOM: one canvas pass.
 *
 * The box spans EXACTLY [startSec, endSec] × [lowPrice, highPrice] - the
 * opening range never extends beyond its window (spec §5.3). Fill alpha
 * stays subtle (§6.3) and the boundary hairlines echo the OR price lines.
 * Colors resolve from THEME TOKENS at draw time (never stored hex).
 */

/** Resolved color lookup - cleared on theme re-apply (engine applyTheme). */
export type RangeColorResolver = (tokenKey: string) => string;

export interface OryonRangeBoxSpec {
  /** Stable identity (probe observability). */
  readonly id: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly highPrice: number;
  readonly lowPrice: number;
  /** Theme token KEY - resolved at draw time. */
  readonly colorToken: string;
}

interface ProjectedBox {
  readonly box: OryonRangeBoxSpec;
  readonly x1: number;
  readonly x2: number;
  readonly yHigh: number;
  readonly yLow: number;
}

class OryonRangeBoxRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly boxes: readonly ProjectedBox[],
    private readonly color: RangeColorResolver,
  ) {}

  draw(target: {
    useBitmapCoordinateSpace: (
      cb: (scope: {
        context: CanvasRenderingContext2D;
        horizontalPixelRatio: number;
        verticalPixelRatio: number;
      }) => void,
    ) => void;
  }): void {
    if (this.boxes.length === 0) return;
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio: hp, verticalPixelRatio: vp } = scope;
      for (const { box, x1, x2, yHigh, yLow } of this.boxes) {
        const left = Math.min(x1, x2) * hp;
        const right = Math.max(x1, x2) * hp;
        const top = Math.min(yHigh, yLow) * vp;
        const bottom = Math.max(yHigh, yLow) * vp;
        const width = right - left;
        const height = bottom - top;
        if (width < 1 || height < 1) continue;

        const base = this.color(box.colorToken);
        if (base === "") continue;
        context.globalAlpha = 0.06;
        context.fillStyle = base;
        context.fillRect(left, top, width, height);
        context.globalAlpha = 0.3;
        // Boundary hairlines - echo the OR high/low price lines.
        context.fillRect(left, top, width, Math.max(1, vp));
        context.fillRect(left, bottom - Math.max(1, vp), width, Math.max(1, vp));
      }
      context.globalAlpha = 1;
    });
  }
}

export interface RangeBoxDeps {
  getBoxes(): readonly OryonRangeBoxSpec[];
  getColor(tokenKey: string): string;
  conversions: OryonDrawingConversions;
}

class OryonRangeBoxPaneView implements IPrimitivePaneView {
  constructor(private readonly deps: RangeBoxDeps) {}

  /** BEHIND the series - the documented background layer (§6.3). */
  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer {
    const conversions = this.deps.conversions;
    const projected: ProjectedBox[] = [];
    for (const box of this.deps.getBoxes()) {
      const x1 = conversions.timeToX(box.startSec);
      const x2 = conversions.timeToX(box.endSec);
      const yHigh = conversions.priceToY(box.highPrice);
      const yLow = conversions.priceToY(box.lowPrice);
      if (x1 === null || x2 === null || yHigh === null || yLow === null) continue;
      if (![x1, x2, yHigh, yLow].every(Number.isFinite)) continue;
      projected.push({ box, x1, x2, yHigh, yLow });
    }
    return new OryonRangeBoxRenderer(projected, this.deps.getColor);
  }
}

/**
 * The attachable primitive. Boxes are read through deps at paint time -
 * setBoxes() swaps the source array and requests a redraw, so a visibility
 * toggle NEVER recreates the chart (spec §6/§14).
 */
export class OryonRangeBoxPrimitive implements ISeriesPrimitive<UTCTimestamp> {
  private boxes: readonly OryonRangeBoxSpec[] = [];
  private view: OryonRangeBoxPaneView | null = null;
  private attachedParameter: SeriesAttachedParameter<UTCTimestamp> | null = null;

  constructor(private readonly deps: RangeBoxDeps) {}

  setBoxes(boxes: readonly OryonRangeBoxSpec[]): void {
    this.boxes = boxes;
    this.requestRedraw();
  }

  updateAllViews(): void {
    // State is read live in the renderer - nothing to precompute.
  }

  paneViews(): readonly IPrimitivePaneView[] {
    if (this.view === null) this.view = new OryonRangeBoxPaneView(this.deps);
    return [this.view];
  }

  attached(param: SeriesAttachedParameter<UTCTimestamp>): void {
    this.attachedParameter = param;
  }

  detached(): void {
    this.attachedParameter = null;
  }

  /** Redraw through the chart API when attached (box set changed). */
  requestRedraw(): void {
    this.attachedParameter?.chart.applyOptions({});
  }
}

/**
 * Engine-facing manager - owns the attach lifecycle (mirrors the session
 * overlay manager; the engine stays a thin boundary).
 */
export class OryonRangeBoxManager {
  private primitive: OryonRangeBoxPrimitive | null = null;
  private series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null = null;
  private boxes: readonly OryonRangeBoxSpec[] = [];

  constructor(private readonly deps: Omit<RangeBoxDeps, "getBoxes">) {}

  setBoxes(boxes: readonly OryonRangeBoxSpec[]): void {
    this.boxes = boxes;
    this.primitive?.setBoxes(boxes);
  }

  get count(): number {
    return this.boxes.length;
  }

  /** (Re)attaches to the given series - no-op when already attached there. */
  attach(series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">): void {
    if (this.series === series) return;
    this.detach();
    this.series = series;
    this.primitive = new OryonRangeBoxPrimitive({
      ...this.deps,
      getBoxes: () => this.boxes,
    });
    try {
      series.attachPrimitive(this.primitive as unknown as Parameters<ISeriesApi<"Candlestick">["attachPrimitive"]>[0]);
      this.primitive.setBoxes(this.boxes);
    } catch {
      // Double-attach is an upstream programming error we survive.
      this.primitive = null;
    }
  }

  detach(): void {
    const series = this.series;
    const primitive = this.primitive;
    this.series = null;
    this.primitive = null;
    if (series === null || primitive === null) return;
    try {
      series.detachPrimitive(primitive as unknown as Parameters<ISeriesApi<"Candlestick">["detachPrimitive"]>[0]);
    } catch {
      // Never attached / already gone - nothing to clean.
    }
  }

  destroy(): void {
    this.detach();
    this.boxes = [];
  }
}

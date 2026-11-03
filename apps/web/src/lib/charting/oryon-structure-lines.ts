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
 * Oryon structure-line overlay primitive - the market-structure BREAK
 * rendering (Phase 9 refinement): for every BOS / CHoCH event, the broken
 * swing level is drawn as a horizontal segment from the PIVOT bar to the
 * BREAK bar at the level price, with a boxed label at the break end.
 *
 * This is the TradingView-style market-structure look: the reader sees
 * WHICH swing was broken, WHEN it was broken, and the event type - instead
 * of a bare floating marker text.
 *
 * Architecture (same argument as the range-box / session overlays, audit-
 * verified against the installed 5.2.1 typings): LWC calls updateAllViews()
 * + the pane renderer before EVERY internal repaint (pan, zoom, autoscale,
 * data updates, live ticks) - a line anchored to real times + a real price
 * cannot drift from the candles because the library's own paint loop
 * projects it. One canvas pass, no per-candle DOM, no React.
 *
 * Theming: colors travel as THEME TOKEN KEYS and resolve at draw time via
 * the injected resolver (never stored hex) - a theme switch restyles the
 * lines on the next paint. BOS renders solid, CHoCH dashed (the type is
 * encoded by line style AND the label text, never color alone).
 */

/** Resolved color lookup - invalidated on theme re-apply (engine applyTheme). */
export type StructureColorResolver = (tokenKey: string) => string;

export interface OryonStructureLineSpec {
  /** Stable identity - derived from the break event id (§4.4). */
  readonly id: string;
  /** Open time of the PIVOT bar (unix seconds) - segment start. */
  readonly startSec: number;
  /** Open time of the BREAK bar (unix seconds) - segment end + label. */
  readonly endSec: number;
  /** The broken swing level (the pivot price). */
  readonly level: number;
  /** Event type - line style + label text. */
  readonly type: "BOS" | "CHoCH";
  /** Structure direction after the break - label side (above/below). */
  readonly direction: "bullish" | "bearish";
  /** Theme token KEY for line + label box ("profit", "loss", "warning"). */
  readonly colorToken: string;
}

interface ProjectedLine {
  readonly spec: OryonStructureLineSpec;
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
}

const LABEL_FONT_SIZE = 9;
const LABEL_PAD_X = 4;
const LABEL_PAD_Y = 2;
/** Label offset from the break bar (bitmap px added on top of the pad). */
const LABEL_GAP_X = 6;

class OryonStructureLineRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly lines: readonly ProjectedLine[],
    private readonly color: StructureColorResolver,
    private readonly monoFont: string,
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
    if (this.lines.length === 0) return;
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio: hp, verticalPixelRatio: vp } = scope;
      const background = this.color("background");
      for (const { spec, x1, x2, y } of this.lines) {
        const base = this.color(spec.colorToken);
        if (base === "") continue;
        const left = Math.min(x1, x2) * hp;
        const right = Math.max(x1, x2) * hp;
        const cy = y * vp;
        if (right - left < 1) continue;

        // Segment: solid for BOS, dashed for CHoCH (type ≠ color alone).
        context.strokeStyle = base;
        context.lineWidth = Math.max(1, vp);
        context.globalAlpha = 0.85;
        context.setLineDash(spec.type === "CHoCH" ? [4 * hp, 3 * hp] : []);
        context.beginPath();
        context.moveTo(left, cy);
        context.lineTo(right, cy);
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = 1;

        // Boxed label at the BREAK end - above the line for a bullish
        // break, below for a bearish one (mirrors the price crossing).
        const text = spec.type;
        context.font = `${LABEL_FONT_SIZE}px ${this.monoFont}`;
        const metrics = context.measureText(text);
        const boxW = metrics.width + LABEL_PAD_X * 2 * hp;
        const boxH = (LABEL_FONT_SIZE + LABEL_PAD_Y * 2) * vp;
        const above = spec.direction === "bullish";
        const boxX = right + LABEL_GAP_X * hp;
        const boxY = above ? cy - boxH - 2 * vp : cy + 2 * vp;
        context.globalAlpha = 0.9;
        context.fillStyle = base;
        context.fillRect(boxX, boxY, boxW, boxH);
        context.globalAlpha = 1;
        context.fillStyle = background;
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(text, boxX + LABEL_PAD_X * hp, boxY + boxH / 2);
      }
    });
  }
}

export interface StructureLineDeps {
  getLines(): readonly OryonStructureLineSpec[];
  getColor(tokenKey: string): string;
  getMonoFont(): string;
  conversions: OryonDrawingConversions;
}

class OryonStructureLinePaneView implements IPrimitivePaneView {
  constructor(private readonly deps: StructureLineDeps) {}

  /** ABOVE the series - structure annotations must stay readable. */
  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer {
    const conversions = this.deps.conversions;
    const projected: ProjectedLine[] = [];
    for (const spec of this.deps.getLines()) {
      const x1 = conversions.timeToX(spec.startSec);
      const x2 = conversions.timeToX(spec.endSec);
      const y = conversions.priceToY(spec.level);
      if (x1 === null || x2 === null || y === null) continue;
      if (![x1, x2, y].every(Number.isFinite)) continue;
      projected.push({ spec, x1, x2, y });
    }
    return new OryonStructureLineRenderer(projected, this.deps.getColor, this.deps.getMonoFont());
  }
}

/**
 * The attachable primitive. Lines are read through deps at paint time -
 * setLines() swaps the source array and requests a redraw, so a visibility
 * toggle NEVER recreates the chart.
 */
export class OryonStructureLinePrimitive implements ISeriesPrimitive<UTCTimestamp> {
  private lines: readonly OryonStructureLineSpec[] = [];
  private view: OryonStructureLinePaneView | null = null;
  private attachedParameter: SeriesAttachedParameter<UTCTimestamp> | null = null;

  constructor(private readonly deps: StructureLineDeps) {}

  setLines(lines: readonly OryonStructureLineSpec[]): void {
    this.lines = lines;
    this.requestRedraw();
  }

  updateAllViews(): void {
    // State is read live in the renderer - nothing to precompute.
  }

  paneViews(): readonly IPrimitivePaneView[] {
    if (this.view === null) this.view = new OryonStructureLinePaneView(this.deps);
    return [this.view];
  }

  attached(param: SeriesAttachedParameter<UTCTimestamp>): void {
    this.attachedParameter = param;
  }

  detached(): void {
    this.attachedParameter = null;
  }

  /** Redraw through the chart API when attached (line set changed). */
  requestRedraw(): void {
    this.attachedParameter?.chart.applyOptions({});
  }
}

/**
 * Engine-facing manager - owns the attach lifecycle (mirrors the range-box
 * manager; the engine stays a thin boundary). Lines survive chart-type
 * switches: specs are remembered and replayed on re-attach.
 */
export class OryonStructureLineManager {
  private primitive: OryonStructureLinePrimitive | null = null;
  private series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null = null;
  private lines: readonly OryonStructureLineSpec[] = [];

  constructor(private readonly deps: Omit<StructureLineDeps, "getLines">) {}

  setLines(lines: readonly OryonStructureLineSpec[]): void {
    this.lines = lines;
    this.primitive?.setLines(lines);
  }

  get count(): number {
    return this.lines.length;
  }

  /** (Re)attaches to the given series - no-op when already attached there. */
  attach(series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">): void {
    if (this.series === series) return;
    this.detach();
    this.series = series;
    this.primitive = new OryonStructureLinePrimitive({
      ...this.deps,
      getLines: () => this.lines,
    });
    try {
      series.attachPrimitive(this.primitive as unknown as Parameters<ISeriesApi<"Candlestick">["attachPrimitive"]>[0]);
      this.primitive.setLines(this.lines);
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
    this.lines = [];
  }
}

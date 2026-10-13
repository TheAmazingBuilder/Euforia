import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle } from "@cosmoz/shared";

import type { ChartTheme } from "@/lib/utils/chart-theme";
import { formatPrice } from "@/lib/oryon/candles";
import {
  buildTimeline,
  logicalToTime,
  logicalToX,
  timeToLogical,
  timeToX,
  xToLogical,
  xToTime,
  type BarTimeline,
  type RangeProjection,
} from "@/components/oryon/drawings/projection";

/**
 * Oryon chart-engine boundary — the ONLY module allowed to touch the
 * `lightweight-charts` API (docs/specs/oryon-prd.md §7.4). It separates:
 *   - chart creation / disposal (client-only, lifecycle owned by React)
 *   - configuration and theming (Euforia tokens via ChartTheme)
 *   - candle-series creation, type swaps and incremental updates
 *   - visible-range events (backfill trigger, go-latest) and crosshair
 *   - time/price ↔ screen coordinate conversions (Phase 2 — drawing
 *     subsystem; the math lives in drawings/projection.ts, this boundary
 *     only feeds it the chart's actual state)
 *
 * Deliberately NOT implemented yet (later phases): indicator panes,
 * position price-lines. No speculative abstraction — the boundary grows
 * when those features actually land.
 *
 * Performance rule (§7.3): ticks NEVER flow through React state here —
 * `upsertBar` feeds `series.update()` imperatively; React re-renders only
 * the workspace chrome.
 */

export type OryonChartType = "candles" | "bars" | "line" | "area";

export const ORYON_CHART_TYPES: readonly OryonChartType[] = [
  "candles",
  "bars",
  "line",
  "area",
];

export interface OryonEngineHandlers {
  /** Fires on every visible-range change (logical units) — may be null. */
  onVisibleRangeChange?: (range: LogicalRange | null) => void;
  /** Fires on crosshair moves with the bar under the cursor (null = away). */
  onCrosshairBar?: (bar: Candle | null) => void;
}

/** Append "rrggbb" alpha to a resolved #hex token (token-driven, not a color). */
function withAlpha(token: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(token) ? `${token}${alpha}` : token;
}

interface BarPoint {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface LinePoint {
  time: UTCTimestamp;
  value: number;
}

function toSeconds(t: number): UTCTimestamp {
  return Math.floor(t / 1000) as UTCTimestamp;
}

export class OryonChartEngine {
  private chart: IChartApi;
  private series:
    | ISeriesApi<"Candlestick">
    | ISeriesApi<"Bar">
    | ISeriesApi<"Line">
    | ISeriesApi<"Area">
    | null = null;
  private seriesType: OryonChartType = "candles";
  /** Newest merged series the engine knows (drives crosshair resolution). */
  private bars: Candle[] = [];
  private timeIndex = new Map<number, Candle>();
  /** Logical-index lookup for the drawing projection (rebuilt on setBars). */
  private timeline: BarTimeline = buildTimeline([]);
  private digits = 2;
  private handlers: OryonEngineHandlers;
  private destroyed = false;

  private constructor(
    private container: HTMLElement,
    theme: ChartTheme,
    handlers: OryonEngineHandlers,
  ) {
    this.handlers = handlers;
    this.chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.textMuted,
        fontSize: 11,
        fontFamily: theme.monoFont,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: withAlpha(theme.border, "66") },
        horzLines: { color: withAlpha(theme.border, "66") },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.textMuted, labelBackgroundColor: theme.surfaceRaised },
        horzLine: { color: theme.textMuted, labelBackgroundColor: theme.surfaceRaised },
      },
      rightPriceScale: {
        borderColor: theme.border,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
      },
    });

    this.chart.subscribeCrosshairMove(this.handleCrosshair);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(
      this.handleRangeChange,
    );

    // The price series exists from birth — setBars feeds it immediately.
    // (Deferred creation would silently drop every setData: pushData
    // no-ops without a series, and setSeriesType only fires on a CHANGE.)
    this.createSeries(theme);
  }

  /** Create the engine (client-only — never called during SSR). */
  static create(
    container: HTMLElement,
    theme: ChartTheme,
    handlers: OryonEngineHandlers = {},
  ): OryonChartEngine {
    return new OryonChartEngine(container, theme, handlers);
  }

  private handleRangeChange = (range: LogicalRange | null): void => {
    if (!this.destroyed) this.handlers.onVisibleRangeChange?.(range);
  };

  private handleCrosshair = (param: MouseEventParams): void => {
    if (this.destroyed) return;
    // `time` is a union (UTCTimestamp | BusinessDay | string) — only the
    // numeric UTCTimestamp form maps back to our millisecond bucket keys.
    const bar =
      typeof param.time === "number"
        ? this.timeIndex.get(param.time * 1000) ?? null
        : null;
    this.handlers.onCrosshairBar?.(bar);
  };

  /** Re-apply the full theme (canvas cannot read CSS variables). */
  applyTheme(theme: ChartTheme): void {
    if (this.destroyed) return;
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.textMuted,
        fontFamily: theme.monoFont,
      },
      grid: {
        vertLines: { color: withAlpha(theme.border, "66") },
        horzLines: { color: withAlpha(theme.border, "66") },
      },
      crosshair: {
        vertLine: { color: theme.textMuted, labelBackgroundColor: theme.surfaceRaised },
        horzLine: { color: theme.textMuted, labelBackgroundColor: theme.surfaceRaised },
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
    });
    this.restyleSeries(theme);
  }

  private restyleSeries(theme: ChartTheme): void {
    if (!this.series) return;
    const accentSoft = withAlpha(theme.accent, "33");
    switch (this.seriesType) {
      case "candles":
        (this.series as ISeriesApi<"Candlestick">).applyOptions({
          upColor: theme.profit,
          downColor: theme.loss,
          borderVisible: false,
          wickUpColor: theme.profit,
          wickDownColor: theme.loss,
        });
        break;
      case "bars":
        (this.series as ISeriesApi<"Bar">).applyOptions({
          upColor: theme.profit,
          downColor: theme.loss,
          thinBars: false,
        });
        break;
      case "line":
        (this.series as ISeriesApi<"Line">).applyOptions({
          color: theme.accent,
          lineWidth: 2,
        });
        break;
      case "area":
        (this.series as ISeriesApi<"Area">).applyOptions({
          lineColor: theme.accent,
          topColor: accentSoft,
          bottomColor: withAlpha(theme.background, "00"),
          lineWidth: 2,
        });
        break;
    }
  }

  /** Display precision from the instrument spec (digits, minMove). */
  setPriceDigits(digits: number): void {
    this.digits = digits;
    if (this.series) {
      this.series.applyOptions({
        priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits },
      });
    }
  }

  /** Swap the rendered series type, preserving instrument/timeframe/viewport. */
  setSeriesType(type: OryonChartType, theme: ChartTheme): void {
    if (this.destroyed || type === this.seriesType) return;
    const range = this.chart.timeScale().getVisibleLogicalRange();
    if (this.series) {
      this.chart.removeSeries(this.series);
      this.series = null;
    }
    this.seriesType = type;
    this.createSeries(theme);
    this.pushData(this.bars, false);
    if (range) this.chart.timeScale().setVisibleLogicalRange(range);
  }

  private createSeries(theme: ChartTheme): void {
    const priceFormat = {
      type: "price" as const,
      precision: this.digits,
      minMove: 1 / 10 ** this.digits,
    };
    switch (this.seriesType) {
      case "candles":
        this.series = this.chart.addSeries(CandlestickSeries, {
          upColor: theme.profit,
          downColor: theme.loss,
          borderVisible: false,
          wickUpColor: theme.profit,
          wickDownColor: theme.loss,
          priceFormat,
        });
        break;
      case "bars":
        this.series = this.chart.addSeries(BarSeries, {
          upColor: theme.profit,
          downColor: theme.loss,
          thinBars: false,
          priceFormat,
        });
        break;
      case "line":
        this.series = this.chart.addSeries(LineSeries, {
          color: theme.accent,
          lineWidth: 2,
          priceFormat,
        });
        break;
      case "area":
        this.series = this.chart.addSeries(AreaSeries, {
          lineColor: theme.accent,
          topColor: withAlpha(theme.accent, "33"),
          bottomColor: withAlpha(theme.background, "00"),
          lineWidth: 2,
          priceFormat,
        });
        break;
    }
  }

  private pushData(bars: Candle[], fit: boolean): void {
    if (!this.series) return;
    if (this.seriesType === "candles" || this.seriesType === "bars") {
      const data: BarPoint[] = bars.map((bar) => ({
        time: toSeconds(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
      }));
      (this.series as ISeriesApi<"Candlestick">).setData(data);
    } else {
      const data: LinePoint[] = bars.map((bar) => ({
        time: toSeconds(bar.t),
        value: bar.c,
      }));
      (this.series as ISeriesApi<"Line">).setData(data);
    }
    if (fit) this.chart.timeScale().fitContent();
  }

  /**
   * Replace the whole series data (history load, backfill merge, refetch).
   * `fit` fits the viewport to the data (first load of an instrument or
   * timeframe) — otherwise the user's zoom/pan is preserved.
   */
  setBars(bars: Candle[], options: { fit?: boolean } = {}): void {
    if (this.destroyed) return;
    this.bars = bars;
    this.timeIndex = new Map(bars.map((bar) => [bar.t, bar]));
    this.timeline = buildTimeline(bars.map((bar) => bar.t));
    this.pushData(bars, options.fit === true);
  }

  // ── Coordinate conversions (Phase 2 drawing subsystem) ──────────────────
  // Math lives in drawings/projection.ts (pure, unit-tested); these methods
  // only project the chart's LIVE state. Null results are honest "cannot
  // map right now" answers (no data yet, degenerate range) — callers must
  // handle them explicitly instead of substituting arbitrary values.

  /** Plot area in container/wrapper coordinates, axes EXCLUDED. */
  getPlotRect(): { left: number; top: number; width: number; height: number } {
    const rightAxisWidth = this.chart.priceScale("right").width();
    const timeAxisHeight = this.chart.timeScale().height();
    return {
      left: 0,
      top: 0,
      width: Math.max(0, this.container.clientWidth - rightAxisWidth),
      height: Math.max(0, this.container.clientHeight - timeAxisHeight),
    };
  }

  /** Visible logical range + plot width — null while no data is rendered. */
  getRangeProjection(): RangeProjection | null {
    const range = this.chart.timeScale().getVisibleLogicalRange();
    if (!range) return null;
    const plot = this.getPlotRect();
    if (plot.width <= 0) return null;
    return { from: range.from, to: range.to, width: plot.width };
  }

  /** Time (ms) → fractional logical index; null when unmappable. */
  timeToLogical(timeMs: number): number | null {
    return timeToLogical(this.timeline, timeMs);
  }

  /** Fractional logical index → time (ms); null when unmappable. */
  logicalToTime(logical: number): number | null {
    return logicalToTime(this.timeline, logical);
  }

  /** Logical index → screen x (plot coordinates); null when unmappable. */
  logicalToX(logical: number): number | null {
    const projection = this.getRangeProjection();
    return projection ? logicalToX(projection, logical) : null;
  }

  /** Screen x → logical index; null when unmappable. */
  xToLogical(x: number): number | null {
    const projection = this.getRangeProjection();
    return projection ? xToLogical(projection, x) : null;
  }

  /** Time (ms) → screen x; null when unmappable (no data / degenerate). */
  timeToX(timeMs: number): number | null {
    const projection = this.getRangeProjection();
    return projection ? timeToX(this.timeline, projection, timeMs) : null;
  }

  /** Screen x → time (ms); null when unmappable. */
  xToTime(x: number): number | null {
    const projection = this.getRangeProjection();
    return projection ? xToTime(this.timeline, projection, x) : null;
  }

  /** Market price → screen y (plot coordinates); null when unmappable. */
  priceToY(price: number): number | null {
    if (!this.series || !Number.isFinite(price)) return null;
    const y = this.series.priceToCoordinate(price as never);
    return y === null ? null : Number(y);
  }

  /** Screen y → market price; null when unmappable. */
  yToPrice(y: number): number | null {
    if (!this.series || !Number.isFinite(y)) return null;
    const price = this.series.coordinateToPrice(y as never);
    return price === null ? null : Number(price);
  }

  /**
   * Extra visible-range subscription (drawing renderer). Returns an
   * unsubscribe closure; Lightweight Charts drops listeners on chart.remove().
   */
  subscribeRangeChange(
    listener: (range: LogicalRange | null) => void,
  ): () => void {
    const wrapped = (range: LogicalRange | null): void => {
      if (!this.destroyed) listener(range);
    };
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(wrapped);
    return () => {
      if (!this.destroyed) {
        this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(wrapped);
      }
    };
  }

  /**
   * Force the pointer cursor over the chart canvases (drawing hover/drag
   * affordances). Empty string restores the chart default.
   */
  setCursor(cursor: string): void {
    if (this.destroyed) return;
    this.container.style.cursor = cursor;
    for (const canvas of this.container.querySelectorAll("canvas")) {
      (canvas as HTMLCanvasElement).style.cursor = cursor;
    }
  }

  /** Merge one live tick/bucket into the rendered series (no React involved). */
  upsertBar(bar: Candle): void {
    if (this.destroyed || !this.series) return;
    if (this.seriesType === "candles" || this.seriesType === "bars") {
      (this.series as ISeriesApi<"Candlestick">).update({
        time: toSeconds(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
      });
    } else {
      (this.series as ISeriesApi<"Line">).update({
        time: toSeconds(bar.t),
        value: bar.c,
      });
    }
  }

  /** True when the newest data point is inside the visible logical range. */
  isLatestVisible(): boolean {
    if (this.bars.length === 0) return true;
    const range = this.chart.timeScale().getVisibleLogicalRange();
    if (!range) return true;
    return range.to >= this.bars.length - 2;
  }

  /** Scroll the viewport so the newest bucket is visible (go-to-latest). */
  goLatest(): void {
    this.chart.timeScale().scrollToRealTime();
  }

  /** Snapshot of the last known close (legend fallback before a crosshair). */
  get lastBar(): Candle | null {
    return this.bars.length > 0 ? this.bars[this.bars.length - 1]! : null;
  }

  /** Price axis label helper shared with the legend (instrument digits). */
  formatPriceLabel(price: number): string {
    return formatPrice(price, this.digits);
  }

  /** Full teardown — unsubscribes events, frees the canvas and its data. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.chart.unsubscribeCrosshairMove(this.handleCrosshair);
    this.chart
      .timeScale()
      .unsubscribeVisibleLogicalRangeChange(this.handleRangeChange);
    this.chart.remove();
    this.series = null;
    this.bars = [];
    this.timeIndex = new Map();
    this.timeline = buildTimeline([]);
  }
}

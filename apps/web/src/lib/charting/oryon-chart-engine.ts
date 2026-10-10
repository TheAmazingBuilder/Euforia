"use client";

import {
  CandlestickSeries,
  CrosshairMode,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle } from "@cosmoz/shared";

import { getChartTheme } from "@/lib/utils/chart-theme";

/**
 * Oryon chart-engine boundary — TradingView Lightweight Charts v5.
 *
 * Rendering foundation per the Oryon Phase 1 decision (cahier des charges §8):
 * Lightweight Charts is the SANCTIONED price-chart library of this repo
 * (AGENTS.md stack — "TradingView Lightweight Charts free version (price
 * charts)"), installed as the smallest justified dependency change and used
 * through this single adapter so the workspace components never touch the
 * library directly.
 *
 * Scope discipline (Phase 1):
 *   - chart creation / disposal, theming via getChartTheme() (NEVER hardcoded
 *     hex — AGENTS.md golden rule), candlestick + line series, tick→candle
 *     merge into the last bucket, crosshair inspection, magnet toggle,
 *     go-to-latest.
 *   - NO drawing tools, NO indicators, NO panes, NO position overlays — the
 *     adapter is deliberately narrow; future phases extend it without a
 *     rewrite.
 *
 * Library facts honored:
 *   - v5 API: series are added with chart.addSeries(CandlestickSeries, …)
 *     (the v4 addCandlestickSeries API is gone).
 *   - The TradingView attribution logo stays ON (library default) — license
 *     compliance; we do not hide or restyle it.
 *   - autoSize: true — the library owns container resizing via its own
 *     ResizeObserver; no second observer is created here.
 *   - SSR: mount() is only ever called from a client effect; nothing here
 *     touches the DOM at module scope.
 */

export type OryonChartType = "candles" | "line";

/** Bar handed to the legend on crosshair inspection (raw candle shape). */
export type OryonCrosshairBar = Pick<Candle, "t" | "o" | "h" | "l" | "c">;

export class OryonChartEngine {
  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<"Candlestick"> | null = null;
  private lineSeries: ISeriesApi<"Line"> | null = null;
  private chartType: OryonChartType = "candles";
  private candles: Candle[] = [];
  private digits = 2;
  private intervalMs = 300_000;
  private crosshairHandler: ((bar: OryonCrosshairBar | null) => void) | null = null;

  /** True once mount() succeeded (guards every later call). */
  get isMounted(): boolean {
    return this.chart !== null;
  }

  /** Creates the chart + the default candlestick series. Idempotent. */
  mount(container: HTMLElement): void {
    if (this.chart !== null) return;
    const theme = getChartTheme();

    this.chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: theme.surface },
        textColor: theme.textPrimary,
        fontFamily: theme.monoFont,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: theme.border },
        horzLines: { color: theme.border },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.textMuted, labelBackgroundColor: theme.accent },
        horzLine: { color: theme.textMuted, labelBackgroundColor: theme.accent },
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, this.candleStyle());
    this.chart.subscribeCrosshairMove(this.handleCrosshairMove);
    this.rebuildSeriesData();
  }

  /** Removes the chart instance and every internal reference. */
  destroy(): void {
    if (this.chart === null) return;
    this.chart.unsubscribeCrosshairMove(this.handleCrosshairMove);
    this.chart.remove();
    this.chart = null;
    this.candleSeries = null;
    this.lineSeries = null;
    this.candles = [];
    this.crosshairHandler = null;
  }

  /**
   * Re-applies theme-resolved colors. Called when the active Euphoria theme
   * changes (canvas engines cannot resolve CSS variables themselves).
   */
  applyTheme(): void {
    if (this.chart === null) return;
    const theme = getChartTheme();
    this.chart.applyOptions({
      layout: {
        background: { color: theme.surface },
        textColor: theme.textPrimary,
        fontFamily: theme.monoFont,
      },
      grid: {
        vertLines: { color: theme.border },
        horzLines: { color: theme.border },
      },
      crosshair: {
        vertLine: { color: theme.textMuted, labelBackgroundColor: theme.accent },
        horzLine: { color: theme.textMuted, labelBackgroundColor: theme.accent },
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
    });
    this.candleSeries?.applyOptions(this.candleStyle());
    this.lineSeries?.applyOptions({ color: theme.accent });
  }

  /**
   * Replaces the full history. `fit` scrolls the whole range into view
   * (symbol / timeframe change); background refetches pass fit=false to keep
   * the user's viewport and just follow the latest bar.
   */
  setCandles(candles: Candle[], digits: number, intervalMs: number, fit: boolean): void {
    this.candles = candles;
    this.digits = digits;
    this.intervalMs = intervalMs;
    if (this.chart === null) return;
    this.chart.timeScale().applyOptions({ timeVisible: intervalMs < 86_400_000 });
    this.rebuildSeriesData();
    if (fit) this.chart.timeScale().fitContent();
  }

  /** Switches the rendered series type without touching the data window. */
  setChartType(type: OryonChartType): void {
    if (this.chart === null || type === this.chartType) return;
    this.chartType = type;
    if (this.candleSeries !== null) {
      this.chart.removeSeries(this.candleSeries);
      this.candleSeries = null;
    }
    if (this.lineSeries !== null) {
      this.chart.removeSeries(this.lineSeries);
      this.lineSeries = null;
    }
    if (type === "candles") {
      this.candleSeries = this.chart.addSeries(CandlestickSeries, this.candleStyle());
    } else {
      this.lineSeries = this.chart.addSeries(LineSeries, { color: getChartTheme().accent, lineWidth: 2 });
    }
    this.rebuildSeriesData();
    this.chart.timeScale().scrollToRealTime();
  }

  /**
   * Live tick → candle merge (the reimplemented RF-03): the tick lands in the
   * current bucket (updates close, widens high/low) or opens the next bucket.
   * Ticks older than the last bucket are ignored. Cheap enough at feed rate
   * (≤2 Hz): at most one small array copy + one series.update — no React
   * state involved, so the workspace does NOT re-render per tick.
   */
  applyTick(price: number, tsMs: number): boolean {
    if (this.candles.length === 0) return false;
    const last = this.candles[this.candles.length - 1]!;
    const bucket = tsMs - (tsMs % this.intervalMs);
    if (bucket < last.t) return false;

    if (bucket === last.t) {
      const merged: Candle = {
        ...last,
        h: Math.max(last.h, price),
        l: Math.min(last.l, price),
        c: price,
      };
      this.candles = [...this.candles.slice(0, -1), merged];
      this.updateSeries(merged);
      return true;
    }

    const opened: Candle = { t: bucket, o: price, h: price, l: price, c: price, v: 0 };
    this.candles = [...this.candles, opened];
    this.updateSeries(opened);
    return true;
  }

  /** Latest candle the engine holds (legend fallback when not hovering). */
  get lastBar(): OryonCrosshairBar | null {
    const last = this.candles[this.candles.length - 1];
    return last ? { t: last.t, o: last.o, h: last.h, l: last.l, c: last.c } : null;
  }

  /** Registers the crosshair-inspection callback (legend OHLC). */
  onCrosshair(handler: (bar: OryonCrosshairBar | null) => void): void {
    this.crosshairHandler = handler;
  }

  /** Crosshair magnet on/off (real engine option — the rail's honest toggle). */
  setMagnet(on: boolean): void {
    if (this.chart === null) return;
    this.chart.applyOptions({ crosshair: { mode: on ? CrosshairMode.Magnet : CrosshairMode.Normal } });
  }

  /** Scrolls the viewport back to the newest bar ("return to latest"). */
  goToLatest(): void {
    if (this.chart === null) return;
    this.chart.timeScale().scrollToRealTime();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private candleStyle() {
    const theme = getChartTheme();
    const minMove = 10 ** -this.digits;
    return {
      upColor: theme.profit,
      downColor: theme.loss,
      borderUpColor: theme.profit,
      borderDownColor: theme.loss,
      wickUpColor: theme.profit,
      wickDownColor: theme.loss,
      priceFormat: { type: "price" as const, precision: this.digits, minMove },
    };
  }

  private updateSeries(candle: Candle): void {
    if (this.chartType === "candles" && this.candleSeries !== null) {
      this.candleSeries.update(this.toCandlestickBar(candle));
    } else if (this.chartType === "line" && this.lineSeries !== null) {
      this.lineSeries.update(this.toLineBar(candle));
    }
  }

  private rebuildSeriesData(): void {
    if (this.chartType === "candles" && this.candleSeries !== null) {
      this.candleSeries.setData(this.candles.map(this.toCandlestickBar));
    } else if (this.chartType === "line" && this.lineSeries !== null) {
      this.lineSeries.setData(this.candles.map(this.toLineBar));
    }
  }

  private toCandlestickBar = (candle: Candle): CandlestickData<UTCTimestamp> => ({
    time: (candle.t / 1000) as UTCTimestamp,
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
  });

  private toLineBar = (candle: Candle): LineData<UTCTimestamp> => ({
    time: (candle.t / 1000) as UTCTimestamp,
    value: candle.c,
  });

  private handleCrosshairMove = (param: { time?: unknown; point?: { x: number; y: number } | null }): void => {
    if (this.crosshairHandler === null) return;
    if (param.time === undefined || param.point === undefined || param.point === null) {
      this.crosshairHandler(this.lastBar);
      return;
    }
    const timeSec = typeof param.time === "number" ? param.time : NaN;
    const bar = this.candles.find((c) => c.t / 1000 === timeSec);
    this.crosshairHandler(bar ? { t: bar.t, o: bar.o, h: bar.h, l: bar.l, c: bar.c } : null);
  };
}

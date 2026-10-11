"use client";

import {
  CandlestickSeries,
  CrosshairMode,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesPrimitive,
  type LineData,
  type Logical,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle, OryonIndicatorInstance } from "@cosmoz/shared";

import {
  OryonIndicatorSeriesManager,
  type ManagedIndicatorValue,
} from "@/lib/charting/oryon-indicator-series";
import {
  OryonPositionOverlayManager,
} from "@/lib/charting/oryon-position-overlays";
import { OryonAlertOverlayManager } from "@/lib/charting/oryon-alert-overlays";
import type { PositionLineSpec } from "@/lib/oryon/positions/overlay";
import type { AlertLineSpec } from "@/lib/oryon/alerts/overlay";
import {
  findBarContainingTime,
  createEchoGuard,
  type EchoGuard,
  type SyncRange,
} from "@/lib/oryon/sync/alignment";
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
 * Scope discipline (Phase 1 + Phase 3):
 *   - chart creation / disposal, theming via getChartTheme() (NEVER hardcoded
 *     hex — AGENTS.md golden rule), candlestick + line series, tick→candle
 *     merge into the last bucket, crosshair inspection, magnet toggle,
 *     go-to-latest.
 *   - Phase 3: indicator series management (overlays in pane 0, RSI/MACD/
 *     ATR/Volume in NATIVE v5 panes) delegated to
 *     OryonIndicatorSeriesManager — the engine forwards data/theme/tick
 *     events but owns no indicator math.
 *   - Phase 4: open-position overlays (entry/SL/TP price lines, read-only —
 *     library price lines are non-interactive by construction) delegated to
 *     OryonPositionOverlayManager; the engine owns the series-lifecycle
 *     re-homing (chart-type switch) and theme restyling.
 *   - Phase 7: synchronization surface — visible-range get/apply/subscribe
 *     and timestamp-based crosshair positioning with echo guards, so the
 *     sync coordinator can align charts without re-entry loops. NO drawing
 *     tools (owned by the drawing primitive) — the adapter stays narrow;
 *     phases extend it without a rewrite.
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

/**
 * Bar handed to the legend on crosshair inspection (raw candle shape).
 * Phase 5: `v` (volume) joins the payload — the legend decides honestly
 * whether to display it (valid positive values only; the locally-merged
 * forming candle reports 0 until the server refetch).
 */
export type OryonCrosshairBar = Pick<Candle, "t" | "o" | "h" | "l" | "c" | "v">;

/**
 * Drawing-domain conversion facade (Phase 2 spec §4B — coordinate layer).
 *
 * Screen space: CSS pixels relative to the chart PANE (plot area) top-left.
 * Domain space: unix seconds + raw price. Every method is null-safe — the
 * callers MUST handle null explicitly (no arbitrary substitutes, spec §6).
 *
 * Why the LOGICAL pipeline instead of timeToCoordinate(): Lightweight
 * Charts maps TIME→X only for times that exactly match a loaded bar. A
 * 5m-anchored drawing viewed on 1D (or panned between bars) would vanish.
 * Logical indexes are CONTINUOUS, so the engine interpolates the bar index
 * for an arbitrary time (binary search over the loaded candles) and lets
 * the time scale project logical→X with its own spacing. Anchors are always
 * snapped to a real bar time on creation, so the store↔screen round trip is
 * deterministic on any timeframe.
 */
export interface OryonDrawingConversions {
  /** Bar time (unix sec) → pane X (CSS px, may be off-screen). */
  timeToX(timeSec: number): number | null;
  /** Pointer X → SNAPPED bar time (unix sec) for anchor creation. */
  xToSnappedTimeSec(x: number): number | null;
  /** Continuous logical bar index → pane X. */
  logicalToX(logical: number): number | null;
  /** Pointer X → continuous logical bar index. */
  xToLogical(x: number): number | null;
  /** Bar time (unix sec) → continuous logical index (interpolated). */
  timeSecToLogical(timeSec: number): number | null;
  /** Continuous logical index → interpolated time (unix sec, unsnapped). */
  logicalToTimeSec(logical: number): number | null;
  /** Continuous logical index → SNAPPED bar time (clamped into loaded bars). */
  logicalToSnappedTimeSec(logical: number): number | null;
  /** Raw price → pane Y (CSS px). */
  priceToY(price: number): number | null;
  /** Pane Y (CSS px) → raw price. */
  yToPrice(y: number): number | null;
  /** Current interval in ms (snap tolerance + measure Δbars). */
  getIntervalMs(): number;
  /** Number of loaded bars (0 = nothing to project against). */
  getBarCount(): number;
}

export class OryonChartEngine {
  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<"Candlestick"> | null = null;
  private lineSeries: ISeriesApi<"Line"> | null = null;
  private chartType: OryonChartType = "candles";
  private candles: Candle[] = [];
  private digits = 2;
  private intervalMs = 300_000;
  private crosshairHandler: ((bar: OryonCrosshairBar | null) => void) | null = null;
  /** Drawing overlay primitive — re-attached whenever the series is rebuilt. */
  private drawingsPrimitive: ISeriesPrimitive<UTCTimestamp> | null = null;
  /** Indicator series manager (Phase 3) — created with the chart. */
  private indicators: OryonIndicatorSeriesManager | null = null;
  /** Position overlay manager (Phase 4) — created with the chart. */
  private positions: OryonPositionOverlayManager | null = null;
  /** Alert overlay manager (Phase 5) — created with the chart. */
  private alerts: OryonAlertOverlayManager | null = null;
  /** Sync surface (Phase 7) — raw listeners + programmatic-apply guards. */
  private rangeListeners = new Set<(range: SyncRange | null) => void>();
  private crosshairListeners = new Set<(timeSec: number | null) => void>();
  private rangeEcho: EchoGuard = createEchoGuard();
  private crosshairEcho: EchoGuard = createEchoGuard();
  private applyingRange = false;
  private applyingCrosshair = false;

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
    this.indicators = new OryonIndicatorSeriesManager(this.chart);
    this.positions = new OryonPositionOverlayManager();
    this.positions.setSeries(this.candleSeries);
    this.alerts = new OryonAlertOverlayManager();
    this.alerts.setSeries(this.candleSeries);
    this.attachDrawingsToActiveSeries();
    this.chart.subscribeCrosshairMove(this.handleCrosshairMove);
    this.chart.timeScale().subscribeVisibleTimeRangeChange(this.handleVisibleRangeChange);
    this.rebuildSeriesData();
  }

  /** Registers the drawing overlay. Re-attached automatically when the
   *  active series is rebuilt (chart type switch) — the primitive never
   *  dies silently with its host series. */
  attachDrawings(primitive: ISeriesPrimitive<UTCTimestamp>): void {
    this.drawingsPrimitive = primitive;
    this.attachDrawingsToActiveSeries();
  }

  /** Unregisters the drawing overlay (component unmount). */
  detachDrawings(primitive: ISeriesPrimitive<UTCTimestamp>): void {
    if (this.drawingsPrimitive !== primitive) return;
    const series = this.activeSeries();
    if (series !== null) {
      try {
        series.detachPrimitive(
          primitive as unknown as Parameters<ISeriesApi<"Candlestick">["detachPrimitive"]>[0],
        );
      } catch {
        // Already detached with a removed series — nothing to clean up.
      }
    }
    this.drawingsPrimitive = null;
  }

  /** Removes the chart instance and every internal reference. */
  destroy(): void {
    if (this.chart === null) return;
    this.chart.unsubscribeCrosshairMove(this.handleCrosshairMove);
    this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.handleVisibleRangeChange);
    this.rangeListeners.clear();
    this.crosshairListeners.clear();
    this.indicators?.destroy();
    this.indicators = null;
    this.positions?.destroy();
    this.positions = null;
    this.alerts?.destroy();
    this.alerts = null;
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
    this.indicators?.restyle({ digits: this.digits, theme });
    this.positions?.restyle(theme);
    this.alerts?.restyle(theme);
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
    // Indicator datasets follow the displayed window (history load, symbol
    // or timeframe switch, background refetch).
    this.indicators?.rebuild(candles, { digits, theme: getChartTheme() });
    if (fit) this.chart.timeScale().fitContent();
  }

  /**
   * Structural indicator sync (Phase 3) — create/update/remove indicator
   * series + panes to mirror the instance list. Full data rebuild included.
   */
  setIndicators(instances: readonly OryonIndicatorInstance[]): void {
    if (this.chart === null || this.indicators === null) return;
    this.indicators.sync(instances, this.candles, {
      digits: this.digits,
      theme: getChartTheme(),
    });
  }

  /** Legend subscription — latest valid value per indicator output. */
  onIndicatorValues(handler: (values: readonly ManagedIndicatorValue[]) => void): void {
    if (this.indicators === null) return;
    this.indicators.onValues(handler);
  }

  /**
   * Structural position-overlay sync (Phase 4) — mirrors the validated
   * position set of the ACTIVE instrument onto price lines. Specs are
   * remembered even while the series is being rebuilt (chart-type switch),
   * then replayed — overlays survive type switches without caller action.
   */
  setPositions(specs: readonly PositionLineSpec[]): void {
    if (this.chart === null || this.positions === null) return;
    this.positions.sync(specs, getChartTheme());
  }

  /**
   * Structural alert-overlay sync (Phase 5) — mirrors the ACTIVE alerts of
   * the displayed instrument onto price lines. Specs are remembered across
   * series rebuilds (chart-type switch) and replayed — the overlay survives
   * type switches without caller action.
   */
  setAlerts(specs: readonly AlertLineSpec[]): void {
    if (this.chart === null || this.alerts === null) return;
    this.alerts.sync(specs, getChartTheme());
  }

  /**
   * Indicator readings AT one bar-open time (Phase 5 crosshair §5) — exact
   * lookup on the manager's calculations; empty when nothing is computed
   * there (honest omission, never an interpolation).
   */
  indicatorValuesAtTime(timeSec: number): readonly ManagedIndicatorValue[] {
    if (this.indicators === null) return [];
    return this.indicators.valuesAtTime(timeSec);
  }

  /** Switches the rendered series type without touching the data window. */
  setChartType(type: OryonChartType): void {
    if (this.chart === null || type === this.chartType) return;
    this.chartType = type;
    // Pane-0 survival: the main series is pane 0's ONLY data source, and
    // LWC v5 auto-removes an empty pane on removeSeries
    // (cleanupIfPaneIsEmpty) — the indicator panes would lose their anchor
    // and the rebuilt main series would land in the wrong pane. Preserve
    // pane 0 across the rebuild, then restore the default semantics.
    const paneZero = this.chart.panes()[0];
    paneZero?.setPreserveEmptyPane(true);
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
    paneZero?.setPreserveEmptyPane(false);
    this.attachDrawingsToActiveSeries();
    this.positions?.setSeries(this.activeSeries());
    this.alerts?.setSeries(this.activeSeries());
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
      this.updateIndicatorLastPoints();
      return true;
    }

    const opened: Candle = { t: bucket, o: price, h: price, l: price, c: price, v: 0 };
    this.candles = [...this.candles, opened];
    this.updateSeries(opened);
    this.updateIndicatorLastPoints();
    return true;
  }

  /** Latest candle the engine holds (legend fallback when not hovering). */
  get lastBar(): OryonCrosshairBar | null {
    const last = this.candles[this.candles.length - 1];
    return last ? { t: last.t, o: last.o, h: last.h, l: last.l, c: last.c, v: last.v } : null;
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

  // ── synchronization surface (Phase 7 — coordinator adapter) ────────────

  /** Current visible time range (unix seconds), or null when no data. */
  getVisibleRange(): SyncRange | null {
    if (this.chart === null) return null;
    const range = this.chart.timeScale().getVisibleRange();
    if (range === null) return null;
    const from = Number(range.from);
    const to = Number(range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return { from, to };
  }

  /** Programmatic visible-range apply (echo-guarded — see the coordinator). */
  applyVisibleRange(range: SyncRange): void {
    if (this.chart === null) return;
    this.applyingRange = true;
    try {
      this.chart.timeScale().setVisibleRange({
        from: range.from as UTCTimestamp,
        to: range.to as UTCTimestamp,
      });
      this.rangeEcho.mark(range);
    } finally {
      this.applyingRange = false;
    }
  }

  /** Subscribes a sync listener to visible-range changes. Returns the
   *  unsubscribe function (cleaned up automatically on destroy). */
  onVisibleRangeChange(handler: (range: SyncRange | null) => void): () => void {
    this.rangeListeners.add(handler);
    return () => {
      this.rangeListeners.delete(handler);
    };
  }

  /**
   * Moves the crosshair onto the bar CONTAINING `timeSec` (timestamp-based
   * alignment — never pixel positions). The vertical line lands on that
   * bar; the horizontal line sits at the bar's CLOSE (a real value of this
   * chart's data — never a fabricated level). False = the timestamp falls
   * in a session gap or outside the loaded span: nothing moved (the caller
   * decides whether to clear — the coordinator does).
   */
  applyCrosshairAtTime(timeSec: number): boolean {
    if (this.chart === null) return false;
    const bar = findBarContainingTime(this.candles, timeSec, this.intervalMs);
    if (bar === null) return false;
    const series = this.activeSeries();
    if (series === null) return false;
    this.applyingCrosshair = true;
    try {
      this.chart.setCrosshairPosition(bar.c, (bar.t / 1000) as UTCTimestamp, series);
      this.crosshairEcho.mark(bar.t / 1000);
    } finally {
      this.applyingCrosshair = false;
    }
    return true;
  }

  /** Removes the crosshair (programmatic — echo-guarded). */
  clearCrosshairPosition(): void {
    if (this.chart === null) return;
    this.applyingCrosshair = true;
    try {
      this.chart.clearCrosshairPosition();
      this.crosshairEcho.mark(null);
    } finally {
      this.applyingCrosshair = false;
    }
  }

  /** Subscribes a sync listener to crosshair movements. The payload is the
   *  hovered bar time (unix seconds) or null when the crosshair left the
   *  plot area. Returns the unsubscribe function. */
  onCrosshairTime(handler: (timeSec: number | null) => void): () => void {
    this.crosshairListeners.add(handler);
    return () => {
      this.crosshairListeners.delete(handler);
    };
  }

  // ── drawing coordinate facade (OryonDrawingConversions) ────────────────────

  /** Implements the drawing-domain conversion contract (null-safe). */
  readonly conversions: OryonDrawingConversions = {
    timeToX: (timeSec: number): number | null => {
      const logical = this.timeSecToLogical(timeSec);
      if (logical === null) return null;
      return this.logicalIndexToX(logical);
    },
    xToSnappedTimeSec: (x: number): number | null => {
      if (this.chart === null || this.candles.length === 0) return null;
      const logical = this.chart.timeScale().coordinateToLogical(x as Logical);
      if (logical === null) return null;
      const index = Math.max(0, Math.min(this.candles.length - 1, Math.round(logical)));
      return this.candles[index]!.t / 1000;
    },
    logicalToX: (logical: number): number | null => this.logicalIndexToX(logical),
    xToLogical: (x: number): number | null => {
      if (this.chart === null || this.candles.length === 0) return null;
      const logical = this.chart.timeScale().coordinateToLogical(x as Logical);
      return logical === null ? null : (logical as number);
    },
    timeSecToLogical: (timeSec: number): number | null => this.timeSecToLogical(timeSec),
    logicalToTimeSec: (logical: number): number | null => {
      const candles = this.candles;
      if (candles.length === 0) return null;
      if (candles.length === 1) return candles[0]!.t / 1000;
      const last = candles.length - 1;
      if (logical <= 0) {
        // Linear extrapolation on the first spacing (keeps pre-data geometry stable).
        return candles[0]!.t / 1000 + logical * (this.intervalMs / 1000);
      }
      if (logical >= last) {
        return candles[last]!.t / 1000 + (logical - last) * (this.intervalMs / 1000);
      }
      const i = Math.floor(logical);
      const frac = logical - i;
      const t0 = candles[i]!.t;
      const t1 = candles[i + 1]!.t;
      return (t0 + frac * (t1 - t0)) / 1000;
    },
    logicalToSnappedTimeSec: (logical: number): number | null => {
      const candles = this.candles;
      if (candles.length === 0 || !Number.isFinite(logical)) return null;
      const index = Math.max(0, Math.min(candles.length - 1, Math.round(logical)));
      return candles[index]!.t / 1000;
    },
    priceToY: (price: number): number | null => {
      const series = this.activeSeries();
      if (series === null) return null;
      const y = series.priceToCoordinate(price);
      return y === null ? null : (y as number);
    },
    yToPrice: (y: number): number | null => {
      const series = this.activeSeries();
      if (series === null) return null;
      const price = series.coordinateToPrice(y as number);
      return price === null ? null : (price as number);
    },
    getIntervalMs: (): number => this.intervalMs,
    getBarCount: (): number => this.candles.length,
  };

  /**
   * Dev-probe handle (window.__ORYON_CHART_DEBUG__, dev builds only): the
   * number of live series + native panes — structural assertions without
   * scraping the canvas.
   */
  get debugStats(): { series: number; panes: number; priceLines: number; alertLines: number } | null {
    if (this.chart === null) return null;
    const main = (this.candleSeries !== null ? 1 : 0) + (this.lineSeries !== null ? 1 : 0);
    const managed = this.indicators?.stats ?? { series: 0, panes: 1 };
    return {
      series: main + managed.series,
      panes: managed.panes,
      priceLines: this.positions?.count ?? 0,
      alertLines: this.alerts?.count ?? 0,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** Tick path: refresh the FORMING bar of every indicator (spec §10). */
  private updateIndicatorLastPoints(): void {
    if (this.indicators === null || this.candles.length === 0) return;
    this.indicators.updateLast(this.candles, {
      digits: this.digits,
      theme: getChartTheme(),
    });
  }

  /** Continuous logical index → pane X (the time scale's own spacing). */
  private logicalIndexToX(logical: number): number | null {
    if (this.chart === null || this.candles.length === 0) return null;
    const x = this.chart.timeScale().logicalToCoordinate(logical as Logical);
    return x === null ? null : (x as number);
  }

  /** Re-attaches the drawing primitive to the CURRENTLY active series. */
  private attachDrawingsToActiveSeries(): void {
    const primitive = this.drawingsPrimitive;
    if (primitive === null) return;
    const series = this.activeSeries();
    if (series === null) return;
    try {
      // The engine stores UTC-timestamp primitives; the library's generic
      // default is Time — this cast is the documented boundary (our series
      // data is ALWAYS UTCTimestamp, see toCandlestickBar/toLineBar).
      series.attachPrimitive(primitive as unknown as Parameters<ISeriesApi<"Candlestick">["attachPrimitive"]>[0]);
    } catch {
      // Attaching the same primitive twice is an upstream error we survive.
    }
  }

  private activeSeries(): ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null {
    if (this.chartType === "candles") return this.candleSeries;
    return this.lineSeries;
  }

  /** Bar time (unix sec) → continuous logical index (binary search + interp). */
  private timeSecToLogical(timeSec: number): number | null {
    const candles = this.candles;
    if (candles.length === 0 || !Number.isFinite(timeSec)) return null;
    if (candles.length === 1) return 0;
    const ms = timeSec * 1000;
    const first = candles[0]!.t;
    const last = candles[candles.length - 1]!.t;
    if (ms <= first) {
      // Extrapolate before the first bar on the actual first spacing.
      const spacing = candles.length > 1 ? candles[1]!.t - first : this.intervalMs;
      return (ms - first) / spacing;
    }
    if (ms >= last) {
      const spacing =
        candles.length > 1 ? last - candles[candles.length - 2]!.t : this.intervalMs;
      return (candles.length - 1) + (ms - last) / spacing;
    }
    // Binary search: greatest i with candles[i].t <= ms.
    let lo = 0;
    let hi = candles.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (candles[mid]!.t <= ms) lo = mid;
      else hi = mid;
    }
    const span = candles[hi]!.t - candles[lo]!.t;
    const frac = span === 0 ? 0 : (ms - candles[lo]!.t) / span;
    return lo + frac;
  }

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
    const timeSec = typeof param.time === "number" ? param.time : null;
    // Sync dispatch — programmatic applies are suppressed (they marked the
    // echo guard synchronously inside applyCrosshairAtTime/clear).
    if (!this.applyingCrosshair && !this.crosshairEcho.matches(timeSec)) {
      for (const listener of this.crosshairListeners) listener(timeSec);
    }
    if (this.crosshairHandler === null) return;
    if (param.time === undefined || param.point === undefined || param.point === null) {
      this.crosshairHandler(this.lastBar);
      return;
    }
    const bar = this.candles.find((c) => c.t / 1000 === timeSec);
    this.crosshairHandler(bar ? { t: bar.t, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v } : null);
  };

  private handleVisibleRangeChange = (param: { from: unknown; to: unknown } | null): void => {
    if (this.applyingRange) return;
    let range: SyncRange | null = null;
    if (param !== null) {
      const from = Number(param.from);
      const to = Number(param.to);
      if (Number.isFinite(from) && Number.isFinite(to)) range = { from, to };
    }
    if (range !== null && this.rangeEcho.matches(range)) return;
    for (const listener of this.rangeListeners) listener(range);
  };
}

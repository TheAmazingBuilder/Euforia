import {
  HistogramSeries,
  LineSeries,
  LineStyle,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type LineWidth,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle, OryonIndicatorInstance } from "@cosmoz/shared";

import {
  calculateIndicator,
  type IndicatorCalculation,
  type IndicatorOutputId,
} from "@/lib/oryon/indicators/calculate";
import { indicatorIndexOfTime, indicatorValuesAtIndex } from "@/lib/oryon/indicators/lookup";
import {
  INDICATOR_COLOR_TOKENS,
  INDICATOR_REGISTRY,
} from "@/lib/oryon/indicators/registry";
import { indicatorRuleError } from "@/lib/oryon/indicators/validation";
import { normalizeCandles } from "@/lib/oryon/indicators/normalize";
import type { ChartTheme } from "@/lib/utils/chart-theme";

/**
 * Indicator chart-integration boundary (Phase 3 spec §4E, §7) — the ONLY
 * module that turns calculated indicator series into Lightweight Charts
 * series. The calculation layer (lib/oryon/indicators) knows nothing about
 * this file; this file owns every LWC concern:
 *
 *  - OVERLAY indicators (SMA/EMA/BB) live in pane 0 on the main price scale;
 *  - PANE indicators (RSI/MACD/ATR/Volume) each get a NATIVE v5 pane
 *    (chart.addSeries(…, paneIndex)) — never pixel offsets, never a second
 *    chart instance;
 *  - structural diff by instance id: create / option-update / destroy,
 *    so adding one indicator never recreates the chart (spec §7);
 *  - hidden instances keep their series with visible:false — toggling
 *    never reassigns panes or disturbs siblings;
 *  - tick updates replace/append ONLY the last point per series
 *    (series.update) after a full (cheap) recalculation — no setData per
 *    tick, no React involvement;
 *  - every color resolves from theme tokens at option-build time (the
 *    golden rule — no hardcoded hex).
 */

export interface IndicatorSyncOptions {
  digits: number;
  theme: ChartTheme;
}

/** Latest-value payload pushed to the legend (one entry per instance). */
export interface ManagedIndicatorValue {
  id: string;
  values: Partial<Record<IndicatorOutputId, number>>;
}

type ValuesHandler = (values: readonly ManagedIndicatorValue[]) => void;

/** A chart-ready point: line or histogram (histogram carries its color). */
type ChartPoint = LineData<UTCTimestamp> | HistogramData<UTCTimestamp>;

interface ManagedEntry {
  instance: OryonIndicatorInstance;
  paneIndex: number;
  series: Partial<Record<IndicatorOutputId, ISeriesApi<SeriesType>>>;
  priceLines: IPriceLine[];
  calc: IndicatorCalculation | null;
  /** Last data time pushed per output (guards series.update monotonicity). */
  lastTimes: Partial<Record<IndicatorOutputId, number>>;
}

const DASH_TO_LWC = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
} as const;

export class OryonIndicatorSeriesManager {
  private entries = new Map<string, ManagedEntry>();
  private valuesHandler: ValuesHandler | null = null;
  private lastCandles: readonly Candle[] = [];
  private lastOptions: IndicatorSyncOptions | null = null;
  private lastPaneCount = -1;

  constructor(private readonly chart: IChartApi) {}

  /** Legend value subscription. Fires immediately with current values. */
  onValues(handler: ValuesHandler): void {
    this.valuesHandler = handler;
    handler(this.currentValues());
  }

  /** Dev-probe handle: managed series count + live pane count. */
  get stats(): { series: number; panes: number } {
    let series = 0;
    for (const entry of this.entries.values()) {
      series += Object.keys(entry.series).length;
    }
    return { series, panes: this.chart.panes().length };
  }

  /**
   * Structural sync: diff the instance list against managed entries, then
   * rebuild every dataset. Panes are assigned by LIST ORDER of pane-category
   * instances (stable regardless of visibility); the main chart stays pane 0.
   */
  sync(
    instances: readonly OryonIndicatorInstance[],
    candles: readonly Candle[],
    opts: IndicatorSyncOptions,
  ): void {
    this.lastCandles = candles;
    this.lastOptions = opts;

    // 1. Destroy dropped or rule-violating instances (never render bad math).
    const nextIds = new Set(instances.map((i) => i.id));
    for (const [id, entry] of this.entries) {
      if (!nextIds.has(id) || indicatorRuleError(entry.instance) !== null) {
        this.destroyEntry(entry);
        this.entries.delete(id);
      }
    }

    // 2. Stable pane assignment over the FULL list (visibility ignored).
    let highestPane = 0;
    const paneOf = new Map<string, number>();
    for (const instance of instances) {
      if (indicatorRuleError(instance) !== null) continue;
      if (INDICATOR_REGISTRY[instance.type].category === "pane") {
        highestPane += 1;
        paneOf.set(instance.id, highestPane);
      } else {
        paneOf.set(instance.id, 0);
      }
    }

    // 3. Create / move / update entries.
    for (const instance of instances) {
      if (indicatorRuleError(instance) !== null) continue;
      const paneIndex = paneOf.get(instance.id)!;
      const existing = this.entries.get(instance.id);
      if (existing !== undefined && existing.paneIndex !== paneIndex) {
        // Pane reassignment (list reorder) — rebuild in the new pane.
        this.destroyEntry(existing);
        this.entries.delete(instance.id);
      }
      if (existing === undefined) {
        this.createEntry(instance, paneIndex, opts);
      } else {
        existing.instance = instance;
        existing.paneIndex = paneIndex;
        this.applyEntryOptions(existing, opts);
      }
    }

    // 4. Layout hygiene: prune trailing empty panes + proportion the panes.
    this.prunePanes(highestPane);
    this.applyStretch();

    // 5. Data for every entry (full rebuild — this is the only setData path).
    this.rebuild(candles, opts);
  }

  /**
   * Full data rebuild (history load, config change, theme with per-point
   * colors). Cheap at feed scale (≤300 candles × ≤7 indicators).
   */
  rebuild(candles: readonly Candle[], opts: IndicatorSyncOptions): void {
    this.lastCandles = candles;
    this.lastOptions = opts;
    if (this.entries.size === 0) return;
    const normalized = normalizeCandles(candles);
    for (const entry of this.entries.values()) {
      entry.calc = calculateIndicator(entry.instance, normalized);
      entry.lastTimes = {};
      for (const [outputId, series] of Object.entries(entry.series) as [
        IndicatorOutputId,
        ISeriesApi<SeriesType>,
      ][]) {
        const points = this.buildPoints(entry, outputId, normalized, opts.theme);
        series.setData(points);
        const last = points[points.length - 1];
        if (last !== undefined) entry.lastTimes[outputId] = last.time as number;
      }
    }
    this.emitValues();
  }

  /**
   * Tick-path update (called from the engine's applyTick — ≤2 Hz): recompute
   * (pure, cheap) then push ONLY the last point per output through
   * series.update — no setData, no flicker, no React render.
   */
  updateLast(candles: readonly Candle[], opts: IndicatorSyncOptions): void {
    if (this.entries.size === 0) return;
    const normalized = normalizeCandles(candles);
    for (const entry of this.entries.values()) {
      entry.calc = calculateIndicator(entry.instance, normalized);
      for (const [outputId, series] of Object.entries(entry.series) as [
        IndicatorOutputId,
        ISeriesApi<SeriesType>,
      ][]) {
        const seriesValues = entry.calc.outputs[outputId];
        const idx = lastDefinedIndex(seriesValues);
        if (idx < 0) continue;
        const time = entry.calc.times[idx]!;
        const known = entry.lastTimes[outputId];
        // Monotonicity guard — series.update throws on a time regression.
        if (known !== undefined && time < known) continue;
        const point = this.buildPoint(entry, outputId, idx, normalized, opts.theme);
        if (point !== null) {
          series.update(point);
          entry.lastTimes[outputId] = time;
        }
      }
    }
    this.emitValues();
  }

  /** Re-applies resolved theme colors (theme switch) + per-point datasets. */
  restyle(opts: IndicatorSyncOptions): void {
    this.lastOptions = opts;
    for (const entry of this.entries.values()) {
      this.applyEntryOptions(entry, opts);
    }
    // Volume/MACD histogram colors are DATA (per-point) — rebuild them.
    this.rebuild(this.lastCandles, opts);
  }

  /** Destroys every managed entry (engine teardown). */
  destroy(): void {
    for (const entry of this.entries.values()) this.destroyEntry(entry);
    this.entries.clear();
    this.valuesHandler = null;
    this.lastCandles = [];
    this.lastOptions = null;
  }

  currentValues(): readonly ManagedIndicatorValue[] {
    const values: ManagedIndicatorValue[] = [];
    for (const [id, entry] of this.entries) {
      if (entry.calc === null) continue;
      const latest = latestOf(entry.calc);
      values.push({ id, values: latest });
    }
    return values;
  }

  /**
   * Indicator readings AT one bar-open time, unix seconds (Phase 5 crosshair
   * §5). Exact-time lookup on the calculation's own `times` — the crosshair
   * always reports a loaded bar's open time, so an exact match is the honest
   * contract; anything else (uncomputed bar, warm-up nulls) yields NO value
   * for that output rather than an interpolation. Never throws.
   */
  valuesAtTime(timeSec: number): readonly ManagedIndicatorValue[] {
    const values: ManagedIndicatorValue[] = [];
    if (!Number.isFinite(timeSec)) return values;
    for (const [id, entry] of this.entries) {
      if (entry.calc === null) continue;
      const index = indicatorIndexOfTime(entry.calc, timeSec);
      if (index < 0) continue;
      const at = indicatorValuesAtIndex(entry.calc, index);
      if (at !== null) values.push({ id, values: at });
    }
    return values;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private createEntry(
    instance: OryonIndicatorInstance,
    paneIndex: number,
    opts: IndicatorSyncOptions,
  ): void {
    const series: Partial<Record<IndicatorOutputId, ISeriesApi<SeriesType>>> = {};
    switch (instance.type) {
      case "sma":
      case "ema":
      case "rsi":
      case "atr":
        series.line = this.chart.addSeries(
          LineSeries,
          {
            priceFormat: this.priceFormat(instance.type, opts.digits),
            lastValueVisible: false,
            priceLineVisible: false,
          },
          paneIndex,
        );
        break;
      case "bbands":
        series.basis = this.chart.addSeries(
          LineSeries,
          { priceFormat: this.priceFormat("sma", opts.digits), lastValueVisible: false, priceLineVisible: false },
          paneIndex,
        );
        series.upper = this.chart.addSeries(
          LineSeries,
          { priceFormat: this.priceFormat("sma", opts.digits), lastValueVisible: false, priceLineVisible: false },
          paneIndex,
        );
        series.lower = this.chart.addSeries(
          LineSeries,
          { priceFormat: this.priceFormat("sma", opts.digits), lastValueVisible: false, priceLineVisible: false },
          paneIndex,
        );
        break;
      case "macd":
        series.macd = this.chart.addSeries(
          LineSeries,
          { priceFormat: this.priceFormat("macd", opts.digits), lastValueVisible: false, priceLineVisible: false },
          paneIndex,
        );
        series.signal = this.chart.addSeries(
          LineSeries,
          { priceFormat: this.priceFormat("macd", opts.digits), lastValueVisible: false, priceLineVisible: false },
          paneIndex,
        );
        series.histogram = this.chart.addSeries(
          HistogramSeries,
          { priceFormat: this.priceFormat("macd", opts.digits), base: 0 },
          paneIndex,
        );
        break;
      case "volume":
        series.volume = this.chart.addSeries(
          HistogramSeries,
          { priceFormat: { type: "volume", precision: 0, minMove: 1 } },
          paneIndex,
        );
        break;
    }
    const entry: ManagedEntry = {
      instance,
      paneIndex,
      series,
      priceLines: [],
      calc: null,
      lastTimes: {},
    };
    this.entries.set(instance.id, entry);
    this.applyEntryOptions(entry, opts);
  }

  /** Style/visibility/price-line options — colors resolved from tokens NOW. */
  private applyEntryOptions(entry: ManagedEntry, opts: IndicatorSyncOptions): void {
    const { instance, series } = entry;
    const visible = instance.visible;

    switch (instance.type) {
      case "sma":
      case "ema":
      case "atr": {
        series.line?.applyOptions({
          visible,
          color: resolveColor(instance.style.color, opts.theme),
          lineWidth: instance.style.width as LineWidth,
          lineStyle: DASH_TO_LWC[instance.style.dash],
        });
        break;
      }
      case "rsi": {
        series.line?.applyOptions({
          visible,
          color: resolveColor(instance.style.color, opts.theme),
          lineWidth: instance.style.width as LineWidth,
          lineStyle: DASH_TO_LWC[instance.style.dash],
        });
        this.syncRsiPriceLines(entry, opts);
        break;
      }
      case "bbands": {
        const color = resolveColor(instance.style.color, opts.theme);
        series.basis?.applyOptions({
          visible,
          color,
          lineWidth: instance.style.width as LineWidth,
          lineStyle: DASH_TO_LWC[instance.style.dash],
        });
        for (const band of ["upper", "lower"] as const) {
          series[band]?.applyOptions({
            visible,
            color,
            lineWidth: 1 as LineWidth,
            lineStyle: DASH_TO_LWC[instance.style.dash],
          });
        }
        break;
      }
      case "macd": {
        series.macd?.applyOptions({
          visible,
          color: resolveColor(instance.style.color, opts.theme),
          lineWidth: instance.style.width as LineWidth,
          lineStyle: DASH_TO_LWC[instance.style.dash],
        });
        series.signal?.applyOptions({
          visible,
          color: resolveColor(instance.signalStyle.color, opts.theme),
          lineWidth: instance.signalStyle.width as LineWidth,
          lineStyle: DASH_TO_LWC[instance.signalStyle.dash],
        });
        series.histogram?.applyOptions({
          visible,
          // Per-point colors carry the sign; the base color is a token too.
          color: opts.theme.loss,
        });
        break;
      }
      case "volume": {
        series.volume?.applyOptions({ visible });
        break;
      }
    }
  }

  /** RSI reference levels — REAL price lines on the series, not pixels. */
  private syncRsiPriceLines(entry: ManagedEntry, opts: IndicatorSyncOptions): void {
    const series = entry.series.line;
    if (series === undefined) return;
    for (const line of entry.priceLines) {
      try {
        series.removePriceLine(line);
      } catch {
        // Series already gone — nothing to clean.
      }
    }
    entry.priceLines = [];
    if (entry.instance.type !== "rsi") return;
    const color = resolveColor(entry.instance.style.color, opts.theme);
    for (const level of [entry.instance.upper, entry.instance.lower]) {
      entry.priceLines.push(
        series.createPriceLine({
          price: level,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: String(level),
        }),
      );
    }
  }

  private buildPoints(
    entry: ManagedEntry,
    outputId: IndicatorOutputId,
    normalized: readonly Candle[],
    theme: ChartTheme,
  ): ChartPoint[] {
    const calc = entry.calc;
    const values = calc?.outputs[outputId];
    if (calc === undefined || calc === null || values === undefined) return [];
    const points: ChartPoint[] = [];
    for (let i = 0; i < values.length; i += 1) {
      const point = this.buildPoint(entry, outputId, i, normalized, theme);
      if (point !== null) points.push(point);
    }
    return points;
  }

  private buildPoint(
    entry: ManagedEntry,
    outputId: IndicatorOutputId,
    index: number,
    normalized: readonly Candle[],
    theme: ChartTheme,
  ): ChartPoint | null {
    const calc = entry.calc;
    if (calc === null) return null;
    const values = calc.outputs[outputId];
    const value = values === undefined ? undefined : values[index];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const time = calc.times[index] as UTCTimestamp;
    if (outputId === "histogram") {
      return { time, value, color: value >= 0 ? theme.profit : theme.loss };
    }
    if (outputId === "volume") {
      const candle = normalized[index];
      const up = candle !== undefined && candle.c >= candle.o;
      return { time, value, color: up ? theme.profit : theme.loss };
    }
    return { time, value };
  }

  private destroyEntry(entry: ManagedEntry): void {
    for (const series of Object.values(entry.series)) {
      try {
        this.chart.removeSeries(series);
      } catch {
        // Already removed with the chart/pane — nothing to clean.
      }
    }
    entry.series = {};
    entry.priceLines = [];
    entry.calc = null;
  }

  /** Removes trailing empty panes above the highest managed pane index. */
  private prunePanes(highestPane: number): void {
    const panes = this.chart.panes();
    for (let i = panes.length - 1; i > highestPane; i -= 1) {
      try {
        this.chart.removePane(i);
      } catch {
        // Upstream auto-removed the empty pane — fine.
      }
    }
  }

  /** Main pane keeps 3× the height of each indicator pane. */
  private applyStretch(): void {
    const panes = this.chart.panes();
    if (panes.length === this.lastPaneCount) return;
    this.lastPaneCount = panes.length;
    panes.forEach((pane, i) => {
      try {
        pane.setStretchFactor(i === 0 ? 3 : 1);
      } catch {
        // Non-fatal — panes keep their default proportion.
      }
    });
  }

  private priceFormat(
    type: OryonIndicatorInstance["type"],
    digits: number,
  ): { type: "price"; precision: number; minMove: number } {
    // RSI is scale-bound (0..100); everything else uses instrument precision.
    const precision = type === "rsi" ? 2 : Math.max(digits, 0);
    return { type: "price", precision, minMove: 10 ** -precision };
  }

  private emitValues(): void {
    if (this.valuesHandler === null) return;
    this.valuesHandler(this.currentValues());
  }
}

function lastDefinedIndex(values: (number | null)[] | undefined): number {
  if (values === undefined) return -1;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (typeof values[i] === "number") return i;
  }
  return -1;
}

function latestOf(calc: IndicatorCalculation): Partial<Record<IndicatorOutputId, number>> {
  const out: Partial<Record<IndicatorOutputId, number>> = {};
  for (const [key, values] of Object.entries(calc.outputs) as [
    IndicatorOutputId,
    (number | null)[],
  ][]) {
    const idx = lastDefinedIndex(values);
    if (idx >= 0) out[key] = values[idx]!;
  }
  return out;
}

/**
 * Theme token KEY → resolved color. Unknown keys degrade to the accent —
 * never a crash, never a hardcoded hex.
 */
export function resolveColor(tokenKey: string, theme: ChartTheme): string {
  if (tokenKey === "accent") return theme.accent;
  if (tokenKey === "profit") return theme.profit;
  if (tokenKey === "loss") return theme.loss;
  const idx = INDICATOR_COLOR_TOKENS.indexOf(tokenKey);
  if (idx >= 0) return theme.indicatorPalette[idx] ?? theme.accent;
  return theme.accent;
}

"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle } from "@cosmoz/shared";

import {
  formatSignedDelta,
  type ChartSymbolSpec,
  type SimTrade,
} from "@/lib/charts/chart-sim";

/**
 * TradingChart — the TradingView-grade candlestick pane (lightweight-charts,
 * TradingView's own open-source charting engine, so the rendering — candles,
 * crosshair, price/time scales with colored last-value badges, pan/zoom/
 * pinch — matches the reference UX exactly).
 *
 * Responsibilities:
 *   - chart lifecycle: created ONCE per mount, `autoSize` keeps it glued to
 *     the full-width container (ResizeObserver inside the library);
 *   - theme: colors are read from the app's CSS tokens and RE-READ whenever
 *     the root `data-theme` attribute changes (Encre / Carbone / Papier);
 *   - data: `candles` prop → setData; the SIM tick loop updates the last bar
 *     in place so the pane feels alive like a real feed;
 *   - overlays: EMA line, journal trade markers (entry arrows + exit P/L),
 *     a dashed line at the last entry price;
 *   - crosshair: reports the hovered bar up to the legend (parent overlay).
 *
 * Parent interaction goes through an imperative handle (range bar buttons)
 * — the chart instance itself never leaks into React state.
 */

export interface HoveredBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradingChartHandle {
  /** Make the last `count` bars fill the pane (range bar buttons). */
  showLastBars(count: number): void;
  /** Zoom out to the whole series ("All"). */
  fitAll(): void;
}

interface TradingChartProps {
  candles: Candle[];
  ema: { t: number; value: number }[];
  trades: SimTrade[];
  spec: ChartSymbolSpec;
  /** Overlays switched by the toolbar. */
  showEma: boolean;
  showTrades: boolean;
  /** true when the data comes from the SIM engine (drives the tick loop). */
  simulated: boolean;
  onHoverBar: (bar: HoveredBar | null) => void;
  /** Fires whenever the live tick moves the last close (SIM feed). */
  onLivePrice: (price: number) => void;
}

interface ChartTheme {
  text: string;
  textMuted: string;
  grid: string;
  border: string;
  crosshair: string;
  crosshairLabel: string;
  crosshairLabelText: string;
  up: string;
  down: string;
  ema: string;
  marker: string;
  profit: string;
  loss: string;
}

/** Reads the design tokens the chart canvas needs (never hardcodes them). */
function readChartTheme(): ChartTheme {
  const root = window.getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string =>
    root.getPropertyValue(name).trim() || fallback;
  return {
    text: read("--text-primary", "#E9ECEF"),
    textMuted: read("--text-muted", "#99A2AD"),
    grid: read("--border", "#262E3A"),
    border: read("--border", "#262E3A"),
    crosshair: read("--text-muted", "#99A2AD"),
    crosshairLabel: read("--surface-raised", "#1A2029"),
    crosshairLabelText: read("--text-primary", "#E9ECEF"),
    up: read("--accent", "#4E6EE0"),
    down: read("--loss", "#E05B5B"),
    ema: read("--warning", "#D9A03F"),
    marker: read("--cat-pa", "#A57BE8"),
    profit: read("--profit", "#3EBE8C"),
    loss: read("--loss", "#E05B5B"),
  };
}

/** Candle (ms epoch) → lightweight-charts bar (s epoch). */
function toBarData(candles: Candle[]): CandlestickData<UTCTimestamp>[] {
  return candles.map((candle) => ({
    time: Math.floor(candle.t / 1000) as UTCTimestamp,
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
  }));
}

function toLineData(points: { t: number; value: number }[]): LineData<UTCTimestamp>[] {
  return points.map((point) => ({
    time: Math.floor(point.t / 1000) as UTCTimestamp,
    value: point.value,
  }));
}

/** Journal trades → entry arrows + exit P/L dots. */
function toMarkers(
  candles: Candle[],
  trades: SimTrade[],
  theme: ChartTheme,
  digits: number,
): SeriesMarker<UTCTimestamp>[] {
  const markers: SeriesMarker<UTCTimestamp>[] = [];
  for (const trade of trades) {
    const entry = candles[trade.entryIndex];
    const exit = candles[trade.exitIndex];
    if (!entry || !exit) continue;
    markers.push({
      time: Math.floor(entry.t / 1000) as UTCTimestamp,
      position: trade.side === "BUY" ? "belowBar" : "aboveBar",
      shape: trade.side === "BUY" ? "arrowUp" : "arrowDown",
      color: theme.marker,
      size: 1,
      text: trade.side === "BUY" ? "B" : "S",
    });
    markers.push({
      time: Math.floor(exit.t / 1000) as UTCTimestamp,
      position: trade.side === "BUY" ? "aboveBar" : "belowBar",
      shape: "circle",
      color: trade.pnl >= 0 ? theme.profit : theme.loss,
      size: 1,
      text: formatSignedDelta(trade.pnl, digits),
    });
  }
  return markers.sort((a, b) => (a.time as number) - (b.time as number));
}

export const TradingChart = forwardRef<TradingChartHandle, TradingChartProps>(
  function TradingChart(
    { candles, ema, trades, spec, showEma, showTrades, simulated, onHoverBar, onLivePrice },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
    const emaSeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);
    const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const entryLineRef = useRef<IPriceLine | null>(null);
    // Latest props as refs so the chart effects never need to re-create
    // anything when only the callbacks identities change.
    const hoverRef = useRef(onHoverBar);
    const liveRef = useRef(onLivePrice);
    hoverRef.current = onHoverBar;
    liveRef.current = onLivePrice;

    // Imperative range control for the bottom bar.
    useImperativeHandle(
      ref,
      () => ({
        showLastBars(count: number) {
          const chart = chartRef.current;
          if (!chart || candles.length === 0) return;
          const clamped = Math.max(10, Math.min(count, candles.length));
          const from = Math.floor(candles[candles.length - clamped].t / 1000) as UTCTimestamp;
          const to = Math.floor(candles[candles.length - 1].t / 1000) as UTCTimestamp;
          chart.timeScale().setVisibleRange({ from, to });
        },
        fitAll() {
          chartRef.current?.timeScale().fitContent();
        },
      }),
      [candles],
    );

    // Create the chart ONCE per mount; everything else flows through refs.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const theme = readChartTheme();

      const chart = createChart(container, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: theme.textMuted,
          fontFamily:
            "var(--font-sans, ui-sans-serif), system-ui, -apple-system, sans-serif",
          attributionLogo: false,
          panes: { separatorColor: theme.border },
        },
        grid: {
          vertLines: { color: theme.grid },
          horzLines: { color: theme.grid },
        },
        rightPriceScale: {
          borderVisible: true,
          borderColor: theme.border,
          scaleMargins: { top: 0.12, bottom: 0.12 },
        },
        timeScale: {
          borderVisible: true,
          borderColor: theme.border,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 6,
          barSpacing: 7,
        },
        crosshair: {
          mode: 0, // Normal — free crosshair like the reference UX
          vertLine: {
            color: theme.crosshair,
            width: 1,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: theme.crosshairLabel,
          },
          horzLine: {
            color: theme.crosshair,
            width: 1,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: theme.crosshairLabel,
          },
        },
        localization: {
          locale: "en-US",
        },
        handleScroll: true,
        handleScale: true,
        kineticScroll: { touch: true, mouse: false },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: theme.up,
        downColor: theme.down,
        borderUpColor: theme.up,
        borderDownColor: theme.down,
        wickUpColor: theme.up,
        wickDownColor: theme.down,
        priceFormat: {
          type: "price",
          precision: spec.digits,
          minMove: spec.minMove,
        },
      });

      const emaSeries = chart.addSeries(LineSeries, {
        color: theme.ema,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      const markersPlugin = createSeriesMarkers(candleSeries, []);

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      emaSeriesRef.current = emaSeries;
      markersPluginRef.current = markersPlugin;

      // Legend follows the crosshair; leaving the pane falls back to last bar.
      chart.subscribeCrosshairMove((param) => {
        if (!param.point || param.time === undefined) {
          hoverRef.current(null);
          return;
        }
        const bar = param.seriesData.get(candleSeries) as
          | CandlestickData<UTCTimestamp>
          | undefined;
        if (!bar) {
          hoverRef.current(null);
          return;
        }
        hoverRef.current({
          time: bar.time as number,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        });
      });

      // Re-read tokens when the theme attribute flips (Encre/Carbone/Papier).
      const observer = new MutationObserver(() => {
        const next = readChartTheme();
        chart.applyOptions({
          layout: { textColor: next.textMuted },
          grid: {
            vertLines: { color: next.grid },
            horzLines: { color: next.grid },
          },
          rightPriceScale: { borderColor: next.border },
          timeScale: { borderColor: next.border },
          crosshair: {
            vertLine: { color: next.crosshair, labelBackgroundColor: next.crosshairLabel },
            horzLine: { color: next.crosshair, labelBackgroundColor: next.crosshairLabel },
          },
        });
        candleSeries.applyOptions({
          upColor: next.up,
          downColor: next.down,
          borderUpColor: next.up,
          borderDownColor: next.down,
          wickUpColor: next.up,
          wickDownColor: next.down,
        });
        emaSeries.applyOptions({ color: next.ema });
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class"],
      });

      return () => {
        observer.disconnect();
        chart.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        emaSeriesRef.current = null;
        markersPluginRef.current = null;
        entryLineRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- spec* only feeds the initial priceFormat
    }, []);

    // Data → series (runs on mount and whenever the payload changes).
    useEffect(() => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      const emaSeries = emaSeriesRef.current;
      const markersPlugin = markersPluginRef.current;
      if (!chart || !candleSeries || !emaSeries || !markersPlugin) return;
      if (candles.length === 0) return;

      candleSeries.setData(toBarData(candles));
      emaSeries.setData(toLineData(ema));

      const theme = readChartTheme();
      markersPlugin.setMarkers(
        showTrades ? toMarkers(candles, trades, theme, spec.digits) : [],
      );

      // Dashed line at the last entry price (reference UX shows one).
      if (entryLineRef.current) {
        candleSeries.removePriceLine(entryLineRef.current);
        entryLineRef.current = null;
      }
      const lastTrade = trades.at(-1);
      if (showTrades && lastTrade) {
        entryLineRef.current = candleSeries.createPriceLine({
          price: lastTrade.entryPrice,
          color: theme.marker,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });
      }

      // First paint (and every new dataset): show the recent window like the
      // reference UX — roughly the last 180 bars plus breathing room.
      const barsShown = Math.min(180, candles.length);
      const from = Math.floor(candles[candles.length - barsShown].t / 1000) as UTCTimestamp;
      const to = Math.floor(candles[candles.length - 1].t / 1000) as UTCTimestamp;
      chart.timeScale().setVisibleRange({ from, to });

      liveRef.current(candles[candles.length - 1].c);
    }, [candles, ema, trades, showTrades, spec.digits]);

    // Overlay visibility for the EMA line (no data churn — just show/hide).
    useEffect(() => {
      emaSeriesRef.current?.applyOptions({ visible: showEma });
    }, [showEma]);

    // SIM tick loop — nudges the last bar so the pane feels alive. REAL feeds
    // merge their own live quote upstream (Session Live transport); this loop
    // only ever runs when the data is honestly labeled SIM.
    useEffect(() => {
      if (!simulated || candles.length === 0) return;
      const last = candles[candles.length - 1];
      const tickVol = spec.anchor * spec.dailyVol * 0.0035;
      let tick = 0;
      const seedBase = Math.floor(last.t / 1000);
      const id = window.setInterval(() => {
        tick += 1;
        // Deterministic-ish wiggle: mulberry32 inline (no external state).
        let a = (seedBase + tick * 7919) >>> 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        const step = (u - 0.5) * 2 * tickVol;

        const nextClose = Math.max(spec.minMove, last.c + step);
        last.c = nextClose;
        last.h = Math.max(last.h, nextClose);
        last.l = Math.min(last.l, nextClose);
        candleSeriesRef.current?.update({
          time: Math.floor(last.t / 1000) as UTCTimestamp,
          open: last.o,
          high: last.h,
          low: last.l,
          close: last.c,
        });
        liveRef.current(nextClose);
      }, 1000);
      return () => window.clearInterval(id);
    }, [simulated, candles, spec.anchor, spec.dailyVol, spec.minMove]);

    return (
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="trading-chart"
        aria-label={`${spec.name} candlestick chart`}
      />
    );
  },
);

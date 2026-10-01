"use client";

import * as React from "react";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { History, Pause, Play, RefreshCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { bindChartGroup, createChartInstance } from "@/components/charts/echart";
import { formatPrice } from "@cosmoz/shared";
import type {
  BrokerPosition,
  Candle,
  CandlesResponse,
  DrawingKind,
  DrawingObject,
  IndicatorConfig,
  Instrument,
  KeyLevel,
  MarketInterval,
  Trade,
} from "@cosmoz/shared";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { anchorIndex, drawingTool, FIB_RATIOS, fibLabel, fibLevels, newId } from "@/lib/utils/drawings";
import { computeIndicators } from "@/lib/utils/indicators";
import { STALE_MS, type LiveQuote } from "@/lib/realtime/market";
import { usePreferences } from "@/lib/api/queries";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Session Live ANALYSIS CHART — the professional workspace canvas (Phase 3-4).
 *
 * Extends the station chart with what the MASTER PROMPT §9/§16/§14 requires:
 *  - technical indicators (real math — lib/utils/indicators) as price overlays
 *    or dedicated sub-panes (RSI / MACD / ATR / Volume);
 *  - drawing tools anchored to (time, price) — placed with clicks, rendered
 *    as silent markLine/markArea elements so zoom/pan/rescale stay correct;
 *  - opt-in key-level overlay lines (§20 — user documentation, off by default);
 *  - read-only position overlays (journal + broker, labeled, non-actionable).
 *
 * Overlays are INFORMATIONAL ONLY (§32): nothing on this chart can place,
 * modify or close anything. Replay (scrub through the loaded window) is kept
 * from the station chart.
 */

const INTERVAL_MS: Record<MarketInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

const CANDLE_LIMIT = 300;
/** Sub-pane geometry (px). */
const PANE_HEIGHT = 46;
const PANE_GAP = 12;
const AXIS_AREA = 44;
/** Price-grid horizontal insets — MUST mirror the grid config in baseOption. */
const GRID_LEFT = 62;
const GRID_RIGHT = 64;

function bucketLabel(t: number, interval: MarketInterval): string {
  const date = new Date(t);
  if (interval === "1D") {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(date);
}

function bucketTooltipTitle(t: number, interval: MarketInterval): string {
  const date = new Date(t);
  const options: Intl.DateTimeFormatOptions =
    interval === "1D"
      ? { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }
      : { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" };
  return `${new Intl.DateTimeFormat(undefined, options).format(date)} UTC`;
}

/** Safe defaults before the preferences document loads (schema-safe fallback). */
const DEFAULT_CHART_PREFS = { style: "CANDLES", showVolume: false, showGrid: true } as const;

/** Merge the live tick into the history: update/append the last bucket. */
function mergeTick(candles: Candle[], quote: LiveQuote | null, interval: MarketInterval, stale: boolean): Candle[] {
  if (!quote || stale || candles.length === 0) return candles;
  const bucket = Math.floor(quote.ts / INTERVAL_MS[interval]) * INTERVAL_MS[interval];
  const last = candles[candles.length - 1];
  if (bucket === last.t) {
    const merged: Candle = {
      t: last.t,
      o: last.o,
      h: Math.max(last.h, quote.price),
      l: Math.min(last.l, quote.price),
      c: quote.price,
      v: last.v,
    };
    return [...candles.slice(0, -1), merged];
  }
  if (bucket > last.t) {
    return [...candles.slice(-(CANDLE_LIMIT - 1)), { t: bucket, o: quote.price, h: quote.price, l: quote.price, c: quote.price, v: 0 }];
  }
  return candles;
}

interface AnalysisChartProps {
  symbol: string;
  interval: MarketInterval;
  instrument: Instrument | null;
  data: CandlesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  quote: LiveQuote | null;
  /** Journal open trades on this symbol — Entry/SL/TP overlays. */
  overlayTrades: Trade[];
  /** Real broker positions — read-only overlays with a source tag. */
  brokerPositions?: BrokerPosition[];
  /** Trader-documented key levels (§20) — rendered only when levelsVisible. */
  levels?: KeyLevel[];
  levelsVisible?: boolean;
  indicators: IndicatorConfig[];
  drawings: DrawingObject[];
  /** Armed placement tool (null = cursor). */
  tool: DrawingKind | null;
  onDrawingCreate: (drawing: DrawingObject) => void;
  onToolDone: () => void;
  heightClass?: string;
  /**
   * ECharts connect group — when set (multi-chart layouts), crosshair +
   * zoom actions mirror across every chart bound to the same group.
   * Null/undefined keeps the chart independent (single-chart default).
   */
  syncGroup?: string | null;
}

interface PlacedPoint {
  t: number;
  y: number;
  /** Canvas-local pixel position — only used for the provisional marker. */
  px: number;
  py: number;
}

export function AnalysisChart({
  symbol,
  interval,
  instrument,
  data,
  isLoading,
  isError,
  quote,
  overlayTrades,
  brokerPositions = [],
  levels = [],
  levelsVisible = false,
  indicators,
  drawings,
  tool,
  onDrawingCreate,
  onToolDone,
  heightClass = "h-[320px] sm:h-[440px]",
  syncGroup = null,
}: AnalysisChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<EChartsType | null>(null);
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  const { data: prefs } = usePreferences();
  const chartPrefs = prefs?.trading?.chart ?? DEFAULT_CHART_PREFS;

  const digits = instrument?.digits ?? 5;
  const nowMs = useNowMs();
  const stale = quote !== null && nowMs !== null && nowMs - quote.ts > STALE_MS;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const merged = React.useMemo(() => mergeTick(data?.candles ?? [], quote, interval, stale), [data, quote, interval, stale]);

  // ── Replay (kept from the station chart) ─────────────────────────────────
  const [replayOn, setReplayOn] = React.useState(false);
  const [replayIndex, setReplayIndex] = React.useState(0);
  const [replayPlaying, setReplayPlaying] = React.useState(false);

  const displayed = React.useMemo(
    () => (replayOn ? merged.slice(0, Math.min(replayIndex + 1, merged.length)) : merged),
    [replayOn, merged, replayIndex],
  );

  React.useEffect(() => {
    if (!replayOn || !replayPlaying) return;
    const id = window.setInterval(() => {
      setReplayIndex((index) => {
        if (index >= merged.length - 1) {
          setReplayPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, 150);
    return () => window.clearInterval(id);
  }, [replayOn, replayPlaying, merged.length]);

  const toggleReplay = React.useCallback(() => {
    setReplayOn((on) => {
      if (!on) {
        setReplayIndex(0);
        setReplayPlaying(false);
      }
      return !on;
    });
  }, []);

  const displayedRef = React.useRef(displayed);
  React.useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  // ── Indicators (computed every render of the window; cheap at 300 bars) ───
  const computed = React.useMemo(() => computeIndicators(indicators, displayed), [indicators, displayed]);
  const visibleComputed = React.useMemo(() => computed.filter((item) => item.config.visible), [computed]);

  const volumeVisible = (chartPrefs.showVolume || visibleComputed.some((item) => item.config.kind === "VOLUME")) && !replayOn;
  const subPanes = React.useMemo(
    () => visibleComputed.filter((item) => item.sub !== undefined && item.config.kind !== "VOLUME"),
    [visibleComputed],
  );

  const view = React.useMemo(() => {
    const labels = displayed.map((candle) => bucketLabel(candle.t, interval));
    const ohlc = displayed.map((candle) => [candle.o, candle.c, candle.l, candle.h] as const);
    return { labels, ohlc, times: displayed.map((candle) => candle.t), volumes: displayed.map((candle) => candle.v) };
  }, [displayed, interval]);

  // ── Drawing placement state machine ──────────────────────────────────────
  // Pending points are stored WITH the tool that armed them — switching or
  // disarming the tool implicitly invalidates the placement (no reset
  // effect, no setState-in-effect).
  const [placement, setPlacement] = React.useState<{ tool: DrawingKind; points: PlacedPoint[] } | null>(null);
  const [textDraft, setTextDraft] = React.useState<{ px: number; py: number; point: PlacedPoint; value: string } | null>(null);
  const toolMeta = tool !== null ? drawingTool(tool) : null;
  const pendingPoints = placement !== null && placement.tool === tool ? placement.points : [];

  // Escape cancels the armed tool (external-system listener only).
  React.useEffect(() => {
    if (tool === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToolDone();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool, onToolDone]);

  const commitDrawing = React.useCallback(
    (points: PlacedPoint[], text: string | null) => {
      if (tool === null || points.length === 0) return;
      onDrawingCreate({
        id: newId(),
        kind: tool,
        points: points.map((point) => ({ t: point.t, y: point.y })),
        text,
      });
      if (toolMeta?.points === 2) {
        // Two-point tools stay armed for quick successive placements.
        setPlacement(null);
      } else {
        onToolDone();
      }
    },
    [tool, toolMeta, onDrawingCreate, onToolDone],
  );

  const handleCanvasClick = React.useCallback(
    (offsetX: number, offsetY: number) => {
      const chart = chartRef.current;
      if (chart === null || tool === null) return;
      const pending = placement !== null && placement.tool === tool ? placement.points : [];
      // Ignore clicks below the price pane stack (slider area).
      const height = containerRef.current?.clientHeight ?? 0;
      if (offsetY > height - AXIS_AREA) return;

      // X: convert the pixel to a category index manually. ECharts'
      // convertFromPixel returns NaN for category axes here, so we map the
      // pixel through the CURRENT dataZoom window onto the candle indexes —
      // the grid insets are module constants shared with baseOption.
      // Y: the value axis converts fine with the axis-specific finder.
      const candles = displayedRef.current;
      if (candles.length === 0) return;
      const yPrice = chart.convertFromPixel({ yAxisIndex: 0 }, offsetY) as number;
      if (!Number.isFinite(yPrice)) return;
      const gridWidth = Math.max((containerRef.current?.clientWidth ?? 0) - GRID_LEFT - GRID_RIGHT, 1);
      const fraction = Math.min(Math.max((offsetX - GRID_LEFT) / gridWidth, 0), 1);
      const zoom = (chart.getOption() as { dataZoom?: Array<{ startValue?: number; endValue?: number; start?: number; end?: number }> })
        .dataZoom?.[0];
      let fractionStart = 0;
      let fractionSpan = 1;
      if (zoom && typeof zoom.start === "number" && typeof zoom.end === "number") {
        fractionStart = zoom.start / 100;
        fractionSpan = Math.max((zoom.end - zoom.start) / 100, 0.001);
      }
      const windowStart = fractionStart * (candles.length - 1);
      const windowSpan = fractionSpan * (candles.length - 1);
      const xIndex = windowStart + fraction * windowSpan;
      const index = Math.min(Math.max(Math.round(xIndex), 0), candles.length - 1);
      if (candles.length === 0) return;
      const point: PlacedPoint = { t: candles[index].t, y: yPrice, px: offsetX, py: offsetY };

      if (tool === "TEXT") {
        setTextDraft({ px: offsetX, py: offsetY, point, value: "" });
        return;
      }
      if (toolMeta?.points === 1) {
        commitDrawing([point], null);
        return;
      }
      if (pending.length === 0) {
        setPlacement({ tool, points: [point] });
        return;
      }
      commitDrawing([pending[0], point], null);
      setPlacement(null);
    },
    [tool, toolMeta, commitDrawing, placement],
  );

  // Canvas click listener (zrender) — blank-area clicks do not hit series.
  React.useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) return;
    const zr = chart.getZr();
    const onClick = (event: { offsetX?: number; offsetY?: number }) => {
      if (typeof event.offsetX !== "number" || typeof event.offsetY !== "number") return;
      handleCanvasClick(event.offsetX, event.offsetY);
    };
    zr.on("click", onClick);
    return () => zr.off("click", onClick);
  }, [handleCanvasClick, resolvedTheme]);

  // ── Structural option: panes, axes, zoom, tooltip, theme, chart prefs ────
  const baseOption = React.useMemo<EChartsCoreOption>(() => {
    // Pane stack, top→bottom: [Volume] then indicator sub-panes — anchored
    // from the bottom so the price grid always hugs the top of the canvas.
    const paneCount = (volumeVisible ? 1 : 0) + subPanes.length;
    const paneBottom = (position: number): number =>
      AXIS_AREA + (paneCount - 1 - position) * (PANE_HEIGHT + PANE_GAP);

    const grids: Array<Record<string, unknown>> = [
      {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: 16,
        bottom: AXIS_AREA + (paneCount > 0 ? paneCount * (PANE_HEIGHT + PANE_GAP) + PANE_GAP : 0),
      },
    ];
    const xAxes: Array<Record<string, unknown>> = [
      {
        type: "category",
        data: [],
        boundary: true,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, margin: 10 },
        splitLine: { show: false },
      },
    ];
    const yAxes: Array<Record<string, unknown>> = [
      {
        type: "value",
        scale: true,
        position: "right",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, formatter: (value: number) => formatPrice(value, digits) },
        splitLine: { show: chartPrefs.showGrid, lineStyle: { color: theme.border, width: 1, opacity: 0.6 } },
      },
    ];

    for (let position = 0; position < paneCount; position += 1) {
      const gridIndex = position + 1;
      const paneKind = position === 0 && volumeVisible ? "VOLUME" : subPanes[position - (volumeVisible ? 1 : 0)]?.sub?.kind;
      grids.push({ left: GRID_LEFT, right: GRID_RIGHT, height: PANE_HEIGHT - 8, bottom: paneBottom(position) });
      xAxes.push({
        type: "category",
        gridIndex,
        data: [],
        boundary: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      });
      yAxes.push({
        type: "value",
        gridIndex,
        position: "right",
        ...(paneKind === "RSI" ? { min: 0, max: 100 } : { scale: true }),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      });
    }

    const mainSeries: Record<string, unknown> =
      chartPrefs.style === "CANDLES"
        ? {
            name: symbol,
            type: "candlestick",
            data: [],
            itemStyle: { color: theme.profit, color0: theme.loss, borderColor: theme.profit, borderColor0: theme.loss, borderWidth: 1 },
          }
        : {
            name: symbol,
            type: "line",
            data: [],
            showSymbol: false,
            lineStyle: { width: 2, color: theme.accent },
            ...(chartPrefs.style === "AREA"
              ? {
                  areaStyle: {
                    color: {
                      type: "linear",
                      x: 0,
                      y: 0,
                      x2: 0,
                      y2: 1,
                      colorStops: [
                        { offset: 0, color: `${theme.accent}59` },
                        { offset: 1, color: `${theme.accent}00` },
                      ],
                    },
                  },
                }
              : {}),
          };

    const series: Array<Record<string, unknown>> = [mainSeries];
    if (volumeVisible) {
      series.push({ name: "Volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: [], barWidth: "60%", large: true });
    }

    const zoomIndexes = Array.from({ length: grids.length }, (_, i) => i);

    return {
      backgroundColor: "transparent",
      animationDuration: 300,
      animationDurationUpdate: 120,
      grid: grids,
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          lineStyle: { color: theme.border, width: 1 },
          crossStyle: { color: theme.border, width: 1 },
          label: {
            backgroundColor: theme.surfaceRaised,
            color: theme.textMuted,
            fontFamily: theme.monoFont,
            fontSize: 10,
            borderWidth: 1,
            borderColor: theme.border,
          },
        },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        borderWidth: 1,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 11 },
        formatter: (params: unknown) => {
          const list = params as Array<{ dataIndex: number }>;
          const index = list[0]?.dataIndex ?? 0;
          const candle = displayedRef.current[index];
          if (!candle) return "";
          const change = candle.c - candle.o;
          const changeColor = change >= 0 ? theme.profit : theme.loss;
          const sign = change >= 0 ? "+" : "−";
          return [
            `<span style="color:${theme.textMuted}">${bucketTooltipTitle(candle.t, interval)}</span>`,
            `O ${formatPrice(candle.o, digits)}  H ${formatPrice(candle.h, digits)}`,
            `L ${formatPrice(candle.l, digits)}  C ${formatPrice(candle.c, digits)}`,
            `<span style="color:${changeColor}">${sign}${formatPrice(Math.abs(change), digits)}</span>  <span style="color:${theme.textMuted}">V ${candle.v.toFixed(2)}</span>`,
          ].join("<br/>");
        },
      },
      xAxis: xAxes,
      yAxis: yAxes,
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: zoomIndexes,
          start: 0,
          end: 100,
          zoomOnMouseWheel: tool === null,
          preventDefaultMouseMove: false,
        },
        {
          type: "slider",
          xAxisIndex: zoomIndexes,
          height: 18,
          bottom: 6,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          fillerColor: `${theme.accent}22`,
          handleStyle: { color: theme.surfaceRaised, borderColor: theme.accent },
          moveHandleStyle: { color: theme.accent },
          textStyle: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 9 },
          dataBackground: { lineStyle: { color: theme.border }, areaStyle: { color: `${theme.border}55` } },
          selectedDataBackground: { lineStyle: { color: theme.accent }, areaStyle: { color: `${theme.accent}33` } },
        },
      ],
      series,
    };
    // Tool state is structural (zoom armed/disarmed); data flows through the
    // data option so ticks never reset zoom.
  }, [theme, interval, symbol, digits, chartPrefs, volumeVisible, subPanes, tool]);

  // ── Data option: candles + overlays + indicator series + drawings ────────
  const dataOption = React.useMemo<EChartsCoreOption>(() => {
    const palette = theme.indicatorPalette;
    const colorAt = (index: number): string => palette[index % palette.length];

    // ── Overlay lines (positions, levels, live price, drawings) ──────────
    // Two-point lines use the ECharts pair format: one data item = an array
    // of two { coord } objects. Single-level lines use { yAxis }.
    const markLineData: Array<unknown> = [];

    for (const trade of overlayTrades) {
      const tag = overlayTrades.length > 1 ? ` #${trade.id.slice(0, 4)}` : "";
      markLineData.push({
        yAxis: Number(trade.entryPrice),
        lineStyle: { color: theme.accent, type: "solid", width: 1, opacity: 0.9 },
        label: { formatter: `Entry${tag} ${formatPrice(Number(trade.entryPrice), digits)}`, position: "insideEndTop", color: theme.accent, fontFamily: theme.monoFont, fontSize: 9 },
        symbol: "none",
        emphasis: { disabled: true },
        silent: true,
      });
      const stop = trade.finalStop ?? trade.initialStop;
      if (stop !== null) {
        markLineData.push({
          yAxis: Number(stop),
          lineStyle: { color: theme.loss, type: "dashed", width: 1, opacity: 0.85 },
          label: { formatter: `SL${tag} ${formatPrice(Number(stop), digits)}`, position: "insideEndTop", color: theme.loss, fontFamily: theme.monoFont, fontSize: 9 },
          symbol: "none",
          emphasis: { disabled: true },
          silent: true,
        });
      }
      if (trade.initialTP !== null) {
        markLineData.push({
          yAxis: Number(trade.initialTP),
          lineStyle: { color: theme.profit, type: "dashed", width: 1, opacity: 0.85 },
          label: { formatter: `TP${tag} ${formatPrice(Number(trade.initialTP), digits)}`, position: "insideEndTop", color: theme.profit, fontFamily: theme.monoFont, fontSize: 9 },
          symbol: "none",
          emphasis: { disabled: true },
          silent: true,
        });
      }
    }

    for (const position of brokerPositions) {
      markLineData.push({
        yAxis: Number(position.entryPrice),
        lineStyle: { color: theme.warning, type: "solid", width: 1, opacity: 0.7 },
        label: { formatter: `${position.symbol} ${position.direction} · ${position.entryPrice}`, position: "insideEndBottom", color: theme.warning, fontFamily: theme.monoFont, fontSize: 9 },
        symbol: "none",
        emphasis: { disabled: true },
        silent: true,
      });
    }

    if (levelsVisible) {
      for (const level of levels) {
        markLineData.push({
          yAxis: level.price,
          lineStyle: { color: theme.warning, type: "dashed", width: 1, opacity: 0.5 },
          label: { formatter: `${level.kind.replace(/_/g, " ")} ${formatPrice(level.price, digits)}`, position: "insideEndBottom", color: theme.warning, fontFamily: theme.monoFont, fontSize: 9 },
          symbol: "none",
          emphasis: { disabled: true },
          silent: true,
        });
      }
    }

    if (quote && !stale && !replayOn) {
      markLineData.push({
        yAxis: quote.price,
        lineStyle: { color: theme.accent, type: "dashed", width: 1, opacity: 0.55 },
        label: { formatter: formatPrice(quote.price, digits), position: "insideEndBottom", color: theme.accent, fontFamily: theme.monoFont, fontSize: 9 },
        symbol: "none",
        emphasis: { disabled: true },
        silent: true,
      });
    }

    // Drawings — anchored to (time, price), projected onto displayed indexes.
    const markAreaData: Array<Array<Record<string, unknown>>> = [];
    const times = view.times;
    const project = (t: number): number | null => anchorIndex(times, t);

    for (const drawing of drawings) {
      const color = theme.warning;
      const [a, b] = drawing.points;
      const ia = project(a.t);
      if (ia === null) continue;
      switch (drawing.kind) {
        case "HLINE":
          markLineData.push({
            yAxis: a.y,
            lineStyle: { color, type: "solid", width: 1, opacity: 0.85 },
            label: { formatter: formatPrice(a.y, digits), position: "insideEndTop", color, fontFamily: theme.monoFont, fontSize: 9 },
            symbol: "none",
            emphasis: { disabled: true },
            silent: true,
          });
          break;
        case "TREND":
        case "MEASURE": {
          const ib = b ? project(b.t) : null;
          if (ib === null) continue;
          const measureLabel =
            drawing.kind === "MEASURE" && b
              ? `${b.y >= a.y ? "+" : "−"}${formatPrice(Math.abs(b.y - a.y), digits)} (${(((b.y - a.y) / a.y) * 100).toFixed(2)}%)`
              : null;
          markLineData.push([
            { coord: [ia, a.y], symbol: "none" },
            {
              coord: [ib, b.y],
              symbol: "none",
              ...(measureLabel
                ? {
                    label: {
                      formatter: measureLabel,
                      position: "middle",
                      color: theme.textPrimary,
                      fontFamily: theme.monoFont,
                      fontSize: 9,
                      backgroundColor: `${theme.surfaceRaised}CC`,
                      padding: [2, 4],
                      borderRadius: 3,
                    },
                  }
                : {}),
            },
            { lineStyle: { color, type: "solid", width: 1.2, opacity: 0.9 } },
          ]);
          break;
        }
        case "RAY": {
          const ib = b ? project(b.t) : null;
          if (ib === null) continue;
          const lastIndex = times.length - 1;
          const slope = (b.y - a.y) / Math.max(ib - ia, 1);
          const endY = a.y + slope * (lastIndex - ia);
          markLineData.push([
            { coord: [ia, a.y], symbol: "none" },
            { coord: [lastIndex, endY], symbol: "none" },
            { lineStyle: { color, type: "dashed", width: 1, opacity: 0.8 } },
          ]);
          break;
        }
        case "RECT": {
          const ib = b ? project(b.t) : null;
          if (ib === null) continue;
          markAreaData.push([
            { xAxis: Math.min(ia, ib), yAxis: Math.max(a.y, b.y), itemStyle: { color: `${color}14`, borderColor: color, borderWidth: 1 } },
            { xAxis: Math.max(ia, ib), yAxis: Math.min(a.y, b.y) },
          ]);
          break;
        }
        case "TEXT": {
          markLineData.push([
            { coord: [ia, a.y], symbol: "none" },
            { coord: [ia, a.y], symbol: "none" },
            {
              lineStyle: { color: "transparent", width: 0 },
              label: {
                formatter: drawing.text ?? "•",
                position: "top",
                color: theme.textPrimary,
                fontFamily: theme.headingFont,
                fontSize: 11,
                backgroundColor: `${theme.surfaceRaised}CC`,
                padding: [2, 5],
                borderRadius: 4,
                borderColor: theme.border,
                borderWidth: 1,
              },
            },
          ]);
          break;
 }
        case "FIB": {
          const ib = b ? project(b.t) : null;
          if (ib === null) continue;
          const left = Math.min(ia, ib);
          const right = Math.max(ia, ib);
          const fibPrices = fibLevels(a.y, b.y);
          for (let i = 0; i < fibPrices.length; i += 1) {
            const ratio = FIB_RATIOS[i] ?? 0;
            markLineData.push([
              { coord: [left, fibPrices[i]], symbol: "none" },
              { coord: [right, fibPrices[i]], symbol: "none" },
              {
                lineStyle: { color: i === 0 || i === fibPrices.length - 1 ? theme.accent : color, type: "dashed", width: 1, opacity: 0.75 },
                label: { formatter: `${fibLabel(ratio)} ${formatPrice(fibPrices[i], digits)}`, position: "insideEndTop", color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 8 },
              },
            ]);
          }
          break;
        }
      }
    }

    // ── Indicator series ─────────────────────────────────────────────────
    const series: Array<Record<string, unknown>> = [
      {
        data: chartPrefs.style === "CANDLES" ? view.ohlc : displayed.map((candle) => candle.c),
        markLine: { animation: false, symbol: "none", silent: true, data: markLineData },
        markArea: { animation: false, silent: true, data: markAreaData },
      },
    ];

    let gridCursor = 1;
    if (volumeVisible) {
      series.push({
        name: "Volume",
        type: "bar",
        xAxisIndex: gridCursor,
        yAxisIndex: gridCursor,
        data: displayed.map((candle) => ({ value: candle.v, itemStyle: { color: candle.c >= candle.o ? `${theme.profit}8C` : `${theme.loss}8C` } })),
        barWidth: "60%",
        large: true,
      });
      gridCursor += 1;
    }
    for (const item of subPanes) {
      const sub = item.sub;
      if (!sub) continue;
      if (sub.hist !== undefined) {
        series.push({
          name: "MACD hist",
          type: "bar",
          xAxisIndex: gridCursor,
          yAxisIndex: gridCursor,
          data: sub.hist.map((value) => (value === null ? null : { value, itemStyle: { color: value >= 0 ? `${theme.profit}99` : `${theme.loss}99` } })),
          barWidth: "55%",
          large: true,
        });
      }
      for (const line of sub.lines) {
        series.push({
          name: line.label,
          type: "line",
          xAxisIndex: gridCursor,
          yAxisIndex: gridCursor,
          data: line.data,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 1.1, color: colorAt(line.colorIndex) },
          itemStyle: { color: colorAt(line.colorIndex) },
          ...(sub.guides
            ? {
                markLine: {
                  animation: false,
                  symbol: "none",
                  silent: true,
                  data: sub.guides.map((guide) => ({
                    yAxis: guide.value,
                    lineStyle: { color: theme.border, type: "dashed", width: 1 },
                    label: { formatter: guide.label, position: "insideStartTop", color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 8 },
                  })),
                },
              }
            : {}),
        });
      }
      gridCursor += 1;
    }
    // Overlay indicator lines on the PRICE grid (index 0).
    for (const item of visibleComputed) {
      for (const line of item.overlayLines) {
        series.push({
          name: line.label,
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: line.data,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 1.2, color: colorAt(line.colorIndex), opacity: 0.9 },
          itemStyle: { color: colorAt(line.colorIndex) },
          emphasis: { disabled: true },
          silent: true,
        });
      }
    }

    return {
      // Grid 0 gets the labels; every sub-pane axis carries identical category
      // data so zoom/pan stay synchronized across panes.
      xAxis: [view.labels, ...Array.from({ length: (volumeVisible ? 1 : 0) + subPanes.length }, () => view.labels)],
      series,
    };
  }, [view, displayed, overlayTrades, brokerPositions, levels, levelsVisible, quote, stale, theme, digits, chartPrefs, replayOn, visibleComputed, subPanes, volumeVisible, drawings]);

  // ── Canvas lifecycle ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChartInstance(container);
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [resolvedTheme]);

  // Multi-chart sync — rebound after every (re)creation (theme switch makes
  // a fresh instance) and whenever the group assignment changes.
  React.useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) return;
    bindChartGroup(chart, syncGroup);
  }, [syncGroup, resolvedTheme]);

  React.useEffect(() => {
    chartRef.current?.setOption(baseOption, { notMerge: true });
  }, [baseOption]);

  React.useEffect(() => {
    chartRef.current?.setOption(dataOption);
  }, [dataOption]);

  // Legend chips of the visible overlays (top-right, informational).
  const legendChips = React.useMemo(() => {
    const chips: Array<{ label: string; color: string }> = [];
    const palette = theme.indicatorPalette;
    const colorAt = (index: number): string => palette[index % palette.length];
    for (const item of visibleComputed) {
      for (const line of item.overlayLines) chips.push({ label: line.label, color: colorAt(line.colorIndex) });
      if (item.sub && item.config.kind !== "VOLUME") {
        for (const line of item.sub.lines) chips.push({ label: line.label, color: colorAt(line.colorIndex) });
      }
    }
    return chips;
  }, [visibleComputed, theme]);

  const armedHint = toolMeta !== null
    ? pendingPoints.length === 0
      ? toolMeta.hint
      : tool === "TEXT"
        ? "Type the note, press Enter"
        : "Click the second point · Esc to cancel"
    : null;

  if (isError) {
    return (
      <div className={cn("flex flex-col items-center justify-center rounded-xl border border-border bg-surface", heightClass)}>
        <p className="font-heading text-base font-semibold text-foreground">Market data unavailable</p>
        <p className="mt-1 max-w-xs text-center text-sm text-muted-foreground">
          The candle feed could not be reached. Your positions and account are unaffected.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void queryClient.refetchQueries({ queryKey: ["candles"] })}>
          <RefreshCcw className="size-3.5" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn("relative rounded-xl border border-border bg-surface", heightClass)}
        data-testid="analysis-chart"
        data-symbol={symbol}
        data-interval={interval}
        data-chart-style={chartPrefs.style}
        data-tool={tool ?? "cursor"}
        data-indicators={visibleComputed.length}
        data-drawings={drawings.length}
        data-sync-group={syncGroup ?? undefined}
      >
        {isLoading && displayed.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center" aria-live="polite">
            <p className="text-sm text-muted-foreground">Loading market data…</p>
          </div>
        ) : null}

        {/* Indicator legend (informational) */}
        {legendChips.length > 0 ? (
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex max-w-[60%] flex-wrap justify-end gap-1.5" data-testid="chart-indicator-legend">
            {legendChips.slice(0, 8).map((chip, index) => (
              <span key={`${chip.label}-${index}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: chip.color }} aria-hidden="true" />
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}

        {/* Replay toggle */}
        {displayed.length > 0 ? (
          <button
            type="button"
            onClick={toggleReplay}
            aria-label={replayOn ? "Exit price replay" : "Replay the price curve"}
            aria-pressed={replayOn}
            data-testid="session-replay-toggle"
            className={cn(
              "absolute bottom-[52px] left-3 z-10 inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium backdrop-blur transition-colors",
              replayOn ? "border-accent/50 bg-accent/15 text-accent" : "border-border bg-background/85 text-muted-foreground hover:text-foreground",
            )}
          >
            <History className="size-3.5" aria-hidden="true" />
            Replay
          </button>
        ) : null}

        {/* Armed-tool hint + provisional placement markers */}
        {armedHint !== null ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning backdrop-blur" data-testid="chart-tool-hint">
            {armedHint}
          </div>
        ) : null}
        {pendingPoints.map((point, index) => (
          <span
            key={`${point.t}-${index}`}
            aria-hidden="true"
            className="pointer-events-none absolute z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-warning bg-warning/40 animate-pulse"
            style={{ left: point.px, top: point.py }}
          />
        ))}
        {textDraft !== null ? (
          <div className="absolute z-20" // CSS min() keeps the input on-canvas without reading layout in render.
            style={{ left: `min(${textDraft.px}px, calc(100% - 190px))`, top: textDraft.py + 8 }}>
            <input
              autoFocus
              value={textDraft.value}
              onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && textDraft.value.trim() !== "") {
                  commitDrawing([textDraft.point], textDraft.value.trim());
                  setTextDraft(null);
                }
                if (event.key === "Escape") setTextDraft(null);
              }}
              onBlur={() => setTextDraft(null)}
              maxLength={120}
              placeholder="Note text…"
              aria-label="Drawing note text"
              className="w-44 rounded-md border border-accent/50 bg-background px-2 py-1 text-xs text-foreground shadow-lg outline-none"
            />
          </div>
        ) : null}

        <div
          ref={containerRef}
          role="img"
          aria-label={`${symbol} ${interval} analysis chart with indicators, drawings and position overlays`}
          className={cn("size-full", tool !== null && "cursor-crosshair")}
        />
      </div>

      {/* Replay scrubber */}
      {replayOn && displayed.length > 0 ? (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2" data-testid="session-replay-bar">
          <button
            type="button"
            onClick={() => setReplayPlaying((playing) => !playing)}
            aria-label={replayPlaying ? "Pause replay" : "Play replay"}
            data-testid="session-replay-play"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent transition-colors hover:bg-accent/20"
          >
            {replayPlaying ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(merged.length - 1, 0)}
            step={1}
            value={replayIndex}
            onChange={(event) => {
              setReplayPlaying(false);
              setReplayIndex(Number(event.target.value));
            }}
            aria-label="Replay position"
            data-testid="session-replay-scrubber"
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
          />
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="session-replay-time">
            {bucketLabel(displayed[displayed.length - 1]?.t ?? 0, interval)}
            <span className="mx-1 text-border">·</span>
            {replayIndex + 1}/{merged.length}
          </span>
          <button type="button" onClick={toggleReplay} aria-label="Close replay" data-testid="session-replay-close" className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

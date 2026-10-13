"use client";

import * as React from "react";
import * as echarts from "echarts/core";
import { CandlestickChart } from "echarts/charts";
import {
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTheme } from "next-themes";
import type {
  ChartCandle,
  ChartZone,
  Instrument,
  Timeframe,
  Trade,
} from "@cosmoz/shared";
import { formatNumber } from "@cosmoz/shared";

import { getChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";
import { toCandleSeriesRow } from "@/lib/trade-charts";

// Extra registrations for this module (echart.tsx registers its own set;
// echarts.use is idempotent).
echarts.use([CandlestickChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, CanvasRenderer]);

export interface CandleChartProps {
  trade: Trade;
  instrument: Instrument;
  timeframe: Timeframe;
  candles: ChartCandle[];
  /** Zones drawn on this trade's chart (persisted per trade). */
  zones: ChartZone[];
  /** Active pick mode (null = picking off). */
  pickMode: "SUPPORT" | "RESISTANCE" | null;
  onPickLevel: (level: number) => void;
  /** Replay cursor (ms) — null when replay is OFF (full history shown). */
  replayTs: number | null;
  /** Fired once after the first painted render (auto-snapshot hook). */
  onPainted?: () => void;
  /** Assigned a capture() closure — used by the panel's snapshot button. */
  captureRef: React.MutableRefObject<(() => string | null) | null>;
}

const STEP_LABEL: Record<Timeframe, string> = {
  M1: "1m",
  M5: "5m",
  M15: "15m",
  H1: "1H",
  H4: "4H",
  D1: "1D",
};

/**
 * Trade candle chart — the REPLAY engine. The candles are the instrument's
 * simulated market history; every marker on top belongs to the trade
 * (entry/exit levels, stop, target, duration window) or to the trader's
 * drawn zones. In replay mode the history is truncated to the cursor so the
 * chart shows exactly what the market looked like at that moment, revealing
 * the trade markers as time passes.
 */
export function CandleChart({
  trade,
  instrument,
  timeframe,
  candles,
  zones,
  pickMode,
  onPickLevel,
  replayTs,
  onPainted,
  captureRef,
}: CandleChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();
  const paintedRef = React.useRef(false);
  const pickModeRef = React.useRef(pickMode);
  const onPickLevelRef = React.useRef(onPickLevel);

  // Latest-ref pattern, done inside effects (refs are off-limits at render).
  React.useEffect(() => {
    pickModeRef.current = pickMode;
    onPickLevelRef.current = onPickLevel;
  });

  const priceDigits = instrument.digits;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = echarts.init(container);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);

    // Zrender-level click: echarts' own `on('click')` only fires on series
    // elements, but zone picking must work on empty chart space too.
    const zr = chart.getZr();
    const onZrClick = (zrEvent: { offsetX?: number; offsetY?: number; event?: { offsetX?: number; offsetY?: number } }) => {
      const mode = pickModeRef.current;
      if (!mode) return;
      const offsetX = zrEvent.offsetX ?? zrEvent.event?.offsetX;
      const offsetY = zrEvent.offsetY ?? zrEvent.event?.offsetY;
      if (offsetX === undefined || offsetY === undefined) return;
      const value = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [offsetX, offsetY]);
      const level = Array.isArray(value) ? value[1] : null;
      if (typeof level === "number" && Number.isFinite(level)) {
        onPickLevelRef.current(level);
      }
    };
    zr.on("click", onZrClick);

    return () => {
      zr.off("click", onZrClick);
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
      captureRef.current = null;
    };
    // Re-create the canvas on theme switch so canvas pixels match tokens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  // Expose the snapshot capture (chart pixels + background, 2x).
  React.useEffect(() => {
    captureRef.current = () => {
      const chart = chartRef.current;
      if (!chart) return null;
      const theme = getChartTheme();
      return chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: theme.background });
    };
  }, [captureRef]);

  const option = React.useMemo(() => {
    const theme = getChartTheme();
    const rows = candles.map(toCandleSeriesRow);
    if (rows.length === 0) return null;

    const entryMs = Date.parse(trade.entryAt);
    // Open trade: "now" is the last candle — pure, derived from props.
    const exitMs =
      trade.exitAt === null ? rows[rows.length - 1]![0] : Date.parse(trade.exitAt);
    // Reveal anchor: trades dated beyond the candle window (future/manual
    // entries) reveal their markers at the end of the visible history.
    const revealMs = Math.min(entryMs, rows[rows.length - 1]![0]);

    // Replay: truncate history to the cursor — the market as it looked then.
    const visible = replayTs === null ? rows : rows.filter((row) => row[0] <= replayTs);
    const revealed = replayTs === null || replayTs >= revealMs;
    const exitRevealed = replayTs === null || replayTs >= exitMs;

    const markLineData: Array<Record<string, unknown>> = [];
    if (revealed) {
      markLineData.push(
        {
          yAxis: Number(trade.entryPrice),
          lineStyle: { color: theme.accent, type: "solid", width: 1.5 },
          label: {
            formatter: `Entry ${formatNumber(trade.entryPrice, priceDigits)}`,
            position: "insideEndTop",
            color: theme.accent,
            fontSize: 10,
            fontFamily: theme.monoFont,
          },
        },
        {
          yAxis: Number(trade.initialStop),
          lineStyle: { color: theme.loss, type: "dashed", width: 1 },
          label: {
            formatter: `SL ${formatNumber(trade.initialStop, priceDigits)}`,
            position: "insideEndBottom",
            color: theme.loss,
            fontSize: 10,
            fontFamily: theme.monoFont,
          },
          symbol: "none",
        },
        {
          yAxis: Number(trade.initialTP),
          lineStyle: { color: theme.profit, type: "dashed", width: 1 },
          label: {
            formatter: `TP ${formatNumber(trade.initialTP, priceDigits)}`,
            position: "insideEndTop",
            color: theme.profit,
            fontSize: 10,
            fontFamily: theme.monoFont,
          },
          symbol: "none",
        },
      );
    }
    if (trade.exitPrice !== null && exitRevealed) {
      markLineData.push({
        yAxis: Number(trade.exitPrice),
        lineStyle: { color: theme.textMuted, type: "dotted", width: 1 },
        label: {
          formatter: `Exit ${formatNumber(trade.exitPrice, priceDigits)}`,
          position: "insideEndBottom",
          color: theme.textMuted,
          fontSize: 10,
          fontFamily: theme.monoFont,
        },
        symbol: "none",
      });
    }

    const markAreaData: Array<[Record<string, unknown>, Record<string, unknown>]> = [];
    if (revealed) {
      // Trade duration window — shaded band from entry to (cursor-clamped) exit.
      markAreaData.push([
        {
          xAxis: entryMs,
          itemStyle: { color: withAlpha(theme.accent, 0.06) },
          label: { show: false },
        } as Record<string, unknown>,
        { xAxis: exitRevealed ? exitMs : replayTs ?? exitMs, label: { show: false } } as Record<string, unknown>,
      ]);
    }
    for (const zone of zones) {
      const ink = zone.kind === "SUPPORT" ? theme.profit : theme.loss;
      markAreaData.push([
        {
          yAxis: zone.hi,
          itemStyle: { color: withAlpha(ink, 0.1), borderColor: withAlpha(ink, 0.35), borderWidth: 1 },
          label: {
            show: true,
            formatter: `${zone.kind === "SUPPORT" ? "S" : "R"} ${formatNumber(String(zone.hi), priceDigits)}`,
            position: "insideTopRight",
            color: ink,
            fontSize: 9,
            fontFamily: theme.monoFont,
          },
        } as Record<string, unknown>,
        { yAxis: zone.lo, label: { show: false } } as Record<string, unknown>,
      ]);
    }

    const intraday = timeframe !== "D1";
    const axisLabelFormatter = (value: number) => {
      const date = new Date(value);
      if (intraday) {
        return `${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
      }
      return `${String(date.getUTCDate()).padStart(2, "0")} ${date.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
    };

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 10, right: 70, top: 14, bottom: 30 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", label: { backgroundColor: theme.surfaceRaised } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontSize: 11, fontFamily: theme.monoFont },
        formatter: (params: unknown) => {
          const list = params as Array<{ data: [number, number, number, number, number] }>;
          const row = list?.[0]?.data;
          if (!row) return "";
          const [t, o, c, l, h] = row;
          const r = (v: number) => formatNumber(String(v), priceDigits);
          return [
            `<b>${instrument.symbol}</b> · ${STEP_LABEL[timeframe]}`,
            `O ${r(o)}  H ${r(h)}`,
            `L ${r(l)}  C ${r(c)}`,
            new Date(t).toISOString().slice(0, 16).replace("T", " ") + "z",
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textMuted, fontSize: 9, fontFamily: theme.monoFont, formatter: axisLabelFormatter, hideOverlap: true },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        position: "right",
        axisLabel: { color: theme.textMuted, fontSize: 9, fontFamily: theme.monoFont, formatter: (v: number) => formatNumber(String(v), priceDigits) },
        splitLine: { lineStyle: { color: theme.border, opacity: 0.4 } },
      },
      series: [
        {
          type: "candlestick",
          data: visible,
          barMaxWidth: 9,
          itemStyle: {
            color: theme.profit,
            color0: theme.loss,
            borderColor: theme.profit,
            borderColor0: theme.loss,
          },
          markLine: {
            symbol: "none",
            animation: false,
            silent: true,
            data: markLineData,
          },
          markArea: {
            silent: true,
            animation: false,
            data: markAreaData,
          },
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, zones, replayTs, resolvedTheme, trade.entryAt, trade.exitAt, trade.entryPrice, trade.initialStop, trade.initialTP, trade.exitPrice, timeframe, priceDigits, instrument.symbol]);

  React.useEffect(() => {
    if (!option) return;
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(option, { notMerge: true });
    if (!paintedRef.current) {
      paintedRef.current = true;
      // Direct first-paint signal — a delayed timer would be cancelled by
      // the StrictMode effect cycle before it ever fired. The panel applies
      // its own delay before auto-snapshotting.
      onPainted?.();
    }
  }, [option, onPainted]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Candlestick replay chart for ${instrument.symbol} ${STEP_LABEL[timeframe]}`}
      className={
        pickMode
          ? "h-64 w-full cursor-crosshair sm:h-72"
          : "h-64 w-full sm:h-72"
      }
      data-testid="trade-candle-chart"
    />
  );
}

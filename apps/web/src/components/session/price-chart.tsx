"use client";

import * as React from "react";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { History, Pause, Play, RefreshCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createChartInstance } from "@/components/charts/echart";
import { formatPrice } from "@cosmoz/shared";
import type { Candle, CandlesResponse, Instrument, MarketInterval, Trade } from "@cosmoz/shared";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { STALE_MS, type LiveQuote } from "@/lib/realtime/market";
import { usePreferences } from "@/lib/api/queries";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Session Live price chart — candlestick datafeed over the market service
 * (mission §6, §8). TradingView Advanced Charts is a licensed library that
 * is not part of this repository, and the free widget cannot consume a
 * custom datafeed or draw position overlays, so the chart is ECharts (the
 * project's chart stack) behind the same shape of contract: REST history
 * (useCandles) + live tick merge into the last bucket.
 *
 * Overlays are INFORMATIONAL ONLY (mission §8): journal open trades on the
 * selected symbol draw Entry/SL/TP as anchored lines — there is no way to
 * drag or edit anything from here, and nothing ever writes to a broker.
 *
 * NOTE: this file never imports echarts at runtime — chart creation goes
 * through components/charts/echart.tsx (createChartInstance) so the whole
 * app shares ONE echarts/zrender instance with the canvas renderer already
 * registered. Two runtime copies would throw "Renderer 'undefined'".
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

interface OverlayLine {
  value: number;
  color: string;
  label: string;
  dashed: boolean;
}

function overlayLines(trades: Trade[], theme: ReturnType<typeof getChartTheme>): OverlayLine[] {
  const lines: OverlayLine[] = [];
  for (const trade of trades) {
    const tag = trades.length > 1 ? ` #${trade.id.slice(0, 4)}` : "";
    lines.push({ value: Number(trade.entryPrice), color: theme.accent, label: `Entry${tag}`, dashed: false });
    const stop = trade.finalStop ?? trade.initialStop;
    if (stop !== null) lines.push({ value: Number(stop), color: theme.loss, label: `SL${tag}`, dashed: true });
    if (trade.initialTP !== null) lines.push({ value: Number(trade.initialTP), color: theme.profit, label: `TP${tag}`, dashed: true });
  }
  return lines;
}

/** Safe defaults before the preferences document loads (schema-safe fallback). */
const DEFAULT_CHART_PREFS = { style: "CANDLES", showVolume: false, showGrid: true } as const;

/** Merge the live tick into the history: update/append the last bucket. */
function mergeTick(
  candles: Candle[],
  quote: LiveQuote | null,
  interval: MarketInterval,
  stale: boolean,
): Candle[] {
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
    return [
      ...candles.slice(-(300 - 1)),
      { t: bucket, o: quote.price, h: quote.price, l: quote.price, c: quote.price, v: 0 },
    ];
  }
  return candles;
}

interface PriceChartProps {
  symbol: string;
  interval: MarketInterval;
  instrument: Instrument | null;
  data: CandlesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  quote: LiveQuote | null;
  overlayTrades: Trade[];
  heightClass?: string;
}

export function PriceChart({
  symbol,
  interval,
  instrument,
  data,
  isLoading,
  isError,
  quote,
  overlayTrades,
  heightClass = "h-[320px] sm:h-[420px]",
}: PriceChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<EChartsType | null>(null);
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  // Chart display preferences (Settings → Trading → Charts). Defaults apply
  // while the preferences document loads — the chart never blocks on it.
  const { data: prefs } = usePreferences();
  const chartPrefs = prefs?.trading?.chart ?? DEFAULT_CHART_PREFS;

  const digits = instrument?.digits ?? 5;
  const nowMs = useNowMs();
  // Frozen feed → do not keep stamping the last price onto the chart (§17).
  const stale = quote !== null && nowMs !== null && nowMs - quote.ts > STALE_MS;

  // resolvedTheme is an intentional dependency even though tokens are read
  // from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);
  const merged = React.useMemo(
    () => mergeTick(data?.candles ?? [], quote, interval, stale),
    [data, quote, interval, stale],
  );

  // ── Replay (scrubber) — step through the loaded window bucket by bucket.
  // While active the chart renders ONLY candles up to the scrub index and
  // the live-price mark line is suppressed: reviewing a sequence must not
  // leak the future. The merge keeps running underneath (honest window).
  const [replayOn, setReplayOn] = React.useState(false);
  const [replayIndex, setReplayIndex] = React.useState(0);
  const [replayPlaying, setReplayPlaying] = React.useState(false);

  const displayed = React.useMemo(
    () => (replayOn ? merged.slice(0, Math.min(replayIndex + 1, merged.length)) : merged),
    [replayOn, merged, replayIndex],
  );

  // Play: advance one bucket per tick until the end, then hold.
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
  // Tooltip formatters fire long after render — they read the LATEST
  // displayed candles through this ref (the structural option never rebuilds
  // on ticks, so a direct closure would go stale).
  const mergedRef = React.useRef(displayed);
  React.useEffect(() => {
    mergedRef.current = displayed;
  }, [displayed]);

  const view = React.useMemo(() => {
    const labels = displayed.map((candle) => bucketLabel(candle.t, interval));
    // ECharts candlestick item = [open, close, lowest, highest].
    const ohlc = displayed.map((candle) => [candle.o, candle.c, candle.l, candle.h] as const);
    return { labels, ohlc, times: displayed.map((candle) => candle.t), volumes: displayed.map((candle) => candle.v) };
  }, [displayed, interval]);

  // ── Structural option (axes, panes, zoom, tooltip, theme, chart prefs) ───
  const baseOption = React.useMemo<EChartsCoreOption>(() => {
    // Fixed left/right for BOTH panes so the volume bars align exactly with
    // the price plot area (containLabel would offset each grid differently).
    const AXIS_AREA = 40; // bottom space for x labels + zoom slider
    const VOLUME_HEIGHT = 40;
    const VOLUME_GAP = 14;
    const grid = chartPrefs.showVolume
      ? [
          { left: 62, right: 64, top: 16, bottom: AXIS_AREA + VOLUME_HEIGHT + VOLUME_GAP },
          // height + bottom only — a third constraint (top) conflicts in ECharts
          // and would drag the pane to the top of the canvas.
          { left: 62, right: 64, height: VOLUME_HEIGHT, bottom: AXIS_AREA },
        ]
      : [{ left: 62, right: 64, top: 16, bottom: AXIS_AREA }];

    // Main series — candlestick, or close-line/area for the other styles.
    const mainSeries: Record<string, unknown> =
      chartPrefs.style === "CANDLES"
        ? {
            name: symbol,
            type: "candlestick",
            data: [],
            itemStyle: {
              color: theme.profit,
              color0: theme.loss,
              borderColor: theme.profit,
              borderColor0: theme.loss,
              borderWidth: 1,
            },
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

    const series: Record<string, unknown>[] = [mainSeries];
    if (chartPrefs.showVolume) {
      series.push({
        name: "Volume",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: [],
        barWidth: "60%",
        large: true,
      });
    }

    return {
      backgroundColor: "transparent",
      animationDuration: 300,
      animationDurationUpdate: 120,
      grid,
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
          const candle = mergedRef.current[index];
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
      xAxis: [
        {
          type: "category",
          // Data arrives through the data option (merge mode) — see below.
          data: [],
          boundary: true,
          axisLine: { lineStyle: { color: theme.border } },
          axisTick: { show: false },
          axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, margin: 10 },
          splitLine: { show: false },
        },
        ...(chartPrefs.showVolume
          ? [
              {
                type: "category",
                gridIndex: 1,
                data: [],
                boundary: true,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
                splitLine: { show: false },
              },
            ]
          : []),
      ],
      yAxis: [
        {
          type: "value",
          scale: true,
          position: "right",
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: theme.textMuted, fontFamily: theme.monoFont, fontSize: 10, formatter: (value: number) => formatPrice(value, digits) },
          // Settings → Trading → "Show grid" — the price/time grid lines.
          splitLine: {
            show: chartPrefs.showGrid,
            lineStyle: { color: theme.border, width: 1, opacity: 0.6 },
          },
        },
        ...(chartPrefs.showVolume
          ? [
              {
                type: "value",
                gridIndex: 1,
                position: "right",
                // Bars sit low like a sparkline strip, never fight the price.
                max: (extent: { max: number }) => Math.ceil((extent.max ?? 1) * 4) || 1,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
                splitLine: { show: false },
              },
            ]
          : []),
      ],
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: chartPrefs.showVolume ? [0, 1] : 0,
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          preventDefaultMouseMove: false,
        },
        {
          type: "slider",
          xAxisIndex: chartPrefs.showVolume ? [0, 1] : 0,
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
    // `merged` is read inside the tooltip formatter through a ref, so the
    // structural option never rebuilds (and never resets zoom) on ticks.
    // Chart-pref changes ARE structural (series type / panes / grid lines).
  }, [theme, interval, symbol, digits, chartPrefs]);

  // ── Data option (labels + candles + overlays) — merge keeps zoom/pan ─────
  const dataOption = React.useMemo<EChartsCoreOption>(() => {
    const lines = overlayLines(overlayTrades, theme);
    const markLineData: Array<Record<string, unknown>> = lines.map((line) => ({
      yAxis: line.value,
      lineStyle: { color: line.color, type: line.dashed ? "dashed" : "solid", width: 1, opacity: 0.9 },
      label: {
        formatter: `${line.label} ${formatPrice(line.value, digits)}`,
        position: "insideEndTop",
        color: line.color,
        fontFamily: theme.monoFont,
        fontSize: 9,
      },
      symbol: "none",
      emphasis: { disabled: true },
      // Informational only — no click/edit path exists.
      silent: true,
    }));
    if (quote && !stale && !replayOn) {
      markLineData.push({
        yAxis: quote.price,
        lineStyle: { color: theme.accent, type: "dashed", width: 1, opacity: 0.55 },
        label: {
          formatter: formatPrice(quote.price, digits),
          position: "insideEndBottom",
          color: theme.accent,
          fontFamily: theme.monoFont,
          fontSize: 9,
        },
        symbol: "none",
        emphasis: { disabled: true },
        silent: true,
      });
    }
    // Style decides the payload shape: OHLC tuples for candles, closes for
    // line/area. markLine overlays work on either series type.
    const mainData =
      chartPrefs.style === "CANDLES" ? view.ohlc : displayed.map((candle) => candle.c);
    const series: Array<Record<string, unknown>> = [
      {
        data: mainData,
        markLine: { animation: false, symbol: "none", silent: true, data: markLineData },
      },
    ];
    if (chartPrefs.showVolume) {
      // Per-candle color: profit tone on up buckets, loss tone on down ones.
      series.push({
        data: displayed.map((candle) => ({
          value: candle.v,
          itemStyle: {
            color:
              candle.c >= candle.o ? `${theme.profit}8C` : `${theme.loss}8C`,
          },
        })),
      });
    }
    return {
      xAxis:
        chartPrefs.showVolume
          ? [{ data: view.labels }, { data: view.labels }]
          : { data: view.labels },
      series,
    };
  }, [view, displayed, overlayTrades, quote, stale, theme, digits, chartPrefs, replayOn]);

  // ── Canvas lifecycle (init / theme re-init / dispose) ────────────────────
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

  // Structural rebuild — safe to reset zoom (symbol/interval/theme change).
  React.useEffect(() => {
    chartRef.current?.setOption(baseOption, { notMerge: true });
  }, [baseOption]);

  // Data update — merge mode preserves the user's zoom & pan.
  React.useEffect(() => {
    chartRef.current?.setOption(dataOption);
  }, [dataOption]);

  if (isError) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl border border-border bg-surface ${heightClass}`}>
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
        className={`relative rounded-xl border border-border bg-surface ${heightClass}`}
        data-testid="price-chart"
        data-symbol={symbol}
        data-interval={interval}
        data-chart-style={chartPrefs.style}
        data-show-volume={chartPrefs.showVolume ? "true" : "false"}
        data-show-grid={chartPrefs.showGrid ? "true" : "false"}
        data-replay={replayOn ? "true" : "false"}
        data-replay-index={replayOn ? replayIndex : undefined}
      >
        {isLoading && displayed.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center" aria-live="polite">
            <p className="text-sm text-muted-foreground">Loading market data…</p>
          </div>
        ) : null}

        {/* Replay toggle — always available once candles exist */}
        {displayed.length > 0 ? (
          <button
            type="button"
            onClick={toggleReplay}
            aria-label={replayOn ? "Exit price replay" : "Replay the price curve"}
            aria-pressed={replayOn}
            data-testid="session-replay-toggle"
            className={cn(
              "absolute top-3 left-3 z-10 inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium backdrop-blur transition-colors",
              replayOn
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-border bg-background/85 text-muted-foreground hover:text-foreground",
            )}
          >
            <History className="size-3.5" aria-hidden="true" />
            Replay
          </button>
        ) : null}

        <div
          ref={containerRef}
          role="img"
          aria-label={`${symbol} ${interval} ${chartPrefs.style.toLowerCase()} chart with journal position overlays`}
          className="size-full"
        />
      </div>

      {/* Replay scrubber — a footer bar, only while replay is active */}
      {replayOn && displayed.length > 0 ? (
        <div
          className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2"
          data-testid="session-replay-bar"
        >
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
          <button
            type="button"
            onClick={toggleReplay}
            aria-label="Close replay"
            data-testid="session-replay-close"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import type { MarketInterval } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDict } from "@/i18n/i18n-provider";
import {
  CHART_RANGES,
  CHART_SYMBOLS,
  INTERVAL_TABS,
  computeEma,
  formatChartPrice,
  formatSignedPercent,
  generateSimTrades,
  getChartSymbol,
  rangeBarCount,
  type ChartRange,
} from "@/lib/charts/chart-sim";
import { useChartCandles } from "@/lib/charts/use-chart-candles";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

import {
  TradingChart,
  type HoveredBar,
  type TradingChartHandle,
} from "@/components/charts/trading-chart";

/**
 * ChartView — the Charts module (Trading section): a full-width, TradingView-
 * grade candlestick pane with the module chrome around it — symbol picker,
 * timeframe tabs, MA/Trades overlays, the OHLC legend + bid/ask badges pinned
 * over the chart (reference UX) and the range bar with a UTC clock below.
 *
 * Honesty rule (mission §16): the feed badge shows LIVE only when candles
 * come from the market service; the deterministic local fallback is labeled
 * SIM, everywhere it matters (badge + legend + title tooltips).
 */

const EMA_PERIOD = 20;

function utcClock(nowMs: number | null): string {
  if (nowMs === null) return "--:--:--";
  return new Date(nowMs).toISOString().slice(11, 19);
}

export function ChartView() {
  const dict = useDict();
  const t = dict.charts;

  const [symbol, setSymbol] = useState<string>("XAUUSD");
  const [interval, setIntervalTf] = useState<MarketInterval>("5m");
  const [showEma, setShowEma] = useState(true);
  const [showTrades, setShowTrades] = useState(true);
  const [hovered, setHovered] = useState<HoveredBar | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const chartRef = useRef<TradingChartHandle | null>(null);
  const nowMs = useNowMs(1000);

  const { data, isPending } = useChartCandles(symbol, interval);

  const spec = getChartSymbol(symbol);
  const candles = useMemo(() => data?.candles ?? [], [data]);
  const source = data?.source ?? "sim";
  const simulated = source === "sim";

  const ema = useMemo(() => computeEma(candles, EMA_PERIOD), [candles]);
  const trades = useMemo(
    () => generateSimTrades(candles, symbol, spec.digits),
    [candles, symbol, spec.digits],
  );

  const last = candles.at(-1) ?? null;
  const prev = candles.at(-2) ?? null;

  // Legend shows the crosshair bar while hovering, the last bar otherwise.
  const bar: HoveredBar | null = hovered ?? (last
    ? { time: last.t, open: last.o, high: last.h, low: last.l, close: last.c }
    : null);
  const refClose = prev?.c ?? bar?.open ?? 0;
  const change = bar && refClose ? bar.close - refClose : 0;
  const changePct = bar && refClose ? (change / refClose) * 100 : 0;
  const bullBar = bar ? bar.close >= bar.open : true;
  const bullChange = change >= 0;

  // Bid/ask around the current price (display badges, not tradeable).
  const price = bar?.close ?? livePrice ?? spec.anchor;
  const halfSpread = spec.spread / 2;
  const bid = price - halfSpread;
  const ask = price + halfSpread;
  const spreadPips = (spec.spread / spec.pipSize).toFixed(1);

  const applyRange = (range: ChartRange) => {
    // First second after mount the ticker hasn't fired — the whole series is
    // the only honest fallback (pure render: never call Date.now here).
    if (nowMs === null) {
      chartRef.current?.fitAll();
      return;
    }
    const count = rangeBarCount(range, interval, nowMs, candles.length);
    chartRef.current?.showLastBars(count);
  };

  const upColor = "text-[color:var(--accent)]";
  const downColor = "text-[color:var(--loss)]";

  return (
    <section aria-label="Charts" className="flex w-full flex-col gap-3">
      {/* ── Toolbar: symbol · timeframes · overlays · feed badge ─────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 px-2.5 font-semibold"
              aria-label={t.toolbar.symbolAria}
            >
              <span>{symbol}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>{t.toolbar.symbol}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CHART_SYMBOLS.map((item) => (
              <DropdownMenuItem
                key={item.symbol}
                onSelect={() => setSymbol(item.symbol)}
                className={cn("flex-col items-start gap-0.5", item.symbol === symbol && "bg-accent/10")}
              >
                <span className="text-sm font-semibold">{item.symbol}</span>
                <span className="text-xs text-muted-foreground">{item.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          role="tablist"
          aria-label={t.toolbar.timeframesAria}
          className="flex items-center gap-0.5 rounded-md bg-background/60 p-0.5"
        >
          {INTERVAL_TABS.map((tab) => (
            <Button
              key={tab.interval}
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={interval === tab.interval}
              onClick={() => setIntervalTf(tab.interval)}
              className={cn(
                "h-7 min-w-8 px-1.5 text-xs font-semibold tabular-nums",
                interval === tab.interval
                  ? "bg-accent text-primary-foreground hover:bg-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={showEma}
            onClick={() => setShowEma((value) => !value)}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <span className="size-2 rounded-full bg-[color:var(--warning)]" aria-hidden />
            {t.toolbar.overlayMA}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={showTrades}
            onClick={() => setShowTrades((value) => !value)}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <span className="size-2 rounded-full bg-[color:var(--cat-pa)]" aria-hidden />
            {t.toolbar.overlayTrades}
          </Button>
        </div>

        <p className="ml-auto hidden text-xs text-muted-foreground xl:block">
          {t.states.hint}
        </p>

        <span
          title={simulated ? t.toolbar.feedSimTitle : t.toolbar.feedRealTitle}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold tracking-wide",
            simulated
              ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
              : "border-[color:var(--profit)]/40 bg-[color:var(--profit)]/10 text-[color:var(--profit)]",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              simulated ? "bg-[color:var(--warning)]" : "animate-pulse bg-[color:var(--profit)]",
            )}
            aria-hidden
          />
          {simulated ? t.toolbar.feedSim : t.toolbar.feedReal}
        </span>
      </div>

      {/* ── Chart pane — FULL WIDTH, legend + bid/ask pinned over it ─────── */}
      <div className="relative h-[min(66vh,720px)] min-h-[440px] w-full overflow-hidden rounded-lg border bg-surface">
        {isPending ? (
          <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.states.loading}
          </div>
        ) : candles.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {t.states.empty}
          </div>
        ) : (
          <>
            <TradingChart
              ref={chartRef}
              candles={candles}
              ema={ema}
              trades={trades}
              spec={spec}
              showEma={showEma}
              showTrades={showTrades}
              simulated={simulated}
              onHoverBar={setHovered}
              onLivePrice={setLivePrice}
            />

            {/* Legend — reference UX: name · timeframe · feed, OHLC, change */}
            <div className="pointer-events-none absolute left-3 top-2.5 z-10 flex flex-col gap-1.5">
              <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block size-3.5 rounded-[3px] bg-[color:var(--warning)]"
                    aria-hidden
                  />
                  {spec.name}
                </span>
                <span className="text-muted-foreground">· {INTERVAL_TABS.find((tab) => tab.interval === interval)?.label} ·</span>
                <span className="text-muted-foreground">
                  {simulated ? t.legend.sourceSim : t.legend.sourceReal}
                </span>
              </p>
              {bar ? (
                <p className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums">
                  <span className="text-muted-foreground">{t.legend.open}</span>
                  <span className={bullBar ? upColor : downColor}>{formatChartPrice(bar.open, spec.digits)}</span>
                  <span className="text-muted-foreground">{t.legend.high}</span>
                  <span className={bullBar ? upColor : downColor}>{formatChartPrice(bar.high, spec.digits)}</span>
                  <span className="text-muted-foreground">{t.legend.low}</span>
                  <span className={bullBar ? upColor : downColor}>{formatChartPrice(bar.low, spec.digits)}</span>
                  <span className="text-muted-foreground">{t.legend.close}</span>
                  <span className={bullBar ? upColor : downColor}>{formatChartPrice(bar.close, spec.digits)}</span>
                  <span className={bullChange ? "text-[color:var(--profit)]" : "text-[color:var(--loss)]"}>
                    {formatChartPrice(change, spec.digits)} ({formatSignedPercent(changePct)})
                  </span>
                </p>
              ) : null}
              {/* Bid / ask badges — display only (the journal never trades here) */}
              <p className="flex items-center gap-1.5 text-xs tabular-nums">
                <span className="rounded-[5px] border border-[color:var(--loss)]/60 bg-[color:var(--loss)]/15 px-2 py-1 font-bold text-[color:var(--loss)]">
                  {formatChartPrice(bid, spec.digits)}{" "}
                  <span className="ml-1 font-semibold opacity-80">{t.quote.sell}</span>
                </span>
                <span className="text-muted-foreground" title={t.quote.spreadLabel}>
                  {spreadPips}
                </span>
                <span className="rounded-[5px] border border-[color:var(--accent)]/60 bg-[color:var(--accent)]/15 px-2 py-1 font-bold text-[color:var(--accent)]">
                  {formatChartPrice(ask, spec.digits)}{" "}
                  <span className="ml-1 font-semibold opacity-80">{t.quote.buy}</span>
                </span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Range bar + UTC clock ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-surface px-2 py-1.5">
        <span className="sr-only">{t.range.aria}</span>
        {CHART_RANGES.map((range) => (
          <Button
            key={range}
            variant="ghost"
            size="sm"
            onClick={() => applyRange(range)}
            className="h-7 shrink-0 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {range}
          </Button>
        ))}
        <Badge
          variant="outline"
          className="ml-auto shrink-0 border-transparent bg-background/60 font-mono text-xs tabular-nums text-muted-foreground"
        >
          {utcClock(nowMs)} {t.clock.utc}
        </Badge>
      </div>
    </section>
  );
}

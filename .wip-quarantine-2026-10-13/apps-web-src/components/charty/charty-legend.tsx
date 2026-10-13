"use client";

import * as React from "react";

import type { Candle, Instrument, MarketInterval } from "@cosmoz/shared";
import { formatPrice } from "@cosmoz/shared";
import { useI18n } from "@/i18n/i18n-provider";
import type { LiveQuote } from "@/lib/realtime/market";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Charty LEGEND — the TradingView-style overlay on the chart's top-left:
 * instrument · interval · feed, then O H L C of the live candle (real
 * values, colored) with the change vs the real previous close. The SELL/BUY
 * pills show the REAL feed price on both sides (no fabricated spread) and
 * are deliberately non-executable — this is a read-only workspace; the
 * countdown is the real time to the current candle's close.
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

interface ChartyLegendProps {
  symbol: string;
  instrument: Instrument | null;
  interval: MarketInterval;
  quote: LiveQuote | null;
  candles: Candle[];
  digits: number;
}

export function ChartyLegend({ symbol, instrument, interval, quote, candles, digits }: ChartyLegendProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const nowMs = useNowMs();

  const last = candles.length > 0 ? candles[candles.length - 1] : null;
  const prev = candles.length > 1 ? candles[candles.length - 2] : null;
  const price = quote?.price ?? last?.c ?? null;
  const reference = quote?.prevClose ?? prev?.c ?? last?.o ?? null;
  const change = price !== null && reference !== null ? price - reference : null;
  const changePct = change !== null && reference !== null && reference !== 0 ? (change / reference) * 100 : null;
  const up = (change ?? 0) >= 0;

  const countdown = React.useMemo(() => {
    if (nowMs === null) return null;
    const ms = INTERVAL_MS[interval];
    const remaining = ms - (nowMs % ms);
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [nowMs, interval]);

  const ohlc = last !== null
    ? [
        { key: "O", value: last.o, cls: "text-accent" },
        { key: "H", value: last.h, cls: "text-profit" },
        { key: "L", value: last.l, cls: "text-loss" },
        { key: "C", value: last.c, cls: up ? "text-profit" : "text-loss" },
      ]
    : [];

  return (
    <div className="pointer-events-none absolute left-2.5 top-2 z-10 max-w-[calc(100%-90px)]" data-testid="charty-legend">
      {/* Row 1 — identity */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="font-semibold text-foreground">
          {instrument?.name ?? symbol}
          <span className="ml-1.5 font-mono font-normal text-muted-foreground">{interval}</span>
          {quote !== null ? (
            <span className="ml-1.5 rounded bg-muted px-1 py-px font-mono text-[9px] font-semibold uppercase text-muted-foreground" title={S.charty.feedSourceTitle}>
              {quote.source}
            </span>
          ) : null}
        </span>

        {ohlc.map((item) => (
          <span key={item.key} className="hidden font-mono tabular-nums sm:inline">
            <span className="text-muted-foreground">{item.key}</span>{" "}
            <span className={item.cls}>{formatPrice(item.value, digits)}</span>
          </span>
        ))}

        {change !== null ? (
          <span className={cn("font-mono tabular-nums", up ? "text-profit" : "text-loss")} data-testid="charty-legend-change">
            {up ? "+" : ""}
            {formatPrice(change, digits)}
            {changePct !== null ? ` (${up ? "+" : ""}${changePct.toFixed(2)}%)` : ""}
          </span>
        ) : null}
      </div>

      {/* Row 2 — SELL/BUY quote pills (real price, non-executable) + countdown */}
      <div className="pointer-events-auto mt-1.5 flex items-center gap-1.5">
        {price !== null ? (
          <>
            <span
              title={S.charty.readonlyTooltip}
              data-testid="charty-quote-sell"
              className="cursor-help rounded-[4px] bg-loss px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-white shadow-sm"
            >
              {formatPrice(price, digits)}
              <span className="ml-1 text-[9px] font-bold uppercase opacity-80">SELL</span>
            </span>
            <span
              title={S.charty.readonlyTooltip}
              data-testid="charty-quote-buy"
              className="cursor-help rounded-[4px] bg-accent px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-white shadow-sm"
            >
              {formatPrice(price, digits)}
              <span className="ml-1 text-[9px] font-bold uppercase opacity-80">BUY</span>
            </span>
          </>
        ) : null}
        {countdown !== null ? (
          <span
            title={S.charty.countdownTitle}
            data-testid="charty-countdown"
            className="rounded-[4px] border border-border bg-background/85 px-1.5 py-1 font-mono text-[11px] font-semibold tabular-nums text-foreground backdrop-blur"
          >
            {countdown}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The chart watermark — bottom-left, like the reference terminal. */
export function ChartyWatermark() {
  const { dict } = useI18n();
  return (
    <span
      aria-hidden="true"
      data-testid="charty-watermark"
      className="pointer-events-none absolute bottom-14 left-3 z-10 select-none font-heading text-2xl font-bold tracking-tight text-muted-foreground/25"
    >
      {dict.session.charty.watermark}
    </span>
  );
}

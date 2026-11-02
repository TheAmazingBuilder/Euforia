"use client";

import * as React from "react";
import { Activity, RadioTower } from "lucide-react";

import { STALE_MS, useLiveQuotes } from "@/lib/realtime/market";
import type { LiveQuote } from "@/lib/realtime/market";
import { isQuoteFresh, quoteChangePercent, selectRealTickerQuotes } from "@/lib/realtime/market-ticker";
import { cn } from "@/lib/utils";

function displaySymbol(symbol: string): string {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: price < 1 ? 4 : 2,
    maximumFractionDigits: price < 1 ? 6 : price < 100 ? 4 : 2,
  }).format(price);
}

function MarketQuoteItem({ quote, nowMs }: { quote: LiveQuote; nowMs: number }) {
  const change = quoteChangePercent(quote);
  const fresh = isQuoteFresh(quote, nowMs, STALE_MS);
  const direction = change === null || change === 0 ? "flat" : change > 0 ? "up" : "down";
  const ageSeconds = Math.max(0, Math.floor((nowMs - quote.ts) / 1_000));

  return (
    <div
      className="flex min-w-[218px] items-center gap-3 border-r border-border/70 px-4 py-2.5"
      data-testid="market-ticker-quote"
      data-symbol={quote.symbol}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-foreground">{displaySymbol(quote.symbol)}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">CRYPTO · 24H</p>
      </div>
      <div className="ml-auto min-w-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums text-foreground">${formatPrice(quote.price)}</p>
        <p
          className={cn(
            "mt-0.5 font-mono text-[10px] tabular-nums",
            direction === "up" ? "text-profit" : direction === "down" ? "text-loss" : "text-muted-foreground",
          )}
        >
          {change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
          <span className="ml-1.5 text-muted-foreground">{fresh ? "LIVE" : `STALE · ${ageSeconds}s`}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Authenticated market-service ticker. Only provider-confirmed real quotes
 * are rendered; simulated instruments are always filtered out.
 */
export function MarketTicker() {
  const market = useLiveQuotes();
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const quotes = React.useMemo(
    () => selectRealTickerQuotes(market.quotes.values()),
    [market.quotes],
  );
  const freshCount = quotes.filter((quote) => isQuoteFresh(quote, nowMs, STALE_MS)).length;
  const connected = freshCount > 0;

  return (
    <section
      aria-label="Real market prices"
      className="overflow-hidden rounded-xl border border-border bg-surface"
      data-testid="market-ticker"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">MARKET WATCH</span>
          <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
          <span className="text-[10px] text-muted-foreground">REAL-TIME FEED</span>
        </div>
        <span className={cn(
          "inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide",
          connected ? "text-profit" : quotes.length > 0 ? "text-warning" : "text-muted-foreground",
        )}>
          <span className={cn("size-1.5 rounded-full", connected ? "bg-profit" : quotes.length > 0 ? "bg-warning" : "bg-muted-foreground")} />
          {connected ? "LIVE" : quotes.length > 0 ? "STALE" : "NO REAL QUOTES"}
        </span>
      </div>

      {quotes.length === 0 ? (
        <div className="flex min-h-16 items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <RadioTower className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          {market.phase === "connecting" || market.phase === "reconnecting"
            ? "Connecting to the real market feed…"
            : "No verified real-market quotes are available. Simulated prices are hidden."}
        </div>
      ) : (
        <div className="overflow-hidden" aria-live="off">
          <div className={quotes.length > 1 ? "market-ticker-track" : "flex w-full items-stretch"}>
            {quotes.map((quote) => (
              <MarketQuoteItem key={quote.symbol} quote={quote} nowMs={nowMs} />
            ))}
            {quotes.length > 1
              ? quotes.map((quote) => (
                  <div key={`repeat-${quote.symbol}`} aria-hidden="true">
                    <MarketQuoteItem quote={quote} nowMs={nowMs} />
                  </div>
                ))
              : null}
          </div>
        </div>
      )}
      <p className="sr-only">
        {quotes.length} real market instruments available; {freshCount} fresh quotes.
      </p>
    </section>
  );
}

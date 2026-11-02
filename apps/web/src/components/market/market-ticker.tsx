"use client";

import * as React from "react";
import { Activity, RadioTower } from "lucide-react";

import { STALE_MS, useLiveQuotes } from "@/lib/realtime/market";
import type { LiveQuote } from "@/lib/realtime/market";
import {
  formatMarketSymbol,
  isQuoteFresh,
  marketTypeLabel,
  pricePrecision,
  quoteChangePercent,
  selectRealTickerQuotes,
} from "@/lib/realtime/market-ticker";
import { cn } from "@/lib/utils";

function formatPrice(price: number, precision: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(price);
}

function MarketQuoteItem({ quote, nowMs }: { quote: LiveQuote; nowMs: number }) {
  const change = quoteChangePercent(quote);
  const fresh = isQuoteFresh(quote, nowMs, STALE_MS);
  const direction = change === null || change === 0 ? "flat" : change > 0 ? "up" : "down";
  const ageSeconds = Math.max(0, Math.floor((nowMs - quote.ts) / 1_000));
  const currency = quote.marketType === "SYNTHETIC" ? "" : quote.quoteCurrency ?? "";
  const suffix = currency.length > 0 ? ` ${currency}` : "";

  return (
    <div
      className="flex min-w-[218px] items-center gap-3 border-r border-border/70 px-4 py-2.5"
      data-testid="market-ticker-quote"
      data-symbol={quote.symbol}
      data-provider={quote.provider}
      data-market-type={quote.marketType}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-foreground">{formatMarketSymbol(quote)}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {marketTypeLabel(quote.marketType)} · {quote.provider.toUpperCase()}
        </p>
      </div>
      <div className="ml-auto min-w-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {formatPrice(quote.price, pricePrecision(quote))}{suffix}
        </p>
        <p className={cn(
          "mt-0.5 font-mono text-[10px] tabular-nums",
          direction === "up" ? "text-profit" : direction === "down" ? "text-loss" : "text-muted-foreground",
        )}>
          {change === null ? "24H N/A" : `${change > 0 ? "+" : ""}${change.toFixed(2)}% · 24H`}
          <span className="ml-1.5 text-muted-foreground">{fresh ? "LIVE" : `STALE · ${ageSeconds}s`}</span>
        </p>
      </div>
    </div>
  );
}

/** Real provider quotes only. There is no local/demo market-data fallback. */
export function MarketTicker() {
  const market = useLiveQuotes();
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const quotes = React.useMemo(() => selectRealTickerQuotes(market.quotes.values()), [market.quotes]);
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
          <span className="text-[10px] text-muted-foreground">LIVE PROVIDER DATA</span>
        </div>
        <span className={cn(
          "inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wide",
          connected ? "text-profit" : quotes.length > 0 ? "text-warning" : "text-muted-foreground",
        )}>
          <span className={cn("size-1.5 rounded-full", connected ? "bg-profit" : quotes.length > 0 ? "bg-warning" : "bg-muted-foreground")} />
          {connected ? "LIVE" : quotes.length > 0 ? "STALE" : "NO LIVE QUOTES"}
        </span>
      </div>

      {quotes.length === 0 ? (
        <div className="flex min-h-16 items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <RadioTower className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          {market.phase === "connecting" || market.phase === "reconnecting"
            ? "Connecting to live market providers…"
            : "No live provider quotes are available. No replacement or simulated prices are shown."}
        </div>
      ) : (
        <div className="overflow-hidden" aria-live="off">
          <div className={quotes.length > 1 ? "market-ticker-track" : "flex w-full items-stretch"}>
            {quotes.map((quote) => <MarketQuoteItem key={quote.symbol} quote={quote} nowMs={nowMs} />)}
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
      <p className="sr-only">{quotes.length} real market instruments available; {freshCount} fresh quotes.</p>
    </section>
  );
}

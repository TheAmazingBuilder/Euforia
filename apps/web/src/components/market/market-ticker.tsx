"use client";

import * as React from "react";

import { STALE_MS, useLiveQuotes } from "@/lib/realtime/market";
import type { LiveQuote } from "@/lib/realtime/market";
import {
  formatMarketSymbol,
  isQuoteFresh,
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
  const direction = change === null ? "unknown" : change === 0 ? "flat" : change > 0 ? "up" : "down";
  const currency = quote.marketType === "SYNTHETIC" ? "" : quote.quoteCurrency ?? "";
  const suffix = currency.length > 0 ? ` ${currency}` : "";

  return (
    <div
      className="market-ticker-item"
      data-testid="market-ticker-quote"
      data-symbol={quote.symbol}
      data-provider={quote.provider}
      data-market-type={quote.marketType}
      title={`${quote.provider.toUpperCase()} · ${fresh ? "Fresh provider quote" : "Stale provider quote"}`}
    >
      <span className="market-ticker-symbol">{formatMarketSymbol(quote)}</span>
      <span className="market-ticker-price">
        {formatPrice(quote.price, pricePrecision(quote))}{suffix}
      </span>
      <span className="market-ticker-change" data-direction={direction}>
        {change === null
          ? "— N/A"
          : `${change > 0 ? "▲" : change < 0 ? "▼" : "•"} ${Math.abs(change).toFixed(2)}%`}
      </span>
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
  const status =
    quotes.length === 0
      ? market.phase === "connecting" || market.phase === "reconnecting" ? "CONNECTING" : "NO LIVE"
      : freshCount === quotes.length
        ? "LIVE"
        : freshCount > 0
          ? "PARTIAL"
          : "STALE";

  const emptyMessage =
    market.phase === "connecting" || market.phase === "reconnecting"
      ? "Connecting to live providers…"
      : "No live provider quotes available. Simulated prices are never displayed.";

  return (
    <section
      aria-label="Live market ticker"
      className="market-ticker"
      data-testid="market-ticker"
      data-market-status={status}
    >
      <div className="market-ticker-viewport" aria-live="off">
        {quotes.length === 0 ? (
          <div className="market-ticker-empty">{emptyMessage}</div>
        ) : (
          <div className={cn("market-ticker-track", quotes.length <= 1 && "market-ticker-track-static")}>
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
        )}
      </div>

      <div className="market-ticker-status" data-status={status} aria-label={`Market data status: ${status.toLowerCase()}`}>
        <span className="market-ticker-status-indicator" aria-hidden="true" />
        {status}
      </div>
      <p className="sr-only">
        {quotes.length} real market instruments available; {freshCount} fresh quotes.
      </p>
    </section>
  );
}

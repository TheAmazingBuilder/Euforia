import type { LiveQuote } from "./market";

/** Provider-confirmed quotes only: simulated and malformed values are rejected. */
export function selectRealTickerQuotes(quotes: Iterable<LiveQuote>): LiveQuote[] {
  return [...quotes]
    .filter(
      (quote) =>
        quote.source === "real" &&
        Number.isFinite(quote.price) &&
        quote.price > 0 &&
        Number.isFinite(quote.prevClose) &&
        quote.prevClose > 0 &&
        Number.isFinite(quote.ts) &&
        quote.ts > 0,
    )
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function quoteChangePercent(quote: Pick<LiveQuote, "price" | "prevClose">): number | null {
  if (
    !Number.isFinite(quote.price) ||
    quote.price <= 0 ||
    !Number.isFinite(quote.prevClose) ||
    quote.prevClose <= 0
  ) {
    return null;
  }
  return ((quote.price - quote.prevClose) / quote.prevClose) * 100;
}

export function isQuoteFresh(quote: Pick<LiveQuote, "ts">, nowMs: number, staleMs: number): boolean {
  const ageMs = nowMs - quote.ts;
  return Number.isFinite(quote.ts) && quote.ts > 0 && ageMs <= staleMs && ageMs >= -60_000;
}

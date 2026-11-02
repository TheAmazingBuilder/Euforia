import type { LiveQuote } from "./market";

/** Only real, finite provider observations enter the ticker. */
export function selectRealTickerQuotes(quotes: Iterable<LiveQuote>): LiveQuote[] {
  return [...quotes]
    .filter((quote) =>
      quote.source === "real" &&
      Number.isFinite(quote.price) && quote.price > 0 &&
      Number.isFinite(quote.ts) && quote.ts > 0,
    )
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function quoteChangePercent(quote: Pick<LiveQuote, "price" | "prevClose">): number | null {
  if (
    !Number.isFinite(quote.price) || quote.price <= 0 ||
    quote.prevClose === null ||
    !Number.isFinite(quote.prevClose) || quote.prevClose <= 0
  ) return null;
  return ((quote.price - quote.prevClose) / quote.prevClose) * 100;
}

export function isQuoteFresh(quote: Pick<LiveQuote, "ts">, nowMs: number, staleMs: number): boolean {
  const ageMs = nowMs - quote.ts;
  return Number.isFinite(quote.ts) && quote.ts > 0 && ageMs <= staleMs && ageMs >= -60_000;
}

export function formatMarketSymbol(quote: Pick<LiveQuote, "symbol" | "marketType">): string {
  if (quote.marketType === "CRYPTO_SPOT" && quote.symbol.endsWith("USDT")) return `${quote.symbol.slice(0, -4)}/USDT`;
  if (quote.marketType === "FOREX" && quote.symbol.length === 6) return `${quote.symbol.slice(0, 3)}/${quote.symbol.slice(3)}`;
  if (quote.marketType === "METAL" && quote.symbol.endsWith("USD")) return `${quote.symbol.slice(0, -3)}/USD`;
  if (quote.symbol === "VOL75(1s)") return "Volatility 75 (1s)";
  return quote.symbol;
}

export function marketTypeLabel(marketType: LiveQuote["marketType"]): string {
  switch (marketType) {
    case "CRYPTO_SPOT": return "CRYPTO SPOT";
    case "FOREX": return "FOREX";
    case "METAL": return "METAL";
    case "SYNTHETIC": return "DERIV SYNTHETIC";
  }
}

export function pricePrecision(quote: Pick<LiveQuote, "symbol" | "marketType">): number {
  if (quote.marketType === "FOREX") return quote.symbol.endsWith("JPY") ? 3 : 5;
  if (quote.marketType === "METAL" || quote.marketType === "SYNTHETIC") return 2;
  return quote.symbol.includes("DOGE") || quote.symbol.includes("ADA") || quote.symbol.includes("XRP") ? 4 : 2;
}

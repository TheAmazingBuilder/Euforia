import type { AssetClass } from "@cosmoz/shared";

/**
 * Instrument display helpers - asset-class aware UI copy.
 * Labels are driven by instrument metadata, never by per-asset-class
 * constants in business code (trade-entry-ux.md §4 "Asset-class adaptation").
 */

const ASSET_CLASS_BADGES: Record<AssetClass, string> = {
  FOREX: "FX",
  CRYPTO: "Crypto",
  SYNTHETIC: "Synthetic",
  INDEX: "Index",
  METAL: "Metal",
  ENERGY: "Energy",
};

/** Compact badge label for an asset class ("FX", "Synthetic"…). */
export function assetClassBadge(assetClass: AssetClass): string {
  return ASSET_CLASS_BADGES[assetClass];
}

const SIZE_UNIT_LABELS: Record<AssetClass, string> = {
  FOREX: "lots",
  CRYPTO: "units",
  SYNTHETIC: "stake",
  INDEX: "units",
  METAL: "oz",
  ENERGY: "units",
};

/** Unit word for the position size of an asset class ("lots"/"stake"/"units"). */
export function sizeUnitLabel(assetClass: AssetClass): string {
  return SIZE_UNIT_LABELS[assetClass];
}

/**
 * Canonical market notation for user-facing labels.
 * Presentation only: preserve raw symbols for API calls, storage and matching.
 */
const FX_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SGD",
  "HKD", "CNY", "SEK", "NOK", "DKK", "ZAR", "MXN", "TRY", "PLN",
]);
const CRYPTO_QUOTES = ["USDT", "USDC", "BUSD", "USD", "BTC", "ETH"] as const;
const SYNTHETIC_LABELS: Record<string, string> = {
  BOOM500: "Boom 500",
  CRASH500: "Crash 500",
  "VOL75(1S)": "Volatility 75 (1s)",
};

export function formatInstrumentSymbol(symbol: string, assetClass?: AssetClass): string {
  const canonical = symbol.trim().toUpperCase();
  if (canonical === "") return symbol;
  const isForex = assetClass === "FOREX" ||
    (assetClass === undefined && /^[A-Z]{6}$/.test(canonical) &&
      FX_CURRENCIES.has(canonical.slice(0, 3)) && FX_CURRENCIES.has(canonical.slice(3, 6)));
  if (isForex && /^[A-Z]{6}$/.test(canonical)) return canonical.slice(0, 3) + "/" + canonical.slice(3);
  const isCrypto = assetClass === "CRYPTO" ||
    (assetClass === undefined && CRYPTO_QUOTES.some((quote) => canonical.endsWith(quote)));
  if (isCrypto) {
    const quote = CRYPTO_QUOTES.find((candidate) => canonical.endsWith(candidate));
    if (quote !== undefined && canonical.length > quote.length) return canonical.slice(0, -quote.length) + "/" + quote;
  }
  const isMetal = assetClass === "METAL" ||
    (assetClass === undefined && /^(XAU|XAG|XPT|XPD)USD$/.test(canonical));
  if (isMetal && canonical.endsWith("USD")) return canonical.slice(0, -3) + "/USD";
  if (assetClass === "SYNTHETIC" || assetClass === undefined) {
    const known = SYNTHETIC_LABELS[canonical];
    if (known !== undefined) return known;
    const volatility = canonical.match(/^VOL(\d+)(\(1S\))?$/);
    if (volatility !== null) return "Volatility " + volatility[1] + (volatility[2] ? " (1s)" : "");
  }
  // Actual exchange codes (NQ, ES, GC, CL, DXY, etc.) remain intact.
  return symbol;
}


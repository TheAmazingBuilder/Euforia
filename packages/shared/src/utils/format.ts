import { parseDecimal, DEFAULT_FORMAT_LOCALE, MONEY_PLACEHOLDER } from "./money";

/**
 * Number & duration display formatters - pure, deterministic, Intl-based.
 * All user-facing numbers rendered through these must use font-mono in JSX
 * (AGENTS.md golden rule - enforced at component level, not here).
 */

/**
 * Format an R-multiple, always signed, 2 decimals: formatR("1.2") → "+1.20R",
 * formatR(-0.85) → "-0.85R", formatR("0") → "+0.00R".
 * Invalid input → placeholder.
 */
export function formatR(r: string | number | null | undefined): string {
  const value = parseDecimal(r);
  if (value === null) return MONEY_PLACEHOLDER;
  const sign = value < 0 ? "-" : "+";
  return `${sign}${Math.abs(value).toFixed(2)}R`;
}

/**
 * Format a price with exactly `digits` decimals, e.g.
 * formatPrice("1.08453", 4) → "1,0845" (fr-FR grouping applies).
 * Invalid input → placeholder.
 */
export function formatPrice(
  price: string | number | null | undefined,
  digits: number,
  locale: string = DEFAULT_FORMAT_LOCALE,
): string {
  const value = parseDecimal(price);
  if (value === null) return MONEY_PLACEHOLDER;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Format a trade duration between two UTC ISO timestamps as "2h14"
 * (h = hours, mm zero-padded); under one hour → "45m"; under a minute → "0m".
 * Negative or unparsable input → placeholder.
 */
export function formatDuration(
  startISO: string,
  endISO: string,
): string {
  const start = Date.parse(startISO);
  const end = Date.parse(endISO);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return MONEY_PLACEHOLDER;
  }
  const totalMinutes = Math.floor((end - start) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

/**
 * Format a plain number (ratio, score, points…) with fixed decimals,
 * e.g. formatNumber("2.84") → "2,84" (fr-FR grouping applies).
 * Invalid input → placeholder.
 */
export function formatNumber(
  value: string | number | null | undefined,
  digits = 2,
  locale: string = DEFAULT_FORMAT_LOCALE,
): string {
  const parsed = parseDecimal(value);
  if (parsed === null) return MONEY_PLACEHOLDER;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(parsed);
}

/**
 * Format a ratio as a percentage with `digits` decimals.
 * CONVENTION: input is a RATIO - formatPercent("0.554") → "55,4 %",
 * formatPercent(0.08) → "8,0 %". Multiply by 100 yourself if your source
 * value is already expressed in percent units.
 * Invalid input → placeholder.
 */
export function formatPercent(
  ratio: string | number | null | undefined,
  digits = 1,
  locale: string = DEFAULT_FORMAT_LOCALE,
): string {
  const value = parseDecimal(ratio);
  if (value === null) return MONEY_PLACEHOLDER;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

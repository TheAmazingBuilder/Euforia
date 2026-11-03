import type { Currency } from "../enums";

/**
 * Money formatting helpers - pure, deterministic, Intl-based.
 *
 * These are DISPLAY helpers (AGENTS.md golden rule: no floating-point math on
 * money in components; parsing/formatting goes through this module). The
 * authoritative computations happen server-side; numbers here serve live
 * form estimates and rendering only.
 */

/** App UI language is English. Override via options.locale. */
export const DEFAULT_FORMAT_LOCALE = "en-US";

/** Placeholder rendered when a value cannot be parsed (bad contract, loading). */
export const MONEY_PLACEHOLDER = "-";

/**
 * Safe string → number for display math. Accepts ONLY plain decimals
 * (optionally signed): no exponent, no separators, no whitespace junk.
 * Returns `null` for anything unparsable - never throws, never NaN.
 */
export function parseDecimal(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface FormatMoneyOptions {
  /** BCP-47 locale. Default: fr-FR (app UI language). */
  locale?: string;
  /** Fraction digits. Default: currency default (2 for USD/EUR, 0 for JPY). */
  digits?: number;
}

/**
 * Format a decimal-as-string amount as currency, e.g.
 * formatMoney("1234.5", "USD") → "1 234,50 $US" (fr-FR).
 * Invalid input → placeholder (never throws).
 */
export function formatMoney(
  amount: string | number | null | undefined,
  currency: Currency,
  options: FormatMoneyOptions = {},
): string {
  const value = parseDecimal(amount);
  if (value === null) return MONEY_PLACEHOLDER;
  const formatter = new Intl.NumberFormat(options.locale ?? DEFAULT_FORMAT_LOCALE, {
    style: "currency",
    currency,
    ...(options.digits !== undefined
      ? { minimumFractionDigits: options.digits, maximumFractionDigits: options.digits }
      : {}),
  });
  return formatter.format(value);
}

/**
 * Format a signed P&L amount: explicit "+" for positive/zero, "-" for
 * negative, e.g. formatSignedMoney("150.25", "USD") → "+150,25 $US".
 * Zero renders as "+0" so gains/losses read consistently in a column.
 * Invalid input → placeholder (never throws).
 */
export function formatSignedMoney(
  amount: string | number | null | undefined,
  currency: Currency,
  options: FormatMoneyOptions = {},
): string {
  const value = parseDecimal(amount);
  if (value === null) return MONEY_PLACEHOLDER;
  const formatted = formatMoney(Math.abs(value), currency, options);
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

/**
 * Format a decimal-as-string amount as a COMPACT currency string for dense
 * surfaces (calendar cells, axes): formatMoneyCompact("1840", "USD") →
 * "1,8 k $US" (fr-FR compact notation). Invalid input → placeholder.
 */
export function formatMoneyCompact(
  amount: string | number | null | undefined,
  currency: Currency,
  options: FormatMoneyOptions = {},
): string {
  const value = parseDecimal(amount);
  if (value === null) return MONEY_PLACEHOLDER;
  const formatter = new Intl.NumberFormat(options.locale ?? DEFAULT_FORMAT_LOCALE, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return formatter.format(value);
}

/**
 * Render a float produced by shared display math back to a canonical decimal
 * string (max 8 decimals, matching numeric(18,8)), stripping trailing zeros.
 * Float artifacts like 0.30000000000000004 become "0.3".
 * Non-finite input → "0".
 */
export function toDecimalString(value: number, maxDecimals = 8): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(maxDecimals);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

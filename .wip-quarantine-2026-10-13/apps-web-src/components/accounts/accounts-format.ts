import type { Currency } from "@cosmoz/shared";

/**
 * Financial formatting for the Accounts module (spec §53). Every helper
 * accepts the wire format (decimal-as-string, nullable) and the ACCOUNT's
 * currency — nothing is hardcoded to USD, and unavailable values render as
 * "—", never an invented number (spec §22).
 */

const UNAVAILABLE = "—";

function parse(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value.replace(/\s|\u00A0|\u202F/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Money in the account currency: "$10,240.00" / "€25 750.50" style. */
export function formatMoney(
  value: string | null | undefined,
  currency: string,
): string {
  const parsed = parse(value);
  if (parsed === null) return UNAVAILABLE;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(parsed);
  } catch {
    return `${parsed.toFixed(2)} ${currency}`;
  }
}

/** Signed P&L: "+$112.00" / "−$42.00" (proper minus sign). */
export function formatSignedMoney(
  value: string | null | undefined,
  currency: string,
): string {
  const parsed = parse(value);
  if (parsed === null) return UNAVAILABLE;
  const formatted = formatMoney(value, currency);
  if (parsed > 0) return `+${formatted}`;
  if (parsed < 0) return formatted.replace("-", "−");
  return formatted;
}

/** Raw price with no currency symbol: "3850.20" / "1.08640". */
export function formatPrice(value: string | null | undefined): string {
  const parsed = parse(value);
  if (parsed === null) return UNAVAILABLE;
  return parsed >= 100
    ? parsed.toFixed(2)
    : parsed.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

/** Volume in lots: "0.10". */
export function formatVolume(value: string | null | undefined): string {
  const parsed = parse(value);
  if (parsed === null) return UNAVAILABLE;
  return parsed.toFixed(2);
}

/** Leverage ratio "1:30"; the wire carries the ratio as a decimal string. */
export function formatLeverage(value: string | null | undefined): string {
  const parsed = parse(value);
  if (parsed === null || parsed <= 0) return UNAVAILABLE;
  return `1:${Number.isInteger(parsed) ? parsed.toFixed(0) : parsed.toString()}`;
}

/** Margin level percentage: "2423.81%". */
export function formatMarginLevel(value: string | null | undefined): string {
  const parsed = parse(value);
  if (parsed === null) return UNAVAILABLE;
  return `${parsed.toFixed(2)}%`;
}

/**
 * Relative freshness line (spec §28, §55): "4 seconds ago" → "3 hours ago"
 * → "Mar 2" for older; null → "Never".
 */
export function formatRelativeTime(
  isoString: string | null | undefined,
  nowMs: number,
): string {
  if (!isoString) return "Never";
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return "Never";
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (seconds <= 1) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Absolute timestamp for tooltips/panels: "Oct 2, 2026 at 15:42". */
export function formatAbsoluteTime(isoString: string | null | undefined): string {
  if (!isoString) return UNAVAILABLE;
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return UNAVAILABLE;
  return new Date(parsed).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Masked provider account number: "100245678" → "••••••5678" (spec §8). */
export function maskAccountNumber(externalAccountId: string): string {
  const tail = externalAccountId.slice(-4);
  return `••••••${tail}`;
}

/** Currency metadata for selectors (spec §53 — respect the account currency). */
export const ACCOUNT_CURRENCIES: Currency[] = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "JPY",
  "NZD",
  "SGD",
];

import type { AccountsDict } from "@/i18n/dictionaries/en/accounts";

/**
 * Financial formatting utilities for the Accounts module (module mandate
 * §53): currency respects the ACCOUNT currency (never a hardcoded USD),
 * decimal precision is preserved (never silently rounded), prices keep
 * provider precision, and identifiers are masked for display. Pure
 * functions — components compose the copy.
 */

/** decimal-as-string → grouped amount with the account currency. null stays null. */
export function formatMoney(
  value: string | null,
  currency: string,
  options: { signed?: boolean } = {},
): string | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(numeric));
  const sign = options.signed ? (numeric > 0 ? "+" : numeric < 0 ? "-" : "") : numeric < 0 ? "-" : "";
  return `${sign}${formatted}`;
}

/** Prices keep their provider precision — displayed as given, grouped. */
export function formatPrice(value: string | null): string | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const decimals = value.includes(".") ? value.split(".")[1]?.length ?? 2 : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(decimals, 5),
    maximumFractionDigits: Math.min(Math.max(decimals, 2), 5),
  }).format(numeric);
}

/** Margin level / percentages — value already in percent units. */
export function formatMarginLevel(value: string | null): string | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)}%`;
}

/** Volumes in lots — displayed as provided (0.10 stays 0.10). */
export function formatVolume(value: string): string {
  return value;
}

/** Masked account identifier — "••••5678". */
export function maskAccountNumber(externalAccountId: string): string {
  return `\u2022\u2022\u2022\u2022${externalAccountId.slice(-4)}`;
}

/** Run duration — sub-second precision for fast syncs, else seconds. */
export function formatDurationMs(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(1)}s`;
}

/** Absolute timestamp — "Oct 2, 2026, 15:42". */
export function formatAbsoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Compact table timestamp — "Oct 8, 14:00". */
export function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

type FreshnessCopy = AccountsDict["freshness"];

/** Relative freshness from a server timestamp — "just now", "42s ago", "5m ago". */
export function formatRelativeTime(iso: string | null, copy: FreshnessCopy, nowMs: number): string {
  if (!iso) return copy.never;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return copy.never;
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (seconds < 8) return copy.justNow;
  if (seconds < 60) return `${seconds}${copy.secondsSuffix}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${copy.minutesSuffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${copy.hoursSuffix}`;
  const days = Math.floor(hours / 24);
  return `${days}${copy.daysSuffix}`;
}

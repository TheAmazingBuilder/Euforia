/**
 * Oryon crosshair legend formatting — PURE helpers (Phase 5 spec §5).
 *
 * The legend may only show what the data ACTUALLY carries: the timestamp is
 * rendered in UTC (the chart's time axis domain — Lightweight Charts renders
 * UTCTimestamps; a legend time in another zone would contradict the axis),
 * and the volume is displayed ONLY for a valid positive value — the forming
 * candle carries v = 0 until the server refetch merges real volume, and a
 * fabricated "0" would read as an observation, not the placeholder it is.
 * Indicator values are looked up by the manager (valuesAtTime) — a missing
 * reading is omitted, never interpolated or guessed.
 */

import type { MarketInterval } from "@cosmoz/shared";

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const INTRADAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Candle timestamp (epoch ms) → legend label, UTC — aligned with the chart
 * time axis. Intraday intervals show date + time; "1D" shows the date only.
 * Returns null for a non-finite timestamp (nothing honest to show).
 */
export function formatCandleTime(tMs: number, interval: MarketInterval): string | null {
  if (!Number.isFinite(tMs)) return null;
  const date = new Date(tMs);
  if (Number.isNaN(date.getTime())) return null;
  return interval === "1D" ? DAY_FORMAT.format(date) : INTRADAY_FORMAT.format(date);
}

const VOLUME_FORMAT = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Legend volume text — null when the value is missing, non-finite or ≤ 0
 * (the locally-merged forming candle reports 0 volume: omit, never fake).
 */
export function formatLegendVolume(v: number | null | undefined): string | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return VOLUME_FORMAT.format(v);
}

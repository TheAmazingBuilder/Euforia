import type { OryonIndicatorInstance } from "@cosmoz/shared";

/**
 * Indicator value formatting for legend readouts - deterministic (no
 * locale-dependent grouping), compact for volume magnitudes.
 */

export function formatIndicatorValue(
  value: number,
  instance: OryonIndicatorInstance,
): string {
  if (!Number.isFinite(value)) return "-";
  switch (instance.type) {
    case "rsi":
      return trim(value.toFixed(2));
    case "volume":
      return compact(value);
    default:
      // Price-domain outputs - 2 decimals on large scales, more on small ones.
      const abs = Math.abs(value);
      const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
      return trim(value.toFixed(decimals));
  }
}

function trim(formatted: string): string {
  return formatted.replace(/\.?0+$/, "");
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim((value / 1e9).toFixed(2))}B`;
  if (abs >= 1e6) return `${trim((value / 1e6).toFixed(2))}M`;
  if (abs >= 1e3) return `${trim((value / 1e3).toFixed(2))}K`;
  return trim(value.toFixed(2));
}

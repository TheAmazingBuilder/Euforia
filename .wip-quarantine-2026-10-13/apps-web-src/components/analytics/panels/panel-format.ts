import type { PanelUnit } from "@cosmoz/shared";
import { formatMoneyCompact, formatMoney, formatNumber, formatR } from "@cosmoz/shared";

/**
 * Unit-aware value formatting for the Atlas panels — the server ships raw
 * decimal strings plus a unit hint; the client only renders. Money uses the
 * compact notation on chart axes and the full notation on KPI chips.
 */

export function formatPanelValue(
  value: number,
  unit: PanelUnit,
  currency?: string,
  style: "full" | "compact" = "full",
): string {
  switch (unit) {
    case "money": {
      if (style === "compact" && Math.abs(value) >= 1000) {
        return formatMoneyCompact(value, (currency ?? "USD") as never);
      }
      return formatMoney(value, (currency ?? "USD") as never);
    }
    case "r":
      return formatR(value);
    case "count":
      return formatNumber(value, 0);
    case "percent":
      return `${formatNumber(value, 1)}%`;
    case "plain":
    default:
      return formatNumber(value, Math.abs(value) >= 100 ? 0 : 2);
  }
}

/** Axis variant of the same formatter — tighter, sign-always for R. */
export function formatPanelAxis(value: number, unit: PanelUnit, currency?: string): string {
  switch (unit) {
    case "money":
      return formatMoneyCompact(value, (currency ?? "USD") as never);
    case "r":
      return `${value > 0 ? "+" : ""}${value.toFixed(1)}R`;
    case "percent":
      return `${value > 0 ? "+" : ""}${value.toFixed(0)}%`;
    case "count":
      return String(Math.round(value));
    case "plain":
    default:
      return value.toFixed(2);
  }
}

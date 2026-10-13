import type { Currency, NumericInput, PnlDisplay } from "@cosmoz/shared";
import {
  formatNumber,
  formatR,
  formatSignedMoney,
  parseDecimal,
} from "@cosmoz/shared";

/**
 * Mode-aware P&L display (Settings → Appearance → "P&L display").
 *
 * The preference picks the PRIMARY figure: CURRENCY (default), R_MULTIPLE
 * (Σ/individual R) or PERCENT (return on entry notional / starting balance).
 * Every surface that shows a P&L number formats through here so the whole
 * app follows one setting. Fallback rule: when the mode's figure is not
 * available for a given item (no R on an open trade, no notional basis),
 * the signed currency amount renders instead — a P&L cell never goes blank
 * while a valid amount exists.
 */

/** Signed percent in PERCENT UNITS ("4.21" → "+4,21 %"), fr-FR grouping. */
export function formatSignedPercent(
  percent: NumericInput,
  digits = 2,
): string {
  const value = parseDecimal(percent);
  if (value === null) return "-";
  const sign = value < 0 ? "-" : "+";
  return `${sign}${formatNumber(Math.abs(value), digits)}\u00A0%`;
}

/** The figures one P&L item can offer — at least the currency amount. */
export interface PnlFigure {
  /** Signed amount in account currency (wire decimal string or live number). */
  amount: NumericInput;
  /** R multiple when known (closed trades, or live R on open positions). */
  r?: NumericInput;
  /** Percent figure when known (percent units: 2.35 = +2,35 %). */
  pct?: NumericInput;
}

/** Fallback digits for the currency figure (dense surfaces pass 0). */
export function formatPnlFigure(
  mode: PnlDisplay,
  figure: PnlFigure,
  currency: Currency,
  options: { digits?: number } = {},
): string {
  const amount = parseDecimal(figure.amount);
  if (mode === "R_MULTIPLE" && parseDecimal(figure.r) !== null) {
    return formatR(figure.r);
  }
  if (mode === "PERCENT" && parseDecimal(figure.pct) !== null) {
    return formatSignedPercent(figure.pct);
  }
  if (amount === null) return "-";
  return formatSignedMoney(amount, currency, { digits: options.digits ?? 2 });
}

/**
 * COSMOZ shared constants.
 */

/**
 * Playbook color palette — the preset swatches offered in the strategy
 * form. These ARE data, not theme chrome: the chosen value is stored on
 * Strategy.color ("UI color hint (CSS color string owned by the client)",
 * data-model.md "Domaine 4") and rendered as an inline, data-driven style
 * (card edge, sparkline stroke). The first three values match the seed
 * fixtures so existing strategies stay visually stable.
 */
export const PLAYBOOK_COLOR_PALETTE: readonly string[] = [
  "#6E7BFF",
  "#34D399",
  "#FBBF24",
  "#F87171",
  "#38BDF8",
  "#C084FC",
  "#F472B6",
  "#A3E635",
];

/** `YYYY-MM-DD` → `YYYY-MM` (monthly aggregates keys). */
export function toMonthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

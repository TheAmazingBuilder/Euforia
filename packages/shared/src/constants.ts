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

/**
 * Analytics time buckets — UTC-based, session-aligned. The heatmap columns
 * and the "By Time" hour chart share these boundaries so both views tell
 * the same story. `to` is exclusive; the last bucket absorbs 20:00–24:00.
 */
export const ANALYTICS_HOUR_BUCKETS: readonly { label: string; from: number; to: number }[] = [
  { label: "00–04", from: 0, to: 4 },
  { label: "04–08", from: 4, to: 8 },
  { label: "08–12", from: 8, to: 12 },
  { label: "12–16", from: 12, to: 16 },
  { label: "16–20", from: 16, to: 20 },
  { label: "20–24", from: 20, to: 24 },
];

/**
 * Trading sessions derived from the UTC hour of entry (documented mapping,
 * applied identically server- and client-side):
 * - ASIA:   20:00–07:00 UTC (Tokyo open, incl. the 20–24 rollover)
 * - LONDON: 07:00–13:00 UTC
 * - NEW_YORK: 13:00–20:00 UTC (incl. the London/NY overlap)
 */
export const ANALYTIC_SESSIONS: readonly { key: string; label: string; hours: readonly number[] }[] = [
  { key: "ASIA", label: "Asia", hours: [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6] },
  { key: "LONDON", label: "London", hours: [7, 8, 9, 10, 11, 12] },
  { key: "NEW_YORK", label: "New York", hours: [13, 14, 15, 16, 17, 18, 19] },
];

/** Weekday order for analytics rows — Monday first (ISO convention). */
export const ANALYTICS_WEEKDAYS: readonly { index: number; label: string }[] = [
  { index: 1, label: "Mon" },
  { index: 2, label: "Tue" },
  { index: 3, label: "Wed" },
  { index: 4, label: "Thu" },
  { index: 5, label: "Fri" },
  { index: 6, label: "Sat" },
  { index: 0, label: "Sun" },
];

/**
 * Emotion display labels (product copy, English) — shared so the mock
 * backend and every screen render the same words.
 */
export const EMOTION_LABELS: Readonly<Record<string, string>> = {
  CALM: "Calm",
  CONFIDENT: "Confident",
  ANXIOUS: "Anxious",
  FOMO: "FOMO",
  TIRED: "Tired",
  FRUSTRATED: "Frustrated",
  REVENGE: "Revenge",
  EUPHORIC: "Euphoric",
  RELIEVED: "Relieved",
  BORED: "Bored",
};

import type { DashboardWidgetKey, MetricsCardWidgetConfig } from "@cosmoz/shared";

import { METRICS_CARD_PERIODS } from "./widget-configs";

/**
 * Settings-panel descriptors (Phase 02 §6) — WHAT each widget's settings
 * dialog shows, as pure data. The dialog component owns the controls and
 * the typed draft updates; this module keeps the copy/labels testable and
 * co-located with the config system.
 *
 * Only REAL controls appear here — every field maps a config key with an
 * actual rendering effect (spec: no placeholder options).
 */

export type SettingsControl =
  | { kind: "select"; key: string; label: string; description?: string; options: { value: string; label: string }[] }
  | { kind: "checkbox"; key: string; label: string; description?: string }
  /** METRICS_CARD metric selection (add/remove/reorder + restore defaults). */
  | { kind: "metric-list"; label: string; description?: string }
  /** STRATEGY_COMPARE strategy selection (options come from the playbook catalog). */
  | { kind: "strategy-list"; label: string; description?: string }
  /** LONG_SHORT metric visibility (checkbox list, ≥ 1). */
  | { kind: "longshort-list"; label: string; description?: string }
  /** METRICS_CARD CUSTOM window (from/to trading-date keys). */
  | { kind: "date-range"; label: string; description?: string };

export interface SettingsGroup {
  title: string;
  fields: SettingsControl[];
}

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const CUMULATIVE_TYPE_OPTIONS = [
  { value: "AREA", label: "Area — gradient under the curve" },
  { value: "LINE", label: "Line — plain trajectory" },
  { value: "BAR", label: "Bars — one per day" },
];

const NOTATION_OPTIONS = [
  { value: "STANDARD", label: "Full numbers (1 234,50)" },
  { value: "COMPACT", label: "Compact (1,2 k)" },
];

const DECIMALS_OPTIONS = [
  { value: "0", label: "0 decimals" },
  { value: "1", label: "1 decimal" },
  { value: "2", label: "2 decimals" },
];

const COMPARISON_OPTIONS = [
  { value: "OFF", label: "No comparison" },
  { value: "PREVIOUS", label: "Compare with previous period" },
];

const HEATMAP_METRIC_OPTIONS = [
  { value: "AVG_R", label: "Average R (profit/loss ink)" },
  { value: "TRADES", label: "Trade count (volume ink)" },
];

/** PERFORMANCE_BREAKDOWN dimensions — kept in sync with
 * performanceBreakdownWidgetConfigSchema. */
const BREAKDOWN_DIMENSION_OPTIONS = [
  { value: "STRATEGY", label: "Strategy (playbook attribution)" },
  { value: "INSTRUMENT", label: "Instrument" },
  { value: "DIRECTION", label: "Direction (long vs short)" },
  { value: "WEEKDAY", label: "Weekday (user-timezone trading day)" },
  { value: "HOUR", label: "Entry hour (UTC buckets)" },
  { value: "DURATION", label: "Holding duration" },
  { value: "ASSET_CLASS", label: "Asset class" },
];

/** Long/short metric ids — kept in sync with longShortWidgetConfigSchema. */
export const LONG_SHORT_METRIC_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "TRADES", label: "Closed trades" },
  { value: "NET_PNL", label: "Net P&L" },
  { value: "WIN_RATE", label: "Win rate" },
  { value: "PROFIT_FACTOR", label: "Profit factor" },
  { value: "EXPECTANCY_R", label: "Expectancy (R)" },
  { value: "AVG_DURATION", label: "Avg holding time" },
];

/** Periods that support a server-resolved previous equivalent — the
 * comparison select disables the others (with an explanatory hint). */
export function comparisonAvailable(period: MetricsCardWidgetConfig["period"]): boolean {
  return period === "TODAY" || period === "THIS_WEEK" || period === "THIS_MONTH";
}

export function settingsGroupsFor(type: DashboardWidgetKey): SettingsGroup[] | null {
  switch (type) {
    case "PNL_BAND":
      return [
        {
          title: "Period",
          fields: [
            { kind: "select", key: "range", label: "Window", description: "How many trading days both charts show.", options: RANGE_OPTIONS },
          ],
        },
        {
          title: "Cumulative P&L chart",
          fields: [
            { kind: "select", key: "cumulativeType", label: "Chart type", description: "The left chart's series shape.", options: CUMULATIVE_TYPE_OPTIONS },
            { kind: "checkbox", key: "showEndMarker", label: "End-of-curve marker", description: "Dot + signed total label on the last point." },
            { kind: "checkbox", key: "showZeroLine", label: "Zero baseline", description: "Dashed reference at 0 when the curve dips below it." },
          ],
        },
        {
          title: "Daily P&L chart",
          fields: [
            { kind: "checkbox", key: "showAvgLine", label: "Average line", description: "Dashed marker at the window's average daily result." },
          ],
        },
      ];
    case "HEATMAP":
      return [
        {
          title: "Display",
          fields: [
            { kind: "checkbox", key: "showCellValues", label: "Day P&L in cells", description: "Show the signed net result inside each day cell." },
          ],
        },
      ];
    case "METRICS_CARD":
      return [
        {
          title: "Metrics",
          fields: [
            { kind: "metric-list", label: "Selected metrics", description: "Order = display order. Between 1 and 12 metrics." },
          ],
        },
        {
          title: "Period",
          fields: [
            { kind: "select", key: "period", label: "Aggregation window", description: "Server-resolved against your trading-day clock.", options: METRICS_CARD_PERIODS.map((period) => ({ value: period.value, label: period.label })) },
            { kind: "date-range", label: "Custom range", description: "Inclusive trading-date keys (used when the window is Custom)." },
            { kind: "select", key: "comparison", label: "Comparison", description: "Previous equivalent period where the server can resolve one (Today, This week, This month).", options: COMPARISON_OPTIONS },
          ],
        },
        {
          title: "Formatting",
          fields: [
            { kind: "select", key: "notation", label: "Money notation", options: NOTATION_OPTIONS },
            { kind: "select", key: "decimals", label: "Decimals", description: "Numbers and percentages; money follows its own precision.", options: DECIMALS_OPTIONS },
          ],
        },
      ];
    case "STRATEGY_COMPARE":
      return [
        {
          title: "Strategies",
          fields: [
            { kind: "strategy-list", label: "Compared strategies", description: "Pick 1–6 strategies, or the out-of-playbook population." },
          ],
        },
      ];
    case "LONG_SHORT":
      return [
        {
          title: "Metrics",
          fields: [
            { kind: "longshort-list", label: "Visible metrics", description: "Which columns the BUY/SELL comparison shows." },
          ],
        },
      ];
    case "ACTIVITY_HEATMAP":
      return [
        {
          title: "Data",
          fields: [
            { kind: "select", key: "metric", label: "Cell metric", description: "What each weekday × hour cell colors by.", options: HEATMAP_METRIC_OPTIONS },
          ],
        },
      ];
    case "PERFORMANCE_BREAKDOWN":
      return [
        {
          title: "Breakdown",
          fields: [
            { kind: "select", key: "dimension", label: "Dimension", description: "Which server-computed breakdown the table shows. Rows always carry their sample sizes.", options: BREAKDOWN_DIMENSION_OPTIONS },
          ],
        },
      ];
    default:
      // Not configurable — the settings entry point is hidden by the registry.
      return null;
  }
}

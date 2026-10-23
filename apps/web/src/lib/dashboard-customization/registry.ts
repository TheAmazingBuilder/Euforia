import { DASHBOARD_WIDGET_KEYS, type DashboardWidgetKey } from "@cosmoz/shared";

import {
  suiteBacked,
  WIDGET_CATEGORY_KEYS,
  type WidgetCategory,
  type WidgetDefinition,
} from "./types";

/**
 * Widget Registry — the SINGLE SOURCE OF TRUTH for what the dashboard can
 * host and how each widget behaves under customization (Phase 01 §4.3).
 *
 * Rules:
 *  - only REAL widgets with an existing renderer and data contract are
 *    registered (no fake library entries);
 *  - metadata only — renderers live in the UI layer, nothing here is
 *    serialized into layouts (layouts reference `type` keys only);
 *  - dimension bounds drive resize clamping (layout-model) and UI affordances.
 *
 * Phase 03 §8: every definition also declares `filterSupport` — how the
 * shared global filter context affects the widget. FULL = the widget's data
 * query receives the global filters; UNAFFECTED = its data source has no
 * filter parameters today, with an honest reason (never a fake filtered
 * result). The UI layer renders the distinction; nothing here is serialized.
 *
 * Width bounds reflect each widget's internal layout: composite sections
 * (EQUITY_ROW's 3+2 split, BEST_WORST's two-card grid) keep a locked
 * 12-column span; self-contained cards may shrink to half width or less.
 * Every widget supports height levels (min-height semantics — content
 * always grows past a level, nothing is clipped).
 */
export const WIDGET_REGISTRY: Record<DashboardWidgetKey, WidgetDefinition> = {
  PNL_BAND: {
    type: "PNL_BAND",
    name: "P&L charts",
    description: "Cumulative and daily P&L side by side - the profit story at a glance.",
    category: "PERFORMANCE",
    iconId: "pnl",
    defaultW: 12,
    defaultH: 1,
    minW: 6,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: { support: "UNAFFECTED", reason: "Reads the overview aggregate (/stats/overview), which has no filter parameters yet." },
  },
  EQUITY_ROW: {
    type: "EQUITY_ROW",
    name: "Equity & live risk",
    description: "Equity constellation with peak, drawdown, open positions and risk budget.",
    category: "OVERVIEW",
    iconId: "equity",
    defaultW: 12,
    defaultH: 1,
    // Composite 3+2 internal grid — width locked, height adjustable.
    minW: 12,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: { support: "UNAFFECTED", reason: "Reads the live overview aggregate - account/equity state, not a filterable trade population." },
  },
  GOALS_PACE: {
    type: "GOALS_PACE",
    name: "Goals on pace",
    description: "Goal progress counters with urgency ordering - what needs attention now.",
    category: "OVERVIEW",
    iconId: "goals",
    defaultW: 12,
    defaultH: 1,
    minW: 6,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: { support: "UNAFFECTED", reason: "Goals progress comes from the goals engine - independent of trade filters." },
  },
  WEEK_COMPARE: {
    type: "WEEK_COMPARE",
    name: "Week vs week",
    description: "This week against the previous ones - momentum, per weekday.",
    category: "PERFORMANCE",
    iconId: "weeks",
    defaultW: 12,
    defaultH: 1,
    minW: 6,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: { support: "UNAFFECTED", reason: "Reads the overview aggregate (/stats/overview), which has no filter parameters yet." },
  },
  HEATMAP: {
    type: "HEATMAP",
    name: "Consistency heatmap",
    description: "Daily P&L calendar - streaks and slumps in one grid.",
    category: "PERFORMANCE",
    iconId: "heatmap",
    defaultW: 12,
    defaultH: 1,
    minW: 6,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: { support: "UNAFFECTED", reason: "Reads the overview aggregate (/stats/overview), which has no filter parameters yet." },
  },
  BEST_WORST: {
    type: "BEST_WORST",
    name: "Best & worst",
    description: "Top and bottom trades next to what discipline saved you.",
    category: "PERFORMANCE",
    iconId: "bestworst",
    defaultW: 12,
    defaultH: 1,
    // Two-card internal grid — width locked, height adjustable.
    minW: 12,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: { support: "UNAFFECTED", reason: "Reads the raw trade ledger; server filter semantics are not applied client-side in v1." },
  },
  ALERTS: {
    type: "ALERTS",
    name: "Alerts feed",
    description: "Coach alerts and strategy-decay signals with read state.",
    category: "RISK_COACHING",
    iconId: "alerts",
    defaultW: 12,
    defaultH: 1,
    minW: 4,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: { support: "UNAFFECTED", reason: "The alerts feed is coach-generated - not a trade-filtered dataset." },
  },
  METRICS_CARD: {
    type: "METRICS_CARD",
    name: "Performance metrics",
    description: "Pick your KPIs, set the period, compare against the previous one.",
    category: "PERFORMANCE",
    iconId: "metrics",
    defaultW: 12,
    defaultH: 1,
    minW: 4,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: suiteBacked(
      "The widget-level period override applies only while the global period is ALL - an active global date range wins (the global bar is authoritative)."
    ),
  },
  STRATEGY_COMPARE: {
    type: "STRATEGY_COMPARE",
    name: "Strategy comparison",
    description: "Side-by-side playbook strategies on the metrics that matter.",
    category: "PERFORMANCE",
    iconId: "strategies",
    defaultW: 12,
    defaultH: 1,
    minW: 6,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: suiteBacked(),
  },
  LONG_SHORT: {
    type: "LONG_SHORT",
    name: "Long vs short",
    description: "How your BUY and SELL populations actually differ.",
    category: "PERFORMANCE",
    iconId: "longshort",
    defaultW: 6,
    defaultH: 1,
    minW: 4,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: suiteBacked(
      "A global direction filter narrows the comparison to one side - the other renders its empty state."
    ),
  },
  ACTIVITY_HEATMAP: {
    type: "ACTIVITY_HEATMAP",
    name: "Activity heatmap",
    description: "Weekday × hour performance grid - when your edge lives.",
    category: "PERFORMANCE",
    iconId: "activity",
    defaultW: 6,
    defaultH: 1,
    minW: 6,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: suiteBacked(),
  },
  // ── Phase 05 — performance insights, pattern analysis & trading behavior ──
  PERFORMANCE_BREAKDOWN: {
    type: "PERFORMANCE_BREAKDOWN",
    name: "Performance breakdown",
    description:
      "One factual breakdown table across the dimension you pick - server-computed rows, every rate with its sample size.",
    category: "PERFORMANCE",
    iconId: "breakdown",
    defaultW: 6,
    defaultH: 1,
    minW: 4,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: suiteBacked(
      "Rows come from the analytics suite under the active global filters - scope changes recompute the table.",
    ),
  },
  BEHAVIORAL_INSIGHTS: {
    type: "BEHAVIORAL_INSIGHTS",
    name: "Behavioral insights",
    description:
      "Deterministic, rule-based findings with sample sizes and reliability labels - no AI, no predictions, small samples stay silent.",
    category: "PERFORMANCE",
    iconId: "insights",
    defaultW: 6,
    defaultH: 1,
    minW: 4,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: suiteBacked(
      "Findings are derived inside the analytics suite from the filtered closed-trade population.",
    ),
  },
  LOSS_STREAKS: {
    type: "LOSS_STREAKS",
    name: "Loss streaks",
    description:
      "Current and historical loss-streak profile with the documented breakeven rule and follow-up performance.",
    category: "PERFORMANCE",
    iconId: "streaks",
    defaultW: 6,
    defaultH: 1,
    minW: 4,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: suiteBacked(),
  },
  PERFORMANCE_TREND: {
    type: "PERFORMANCE_TREND",
    name: "Weekly performance trend",
    description:
      "Recent weekly rollups side by side - trades, net P&L, R and win rate with clearly labeled dates. Measured history, not a forecast.",
    category: "PERFORMANCE",
    iconId: "trend",
    defaultW: 6,
    defaultH: 1,
    minW: 4,
    maxW: 12,
    minH: 1,
    maxH: 4,
    singleton: true,
    removable: true,
    resizable: true,
    filterSupport: suiteBacked(
      "Weekly buckets are computed by the analytics suite over the filtered population and period.",
    ),
  },
};

/** Registry keys — the canonical widget type list (defensive mirror). */
export const REGISTRY_TYPES: readonly DashboardWidgetKey[] = DASHBOARD_WIDGET_KEYS;

/** Categories that actually contain registered widgets. */
export const REGISTRY_CATEGORIES: readonly WidgetCategory[] = WIDGET_CATEGORY_KEYS.filter(
  (category) => Object.values(WIDGET_REGISTRY).some((def) => def.category === category),
);

/** Lookup with a hard boundary — unknown types never render. */
export function getWidgetDefinition(type: string): WidgetDefinition | null {
  if (!(REGISTRY_TYPES as readonly string[]).includes(type)) return null;
  return WIDGET_REGISTRY[type as DashboardWidgetKey];
}

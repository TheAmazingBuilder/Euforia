import {
  dashboardFiltersSchema,
  type DashboardFilters,
} from "@cosmoz/shared";

/**
 * Global dashboard filters — pure model (Phase 03 §4/§6).
 *
 * The authoritative filter state is a `DashboardFilters` document from the
 * shared contract. Every function here is immutable and React-free; the
 * reducer (customization-reducer) owns state transitions, this module owns
 * semantics: defaults, normalization of untrusted input, equality, suite
 * parameter mapping and active-filter chip extraction.
 *
 * Semantics (documented for the whole app — spec §6):
 *  - single value per dimension (existing app convention — the suite API is
 *    scalar); absent = the dimension imposes no restriction;
 *  - dimensions combine with AND (the server engine's behavior);
 *  - "none" as strategyId = out-of-playbook trades, never a missing id;
 *  - date ranges are resolved SERVER-SIDE against the user's trading-day
 *    clock — no client date math anywhere in this module.
 */

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = { period: "ALL" };

/**
 * Period presets offered by the dashboard filter bar, in display order.
 * Every value exists in `analyticsPeriodSchema` and is resolved server-side
 * by the analytics clock — the UI can never offer an unsupported preset
 * (LAST_7 was deliberately NOT invented: the suite has no such preset).
 */
export const DASHBOARD_PERIOD_OPTIONS = [
  "TODAY",
  "YESTERDAY",
  "LAST_30",
  "LAST_90",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_QUARTER",
  "THIS_YEAR",
  "YTD",
  "ALL",
  "CUSTOM",
] as const satisfies readonly (DashboardFilters["period"])[];

/** English display labels (app convention: en-only static dictionaries). */
export const DASHBOARD_PERIOD_LABELS: Record<DashboardFilters["period"], string> = {
  TODAY: "Today",
  YESTERDAY: "Yesterday",
  LAST_30: "Last 30 days",
  LAST_90: "Last 90 days",
  THIS_WEEK: "This week",
  LAST_WEEK: "Previous week",
  THIS_MONTH: "This month",
  LAST_MONTH: "Previous month",
  THIS_QUARTER: "This quarter",
  THIS_YEAR: "This year",
  YTD: "Year to date",
  ALL: "All history",
  CUSTOM: "Custom range",
};

/**
 * Normalize an untrusted candidate (stored prefs, imported views, MSW) into
 * a valid `DashboardFilters`. Invalid documents NEVER throw — they degrade
 * field-by-field: a full parse failure keeps valid dimensions and resets
 * period to ALL; a CUSTOM period missing its bounds degrades to ALL (the
 * same honest fallback the server clock applies — never a fabricated window).
 */
export function normalizeDashboardFilters(candidate: unknown): DashboardFilters {
  const parsed = dashboardFiltersSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  // Field-level salvage: keep valid dimensions, reset the date dimension.
  const retry = dashboardFiltersSchema.safeParse({
    ...(typeof candidate === "object" && candidate !== null ? candidate : {}),
    period: "ALL",
  });
  if (retry.success) {
    const next = retry.data;
    return {
      period: "ALL",
      accountId: next.accountId,
      instrumentId: next.instrumentId,
      strategyId: next.strategyId,
      direction: next.direction,
    };
  }
  return { ...DEFAULT_DASHBOARD_FILTERS };
}

/** Stable equality (saved-view matching, divergence detection). */
export function filtersEqual(a: DashboardFilters, b: DashboardFilters): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(f: DashboardFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [
    "period",
    "customFrom",
    "customTo",
    "accountId",
    "instrumentId",
    "strategyId",
    "direction",
  ] as const) {
    if (f[key] !== undefined) out[key] = f[key];
  }
  return out;
}

/** True when no dimension restricts the dataset (the clear-all target). */
export function isDefaultFilters(filters: DashboardFilters): boolean {
  return filtersEqual(filters, DEFAULT_DASHBOARD_FILTERS);
}

/**
 * The suite query accepts the SAME field names — the dashboard filter model
 * is a strict subset of `AnalyticsFilters`, so the mapping is identity.
 * Returned as a fresh normalized object so callers can add `sims` freely.
 */
export function filtersToSuiteFilters(filters: DashboardFilters): DashboardFilters {
  return normalizeDashboardFilters(filters);
}

export type FilterChip = {
  dimension: "period" | "account" | "instrument" | "strategy" | "direction";
  /** Raw filter value (id / preset key / "none") for chip removal. */
  value: string;
};

/** Active-filter extraction for chips — labels resolved by the UI layer. */
export function activeFilterChips(filters: DashboardFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.period !== "ALL") {
    chips.push({ dimension: "period", value: filters.period });
  }
  if (filters.accountId) chips.push({ dimension: "account", value: filters.accountId });
  if (filters.instrumentId) {
    chips.push({ dimension: "instrument", value: filters.instrumentId });
  }
  if (filters.strategyId) chips.push({ dimension: "strategy", value: filters.strategyId });
  if (filters.direction) chips.push({ dimension: "direction", value: filters.direction });
  return chips;
}

/** Number of restricting dimensions (0 = unfiltered). */
export function activeFilterCount(filters: DashboardFilters): number {
  return activeFilterChips(filters).length;
}

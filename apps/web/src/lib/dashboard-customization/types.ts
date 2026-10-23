import type { DashboardLayoutDocument, DashboardUserTemplate, DashboardWidgetKey } from "@cosmoz/shared";

/**
 * Dashboard customization — shared types (Phase 01).
 *
 * Pure type layer between the shared schemas, the widget registry and the
 * customization state machine. No React, no I/O — everything here is
 * unit-testable in isolation.
 */

export type {
  DashboardLayoutDocument,
  DashboardPreferences,
  DashboardPreferencesInput,
  DashboardUserTemplate,
  DashboardWidgetItem,
  DashboardWidgetKey,
} from "@cosmoz/shared";

/** Widget library groupings — only categories with real widgets exist. */
export const WIDGET_CATEGORY_KEYS = ["OVERVIEW", "PERFORMANCE", "RISK_COACHING"] as const;
export type WidgetCategory = (typeof WIDGET_CATEGORY_KEYS)[number];

export const WIDGET_CATEGORY_LABELS: Record<WidgetCategory, string> = {
  OVERVIEW: "Overview",
  PERFORMANCE: "Performance",
  RISK_COACHING: "Risk & coaching",
};

/**
 * Global filter dimensions offered by the Phase 03 dashboard filter bar
 * (the single-select subset of the analytics suite contract).
 */
export const FILTER_DIMENSIONS = [
  "period",
  "account",
  "instrument",
  "strategy",
  "direction",
] as const;
export type FilterDimension = (typeof FILTER_DIMENSIONS)[number];

/**
 * Filter compatibility metadata (Phase 03 §8): every widget DECLARES how the
 * shared filter context affects it — the UI renders filtered widgets and
 * "unaffected" widgets differently and never claims a filtered result for a
 * widget that ignores the filters.
 *  - FULL: the widget's data query receives the global filters (all five
 *    dimensions — the suite contract is scalar and takes them all).
 *  - UNAFFECTED: the widget's data source has no filter parameters today;
 *    `reason` is an honest, short product explanation (rendered once, in
 *    the widget's contextual detail - not repeated banner text).
 */
export type WidgetFilterSupport =
  | { support: "FULL"; dimensions: readonly FilterDimension[]; note?: string }
  | { support: "UNAFFECTED"; reason: string };

/** Convenience: the FULL support for a widget fed by the suite endpoint. */
export function suiteBacked(note?: string): WidgetFilterSupport {
  return { support: "FULL", dimensions: FILTER_DIMENSIONS, note };
}

/**
 * One widget definition in the registry — the single source of truth for
 * availability and supported behavior. Metadata only: no React component
 * references (renderers live in the UI layer), no serialized config.
 */
export interface WidgetDefinition {
  type: DashboardWidgetKey;
  name: string;
  description: string;
  category: WidgetCategory;
  /** Icon identifier — resolved to a Lucide component in the UI layer. */
  iconId: string;
  defaultW: number;
  defaultH: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  /** Only one instance may exist on a layout (visible or hidden). */
  singleton: boolean;
  removable: boolean;
  /** Width/height editing is exposed for this widget. */
  resizable: boolean;
  /** Phase 03 §8 — how the shared filter context affects this widget. */
  filterSupport: WidgetFilterSupport;
}

/** Widget data props are owned by the UI renderer layer (exact query types). */

/**
 * Normalized, validated customization state derived from the stored
 * preferences document. `layouts` always contains at least one valid
 * layout; `activeLayoutId` always points at a member of `layouts`.
 */
export interface CustomizationSnapshot {
  layouts: DashboardLayoutDocument[];
  activeLayoutId: string;
  /** Phase 06 — the user's default workspace (null = none explicit). */
  defaultLayoutId: string | null;
  /** Phase 06 — user-created templates (frozen workspace snapshots). */
  userTemplates: DashboardUserTemplate[];
}

/** Persistence status of the customization state machine. */
export type PersistenceStatus = "idle" | "saving" | "error";

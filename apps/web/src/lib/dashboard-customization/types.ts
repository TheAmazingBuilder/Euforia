import type { DashboardLayoutDocument, DashboardWidgetKey } from "@cosmoz/shared";

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
}

/** Persistence status of the customization state machine. */
export type PersistenceStatus = "idle" | "saving" | "error";

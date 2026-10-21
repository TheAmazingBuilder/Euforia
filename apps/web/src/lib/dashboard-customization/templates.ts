import type { DashboardLayoutDocument, DashboardWidgetKey } from "@cosmoz/shared";

import {
  LAYOUT_SCHEMA_VERSION,
  newLayoutId,
  newWidgetInstanceId,
} from "./layout-model";
import { WIDGET_REGISTRY } from "./registry";

/**
 * Dashboard templates (Phase 01 §11) — configuration presets built ONLY
 * from registered real widgets. A template produces a NEW independent
 * layout; it never mutates an existing saved layout by itself.
 */

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  /** Ordered widget specs — validated against the registry at build time. */
  widgets: ReadonlyArray<{ type: DashboardWidgetKey; w?: number; h?: number }>;
}

export const DASHBOARD_TEMPLATES: readonly DashboardTemplate[] = [
  {
    id: "general_trading",
    name: "General trading overview",
    description: "The full designed dashboard — performance, risk and coaching in one place.",
    widgets: [
      { type: "PNL_BAND" },
      { type: "EQUITY_ROW" },
      { type: "GOALS_PACE" },
      { type: "WEEK_COMPARE" },
      { type: "HEATMAP" },
      { type: "BEST_WORST" },
      { type: "ALERTS" },
    ],
  },
  {
    id: "performance_focus",
    name: "Performance focus",
    description: "Charts and comparisons first — for traders tuning execution quality.",
    widgets: [
      { type: "PNL_BAND" },
      { type: "WEEK_COMPARE", w: 6 },
      { type: "BEST_WORST" },
      { type: "HEATMAP", w: 6 },
      { type: "EQUITY_ROW" },
    ],
  },
  {
    id: "risk_management",
    name: "Risk management",
    description: "Equity, live risk and alerts up top — discipline over dopamine.",
    widgets: [
      { type: "EQUITY_ROW" },
      { type: "ALERTS", w: 6 },
      { type: "GOALS_PACE", w: 6 },
      { type: "HEATMAP" },
    ],
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Just the essentials — P&L and best/worst, nothing else.",
    widgets: [{ type: "PNL_BAND" }, { type: "BEST_WORST" }],
  },
];

export function getTemplate(id: string): DashboardTemplate | null {
  return DASHBOARD_TEMPLATES.find((template) => template.id === id) ?? null;
}

/**
 * Build a layout from a template. Singleton constraints are enforced here
 * (each type appears at most once — later duplicates are dropped) and the
 * width/height specs are clamped through the registry bounds.
 */
export function layoutFromTemplate(template: DashboardTemplate): DashboardLayoutDocument {
  const seen = new Set<string>();
  const widgets = template.widgets.flatMap((spec) => {
    const def = WIDGET_REGISTRY[spec.type];
    // Unknown types and singleton violations are dropped, never rendered fake.
    if (!def || (def.singleton && seen.has(spec.type))) return [];
    seen.add(spec.type);
    return [
      {
        instanceId: newWidgetInstanceId(def.type),
        type: def.type,
        visible: true,
        w: Math.min(def.maxW, Math.max(def.minW, spec.w ?? def.defaultW)),
        h: Math.min(def.maxH, Math.max(def.minH, spec.h ?? def.defaultH)),
      },
    ];
  });
  const now = new Date().toISOString();
  return {
    id: newLayoutId(),
    name: template.name,
    description: template.description,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    widgets,
    createdAt: now,
    updatedAt: now,
    templateId: template.id,
  };
}

"use client";

import * as React from "react";

import type { OryonLayoutChartType, OryonLayoutPanel, MarketInterval } from "@cosmoz/shared";

import { indicatorRuleError } from "@/lib/oryon/indicators/validation";
import { planTemplateApply } from "@/lib/oryon/workspace/templates";
import {
  OryonWorkspaceConfigStore,
  type WorkspaceConfigSnapshot,
  type WorkspaceOpResult,
} from "@/lib/oryon/workspace/store";

import { useOryonIndicators } from "@/components/oryon/oryon-indicators-context";

/**
 * Oryon workspace configuration context (Phase 6).
 *
 * Wraps the workspace with the layout/template store and the ORCHESTRATION
 * that spans two domains:
 *  - applying a chart template = plan (pure) → replace the indicator stack
 *    through the existing indicator store (loadAll — one commit, the series
 *    manager diffs by id, no chart reinitialization) → patch the session's
 *    chart fields through the config store;
 *  - saving a template = capture the CURRENT indicator stack + chart fields.
 *
 * The store hydrates from browser-local persistence in a mount effect —
 * server render and first client render stay identical (no hydration
 * mismatch), the persisted arrangement lands one frame later, before the
 * chart engine initializes (it waits for the instrument catalog anyway).
 *
 * Drawings, price alerts and positions are NOT wired here on purpose:
 * they live in their own providers/stores, and applying a layout or
 * template must never reach them (spec §11 — structurally guaranteed).
 */

export interface TemplateApplyReport {
  applied: number;
  skipped: number;
  total: number;
}

export interface OryonWorkspaceConfigContextValue {
  store: OryonWorkspaceConfigStore;
  /** Applies a saved template. Returns an honest report, or null if gone. */
  applyTemplate: (id: string) => TemplateApplyReport | null;
  /** Captures the CURRENT chart analysis as a new template. */
  saveCurrentTemplate: (name: string) => WorkspaceOpResult;
}

const OryonWorkspaceConfigContext =
  React.createContext<OryonWorkspaceConfigContextValue | null>(null);

export function OryonWorkspaceConfigProvider({ children }: { children: React.ReactNode }) {
  const [store] = React.useState(() => new OryonWorkspaceConfigStore());
  const { store: indicatorStore } = useOryonIndicators();

  // Hydrate once per workspace mount (after first paint — hydration-safe).
  React.useEffect(() => {
    store.hydrate();
  }, [store]);

  // Flush pending debounced writes on unmount (same discipline as the
  // indicator persistence).
  React.useEffect(() => {
    return () => store.flush();
  }, [store]);

  const applyTemplate = React.useCallback(
    (id: string): TemplateApplyReport | null => {
      const template = store.getSnapshot().templates.find((t) => t.id === id);
      if (template === undefined) return null;

      // Plan against the SAME business rules the live chart enforces —
      // unsupported/invalid entries are dropped and REPORTED, never silent.
      const plan = planTemplateApply(template, indicatorRuleError);
      indicatorStore.loadAll(plan.indicators);
      store.applyTemplateChart(plan.chartType, plan.interval);

      return { applied: plan.indicators.length, skipped: plan.skipped, total: plan.total };
    },
    [store, indicatorStore],
  );

  const saveCurrentTemplate = React.useCallback(
    (name: string): WorkspaceOpResult => {
      const { session } = store.getSnapshot();
      return store.saveTemplate(name, {
        chart: {
          type: session.chartType as OryonLayoutChartType,
          interval: session.interval as MarketInterval,
        },
        indicators: indicatorStore.indicators,
      });
    },
    [store, indicatorStore],
  );

  const value = React.useMemo(
    () => ({ store, applyTemplate, saveCurrentTemplate }),
    [store, applyTemplate, saveCurrentTemplate],
  );

  return (
    <OryonWorkspaceConfigContext.Provider value={value}>
      {children}
    </OryonWorkspaceConfigContext.Provider>
  );
}

export function useOryonWorkspaceConfig(): OryonWorkspaceConfigContextValue {
  const value = React.useContext(OryonWorkspaceConfigContext);
  if (value === null) {
    throw new Error(
      "useOryonWorkspaceConfig must be used within OryonWorkspaceConfigProvider",
    );
  }
  return value;
}

/** Subscribes a component to the workspace config snapshot (rare commits). */
export function useWorkspaceConfigSnapshot(): WorkspaceConfigSnapshot {
  const { store } = useOryonWorkspaceConfig();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export type { OryonLayoutPanel };

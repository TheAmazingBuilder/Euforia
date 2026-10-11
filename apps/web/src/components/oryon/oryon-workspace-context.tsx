"use client";

import * as React from "react";

import type {
  OryonLayoutChartType,
  OryonLayoutPanel,
  MarketInterval,
  OryonWorkspaceLayoutV2,
} from "@cosmoz/shared";

import { indicatorRuleError } from "@/lib/oryon/indicators/validation";
import { planTemplateApply } from "@/lib/oryon/workspace/templates";
import {
  OryonWorkspaceConfigStore,
  type WorkspaceConfigSnapshot,
  type WorkspaceOpResult,
} from "@/lib/oryon/workspace/store";

import { useOryonIndicators } from "@/components/oryon/oryon-indicators-context";

/**
 * Oryon workspace configuration context (Phase 6 + Phase 7).
 *
 * Wraps the workspace with the layout/template store and the ORCHESTRATION
 * that spans two domains:
 *  - applying a chart template = plan (pure) → replace the TARGET panel's
 *    (the ACTIVE chart's) indicator stack through the indicator registry
 *    (loadAll — one commit, the series manager diffs by id, no chart
 *    reinitialization) → patch that panel's chart fields through the
 *    config store. Applying a template never rewrites another panel's
 *    configuration (Phase 7 spec §12);
 *  - saving a template = capture the ACTIVE panel's indicator stack + chart
 *    fields;
 *  - saving a LAYOUT = capture every panel's stack through the store's
 *    capture hook; switching/restoring a layout = apply the record's
 *    per-panel stacks through the same registry (null = "not managed by
 *    this layout" — the live stack is left untouched).
 *
 * The store hydrates from browser-local persistence in a mount effect —
 * server render and first client render stay identical (no hydration
 * mismatch), the persisted arrangement lands one frame later, before the
 * chart engines initialize (they wait for the instrument catalog anyway).
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
  /** Applies a saved template to the ACTIVE panel. Honest report / null. */
  applyTemplate: (id: string) => TemplateApplyReport | null;
  /** Captures the ACTIVE panel's analysis as a new template. */
  saveCurrentTemplate: (name: string) => WorkspaceOpResult;
  /**
   * Switches to a saved layout (or null = the default) AND applies its
   * per-panel indicator stacks — the full orchestrated switch the menus
   * call (the store alone owns the session; stacks live in the registry).
   */
  applySavedLayout: (id: string | null) => void;
}

const OryonWorkspaceConfigContext =
  React.createContext<OryonWorkspaceConfigContextValue | null>(null);

export function OryonWorkspaceConfigProvider({ children }: { children: React.ReactNode }) {
  const [store] = React.useState(() => new OryonWorkspaceConfigStore());
  const { registry: indicatorRegistry } = useOryonIndicators();

  /**
   * Wires the layout-save indicator capture: the store asks the registry
   * for each panel's CURRENT stack when the user explicitly saves a
   * layout. A missing store (panel not mounted yet) records null — "not
   * managed", never a fabricated empty stack.
   */
  React.useEffect(() => {
    store.setPanelIndicatorsCapture((panelId) => {
      const indicatorStore = indicatorRegistry.find(panelId);
      return indicatorStore !== null ? indicatorStore.indicators : null;
    });
    return () => store.setPanelIndicatorsCapture(() => null);
  }, [store, indicatorRegistry]);

  /**
   * Applies a v2 layout record's per-panel indicator stacks through the
   * registry. `null` = "not managed by this layout" — the panel's live
   * stack is left untouched (v1 heritage, honest partial semantics).
   */
  const applyPanelStacks = React.useCallback(
    (layout: OryonWorkspaceLayoutV2) => {
      for (const panel of layout.panels) {
        if (panel.indicators === null) continue;
        const panelStore = indicatorRegistry.storeFor(panel.id);
        panelStore.loadAll(panel.indicators);
      }
    },
    [indicatorRegistry],
  );

  // Hydrate once per workspace mount (after first paint — hydration-safe).
  React.useEffect(() => {
    store.hydrate();
    // Restore the active layout's per-panel indicator stacks (Phase 7):
    // panels whose record manages a stack get it applied through the
    // validated store path (loadAll — ids preserved, no duplicates).
    const { layouts, activeLayoutId } = store.getSnapshot();
    const active = activeLayoutId !== null ? layouts.find((l) => l.id === activeLayoutId) : undefined;
    if (active !== undefined) applyPanelStacks(active);
  }, [store, indicatorRegistry, applyPanelStacks]);

  // Flush pending debounced writes on unmount (same discipline as the
  // indicator persistence).
  React.useEffect(() => {
    return () => store.flush();
  }, [store]);

  const applyTemplate = React.useCallback(
    (id: string): TemplateApplyReport | null => {
      const snapshot = store.getSnapshot();
      const template = snapshot.templates.find((t) => t.id === id);
      if (template === undefined) return null;

      // Plan against the SAME business rules the live chart enforces —
      // unsupported/invalid entries are dropped and REPORTED, never silent.
      const plan = planTemplateApply(template, indicatorRuleError);
      const activePanelId = snapshot.session.activePanelId;
      const panelStore = indicatorRegistry.storeFor(activePanelId);
      panelStore.loadAll(plan.indicators);
      store.applyTemplateChart(activePanelId, plan.chartType, plan.interval);

      return { applied: plan.indicators.length, skipped: plan.skipped, total: plan.total };
    },
    [store, indicatorRegistry],
  );

  const saveCurrentTemplate = React.useCallback(
    (name: string): WorkspaceOpResult => {
      const { session } = store.getSnapshot();
      const panel = session.panels.find((p) => p.id === session.activePanelId);
      if (panel === undefined) return { ok: false, error: "not_found" };
      const panelStore = indicatorRegistry.find(panel.id);
      return store.saveTemplate(name, {
        chart: {
          type: panel.chartType as OryonLayoutChartType,
          interval: panel.interval as MarketInterval,
        },
        indicators: panelStore !== null ? panelStore.indicators : [],
      });
    },
    [store, indicatorRegistry],
  );

  const applySavedLayout = React.useCallback(
    (id: string | null) => {
      if (id === null) {
        store.restoreDefaultLayout();
        return;
      }
      const result = store.switchLayout(id);
      if (!result.ok) return;
      const { layouts, activeLayoutId } = store.getSnapshot();
      const active = activeLayoutId !== null ? layouts.find((l) => l.id === activeLayoutId) : undefined;
      if (active !== undefined) applyPanelStacks(active);
    },
    [store, applyPanelStacks],
  );

  const value = React.useMemo(
    () => ({ store, applyTemplate, saveCurrentTemplate, applySavedLayout }),
    [store, applyTemplate, saveCurrentTemplate, applySavedLayout],
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

"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { DashboardWidgetKey, DashboardWidgetItem, UserPreferences } from "@cosmoz/shared";

import { apiErrorMessage } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import { usePreferences, useUpdatePreferencesDomain } from "@/lib/api/queries";
import {
  activeLayoutOf,
  buildLayoutFromTemplate,
  customizationReducer,
  displayedLayoutOf,
  displayedWidgetOrder,
  initialCustomizationState,
  isDirty,
  layoutNameError,
  makeEmptyLayout,
  type CustomizationAction,
} from "@/lib/dashboard-customization/customization-reducer";
import {
  activeFiltersFromPreferences,
  dashboardDomainWithFilters,
  preferencesFromSnapshot,
  savedViewsFromPreferences,
  snapshotFromPreferences,
} from "@/lib/dashboard-customization/persistence";
import type { CustomizationSnapshot } from "@/lib/dashboard-customization/types";

/**
 * Dashboard customization hook (Phase 01, Phase 03-aware) — wires the pure
 * customization state machine to the existing persistence architecture
 * (PATCH /me/preferences/dashboard via TanStack Query with optimistic cache).
 *
 * Transaction model (§5): entering edit mode snapshots the active layout
 * into a draft; draft mutations stay local until Save commits (and exits)
 * or Cancel discards. A failed save keeps the draft and the session alive.
 *
 * Layout-collection operations (switch/duplicate/rename/delete/templates)
 * persist immediately through the same PATCH — they are separate objects
 * from the edited draft; while editing, active-changing ops are disabled
 * by the UI so a live draft is never silently discarded (§10.2).
 *
 * Phase 03: the dashboard domain is replaced WHOLESALE by the server, so
 * EVERY layout PATCH carries the current filter half (saved analytical
 * views + active filters) merged from the freshest preferences cache — a
 * layout save can never wipe the global filter context (the filters hook
 * merges this machine's layouts the same way, in reverse).
 */
export function useDashboardCustomization() {
  const { data: prefs, isLoading: prefsLoading } = usePreferences();
  const updateDashboard = useUpdatePreferencesDomain("dashboard");
  const queryClient = useQueryClient();

  const [state, dispatch] = React.useReducer(customizationReducer, initialCustomizationState);

  // Ref mirror for event handlers — synced in an effect (react-compiler
  // purity: no ref writes during render).
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Reconcile server truth into the local state whenever the stored
  // dashboard domain changes. The reducer ignores syncs mid-edit.
  const storedDashboard = prefs?.dashboard;
  const storedSignature = React.useMemo(
    () => JSON.stringify(storedDashboard ?? null),
    [storedDashboard],
  );
  React.useEffect(() => {
    if (storedSignature === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(storedSignature);
    } catch {
      return;
    }
    const snapshot = snapshotFromPreferences(
      parsed as Parameters<typeof snapshotFromPreferences>[0],
    );
    dispatch({ type: "sync", snapshot });
  }, [storedSignature]);

  /** Layout payload + the CURRENT filter half from the freshest cache —
   * the domain PATCH replaces everything, both halves always travel. */
  const fullDomainPayload = React.useCallback(
    (snapshot: CustomizationSnapshot) => {
      const stored = queryClient.getQueryData<UserPreferences>(queryKeys.preferences);
      return dashboardDomainWithFilters(
        preferencesFromSnapshot(snapshot),
        activeFiltersFromPreferences(stored?.dashboard),
        savedViewsFromPreferences(stored?.dashboard),
      );
    },
    [queryClient],
  );

  const persist = React.useCallback(
    (snapshot: CustomizationSnapshot) => {
      updateDashboard.mutate(fullDomainPayload(snapshot), {
        onError: (error) => {
          toast.error(apiErrorMessage(error, "Could not save your dashboard layout."));
        },
      });
    },
    [updateDashboard, fullDomainPayload],
  );

  /** View-mode collection op: apply via the pure reducer, then persist. */
  const applyCollectionAction = React.useCallback(
    (action: CustomizationAction) => {
      const next = customizationReducer(stateRef.current, action);
      if (next === stateRef.current) return;
      dispatch(action);
      persist({ layouts: next.layouts, activeLayoutId: next.activeLayoutId });
    },
    [persist],
  );

  const dirty = isDirty(state);
  const activeLayout = activeLayoutOf(state);
  const displayedLayout = displayedLayoutOf(state);

  const enterEdit = React.useCallback(() => dispatch({ type: "editStarted" }), []);
  const cancelEdit = React.useCallback(() => dispatch({ type: "editCancelled" }), []);

  const saveEdit = React.useCallback(() => {
    const current = stateRef.current;
    if (!current.draft) return;
    const target: CustomizationSnapshot = {
      layouts: current.layouts.map((layout) =>
        layout.id === current.draft!.id ? current.draft! : layout,
      ),
      activeLayoutId: current.activeLayoutId,
    };
    dispatch({ type: "saveStarted" });
    updateDashboard.mutate(fullDomainPayload(target), {
      onSuccess: () => {
        dispatch({ type: "saveCommitted", snapshot: target });
        toast.success("Layout saved.");
      },
      onError: (error) => {
        dispatch({
          type: "saveFailed",
          message: apiErrorMessage(error, "The layout could not be saved. Your edits are kept — try again."),
        });
      },
    });
  }, [updateDashboard, fullDomainPayload]);

  // ── Draft mutations (edit mode) ────────────────────────────────────────────
  const addWidget = React.useCallback(
    (widgetType: DashboardWidgetKey) => dispatch({ type: "draftAddWidget", widgetType }),
    [],
  );
  const removeWidget = React.useCallback(
    (instanceId: string) => dispatch({ type: "draftRemoveWidget", instanceId }),
    [],
  );
  const setWidgetVisible = React.useCallback(
    (instanceId: string, visible: boolean) =>
      dispatch({ type: "draftSetVisible", instanceId, visible }),
    [],
  );
  const moveWidgetTo = React.useCallback(
    (instanceId: string, toIndex: number) =>
      dispatch({ type: "draftMoveTo", instanceId, toIndex }),
    [],
  );
  const moveWidgetBy = React.useCallback(
    (instanceId: string, direction: -1 | 1) =>
      dispatch({ type: "draftMoveBy", instanceId, direction }),
    [],
  );
  const resizeWidget = React.useCallback(
    (instanceId: string, patch: { w?: number; h?: number }) =>
      dispatch({ type: "draftResize", instanceId, patch }),
    [],
  );
  /**
   * Per-widget config (Phase 02 §6): edit mode routes into the draft
   * transaction (nothing persists before Save); view mode applies the
   * validated change to the active layout and persists immediately — the
   * same channel as the other view-mode collection operations.
   */
  const setWidgetConfig = React.useCallback(
    (instanceId: string, config: DashboardWidgetItem["config"]) => {
      const current = stateRef.current;
      if (current.draft) {
        dispatch({ type: "draftSetConfig", instanceId, config });
        return;
      }
      applyCollectionAction({
        type: "widgetConfigSet",
        layoutId: current.activeLayoutId,
        instanceId,
        config,
      });
    },
    [applyCollectionAction],
  );
  const resetDraftToDefault = React.useCallback(
    () => dispatch({ type: "draftResetToDefault" }),
    [],
  );
  const replaceDraftWithTemplate = React.useCallback(
    (templateId: string) => {
      const layout = buildLayoutFromTemplate(templateId);
      if (layout) dispatch({ type: "draftReplaced", layout });
    },
    [],
  );

  // ── Layout collection operations (persist immediately) ────────────────────
  const switchLayout = React.useCallback(
    (layoutId: string) => {
      if (!stateRef.current.layouts.some((layout) => layout.id === layoutId)) return;
      applyCollectionAction({ type: "layoutSwitched", layoutId });
    },
    [applyCollectionAction],
  );

  const duplicateLayout = React.useCallback(
    (layoutId: string) => {
      if (!stateRef.current.layouts.some((layout) => layout.id === layoutId)) return;
      applyCollectionAction({ type: "layoutDuplicated", layoutId });
    },
    [applyCollectionAction],
  );

  const renameLayout = React.useCallback(
    (layoutId: string, name: string): boolean => {
      if (layoutNameError(stateRef.current, name, layoutId) !== null) return false;
      applyCollectionAction({ type: "layoutRenamed", layoutId, name });
      return true;
    },
    [applyCollectionAction],
  );

  const deleteLayout = React.useCallback(
    (layoutId: string) => applyCollectionAction({ type: "layoutDeleted", layoutId }),
    [applyCollectionAction],
  );

  const createLayoutFromTemplate = React.useCallback(
    (templateId: string) => {
      const layout = buildLayoutFromTemplate(templateId);
      if (!layout) return;
      applyCollectionAction({ type: "layoutCreated", layout });
      toast.success(`"${layout.name}" layout created.`);
    },
    [applyCollectionAction],
  );

  const createEmptyLayout = React.useCallback(
    (requestedName?: string) => {
      const result = makeEmptyLayout(stateRef.current, requestedName ?? "");
      if ("layout" in result) {
        applyCollectionAction({ type: "layoutCreated", layout: result.layout });
      }
    },
    [applyCollectionAction],
  );

  return {
    /** Local customization state (saved collection + draft + persistence). */
    state,
    dirty,
    prefsLoading,
    activeLayout,
    displayedLayout,
    /** Legacy-order view kept in sync with the displayed layout. */
    widgetOrder: displayedWidgetOrder(state),
    editing: state.draft !== null,
    enterEdit,
    cancelEdit,
    saveEdit,
    addWidget,
    removeWidget,
    setWidgetVisible,
    moveWidgetTo,
    moveWidgetBy,
    resizeWidget,
    setWidgetConfig,
    resetDraftToDefault,
    replaceDraftWithTemplate,
    switchLayout,
    duplicateLayout,
    renameLayout,
    deleteLayout,
    createLayoutFromTemplate,
    createEmptyLayout,
  };
}

export type DashboardCustomization = ReturnType<typeof useDashboardCustomization>;

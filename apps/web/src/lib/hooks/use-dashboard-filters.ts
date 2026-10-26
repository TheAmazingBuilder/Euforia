"use client";

import * as React from "react";
import { toast } from "sonner";
import type { DashboardFilters } from "@cosmoz/shared";

import { apiErrorMessage } from "@/lib/api/client";
import { usePreferences, useUpdatePreferencesDomain } from "@/lib/api/queries";
import { filtersReducer, initialFiltersState, type FiltersState } from "@/lib/dashboard-customization/filters-state";
import {
  createSavedView,
  deleteSavedView,
  duplicateSavedView,
  renameSavedView,
} from "@/lib/dashboard-customization/saved-views";
import {
  activeFiltersFromPreferences,
  dashboardDomainWithFilters,
  preferencesFromSnapshot,
  savedViewsFromPreferences,
  snapshotFromPreferences,
} from "@/lib/dashboard-customization/persistence";

/**
 * Global dashboard filters hook (Phase 03 §7/§10/§12) - wires the pure
 * filter state machine to the EXISTING persistence architecture (PATCH
 * /me/preferences/dashboard via the optimistic preferences mutation).
 *
 * Transaction model: every filter edit / view operation is applied by the
 * reducer immediately (authoritative state) and persisted right away - the
 * same convention as the view-mode layout collection operations. The PATCH
 * carries the WHOLE dashboard domain (layouts merged from the current
 * stored snapshot, views + active filters from this machine) because the
 * server replaces the domain wholesale - a filter save can never wipe
 * layouts, and a layout save can never wipe views (both halves always
 * travel together).
 *
 * Purity contract: the saved-views MODEL (create/rename/duplicate/delete)
 * runs HERE, never inside the reducer - ids and timestamps are generated
 * once per user action and the reducer only applies pre-computed
 * collections (replay-safe under React's reducer re-runs - the same
 * contract as the Phase 01 layout machine).
 *
 * Stale-response safety: `sync` is ignored while a save is in flight; the
 * optimistic mutation rolls the cache back on 4xx and the reducer keeps
 * the local state alive for retry.
 */
export function useDashboardFilters() {
  const { data: prefs, isLoading: prefsLoading } = usePreferences();
  const updateDashboard = useUpdatePreferencesDomain("dashboard");

  const [state, dispatch] = React.useReducer(filtersReducer, initialFiltersState);

  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Fresh stored domain for WHOLESALE merges - synced in an effect
  // (react-compiler purity: no ref writes during render).
  const storedDashboard = prefs?.dashboard;
  const storedRef = React.useRef(storedDashboard);
  React.useEffect(() => {
    storedRef.current = storedDashboard;
  }, [storedDashboard]);

  // Reconcile server truth into the machine whenever the stored domain
  // changes. The persistence layer normalizes; the reducer is the second
  // gate and ignores syncs mid-save.
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
    dispatch({
      type: "sync",
      filters: activeFiltersFromPreferences(parsed as Parameters<typeof activeFiltersFromPreferences>[0]),
      views: savedViewsFromPreferences(parsed as Parameters<typeof savedViewsFromPreferences>[0]),
    });
  }, [storedSignature]);

  const persist = React.useCallback(
    (next: FiltersState) => {
      const base = preferencesFromSnapshot(snapshotFromPreferences(storedRef.current));
      const payload = dashboardDomainWithFilters(base, next.filters, next.views);
      dispatch({ type: "saveStarted" });
      updateDashboard.mutate(payload, {
        onSuccess: () => {
          dispatch({
            type: "saveCommitted",
            filters: next.filters,
            views: next.views,
          });
        },
        onError: (error) => {
          dispatch({ type: "saveFailed", message: "keep" });
          toast.error(apiErrorMessage(error, "Could not save your dashboard filters."));
        },
      });
    },
    [updateDashboard],
  );

  /** Apply through the reducer; persist only when the state changed. */
  const applyAction = React.useCallback(
    (action: Parameters<typeof filtersReducer>[1]) => {
      const next = filtersReducer(stateRef.current, action);
      if (next === stateRef.current) return;
      dispatch(action);
      persist(next);
    },
    [persist],
  );

  const patchFilter = React.useCallback(
    (patch: Partial<DashboardFilters>) => applyAction({ type: "filtersPatched", patch }),
    [applyAction],
  );
  const clearFilters = React.useCallback(
    () => applyAction({ type: "filtersCleared" }),
    [applyAction],
  );
  const applyView = React.useCallback(
    (viewId: string) => applyAction({ type: "viewApplied", viewId }),
    [applyAction],
  );

  // ── Saved-view collection ops (§10) - model runs HERE, reducer applies ────

  const createView = React.useCallback(
    (name: string, description?: string) => {
      const current = stateRef.current;
      const result = createSavedView(
        current.views,
        { name, description, filters: current.filters },
        new Date().toISOString(),
      );
      if (!result.ok) {
        dispatch({ type: "viewOpFailed", error: result.error });
        return;
      }
      const created = result.value[result.value.length - 1]!;
      dispatch({ type: "viewCreated", views: result.value, activeViewId: created.id });
      persist({ ...current, views: result.value, activeViewId: created.id });
    },
    [persist],
  );

  const renameView = React.useCallback(
    (viewId: string, name: string) => {
      const current = stateRef.current;
      const result = renameSavedView(current.views, viewId, name, new Date().toISOString());
      if (!result.ok) {
        dispatch({ type: "viewOpFailed", error: result.error });
        return;
      }
      dispatch({ type: "viewRenamed", views: result.value });
      persist({ ...current, views: result.value });
    },
    [persist],
  );

  const duplicateView = React.useCallback(
    (viewId: string) => {
      const current = stateRef.current;
      const result = duplicateSavedView(current.views, viewId, new Date().toISOString());
      if (!result.ok) {
        dispatch({ type: "viewOpFailed", error: result.error });
        return;
      }
      dispatch({ type: "viewDuplicated", views: result.value });
      persist({ ...current, views: result.value });
    },
    [persist],
  );

  const deleteView = React.useCallback(
    (viewId: string) => {
      const current = stateRef.current;
      const result = deleteSavedView(current.views, viewId);
      if (!result.ok) {
        dispatch({ type: "viewOpFailed", error: result.error });
        return;
      }
      dispatch({ type: "viewDeleted", views: result.value });
      const activeViewId =
        current.activeViewId !== null && result.value.some((v) => v.id === current.activeViewId)
          ? current.activeViewId
          : null;
      persist({ ...current, views: result.value, activeViewId });
    },
    [persist],
  );

  return {
    /** Full machine state (filters + views + persistence status). */
    state,
    filters: state.filters,
    views: state.views,
    saving: state.persistence === "saving",
    /** Last saved-view operation error (NAME_TAKEN / LIMIT_REACHED / …). */
    viewError: state.error,
    prefsLoading,
    patchFilter,
    clearFilters,
    applyView,
    createView,
    renameView,
    duplicateView,
    deleteView,
  };
}

export type DashboardFiltersController = ReturnType<typeof useDashboardFilters>;

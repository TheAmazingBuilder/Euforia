import type { DashboardFilters, DashboardSavedView } from "@cosmoz/shared";

import { DEFAULT_DASHBOARD_FILTERS, filtersEqual, normalizeDashboardFilters } from "./filters";
import {
  createSavedView,
  deleteSavedView,
  duplicateSavedView,
  normalizeSavedViews,
  renameSavedView,
  type SavedViewError,
} from "./saved-views";
import type { PersistenceStatus } from "./types";

/**
 * Global-filter state machine (Phase 03 §7/§10) — a pure reducer that owns
 * the AUTHORITATIVE dashboard filter context and the saved-view collection.
 *
 * Independence (spec §4/§11): this machine is deliberately SEPARATE from the
 * layout customization reducer — applying a view never touches widget
 * arrangement and layout operations never touch filters. The two machines
 * share only the persistence channel (the `dashboard` preferences domain,
 * PATCHed wholesale; the hook layer merges both halves — see
 * `dashboardDomainWithFilters`).
 *
 * Semantics:
 *  - `filters` is always a VALIDATED document (normalizeDashboardFilters at
 *    every entry point — untrusted input can never enter the state);
 *  - a manual filter edit keeps the selected view as the anchor but the UI
 *    derives a "diverged" flag (never silently overwrites a view, §10.7);
 *  - `sync` (server truth) is ignored while a save is in flight — a stale
 *    response can never overwrite newer local state (§7/§13);
 *  - persistence status mirrors the customization machine: a failed save
 *    keeps the local state alive so the user can retry.
 */

export interface FiltersState {
  /** The authoritative active filter context (always validated). */
  filters: DashboardFilters;
  /** Saved analytical views (normalized, capped — model layer owns rules). */
  views: DashboardSavedView[];
  /** The view the user last applied/created — divergence is DERIVED. */
  activeViewId: string | null;
  persistence: PersistenceStatus;
  /** Last saved-view operation error (rendered near the controls). */
  error: SavedViewError | null;
}

export const initialFiltersState: FiltersState = {
  filters: DEFAULT_DASHBOARD_FILTERS,
  views: [],
  activeViewId: null,
  persistence: "idle",
  error: null,
};

export type FiltersAction =
  /** Replace the whole state from stored truth (initial load, refetch).
   * Payloads are normalized here — the persistence layer pre-normalizes,
   * this is the defensive second gate. */
  | { type: "sync"; filters: unknown; views: unknown }
  /** Merge a partial filter patch (one dimension at a time from the bar).
   * The merged document is re-validated: an invalid dimension (e.g. CUSTOM
   * without bounds) degrades instead of poisoning the state. */
  | { type: "filtersPatched"; patch: Partial<DashboardFilters> }
  /** Clear-all — restores the documented default (§10.7). Never deletes
   * views; the selected view is unlinked (its filters may differ now). */
  | { type: "filtersCleared" }
  /** Apply a saved view — filters = the view's definition, re-validated. */
  | { type: "viewApplied"; viewId: string }
  /** Create a view from the CURRENT filters (§10.2). The reducer runs the
   * pure model op so the state and the error surface stay consistent. */
  | { type: "viewCreateRequested"; name: string; description?: string; now: string }
  | { type: "viewRenameRequested"; viewId: string; name: string; now: string }
  /** Duplicate — new id + deep independent copy (§10.5). */
  | { type: "viewDuplicateRequested"; viewId: string; now: string }
  /** Delete — removes ONLY the view (§10.6); filters stay as they are. */
  | { type: "viewDeleteRequested"; viewId: string }
  | { type: "saveStarted" }
  | { type: "saveCommitted"; filters: DashboardFilters; views: DashboardSavedView[] }
  | { type: "saveFailed"; message: string };

/** The selected view, if it still exists. */
export function activeViewOf(state: FiltersState): DashboardSavedView | null {
  if (state.activeViewId === null) return null;
  return state.views.find((view) => view.id === state.activeViewId) ?? null;
}

/** True when the selected view no longer matches the current filters. */
export function isDivergedFromView(state: FiltersState): boolean {
  const view = activeViewOf(state);
  if (view === null) return false;
  return !filtersEqual(view.filters, state.filters);
}

export function filtersReducer(state: FiltersState, action: FiltersAction): FiltersState {
  switch (action.type) {
    case "sync": {
      // Stale-response guard (§7): server truth never overwrites a state
      // whose save is still in flight — the save result wins on landing.
      if (state.persistence === "saving") return state;
      const filters = normalizeDashboardFilters(action.filters);
      // The views payload is normalized defensively (cap/dedupe/drop).
      const nextViews = normalizeViews(action.views);
      return { ...state, filters, views: nextViews, persistence: "idle", error: null };
    }

    case "filtersPatched": {
      const merged = normalizeDashboardFilters({ ...state.filters, ...action.patch });
      return { ...state, filters: merged, error: null };
    }

    case "filtersCleared":
      return { ...state, filters: { ...DEFAULT_DASHBOARD_FILTERS }, error: null };

    case "viewApplied": {
      const view = state.views.find((candidate) => candidate.id === action.viewId);
      if (!view) return state;
      return {
        ...state,
        filters: normalizeDashboardFilters(view.filters),
        activeViewId: view.id,
        error: null,
      };
    }

    case "viewCreateRequested": {
      const result = createSavedView(
        state.views,
        { name: action.name, description: action.description, filters: state.filters },
        action.now,
      );
      if (!result.ok) return { ...state, error: result.error };
      const created = result.value[result.value.length - 1]!;
      return { ...state, views: result.value, activeViewId: created.id, error: null };
    }

    case "viewRenameRequested": {
      const result = renameSavedView(state.views, action.viewId, action.name, action.now);
      return result.ok
        ? { ...state, views: result.value, error: null }
        : { ...state, error: result.error };
    }

    case "viewDuplicateRequested": {
      const result = duplicateSavedView(state.views, action.viewId, action.now);
      return result.ok
        ? { ...state, views: result.value, error: null }
        : { ...state, error: result.error };
    }

    case "viewDeleteRequested": {
      const result = deleteSavedView(state.views, action.viewId);
      if (!result.ok) return { ...state, error: result.error };
      const activeViewId =
        state.activeViewId !== null && result.value.some((v) => v.id === state.activeViewId)
          ? state.activeViewId
          : null;
      return { ...state, views: result.value, activeViewId, error: null };
    }

    case "saveStarted":
      return { ...state, persistence: "saving", error: null };

    case "saveCommitted":
      // The persisted payload IS the new local truth (optimistic parity).
      return {
        ...state,
        filters: normalizeDashboardFilters(action.filters),
        views: action.views,
        persistence: "idle",
        error: null,
      };

    case "saveFailed":
      // Local state survives — the user can retry (same rule as layouts).
      return { ...state, persistence: "error", error: null };

    default:
      return state;
  }
}

/** Defensive second gate for sync views payloads (never throws). */
function normalizeViews(candidate: unknown): DashboardSavedView[] {
  return normalizeSavedViews(candidate);
}

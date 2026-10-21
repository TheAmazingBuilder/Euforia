import type { DashboardFilters, DashboardPreferences, DashboardPreferencesInput, DashboardSavedView } from "@cosmoz/shared";

import { DEFAULT_DASHBOARD_FILTERS, normalizeDashboardFilters } from "./filters";
import { readStoredCustomization, widgetOrderOf } from "./layout-model";
import { normalizeSavedViews } from "./saved-views";
import type { CustomizationSnapshot } from "./types";

/**
 * Persistence adapter (Phase 01 §13, extended by Phase 03 §10/§12) — the
 * ONLY place that maps between the stored dashboard preferences domain and
 * the customization / filter state.
 *
 * Storage mechanism: the EXISTING server-backed preferences API
 * (PATCH /me/preferences/dashboard — per-user ownership enforced server
 * side). Nothing here touches browser storage; no secrets pass through.
 * Layouts and saved views are configuration only — trade data is never
 * serialized here.
 */

/**
 * Stored document → safe snapshot. Handles:
 *  - current documents (layouts + activeLayoutId);
 *  - legacy documents (widgetOrder only → default collection synthesized);
 *  - missing/malformed data (per-layout validation, never a crash).
 */
export function snapshotFromPreferences(
  dashboard: DashboardPreferences | undefined,
): CustomizationSnapshot {
  return readStoredCustomization(dashboard);
}

/**
 * Snapshot → the domain PATCH payload. `widgetOrder` is derived from the
 * active layout so legacy readers and restore flows keep working.
 */
export function preferencesFromSnapshot(
  snapshot: CustomizationSnapshot,
): DashboardPreferencesInput {
  const active = snapshot.layouts.find((layout) => layout.id === snapshot.activeLayoutId)
    ?? snapshot.layouts[0];
  return {
    widgetOrder: widgetOrderOf(active!),
    activeLayoutId: active!.id,
    layouts: snapshot.layouts,
    // Phase 06 — workspace layer keys travel with every domain PATCH (the
    // dashboard domain is replaced wholesale; omitted keys would be wiped).
    ...(snapshot.defaultLayoutId ? { defaultLayoutId: snapshot.defaultLayoutId } : {}),
    ...(snapshot.userTemplates.length > 0 ? { userTemplates: snapshot.userTemplates } : {}),
  };
}

// ── Phase 03 — saved analytical views + active filter context ───────────────

/**
 * Stored document → the saved-views collection. Every item is validated
 * individually (one malformed view never destroys the collection), ids and
 * names deduplicated, capped at 30 — the saved-views model owns the rules.
 */
export function savedViewsFromPreferences(
  dashboard: DashboardPreferences | undefined,
): DashboardSavedView[] {
  return normalizeSavedViews(dashboard?.savedViews);
}

/**
 * Stored document → the last applied active filter context. Absent or
 * malformed documents degrade to the DEFAULT (unfiltered) state — a stale
 * or corrupted `activeFilters` key can never lock the dashboard behind a
 * broken filter (spec §12 "avoid destroying valid views", same spirit).
 */
export function activeFiltersFromPreferences(
  dashboard: DashboardPreferences | undefined,
): DashboardFilters {
  if (dashboard?.activeFilters === undefined) return { ...DEFAULT_DASHBOARD_FILTERS };
  return normalizeDashboardFilters(dashboard.activeFilters);
}

/**
 * Merge the filter-domain state into a FULL dashboard-domain PATCH payload.
 * The dashboard domain is replaced WHOLESALE by the PATCH (server + MSW
 * semantics), so a filter-only save MUST carry the current layout payload
 * too or it would wipe layouts. Callers pass the payload derived from the
 * CURRENT stored domain (preferencesFromSnapshot(snapshotFromPreferences)).
 */
export function dashboardDomainWithFilters(
  base: DashboardPreferencesInput,
  filters: DashboardFilters,
  views: DashboardSavedView[],
): DashboardPreferencesInput {
  return {
    ...base,
    savedViews: views,
    activeFilters: filters,
  };
}

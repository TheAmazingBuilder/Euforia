import type { DashboardPreferences, DashboardPreferencesInput } from "@cosmoz/shared";

import { readStoredCustomization, widgetOrderOf } from "./layout-model";
import type { CustomizationSnapshot } from "./types";

/**
 * Persistence adapter (Phase 01 §13) — the ONLY place that maps between
 * the stored dashboard preferences domain and the customization state.
 *
 * Storage mechanism: the EXISTING server-backed preferences API
 * (PATCH /me/preferences/dashboard — per-user ownership enforced server
 * side). Nothing here touches browser storage; no secrets pass through.
 * Layouts are configuration only — trade data is never serialized here.
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
  };
}

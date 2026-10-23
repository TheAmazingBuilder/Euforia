import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WIDGET_KEYS,
  DEFAULT_USER_PREFERENCES,
  dashboardPreferencesSchema,
  type DashboardPreferencesInput,
} from "@cosmoz/shared";

import {
  activeFiltersFromPreferences,
  dashboardDomainWithFilters,
  savedViewsFromPreferences,
  snapshotFromPreferences,
  preferencesFromSnapshot,
} from "../persistence";
import { readStoredCustomization } from "../layout-model";
import type { CustomizationSnapshot } from "../types";

describe("persistence adapter", () => {
  it("reads current documents (layouts + activeLayoutId) unchanged", () => {
    const snapshot = snapshotFromPreferences({
      widgetOrder: [...DASHBOARD_WIDGET_KEYS],
      activeLayoutId: "custom",
      layouts: [
        { id: "custom", name: "Custom", schemaVersion: 1, widgets: [{ instanceId: "w1", type: "ALERTS", visible: true, w: 4, h: 2 }] },
      ],
    });
    expect(snapshot.activeLayoutId).toBe("custom");
    expect(snapshot.layouts[0]!.widgets[0]!.w).toBe(4);
  });

  it("migrates legacy widgetOrder-only documents to a usable snapshot", () => {
    const snapshot = snapshotFromPreferences({
      widgetOrder: ["HEATMAP", ...DASHBOARD_WIDGET_KEYS.filter((k) => k !== "HEATMAP")],
    });
    expect(snapshot.layouts.length).toBeGreaterThan(0);
    expect(snapshot.layouts[0]!.widgets[0]!.type).toBe("HEATMAP");
  });

  it("survives missing and malformed stored data with safe defaults", () => {
    for (const input of [undefined, {} as never, { layouts: "nope", activeLayoutId: 9 } as never]) {
      const snapshot = snapshotFromPreferences(input);
      expect(snapshot.layouts.length).toBeGreaterThan(0);
      expect(snapshot.layouts.some((l) => l.id === snapshot.activeLayoutId)).toBe(true);
    }
  });

  it("round-trips: snapshot → payload → snapshot is stable", () => {
    const snapshot: CustomizationSnapshot = readStoredCustomization({
      widgetOrder: [...DASHBOARD_WIDGET_KEYS],
      activeLayoutId: "a",
      layouts: [
        { id: "a", name: "A", schemaVersion: 1, widgets: [{ instanceId: "w1", type: "PNL_BAND", visible: true, w: 12, h: 1 }] },
        { id: "b", name: "B", schemaVersion: 1, widgets: [{ instanceId: "w2", type: "ALERTS", visible: false, w: 6, h: 3 }] },
      ],
    });
    const payload = preferencesFromSnapshot(snapshot);
    // widgetOrder is derived from the ACTIVE layout's VISIBLE types in
    // order — exactly what the user sees, nothing invented (Phase 02:
    // opt-in widgets never leak into the stored order).
    expect(payload.widgetOrder).toEqual(["PNL_BAND"]);
    expect(payload.activeLayoutId).toBe("a");
    expect(payload.layouts).toHaveLength(2);
    const reread = readStoredCustomization(payload);
    expect(reread.activeLayoutId).toBe("a");
    expect(reread.layouts.map((l) => l.id)).toEqual(["a", "b"]);
    expect(reread.layouts[1]!.widgets[0]!.visible).toBe(false);
  });
});

describe("persistence adapter - Phase 03 filter domain", () => {
  const ACCOUNT = "0b8f6e1e-7d2a-4c1b-9a2a-00000000000c";

  it("reads saved views with per-item salvage (one bad view never wins)", () => {
    const views = savedViewsFromPreferences({
      widgetOrder: [],
      savedViews: [
        { id: "v1", name: "Gold", schemaVersion: 1, filters: { period: "ALL", accountId: ACCOUNT } },
        { id: "v2", name: "", schemaVersion: 1, filters: { period: "ALL" } }, // invalid name
        "garbage" as never,
      ],
    });
    expect(views).toHaveLength(1);
    expect(views[0]!.name).toBe("Gold");
  });

  it("degrades a missing or malformed activeFilters to the unfiltered default", () => {
    const malformed = { widgetOrder: [], activeFilters: { period: "SOMEDAY" } } as unknown as DashboardPreferencesInput;
    expect(activeFiltersFromPreferences(undefined)).toEqual({ period: "ALL" });
    expect(activeFiltersFromPreferences({ widgetOrder: [] })).toEqual({ period: "ALL" });
    expect(activeFiltersFromPreferences(malformed)).toEqual({
      period: "ALL",
    });
    expect(
      activeFiltersFromPreferences({ widgetOrder: [], activeFilters: { period: "LAST_30", direction: "SELL" } }),
    ).toEqual({ period: "LAST_30", direction: "SELL" });
  });

  it("merges the filter state into a WHOLESALE domain payload (layouts kept)", () => {
    const base: DashboardPreferencesInput = {
      widgetOrder: ["PNL_BAND"],
      activeLayoutId: "layout_default",
      layouts: [{ id: "layout_default", name: "Default", schemaVersion: 1, widgets: [] }],
    };
    const merged = dashboardDomainWithFilters(base, { period: "THIS_MONTH" }, [
      { id: "v1", name: "V", schemaVersion: 1, filters: { period: "THIS_MONTH" } },
    ]);
    // The layout payload survives the merge — a filter-only save must never
    // wipe the layout collection (the domain PATCH replaces everything).
    expect(merged.layouts).toHaveLength(1);
    expect(merged.widgetOrder).toEqual(["PNL_BAND"]);
    expect(merged.savedViews).toHaveLength(1);
    expect(merged.activeFilters).toEqual({ period: "THIS_MONTH" });
    // Round-trips through the shared schema (server-side validation parity).
    expect(dashboardPreferencesSchema.safeParse(merged).success).toBe(true);
  });

  it("the shipped default document validates WITH the new optional keys absent", () => {
    expect(dashboardPreferencesSchema.safeParse(DEFAULT_USER_PREFERENCES.dashboard).success).toBe(true);
  });
});

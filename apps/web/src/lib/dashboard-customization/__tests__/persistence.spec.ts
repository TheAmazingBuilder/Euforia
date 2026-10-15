import { describe, expect, it } from "vitest";
import { DASHBOARD_WIDGET_KEYS } from "@cosmoz/shared";

import {
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
    // widgetOrder is derived from the ACTIVE layout (visible types in order,
    // completed to the canonical set for legacy readers).
    expect(payload.widgetOrder[0]).toBe("PNL_BAND");
    expect([...payload.widgetOrder].sort()).toEqual([...DASHBOARD_WIDGET_KEYS].sort());
    expect(payload.activeLayoutId).toBe("a");
    expect(payload.layouts).toHaveLength(2);
    const reread = readStoredCustomization(payload);
    expect(reread.activeLayoutId).toBe("a");
    expect(reread.layouts.map((l) => l.id)).toEqual(["a", "b"]);
    expect(reread.layouts[1]!.widgets[0]!.visible).toBe(false);
  });
});

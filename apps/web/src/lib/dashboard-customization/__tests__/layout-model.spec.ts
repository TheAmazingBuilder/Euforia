import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WIDGET_KEYS,
  type DashboardLayoutDocument,
  type DashboardWidgetItem,
} from "@cosmoz/shared";

import {
  DEFAULT_LAYOUT_ID,
  MAX_WIDGETS_PER_LAYOUT,
  addWidget,
  cloneLayout,
  createDefaultLayouts,
  createEmptyLayout,
  hasWidgetType,
  layoutsEqual,
  moveWidgetByOffset,
  moveWidgetTo,
  normalizeCustomization,
  normalizeLayout,
  readStoredCustomization,
  removeWidget,
  resizeWidget,
  setWidgetVisible,
  validateLayoutName,
  widgetOrderOf,
} from "../layout-model";
import { WIDGET_REGISTRY } from "../registry";

const defaultLayouts = () => createDefaultLayouts();

function widgetAt(layout: DashboardLayoutDocument, index: number): DashboardWidgetItem {
  return layout.widgets[index]!;
}

describe("layout creation", () => {
  it("creates the default collection with the canonical order", () => {
    const [layout] = defaultLayouts();
    expect(layout!.id).toBe(DEFAULT_LAYOUT_ID);
    expect(layout!.schemaVersion).toBe(1);
    expect(layout!.widgets.map((w) => w.type)).toEqual([...DASHBOARD_WIDGET_KEYS]);
    expect(layout!.widgets.every((w) => w.visible && w.w === 12 && w.h === 1)).toBe(true);
  });

  it("builds ids that are unique across instances and never array indexes", () => {
    const a = createEmptyLayout("A");
    const b = createEmptyLayout("B");
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe("0");
    const withWidget = addWidget(a, "ALERTS")!;
    expect(withWidget.widgets[0]!.instanceId).not.toBe(withWidget.widgets[0]!.type);
  });

  it("merges a legacy saved order: valid keys kept, unknown dropped, missing appended", () => {
    const [layout] = createDefaultLayouts(["HEATMAP", "BOGUS", "ALERTS", "HEATMAP"]);
    expect(layout!.widgets.map((w) => w.type)).toEqual([
      "HEATMAP",
      "ALERTS",
      "PNL_BAND",
      "EQUITY_ROW",
      "GOALS_PACE",
      "WEEK_COMPARE",
      "BEST_WORST",
    ]);
  });
});

describe("widget instance operations", () => {
  it("adds a widget with registry defaults at the end of the layout", () => {
    const layout = addWidget(createEmptyLayout("Test"), "ALERTS")!;
    expect(layout.widgets).toHaveLength(1);
    const instance = widgetAt(layout, 0);
    expect(instance.type).toBe("ALERTS");
    expect(instance.w).toBe(WIDGET_REGISTRY.ALERTS.defaultW);
    expect(instance.h).toBe(WIDGET_REGISTRY.ALERTS.defaultH);
    expect(instance.visible).toBe(true);
  });

  it("refuses a second instance of a singleton widget", () => {
    let layout = addWidget(createEmptyLayout("Test"), "PNL_BAND")!;
    expect(addWidget(layout, "PNL_BAND")).toBeNull();
    // Hidden instances still count against the singleton rule.
    layout = setWidgetVisible(layout, layout.widgets[0]!.instanceId, false);
    expect(addWidget(layout, "PNL_BAND")).toBeNull();
    expect(hasWidgetType(layout, "PNL_BAND")).toBe(true);
  });

  it("removes exactly one instance without touching siblings", () => {
    let layout = createDefaultLayouts()[0]!;
    const victim = layout.widgets.find((w) => w.type === "HEATMAP")!;
    layout = removeWidget(layout, victim.instanceId);
    expect(hasWidgetType(layout, "HEATMAP")).toBe(false);
    expect(layout.widgets).toHaveLength(DASHBOARD_WIDGET_KEYS.length - 1);
  });

  it("hides without deleting configuration and restores it intact", () => {
    let layout = createDefaultLayouts()[0]!;
    const target = widgetAt(layout, 2);
    layout = setWidgetVisible(layout, target!.instanceId, false);
    const hidden = layout.widgets.find((w) => w.instanceId === target!.instanceId)!;
    expect(hidden.visible).toBe(false);
    expect(hidden.w).toBe(target!.w);
    expect(hidden.h).toBe(target!.h);
    const restored = setWidgetVisible(layout, target!.instanceId, true);
    expect(restored.widgets.find((w) => w.instanceId === target!.instanceId)!.visible).toBe(true);
  });

  it("moves widgets to a target index and by relative offset", () => {
    const base = createDefaultLayouts()[0]!;
    const first = widgetAt(base, 0)!.instanceId; // PNL_BAND
    let layout = moveWidgetTo(base, first, 3);
    expect(widgetOrderOf(layout)[3]).toBe("PNL_BAND");
    layout = moveWidgetByOffset(layout, first, 1);
    expect(widgetOrderOf(layout)[4]).toBe("PNL_BAND");
    // Out-of-bounds moves are clamped, not dropped.
    layout = moveWidgetByOffset(layout, first, 1);
    expect(widgetOrderOf(layout)[5]).toBe("PNL_BAND");
    layout = moveWidgetByOffset(layout, first, 1);
    expect(widgetOrderOf(layout).at(-1)).toBe("PNL_BAND");
  });
});

describe("resize constraints", () => {
  it("clamps width to the registry bounds", () => {
    let layout = createDefaultLayouts()[0]!;
    const alerts = layout.widgets.find((w) => w.type === "ALERTS")!;
    layout = resizeWidget(layout, alerts!.instanceId, { w: 1 });
    expect(layout.widgets.find((w) => w.type === "ALERTS")!.w).toBe(WIDGET_REGISTRY.ALERTS.minW);
    layout = resizeWidget(layout, alerts!.instanceId, { w: 99 });
    expect(layout.widgets.find((w) => w.type === "ALERTS")!.w).toBe(WIDGET_REGISTRY.ALERTS.maxW);
  });

  it("keeps composite widgets width-locked but height-adjustable", () => {
    let layout = createDefaultLayouts()[0]!;
    const equity = layout.widgets.find((w) => w.type === "EQUITY_ROW")!;
    layout = resizeWidget(layout, equity!.instanceId, { w: 6 });
    expect(layout.widgets.find((w) => w.type === "EQUITY_ROW")!.w).toBe(12);
    layout = resizeWidget(layout, equity!.instanceId, { h: 3 });
    expect(layout.widgets.find((w) => w.type === "EQUITY_ROW")!.h).toBe(3);
  });

  it("clamps height levels and no-ops when nothing changes", () => {
    let layout = createDefaultLayouts()[0]!;
    const alerts = layout.widgets.find((w) => w.type === "ALERTS")!;
    const before = structuredClone(layout);
    layout = resizeWidget(layout, alerts!.instanceId, { h: 9 });
    expect(layout.widgets.find((w) => w.type === "ALERTS")!.h).toBe(WIDGET_REGISTRY.ALERTS.maxH);
    expect(resizeWidget(layout, alerts!.instanceId, { h: WIDGET_REGISTRY.ALERTS.maxH })).toBe(layout);
    expect(layoutsEqual(layout, before)).toBe(false);
  });
});

describe("layout validation", () => {
  it("rejects malformed layout documents", () => {
    expect(normalizeLayout(null)).toBeNull();
    expect(normalizeLayout("nope")).toBeNull();
    expect(normalizeLayout({ id: "x", name: "X", widgets: [] })).toBeNull(); // no schemaVersion
    expect(normalizeLayout({ id: "x", schemaVersion: 1, widgets: [] })).toBeNull(); // no name
    expect(normalizeLayout({ name: "X", schemaVersion: 1, widgets: [] })).toBeNull(); // no id
    expect(normalizeLayout({ id: "x", name: "X", schemaVersion: 2, widgets: [] })).toBeNull(); // future schema
  });

  it("drops unknown widget types and repairs broken instances", () => {
    const layout = normalizeLayout({
      id: "mix",
      name: "Mix",
      schemaVersion: 1,
      widgets: [
        { type: "PNL_BAND", visible: true, w: 12, h: 1 }, // no instanceId → repaired
        { type: "NOT_A_WIDGET", visible: true, w: 12, h: 1 }, // unknown → dropped
        { type: "ALERTS", visible: "yes", w: -3, h: 99 }, // clamped
      ],
    })!;
    expect(layout.widgets).toHaveLength(2);
    expect(layout.widgets.every((w) => DASHBOARD_WIDGET_KEYS.includes(w.type))).toBe(true);
    expect(layout.widgets[0]!.instanceId).toBeTruthy();
    const alerts = layout.widgets[1]!;
    expect(alerts.w).toBe(WIDGET_REGISTRY.ALERTS.minW);
    expect(alerts.h).toBe(WIDGET_REGISTRY.ALERTS.maxH);
    expect(alerts.visible).toBe(true); // non-false → visible
  });

  it("dedupes instance ids within a layout (first occurrence wins)", () => {
    const layout = normalizeLayout({
      id: "dupe",
      name: "Dupe",
      schemaVersion: 1,
      widgets: [
        { instanceId: "same", type: "ALERTS", visible: true, w: 12, h: 1 },
        { instanceId: "same", type: "HEATMAP", visible: true, w: 12, h: 1 },
      ],
    })!;
    expect(layout.widgets).toHaveLength(1);
    expect(layout.widgets[0]!.type).toBe("ALERTS");
  });

  it("never leaves the collection empty and always resolves the active id", () => {
    const empty = normalizeCustomization([], undefined);
    expect(empty.layouts).toHaveLength(1);
    expect(empty.activeLayoutId).toBe(empty.layouts[0]!.id);

    const garbage = normalizeCustomization(["junk", 42, null], "missing");
    expect(garbage.layouts).toHaveLength(1);
    expect(garbage.activeLayoutId).toBe(garbage.layouts[0]!.id);

    const malformed = normalizeCustomization(
      [{ id: "ok", name: "OK", schemaVersion: 1, widgets: [] }, "junk"],
      "ok",
    );
    expect(malformed.layouts).toHaveLength(1);
    expect(malformed.layouts[0]!.id).toBe("ok");
  });

  it("skips only the malformed layout — valid siblings survive", () => {
    const snapshot = normalizeCustomization(
      [
        { id: "bad", name: "Bad", schemaVersion: 7, widgets: [] },
        { id: "good", name: "Good", schemaVersion: 1, widgets: [{ type: "ALERTS", visible: true, w: 12, h: 1 }] },
      ],
      "good",
    );
    expect(snapshot.layouts.map((l) => l.id)).toEqual(["good"]);
  });
});

describe("collection operations", () => {
  it("duplicates produce independent deep copies", () => {
    const source = createDefaultLayouts()[0]!;
    const copy = cloneLayout(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe("Default copy");
    // Same content (ids are regenerated, everything else preserved)…
    expect(copy.widgets.map((w) => [w.type, w.visible, w.w, w.h]))
      .toEqual(source.widgets.map((w) => [w.type, w.visible, w.w, w.h]));
    // …fresh instance ids guarantee per-layout uniqueness semantics…
    expect(copy.widgets.map((w) => w.instanceId)).not.toEqual(source.widgets.map((w) => w.instanceId));
    // …and no shared structure: mutating the copy never bleeds into the source.
    const mutated = resizeWidget(copy, copy.widgets[0]!.instanceId, { w: 6 });
    expect(mutated.widgets[0]!.w).not.toBe(source.widgets[0]!.w);
    expect(source.widgets[0]!.w).toBe(12);
    expect(mutated.widgets).not.toBe(copy.widgets);
  });

  it("validates names: required, bounded, unique case-insensitively", () => {
    const layouts = [
      ...defaultLayouts(),
      createEmptyLayout("Risk first"),
    ];
    expect(validateLayoutName("", layouts)).toMatch(/required/i);
    expect(validateLayoutName("   ", layouts)).toMatch(/required/i);
    expect(validateLayoutName("x".repeat(61), layouts)).toMatch(/60/);
    expect(validateLayoutName("risk FIRST", layouts)).toMatch(/already exists/i);
    expect(validateLayoutName("risk FIRST", layouts, layouts[1]!.id)).toBeNull();
    expect(validateLayoutName("Clean name", layouts)).toBeNull();
  });

  it("caps widget count per layout", () => {
    let layout = createEmptyLayout("Full");
    for (let i = 0; i < MAX_WIDGETS_PER_LAYOUT; i += 1) {
      const single = addWidget(layout, "ALERTS") ?? addWidget(layout, "PNL_BAND");
      if (!single) break;
      layout = single;
    }
    expect(layout.widgets.length).toBeLessThanOrEqual(MAX_WIDGETS_PER_LAYOUT);
  });
});

describe("legacy migration", () => {
  it("synthesizes the default collection from widgetOrder-only documents", () => {
    const snapshot = readStoredCustomization({
      widgetOrder: ["ALERTS", "PNL_BAND", "EQUITY_ROW", "GOALS_PACE", "WEEK_COMPARE", "HEATMAP", "BEST_WORST"],
    });
    expect(snapshot.layouts).toHaveLength(1);
    expect(snapshot.layouts[0]!.widgets[0]!.type).toBe("ALERTS");
    expect(snapshot.activeLayoutId).toBe(DEFAULT_LAYOUT_ID);
  });

  it("reads current documents without altering valid layouts", () => {
    const snapshot = readStoredCustomization({
      widgetOrder: [...DASHBOARD_WIDGET_KEYS],
      activeLayoutId: "mine",
      layouts: [
        { id: "mine", name: "Mine", schemaVersion: 1, widgets: [{ instanceId: "w1", type: "ALERTS", visible: true, w: 6, h: 2 }] },
      ],
    });
    expect(snapshot.activeLayoutId).toBe("mine");
    expect(snapshot.layouts[0]!.widgets[0]!.w).toBe(6);
  });
});

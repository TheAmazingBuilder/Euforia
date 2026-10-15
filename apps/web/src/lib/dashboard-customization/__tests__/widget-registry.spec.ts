import { describe, expect, it } from "vitest";
import { DASHBOARD_WIDGET_KEYS } from "@cosmoz/shared";

import { REGISTRY_CATEGORIES, REGISTRY_TYPES, getWidgetDefinition, WIDGET_REGISTRY } from "../registry";
import { WIDGET_CATEGORY_KEYS } from "../types";

describe("widget registry", () => {
  it("registers every canonical widget type exactly once", () => {
    expect(Object.keys(WIDGET_REGISTRY).sort()).toEqual([...DASHBOARD_WIDGET_KEYS].sort());
    expect(REGISTRY_TYPES).toEqual(DASHBOARD_WIDGET_KEYS);
  });

  it("carries complete metadata for each definition", () => {
    for (const key of DASHBOARD_WIDGET_KEYS) {
      const def = WIDGET_REGISTRY[key];
      expect(def.type).toBe(key);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.iconId.length).toBeGreaterThan(0);
      expect(WIDGET_CATEGORY_KEYS).toContain(def.category);
      expect(typeof def.singleton).toBe("boolean");
      expect(typeof def.removable).toBe("boolean");
      expect(typeof def.resizable).toBe("boolean");
    }
  });

  it("declares dimension bounds that contain the defaults", () => {
    for (const key of DASHBOARD_WIDGET_KEYS) {
      const def = WIDGET_REGISTRY[key];
      expect(def.minW).toBeGreaterThanOrEqual(1);
      expect(def.maxW).toBeLessThanOrEqual(12);
      expect(def.minW).toBeLessThanOrEqual(def.defaultW);
      expect(def.defaultW).toBeLessThanOrEqual(def.maxW);
      expect(def.minH).toBeLessThanOrEqual(def.defaultH);
      expect(def.defaultH).toBeLessThanOrEqual(def.maxH);
      expect(def.maxH).toBeLessThanOrEqual(4);
    }
  });

  it("exposes at least one resizable widget and one locked composite", () => {
    expect(DASHBOARD_WIDGET_KEYS.some((key) => WIDGET_REGISTRY[key].resizable)).toBe(true);
    expect(WIDGET_REGISTRY.EQUITY_ROW.minW).toBe(12);
  });

  it("marks library widgets singleton so duplicates never render", () => {
    for (const key of DASHBOARD_WIDGET_KEYS) {
      expect(WIDGET_REGISTRY[key].singleton).toBe(true);
    }
  });

  it("maps categories to registered widgets only", () => {
    expect(REGISTRY_CATEGORIES.length).toBeGreaterThan(0);
    for (const category of REGISTRY_CATEGORIES) {
      expect(Object.values(WIDGET_REGISTRY).some((def) => def.category === category)).toBe(true);
    }
  });

  it("returns null for unknown widget lookups instead of throwing", () => {
    expect(getWidgetDefinition("NOT_A_WIDGET")).toBeNull();
    expect(getWidgetDefinition("")).toBeNull();
    expect(getWidgetDefinition("ALERTS")!.type).toBe("ALERTS");
  });
});

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

describe("widget registry — filter capability metadata (Phase 03 §8)", () => {
  const SUITE_FED = new Set(["METRICS_CARD", "STRATEGY_COMPARE", "LONG_SHORT", "ACTIVITY_HEATMAP"]);

  it("declares filter support for EVERY registered widget", () => {
    for (const key of DASHBOARD_WIDGET_KEYS) {
      const def = WIDGET_REGISTRY[key];
      expect(def.filterSupport, `${key} filterSupport`).toBeDefined();
      if (def.filterSupport.support === "UNAFFECTED") {
        // An honest, non-empty reason is mandatory for unaffected widgets.
        expect(def.filterSupport.reason.length).toBeGreaterThan(10);
      } else {
        expect(def.filterSupport.dimensions.length).toBeGreaterThan(0);
      }
    }
  });

  it("marks exactly the suite-fed widgets as FULL with all five dimensions", () => {
    for (const key of DASHBOARD_WIDGET_KEYS) {
      const support = WIDGET_REGISTRY[key].filterSupport;
      if (SUITE_FED.has(key)) {
        expect(support.support, key).toBe("FULL");
        if (support.support === "FULL") {
          expect(support.dimensions).toEqual([
            "period",
            "account",
            "instrument",
            "strategy",
            "direction",
          ]);
        }
      } else {
        expect(support.support, key).toBe("UNAFFECTED");
      }
    }
  });

  it("documents the METRICS_CARD period-override interaction honestly", () => {
    const support = WIDGET_REGISTRY.METRICS_CARD.filterSupport;
    expect(support.support).toBe("FULL");
    if (support.support === "FULL") {
      expect(support.note).toContain("period");
    }
  });

  it("never claims a filtered result for overview-aggregate widgets", () => {
    for (const key of ["PNL_BAND", "EQUITY_ROW", "HEATMAP", "WEEK_COMPARE"] as const) {
      const support = WIDGET_REGISTRY[key].filterSupport;
      expect(support.support).toBe("UNAFFECTED");
      if (support.support === "UNAFFECTED") {
        expect(support.reason).toMatch(/overview aggregate/);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { DASHBOARD_WIDGET_KEYS } from "@cosmoz/shared";

import { hasWidgetType } from "../layout-model";
import { WIDGET_REGISTRY } from "../registry";
import { DASHBOARD_TEMPLATES, getTemplate, layoutFromTemplate } from "../templates";

describe("dashboard templates", () => {
  it("ships the four Phase 01 presets with unique ids and names", () => {
    expect(DASHBOARD_TEMPLATES.map((t) => t.id)).toEqual([
      "general_trading",
      "performance_focus",
      "risk_management",
      "minimal",
    ]);
    const names = new Set(DASHBOARD_TEMPLATES.map((t) => t.name));
    expect(names.size).toBe(DASHBOARD_TEMPLATES.length);
    for (const template of DASHBOARD_TEMPLATES) {
      expect(template.description.length).toBeGreaterThan(0);
      expect(template.widgets.length).toBeGreaterThan(0);
    }
  });

  it("only uses registered widget types", () => {
    for (const template of DASHBOARD_TEMPLATES) {
      for (const spec of template.widgets) {
        expect(DASHBOARD_WIDGET_KEYS).toContain(spec.type);
        expect(WIDGET_REGISTRY[spec.type]).toBeDefined();
      }
    }
  });

  it("never duplicates a singleton widget within a template", () => {
    for (const template of DASHBOARD_TEMPLATES) {
      const types = template.widgets.map((spec) => spec.type);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  it("builds a new independent layout from a template", () => {
    const template = getTemplate("performance_focus")!;
    const layout = layoutFromTemplate(template);
    expect(layout.templateId).toBe("performance_focus");
    expect(layout.name).toBe(template.name);
    expect(layout.widgets.length).toBe(template.widgets.length);
    expect(hasWidgetType(layout, "PNL_BAND")).toBe(true);
    // Widths respect the registry bounds (BEST_WORST is width-locked).
    for (const widget of layout.widgets) {
      const def = WIDGET_REGISTRY[widget.type];
      expect(widget.w).toBeGreaterThanOrEqual(def.minW);
      expect(widget.w).toBeLessThanOrEqual(def.maxW);
    }
    // A second build is independent (new ids).
    const again = layoutFromTemplate(template);
    expect(again.id).not.toBe(layout.id);
    expect(again.widgets.map((w) => w.instanceId)).not.toEqual(layout.widgets.map((w) => w.instanceId));
  });

  it("omits templates that cannot be meaningfully built (no fakes)", () => {
    for (const template of DASHBOARD_TEMPLATES) {
      const layout = layoutFromTemplate(template);
      expect(layout.widgets.length).toBeGreaterThan(0);
    }
  });
});

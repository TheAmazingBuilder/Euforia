/**
 * Unit — Phase 06 workspace model (workspaces.ts): the pure layer between
 * the stored dashboard domain and the workspace UI. Pinned rules:
 *  - user templates are validated PER ITEM (one malformed template never
 *    destroys the collection), deduplicated by id and capped at 10;
 *  - the active-workspace fallback chain is stored-active → explicit
 *    default → first layout;
 *  - a template is a FROZEN deep copy — mutating the source workspace or
 *    the spawned clone never leaks in either direction (spec §5/§6);
 *  - template names are unique case-insensitively within the user's pool.
 */
import { describe, expect, it } from "vitest";
import type { DashboardLayoutDocument, DashboardUserTemplate } from "@cosmoz/shared";

import {
  MAX_USER_TEMPLATES,
  layoutToUserTemplate,
  newUserTemplateId,
  normalizeUserTemplates,
  resolveActiveLayoutId,
  validateUserTemplateName,
} from "../workspaces";
import { createDefaultLayouts } from "../layout-model";

function layout(id: string, name = id): DashboardLayoutDocument {
  return {
    id,
    name,
    schemaVersion: 1,
    widgets: [
      { instanceId: `w_${id}_1`, type: "PNL_BAND", visible: true, w: 12, h: 1 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("normalizeUserTemplates", () => {
  it("validates items individually — one malformed template never destroys the rest", () => {
    const good = layoutToUserTemplate(layout("l1"), "utpl_1", "Good one");
    const templates = normalizeUserTemplates([
      { id: "bad", name: "no layout" }, // missing layout
      good,
      { ...good, id: "utpl_2", layout: { ...good.layout, schemaVersion: 99 } }, // bad version
    ]);
    expect(templates.map((template) => template.id)).toEqual(["utpl_1"]);
  });

  it("deduplicates ids (first wins) and caps the collection at 10", () => {
    const raw = Array.from({ length: MAX_USER_TEMPLATES + 3 }, (_, index) =>
      layoutToUserTemplate(layout(`l${index}`), `utpl_${index}`, `T${index}`),
    );
    const templates = normalizeUserTemplates([raw[0], raw[0], ...raw.slice(1)]);
    expect(templates).toHaveLength(MAX_USER_TEMPLATES);
    expect(templates[0]!.id).toBe("utpl_0");
  });

  it("degrades non-array input to an empty collection", () => {
    expect(normalizeUserTemplates(undefined)).toEqual([]);
    expect(normalizeUserTemplates("junk")).toEqual([]);
  });
});

describe("resolveActiveLayoutId", () => {
  const layouts = [layout("layout_a"), layout("layout_b"), layout("layout_c")];

  it("keeps the stored active id when it still resolves", () => {
    expect(resolveActiveLayoutId(layouts, "layout_b", "layout_c")).toBe("layout_b");
  });

  it("falls back to the explicit default when the stored active id vanished", () => {
    expect(resolveActiveLayoutId(layouts, "layout_gone", "layout_c")).toBe("layout_c");
  });

  it("falls back to the first layout when neither resolves", () => {
    expect(resolveActiveLayoutId(layouts, undefined, null)).toBe("layout_a");
    expect(resolveActiveLayoutId(layouts, "gone", "also-gone")).toBe("layout_a");
  });
});

describe("template freezing and application", () => {
  it("freezes a DEEP copy — later workspace edits never leak into the template", () => {
    const source = createDefaultLayouts(["PNL_BAND", "HEATMAP"])[0]!;
    const template = layoutToUserTemplate(source, "utpl_x", "Snapshot");
    source.widgets[0]!.w = 4;
    source.name = "renamed later";
    expect(template.layout.widgets[0]!.w).toBe(12);
    expect(template.layout.name).not.toBe("renamed later");
  });

  it("template names are unique case-insensitively and non-empty (≤60 chars)", () => {
    const pool: DashboardUserTemplate[] = [layoutToUserTemplate(layout("l1"), "utpl_1", "Research")];
    expect(validateUserTemplateName("research", pool).ok).toBe(false);
    expect(validateUserTemplateName("  ", pool).ok).toBe(false);
    expect(validateUserTemplateName("x".repeat(61), pool).ok).toBe(false);
    expect(validateUserTemplateName("Risk review", pool).ok).toBe(true);
  });

  it("new template ids are prefixed and unique-ish", () => {
    const a = newUserTemplateId();
    const b = newUserTemplateId();
    expect(a.startsWith("utpl_")).toBe(true);
    expect(b.startsWith("utpl_")).toBe(true);
    expect(a).not.toBe(b);
  });
});

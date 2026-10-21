import { describe, expect, it } from "vitest";

import type { DashboardSavedView } from "@cosmoz/shared";

import { DEFAULT_DASHBOARD_FILTERS, filtersEqual } from "../filters";
import {
  MAX_SAVED_VIEWS,
  createSavedView,
  deleteSavedView,
  duplicateSavedView,
  findActiveView,
  normalizeSavedViews,
  renameSavedView,
  viewIsDiverged,
} from "../saved-views";

const NOW = "2026-10-17T00:00:00.000Z";
const ACCOUNT_A = "0b8f6e1e-7d2a-4c1b-9a2a-00000000000a";
const ACCOUNT_B = "0b8f6e1e-7d2a-4c1b-9a2a-00000000000b";

function makeView(overrides: Partial<DashboardSavedView> = {}): DashboardSavedView {
  return {
    id: "view_test1",
    name: "Test view",
    schemaVersion: 1,
    filters: { period: "ALL" },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("createSavedView", () => {
  it("creates a view with a fresh id and timestamps", () => {
    const result = createSavedView(
      [],
      { name: "Gold only", filters: { period: "LAST_30" } },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].name).toBe("Gold only");
    expect(result.value[0].id).toMatch(/^view_/);
    expect(result.value[0].schemaVersion).toBe(1);
    expect(result.value[0].filters).toEqual({ period: "LAST_30" });
  });

  it("rejects invalid names and duplicate names (case-insensitive)", () => {
    const seeded = createSavedView([], { name: "Gold", filters: DEFAULT_DASHBOARD_FILTERS }, NOW);
    expect(seeded.ok).toBe(true);
    const views = seeded.ok ? seeded.value : [];
    expect(createSavedView(views, { name: "  ", filters: DEFAULT_DASHBOARD_FILTERS })).toEqual({
      ok: false,
      error: "INVALID_NAME",
    });
    expect(
      createSavedView(views, { name: "gOLD", filters: DEFAULT_DASHBOARD_FILTERS }),
    ).toEqual({ ok: false, error: "NAME_TAKEN" });
  });

  it("enforces the collection cap", () => {
    let views: DashboardSavedView[] = [];
    for (let i = 0; i < MAX_SAVED_VIEWS; i++) {
      const r = createSavedView(views, { name: `V${i}`, filters: DEFAULT_DASHBOARD_FILTERS }, NOW);
      if (r.ok) views = r.value;
    }
    expect(views).toHaveLength(MAX_SAVED_VIEWS);
    expect(createSavedView(views, { name: "one more", filters: DEFAULT_DASHBOARD_FILTERS })).toEqual(
      { ok: false, error: "LIMIT_REACHED" },
    );
  });
});

describe("renameSavedView", () => {
  it("renames and preserves the filter definition", () => {
    const seeded = createSavedView([], { name: "Old", filters: { period: "YTD" } }, NOW);
    if (!seeded.ok) throw new Error("seed failed");
    const id = seeded.value[0].id;
    const result = renameSavedView(seeded.value, id, "New name", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].name).toBe("New name");
    expect(result.value[0].filters).toEqual({ period: "YTD" });
  });

  it("rejects unknown ids and taken names (self-rename allowed)", () => {
    const r = createSavedView([], { name: "A", filters: DEFAULT_DASHBOARD_FILTERS }, NOW);
    if (!r.ok) throw new Error("seed failed");
    const r2 = createSavedView(r.value, { name: "B", filters: DEFAULT_DASHBOARD_FILTERS }, NOW);
    if (!r2.ok) throw new Error("seed failed");
    expect(renameSavedView(r2.value, "view_missing", "X")).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(renameSavedView(r2.value, r2.value[1].id, "a ")).toEqual({ ok: false, error: "NAME_TAKEN" });
    expect(renameSavedView(r2.value, r2.value[0].id, "")).toEqual({ ok: false, error: "INVALID_NAME" });
    // Self-rename (same name, different case) is a valid no-op-ish rename.
    expect(renameSavedView(r2.value, r2.value[0].id, "a ").ok).toBe(true);
  });
});

describe("duplicateSavedView", () => {
  it("creates an independent deep copy with a suffixed name", () => {
    const r = createSavedView([], { name: "Scalp", filters: { period: "LAST_30", accountId: ACCOUNT_A } }, NOW);
    if (!r.ok) throw new Error("seed failed");
    const dup = duplicateSavedView(r.value, r.value[0].id, NOW);
    expect(dup.ok).toBe(true);
    if (!dup.ok) return;
    expect(dup.value).toHaveLength(2);
    const [source, copy] = dup.value;
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe("Scalp copy");
    expect(filtersEqual(copy.filters, source.filters)).toBe(true);
    // Independence: editing the source must never mutate the copy.
    const edited = dup.value.map((v) =>
      v.id === source.id ? { ...v, filters: { period: "ALL" as const, accountId: ACCOUNT_B } } : v,
    );
    const copyAfter = edited.find((v) => v.name === "Scalp copy");
    expect(copyAfter?.filters).toEqual({ period: "LAST_30", accountId: ACCOUNT_A });
  });

  it("rejects unknown ids and respects the cap", () => {
    const r = createSavedView([], { name: "A", filters: DEFAULT_DASHBOARD_FILTERS }, NOW);
    if (!r.ok) throw new Error("seed failed");
    expect(duplicateSavedView(r.value, "view_missing")).toEqual({ ok: false, error: "NOT_FOUND" });
    let views: DashboardSavedView[] = [];
    for (let i = 0; i < MAX_SAVED_VIEWS; i++) {
      const c = createSavedView(views, { name: `V${i}`, filters: DEFAULT_DASHBOARD_FILTERS }, NOW);
      if (c.ok) views = c.value;
    }
    expect(duplicateSavedView(views, views[0].id)).toEqual({ ok: false, error: "LIMIT_REACHED" });
  });
});

describe("deleteSavedView", () => {
  it("deletes only the target view", () => {
    const r = createSavedView([], { name: "A", filters: DEFAULT_DASHBOARD_FILTERS }, NOW);
    if (!r.ok) throw new Error("seed failed");
    const second = createSavedView(r.value, { name: "B", filters: DEFAULT_DASHBOARD_FILTERS }, NOW);
    if (!second.ok) throw new Error("seed failed");
    const del = deleteSavedView(second.value, second.value[1].id);
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.value.map((v) => v.name)).toEqual(["A"]);
  });

  it("rejects unknown ids", () => {
    expect(deleteSavedView([], "view_missing")).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("findActiveView / viewIsDiverged", () => {
  it("finds the first exact filter match and flags divergence", () => {
    const r = createSavedView([], { name: "Gold", filters: { period: "LAST_30", accountId: ACCOUNT_A } }, NOW);
    if (!r.ok) throw new Error("seed failed");
    const view = r.value[0];
    expect(findActiveView(r.value, { period: "LAST_30", accountId: ACCOUNT_A })?.id).toBe(view.id);
    expect(findActiveView(r.value, { period: "ALL" })).toBeUndefined();
    expect(viewIsDiverged(view, { period: "LAST_30", accountId: ACCOUNT_A })).toBe(false);
    expect(viewIsDiverged(view, { period: "ALL" })).toBe(true);
  });
});

describe("normalizeSavedViews", () => {
  it("drops invalid entries, dedupes ids and names, caps the collection", () => {
    const valid = makeView();
    const candidate = [
      valid,
      { ...valid, id: "view_test1" }, // duplicate id → dropped
      { ...valid, id: "view_other", name: "TEST VIEW" }, // duplicate name (CI) → dropped
      { id: "view_bad", name: "", schemaVersion: 1, filters: {} }, // invalid name → dropped
      makeView({ id: "view_ok2", name: "Second" }),
      "garbage",
    ];
    const views = normalizeSavedViews(candidate);
    expect(views.map((v) => v.id)).toEqual(["view_test1", "view_ok2"]);
    expect(views.every((v) => v.schemaVersion === 1)).toBe(true);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeSavedViews(undefined)).toEqual([]);
    expect(normalizeSavedViews({})).toEqual([]);
  });
});

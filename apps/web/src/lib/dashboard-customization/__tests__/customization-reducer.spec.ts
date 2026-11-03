import { describe, expect, it } from "vitest";
import type { DashboardLayoutDocument } from "@cosmoz/shared";

import {
  activeLayoutOf,
  buildLayoutFromTemplate,
  customizationReducer,
  displayedLayoutOf,
  initialCustomizationState,
  isDirty,
  layoutNameError,
  makeEmptyLayout,
  type CustomizationState,
} from "../customization-reducer";
import { createDefaultLayouts, widgetsEqual } from "../layout-model";

/** A state with the shipped defaults and no edit session. */
function idleState(): CustomizationState {
  return {
    ...initialCustomizationState,
    layouts: createDefaultLayouts(),
  };
}

const firstInstanceId = (state: CustomizationState) =>
  activeLayoutOf(state).widgets[0]!.instanceId;

describe("edit session (draft transaction)", () => {
  it("entering edit mode snapshots the active layout into an isolated draft", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    expect(started.draft).not.toBeNull();
    expect(started.draft!.id).toBe(started.activeLayoutId);
    expect(widgetsEqual(started.draft!.widgets, activeLayoutOf(started).widgets)).toBe(true);
    expect(isDirty(started)).toBe(false);
    // Starting twice is a no-op.
    expect(customizationReducer(started, { type: "editStarted" })).toBe(started);
  });

  it("draft mutations update the draft and mark it dirty, never the saved layout", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    const instanceId = started.draft!.widgets[0]!.instanceId;

    const moved = customizationReducer(started, {
      type: "draftMoveBy", instanceId, direction: 1,
    });
    expect(isDirty(moved)).toBe(true);
    expect(activeLayoutOf(moved).widgets[0]!.instanceId).toBe(instanceId); // saved untouched

    const resized = customizationReducer(moved, {
      type: "draftResize", instanceId, patch: { w: 6, h: 2 },
    });
    const instance = resized.draft!.widgets.find((w) => w.instanceId === instanceId)!;
    expect(instance.w).toBe(6);
    expect(instance.h).toBe(2);

    const hidden = customizationReducer(resized, {
      type: "draftSetVisible", instanceId, visible: false,
    });
    expect(hidden.draft!.widgets.find((w) => w.instanceId === instanceId)!.visible).toBe(false);
  });

  it("adding and removing widgets follow the singleton rule and never touch data", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    // Remove and re-add THE SAME singleton type - the guard counts hidden
    // AND still-present instances, so a different type would be a no-op.
    const removedType = started.draft!.widgets.at(-1)!.type;
    const withoutLast = customizationReducer(started, {
      type: "draftRemoveWidget", instanceId: started.draft!.widgets.at(-1)!.instanceId,
    });
    expect(withoutLast.draft!.widgets).toHaveLength(started.draft!.widgets.length - 1);

    const added = customizationReducer(withoutLast, { type: "draftAddWidget", widgetType: removedType });
    expect(added.draft!.widgets).toHaveLength(withoutLast.draft!.widgets.length + 1);
    const addedInstance = added.draft!.widgets.at(-1)!;
    expect(addedInstance.type).toBe(removedType);

    // Second add of the same singleton is a no-op.
    const again = customizationReducer(added, { type: "draftAddWidget", widgetType: removedType });
    expect(again.draft!.widgets).toHaveLength(added.draft!.widgets.length);
  });

  it("cancelling restores the layout that was active when editing began", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    const dirtied = customizationReducer(started, {
      type: "draftRemoveWidget", instanceId: started.draft!.widgets[0]!.instanceId,
    });
    const cancelled = customizationReducer(dirtied, { type: "editCancelled" });
    expect(cancelled.draft).toBeNull();
    expect(cancelled.layouts).toEqual(started.layouts);
    expect(activeLayoutOf(cancelled).widgets).toHaveLength(started.layouts[0]!.widgets.length);
  });

  it("a committed save lands the draft, exits edit mode and clears the error state", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    const failed = customizationReducer(started, { type: "saveFailed", message: "boom" });
    expect(failed.persistence).toBe("error");
    expect(failed.draft).not.toBeNull(); // draft retained on failure

    const dirtied = customizationReducer(failed, {
      type: "draftResize", instanceId: firstInstanceId(started), patch: { w: 6 },
    });
    const committed = customizationReducer(dirtied, {
      type: "saveCommitted",
      snapshot: {
        layouts: dirtied.layouts.map((layout) =>
          layout.id === dirtied.draft!.id ? dirtied.draft! : layout,
        ),
        activeLayoutId: dirtied.activeLayoutId,
        defaultLayoutId: null,
        userTemplates: [],
      },
    });
    expect(committed.draft).toBeNull();
    expect(committed.persistence).toBe("idle");
    expect(activeLayoutOf(committed).widgets.find((w) => w.instanceId === firstInstanceId(started))!.w).toBe(6);
  });

  it("resetting the draft restores the default configuration but keeps the layout id", () => {
    // Saved layout ≠ default (a template), so reset produces a real diff.
    const withTemplate = customizationReducer(idleState(), {
      type: "layoutCreated",
      layout: buildLayoutFromTemplate("minimal")!,
    });
    const started = customizationReducer(withTemplate, { type: "editStarted" });
    expect(started.draft!.widgets.length).toBeLessThan(createDefaultLayouts()[0]!.widgets.length);

    const reset = customizationReducer(started, { type: "draftResetToDefault" });
    expect(reset.draft!.id).toBe(started.draft!.id); // identity kept
    expect(reset.draft!.widgets).toHaveLength(createDefaultLayouts()[0]!.widgets.length);
    expect(isDirty(reset)).toBe(true); // differs from the saved content until saved

    const committed = customizationReducer(reset, {
      type: "saveCommitted",
      snapshot: {
        layouts: reset.layouts.map((layout) => (layout.id === reset.draft!.id ? reset.draft! : layout)),
        activeLayoutId: reset.activeLayoutId,
        defaultLayoutId: null,
        userTemplates: [],
      },
    });
    expect(activeLayoutOf(committed).widgets).toHaveLength(createDefaultLayouts()[0]!.widgets.length);
  });

  it("draft mutations outside an edit session are no-ops", () => {
    const idle = idleState();
    expect(customizationReducer(idle, { type: "draftAddWidget", widgetType: "ALERTS" })).toBe(idle);
    expect(customizationReducer(idle, { type: "draftResetToDefault" })).toBe(idle);
    expect(customizationReducer(idle, { type: "editCancelled" })).toBe(idle);
  });

  it("sync never stomps a live edit session", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    const synced = customizationReducer(started, {
      type: "sync",
      snapshot: { layouts: createDefaultLayouts(["ALERTS"]), activeLayoutId: "layout_default", defaultLayoutId: null, userTemplates: [] },
    });
    expect(synced.draft).toEqual(started.draft);
  });
});

describe("saved layout collection", () => {
  it("creates, switches, renames and keeps layouts independent", () => {
    const created = customizationReducer(idleState(), {
      type: "layoutCreated",
      layout: buildLayoutFromTemplate("minimal")!,
    });
    expect(created.layouts).toHaveLength(2);
    expect(created.activeLayoutId).not.toBe("layout_default");

    const switched = customizationReducer(created, { type: "layoutSwitched", layoutId: "layout_default" });
    expect(switched.activeLayoutId).toBe("layout_default");

    const renamed = customizationReducer(created, {
      type: "layoutRenamed", layoutId: created.activeLayoutId, name: "My minimal",
    });
    expect(renamed.layouts.find((l) => l.id === created.activeLayoutId)!.name).toBe("My minimal");
    // Invalid rename is rejected.
    expect(customizationReducer(renamed, {
      type: "layoutRenamed", layoutId: renamed.activeLayoutId, name: "default",
    })).toBe(renamed);
  });

  it("duplicates are deep copies that evolve independently", () => {
    const idle = idleState();
    const duplicated = customizationReducer(idle, {
      type: "layoutDuplicated", layoutId: idle.activeLayoutId,
    });
    const copy = duplicated.layouts.at(-1)!;
    expect(copy.id).not.toBe("layout_default");
    expect(copy.name).toBe("Default copy");
    const source = duplicated.layouts[0]!;
    // Same content (ids regenerated) - and no shared structure.
    expect(copy.widgets.map((w) => [w.type, w.visible, w.w, w.h]))
      .toEqual(source.widgets.map((w) => [w.type, w.visible, w.w, w.h]));
    expect(copy.widgets).not.toBe(source.widgets);
    expect(copy.widgets[0]!.instanceId).not.toBe(source.widgets[0]!.instanceId);
  });

  it("deleting the active layout activates a valid alternative", () => {
    const created = customizationReducer(idleState(), {
      type: "layoutCreated",
      layout: buildLayoutFromTemplate("minimal")!,
    });
    const deleted = customizationReducer(created, { type: "layoutDeleted", layoutId: created.activeLayoutId });
    expect(deleted.layouts).toHaveLength(1);
    expect(deleted.activeLayoutId).toBe("layout_default");
    expect(deleted.layouts.some((l) => l.id === created.activeLayoutId)).toBe(false);
  });

  it("refuses to delete the only remaining layout", () => {
    const idle = idleState();
    expect(customizationReducer(idle, { type: "layoutDeleted", layoutId: idle.activeLayoutId })).toBe(idle);
  });

  it("ignores switching to an unknown layout id", () => {
    const idle = idleState();
    expect(customizationReducer(idle, { type: "layoutSwitched", layoutId: "ghost" })).toBe(idle);
  });

  it("snapshotApplied replaces collection + active unconditionally (view-mode ops)", () => {
    const idle = idleState();
    const next = customizationReducer(idle, {
      type: "snapshotApplied",
      snapshot: { layouts: createDefaultLayouts(["ALERTS"]), activeLayoutId: "layout_default", defaultLayoutId: null, userTemplates: [] },
    });
    expect(next.layouts[0]!.widgets[0]!.type).toBe("ALERTS");
    expect(next.activeLayoutId).toBe("layout_default");
  });

  it("draftReplaced swaps draft content while keeping the layout id and session", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    const replaced = customizationReducer(started, {
      type: "draftReplaced",
      layout: buildLayoutFromTemplate("minimal")!,
    });
    expect(replaced.draft!.id).toBe(started.draft!.id);
    expect(replaced.draft!.templateId).toBe("minimal");
    expect(isDirty(replaced)).toBe(true);
    // No edit session → no replacement.
    const idle = idleState();
    expect(customizationReducer(idle, {
      type: "draftReplaced",
      layout: buildLayoutFromTemplate("minimal")!,
    })).toBe(idle);
  });
});

describe("helpers", () => {
  it("makeEmptyLayout generates unique, valid names", () => {
    const state = idleState();
    const first = makeEmptyLayout(state, "");
    expect(first).toHaveProperty("layout");
    const layout = (first as { layout: DashboardLayoutDocument }).layout;
    expect(layout.name).toMatch(/Layout 2/);
    expect(layout.widgets).toHaveLength(0);
    const named = makeEmptyLayout(state, "Default");
    expect((named as { layout: DashboardLayoutDocument }).layout.name).toMatch(/^Default 2$/);
  });

  it("layoutNameError surfaces conflicts", () => {
    const state = idleState();
    expect(layoutNameError(state, "Default")).toMatch(/already exists/i);
    expect(layoutNameError(state, "Fresh")).toBeNull();
  });

  it("displayedLayoutOf prefers the draft while editing", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    expect(displayedLayoutOf(started).id).toBe(started.draft!.id);
    expect(displayedLayoutOf(idleState()).id).toBe(idleState().activeLayoutId);
  });

  it("template builder returns null for unknown template ids", () => {
    expect(buildLayoutFromTemplate("ghost")).toBeNull();
    expect(buildLayoutFromTemplate("risk_management")).not.toBeNull();
  });
});

describe("per-widget configuration (Phase 02)", () => {
  const VALID_CONFIG = {
    kind: "PNL_BAND" as const,
    v: 1 as const,
    range: 7 as const,
    cumulativeType: "BAR" as const,
    showAvgLine: false,
    showEndMarker: true,
    showZeroLine: true,
  };

  it("draftSetConfig edits the draft only - the saved layout is untouched until commit", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    const id = firstInstanceId(started); // PNL_BAND
    const dirtied = customizationReducer(started, { type: "draftSetConfig", instanceId: id, config: VALID_CONFIG });
    expect(dirtied.draft!.widgets.find((w) => w.instanceId === id)!.config).toEqual(VALID_CONFIG);
    expect(activeLayoutOf(dirtied).widgets.find((w) => w.instanceId === id)!.config).toBeUndefined();
    expect(isDirty(dirtied)).toBe(true);
  });

  it("draftSetConfig on a non-configurable widget or invalid payload is a no-op", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    const goals = started.draft!.widgets.find((w) => w.type === "GOALS_PACE")!;
    const unchanged = customizationReducer(started, {
      type: "draftSetConfig", instanceId: goals.instanceId, config: VALID_CONFIG, // wrong kind for this widget
    });
    expect(unchanged.draft).toBe(started.draft);
    expect(isDirty(unchanged)).toBe(false);
  });

  it("widgetConfigSet (view mode) mutates the ACTIVE layout for immediate persistence", () => {
    const state = idleState();
    const activeId = state.activeLayoutId;
    const id = firstInstanceId(state);
    const next = customizationReducer(state, { type: "widgetConfigSet", layoutId: activeId, instanceId: id, config: VALID_CONFIG });
    expect(next.layouts.find((layout) => layout.id === activeId)!.widgets.find((w) => w.instanceId === id)!.config).toEqual(VALID_CONFIG);
  });

  it("widgetConfigSet never stomps a live edit session (draft owns the display)", () => {
    const started = customizationReducer(idleState(), { type: "editStarted" });
    const id = firstInstanceId(started);
    const ignored = customizationReducer(started, {
      type: "widgetConfigSet", layoutId: started.activeLayoutId, instanceId: id, config: VALID_CONFIG,
    });
    // The draft still shows the OLD config; the saved layouts are untouched.
    expect(ignored.draft).toBe(started.draft);
    expect(ignored.layouts).toBe(started.layouts);
  });
});

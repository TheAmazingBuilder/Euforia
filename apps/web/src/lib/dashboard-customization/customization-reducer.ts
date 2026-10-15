import type { DashboardLayoutDocument, DashboardWidgetItem, DashboardWidgetKey } from "@cosmoz/shared";

import {
  addWidget,
  cloneLayout,
  createDefaultLayouts,
  createEmptyLayout,
  layoutsEqual,
  moveWidgetByOffset,
  moveWidgetTo,
  removeWidget,
  resizeWidget,
  setWidgetConfig,
  setWidgetVisible,
  validateLayoutName,
  widgetOrderOf,
} from "./layout-model";
import { getTemplate, layoutFromTemplate } from "./templates";
import type { CustomizationSnapshot, PersistenceStatus } from "./types";

/**
 * Customization state machine (Phase 01 §5/§10/§17) — a pure reducer that
 * owns: the saved layout collection, the active layout id, the editable
 * draft, edit-mode status and persistence status.
 *
 * Invariants:
 *  - the draft is an ISOLATED copy — nothing mutates a saved layout until
 *    `saveCommitted` lands it;
 *  - the collection is never empty and `activeLayoutId` always resolves;
 *  - all mutations are immutable (the model layer returns new documents).
 *
 * The hook layer wires `saveRequest` to the preferences PATCH and feeds
 * `saveCommitted` / `saveFailed` back — a failed save keeps the draft and
 * the edit session alive (§ "persistence errors do not discard the draft").
 */

export interface CustomizationState extends CustomizationSnapshot {
  /** Edit session: null = view mode. */
  draft: DashboardLayoutDocument | null;
  persistence: PersistenceStatus;
  /** Client-side persistence error message (rendered near the toolbar). */
  saveError: string | null;
}

export const initialCustomizationState: CustomizationState = {
  layouts: createDefaultLayouts(),
  activeLayoutId: "layout_default",
  draft: null,
  persistence: "idle",
  saveError: null,
};

export type CustomizationAction =
  /** Replace the whole saved snapshot (initial load, refetch, post-save). */
  | { type: "sync"; snapshot: CustomizationSnapshot }
  /** Unconditional snapshot application — view-mode collection ops that
   * already computed their target state (hook persists right after). */
  | { type: "snapshotApplied"; snapshot: CustomizationSnapshot }
  /** Enter edit mode — draft = isolated copy of the active layout. */
  | { type: "editStarted" }
  | { type: "editCancelled" }
  /** Replace the draft CONTENT with a template-built layout (keeps the
   * layout id and the edit session — §11 draft-replacement interaction). */
  | { type: "draftReplaced"; layout: DashboardLayoutDocument }
  | { type: "saveStarted" }
  /** The PATCH succeeded; `snapshot` is the freshly persisted state. */
  | { type: "saveCommitted"; snapshot: CustomizationSnapshot }
  | { type: "saveFailed"; message: string }
  // ── Draft mutations (edit mode only — no-ops otherwise) ──────────────────
  | { type: "draftAddWidget"; widgetType: DashboardWidgetKey }
  | { type: "draftRemoveWidget"; instanceId: string }
  | { type: "draftSetVisible"; instanceId: string; visible: boolean }
  | { type: "draftMoveTo"; instanceId: string; toIndex: number }
  | { type: "draftMoveBy"; instanceId: string; direction: -1 | 1 }
  | { type: "draftResize"; instanceId: string; patch: { w?: number; h?: number } }
  /** Replace one draft widget's per-instance config (Phase 02 §6) — the
   * payload is validated by the model layer; invalid configs are no-ops. */
  | { type: "draftSetConfig"; instanceId: string; config: DashboardWidgetItem["config"] }
  /** Reset the DRAFT to the shipped default configuration (§12). */
  | { type: "draftResetToDefault" }
  // ── Layout collection operations (view mode — persisted immediately) ─────
  | { type: "layoutCreated"; layout: DashboardLayoutDocument }
  /** Switch active layout; drops any view-mode stale draft (none exists). */
  | { type: "layoutSwitched"; layoutId: string }
  | { type: "layoutRenamed"; layoutId: string; name: string }
  | { type: "layoutDuplicated"; layoutId: string }
  | { type: "layoutDeleted"; layoutId: string }
  /** View-mode per-widget config change (persisted immediately by the
   * hook's collection-op path — same channel as switch/rename). */
  | { type: "widgetConfigSet"; layoutId: string; instanceId: string; config: DashboardWidgetItem["config"] };

/** Does the draft differ from the saved active layout? */
export function isDirty(state: CustomizationState): boolean {
  if (!state.draft) return false;
  const saved = state.layouts.find((layout) => layout.id === state.draft!.id);
  if (!saved) return true; // editing a layout that vanished — treat as dirty
  return !layoutsEqual(state.draft, saved);
}

export function activeLayoutOf(state: CustomizationState): DashboardLayoutDocument {
  return (
    state.layouts.find((layout) => layout.id === state.activeLayoutId) ??
    state.layouts[0] ??
    createEmptyLayout("Default")
  );
}

/** The layout currently rendered: draft while editing, saved otherwise. */
export function displayedLayoutOf(state: CustomizationState): DashboardLayoutDocument {
  return state.draft ?? activeLayoutOf(state);
}

/** Name conflict check against the full collection (minus the layout itself). */
export function layoutNameError(
  state: CustomizationState,
  name: string,
  excludeId?: string,
): string | null {
  return validateLayoutName(name, state.layouts, excludeId);
}

export function customizationReducer(
  state: CustomizationState,
  action: CustomizationAction,
): CustomizationState {
  switch (action.type) {
    case "sync": {
      // Never stomp a live edit session — the draft wins until committed.
      if (state.draft) return state;
      return {
        ...state,
        layouts: action.snapshot.layouts,
        activeLayoutId: action.snapshot.activeLayoutId,
        persistence: "idle",
        saveError: null,
      };
    }

    case "snapshotApplied":
      return {
        ...state,
        layouts: action.snapshot.layouts,
        activeLayoutId: action.snapshot.activeLayoutId,
      };

    case "draftReplaced": {
      if (!state.draft) return state;
      return {
        ...state,
        draft: { ...action.layout, id: state.draft.id, updatedAt: new Date().toISOString() },
      };
    }

    case "editStarted": {
      if (state.draft) return state; // already editing
      const saved = activeLayoutOf(state);
      return {
        ...state,
        draft: structuredClone(saved),
        persistence: "idle",
        saveError: null,
      };
    }

    case "editCancelled":
      return state.draft ? { ...state, draft: null, saveError: null } : state;

    case "saveStarted":
      return { ...state, persistence: "saving", saveError: null };

    case "saveCommitted":
      return {
        ...state,
        layouts: action.snapshot.layouts,
        activeLayoutId: action.snapshot.activeLayoutId,
        draft: null,
        persistence: "idle",
        saveError: null,
      };

    case "saveFailed":
      // Draft + edit session survive — the user can retry or cancel.
      return { ...state, persistence: "error", saveError: action.message };

    case "draftAddWidget": {
      if (!state.draft) return state;
      const next = addWidget(state.draft, action.widgetType);
      return next ? { ...state, draft: next } : state;
    }

    case "draftRemoveWidget": {
      if (!state.draft) return state;
      return { ...state, draft: removeWidget(state.draft, action.instanceId) };
    }

    case "draftSetVisible": {
      if (!state.draft) return state;
      return { ...state, draft: setWidgetVisible(state.draft, action.instanceId, action.visible) };
    }

    case "draftMoveTo": {
      if (!state.draft) return state;
      return { ...state, draft: moveWidgetTo(state.draft, action.instanceId, action.toIndex) };
    }

    case "draftMoveBy": {
      if (!state.draft) return state;
      return { ...state, draft: moveWidgetByOffset(state.draft, action.instanceId, action.direction) };
    }

    case "draftResize": {
      if (!state.draft) return state;
      return { ...state, draft: resizeWidget(state.draft, action.instanceId, action.patch) };
    }

    case "draftSetConfig": {
      if (!state.draft) return state;
      return { ...state, draft: setWidgetConfig(state.draft, action.instanceId, action.config) };
    }

    case "draftResetToDefault": {
      if (!state.draft) return state;
      const [defaultLayout] = createDefaultLayouts();
      return {
        ...state,
        // Keep the CURRENT layout identity — reset replaces its content.
        draft: { ...structuredClone(defaultLayout!), id: state.draft.id, updatedAt: new Date().toISOString() },
      };
    }

    case "layoutCreated": {
      const exists = state.layouts.some((layout) => layout.id === action.layout.id);
      if (exists) return state;
      return {
        ...state,
        layouts: [...state.layouts, action.layout],
        activeLayoutId: action.layout.id,
      };
    }

    case "layoutSwitched": {
      if (!state.layouts.some((layout) => layout.id === action.layoutId)) return state;
      if (state.activeLayoutId === action.layoutId) return state;
      return { ...state, activeLayoutId: action.layoutId };
    }

    case "layoutRenamed": {
      const error = validateLayoutName(action.name, state.layouts, action.layoutId);
      if (error) return state;
      return {
        ...state,
        layouts: state.layouts.map((layout) =>
          layout.id === action.layoutId
            ? { ...layout, name: action.name.trim(), updatedAt: new Date().toISOString() }
            : layout,
        ),
      };
    }

    case "layoutDuplicated": {
      const source = state.layouts.find((layout) => layout.id === action.layoutId);
      if (!source) return state;
      if (state.layouts.length >= 20) return state;
      const copy = cloneLayout(source);
      return {
        ...state,
        layouts: [...state.layouts, copy],
        activeLayoutId: copy.id,
      };
    }

    case "layoutDeleted": {
      // Never leave the dashboard without a usable layout (§10.5).
      if (state.layouts.length <= 1) return state;
      const remaining = state.layouts.filter((layout) => layout.id !== action.layoutId);
      if (remaining.length === state.layouts.length) return state;
      const activeLayoutId =
        state.activeLayoutId === action.layoutId ? remaining[0]!.id : state.activeLayoutId;
      return { ...state, layouts: remaining, activeLayoutId };
    }

    case "widgetConfigSet": {
      // View-mode op: never touch a live draft — the edit session owns the
      // displayed layout until Save/Cancel (§10.2 same rule as collection ops).
      if (state.draft) return state;
      return {
        ...state,
        layouts: state.layouts.map((layout) =>
          layout.id === action.layoutId
            ? setWidgetConfig(layout, action.instanceId, action.config)
            : layout,
        ),
      };
    }

    default:
      return state;
  }
}

/** Factory for "new empty layout" actions with a validated unique name. */
export function makeEmptyLayout(
  state: CustomizationState,
  requestedName: string,
): { layout: DashboardLayoutDocument } | { error: string } {
  let name = requestedName.trim();
  if (name === "") name = `Layout ${state.layouts.length + 1}`;
  let candidate = name;
  let suffix = 2;
  while (validateLayoutName(candidate, state.layouts) !== null) {
    candidate = `${name} ${suffix}`;
    suffix += 1;
  }
  return { layout: createEmptyLayout(candidate) };
}

/** Legacy order view of the current displayed layout (kept in sync on save). */
export function displayedWidgetOrder(state: CustomizationState): DashboardWidgetKey[] {
  return widgetOrderOf(displayedLayoutOf(state));
}

/** Template application produces a layout document — shared by hook paths. */
export function buildLayoutFromTemplate(templateId: string): DashboardLayoutDocument | null {
  const template = getTemplate(templateId);
  return template ? layoutFromTemplate(template) : null;
}

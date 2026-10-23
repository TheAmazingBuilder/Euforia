import {
  DASHBOARD_WIDGET_KEYS,
  DEFAULT_LAYOUT_WIDGET_KEYS,
  type DashboardLayoutDocument,
  type DashboardWidgetKey,
  type DashboardWidgetItem,
} from "@cosmoz/shared";

import { WIDGET_REGISTRY, getWidgetDefinition } from "./registry";
import type { CustomizationSnapshot } from "./types";
import { normalizeUserTemplates, resolveActiveLayoutId } from "./workspaces";
import { configEquals, resolveWidgetConfig } from "./widget-configs";

/**
 * Layout model — pure operations on dashboard layouts (Phase 01 §4/§10/§17).
 *
 * Every function is immutable (structuredClone / spread — no nested
 * mutation), validates against the widget registry, and degrades safely:
 * unknown widget types are dropped per-layout, malformed layouts are
 * skipped, and the collection NEVER ends up empty. No React, no I/O.
 */

export const LAYOUT_SCHEMA_VERSION = 1;
export const DEFAULT_LAYOUT_ID = "layout_default";
export const MAX_LAYOUTS = 20;
export const MAX_WIDGETS_PER_LAYOUT = 30;

/** Deterministic ids for shipped/derived content; random for user actions. */
function randomId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${time}${rand}`.slice(0, 64);
}

export function newLayoutId(): string {
  return randomId("lay");
}

export function newWidgetInstanceId(type: DashboardWidgetKey): string {
  return randomId(`win_${type.toLowerCase()}`);
}

/** Clamp a width span to the widget's registry bounds. */
function clampW(type: DashboardWidgetKey, w: number): number {
  const def = WIDGET_REGISTRY[type];
  return Math.min(def.maxW, Math.max(def.minW, Math.round(w)));
}

/** Clamp a height level to the widget's registry bounds. */
function clampH(type: DashboardWidgetKey, h: number): number {
  const def = WIDGET_REGISTRY[type];
  return Math.min(def.maxH, Math.max(def.minH, Math.round(h)));
}

/** Validate + repair one widget instance against the registry. */
function normalizeWidget(raw: unknown): DashboardWidgetItem | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = raw as Partial<DashboardWidgetItem>;
  const def = getWidgetDefinition(String(candidate.type ?? ""));
  if (!def) return null; // unknown/unsupported widget type — drop the instance
  const instanceId =
    typeof candidate.instanceId === "string" && candidate.instanceId.trim() !== ""
      ? candidate.instanceId.slice(0, 64)
      : newWidgetInstanceId(def.type);
  // Config: validate/migrate/repair through the config system — an invalid
  // or future-versioned config never reaches a renderer (Phase 02 §5/§15).
  const resolution = resolveWidgetConfig(def.type, candidate.config);
  return {
    instanceId,
    type: def.type,
    visible: candidate.visible !== false,
    w: clampW(def.type, Number(candidate.w ?? def.defaultW)),
    h: clampH(def.type, Number(candidate.h ?? def.defaultH)),
    ...(resolution.status === "ok" ? { config: resolution.config } : {}),
  };
}

/**
 * Validate + repair one layout. Returns null when the layout document is
 * structurally unusable (wrong schema version, missing id/name, widget
 * explosion) — the caller skips it without discarding sibling layouts.
 */
export function normalizeLayout(raw: unknown): DashboardLayoutDocument | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = raw as Partial<DashboardLayoutDocument>;
  if (candidate.schemaVersion !== LAYOUT_SCHEMA_VERSION) return null;
  const id = typeof candidate.id === "string" && candidate.id.trim() !== "" ? candidate.id.slice(0, 64) : null;
  const name = typeof candidate.name === "string" && candidate.name.trim() !== "" ? candidate.name.slice(0, 60) : null;
  if (!id || !name || !Array.isArray(candidate.widgets)) return null;

  // Drop unknown widget types; dedupe instance ids (first occurrence wins).
  const seen = new Set<string>();
  const widgets: DashboardWidgetItem[] = [];
  for (const rawWidget of candidate.widgets.slice(0, MAX_WIDGETS_PER_LAYOUT)) {
    const widget = normalizeWidget(rawWidget);
    if (!widget || seen.has(widget.instanceId)) continue;
    seen.add(widget.instanceId);
    widgets.push(widget);
  }

  const description =
    typeof candidate.description === "string" && candidate.description.trim() !== ""
      ? candidate.description.slice(0, 200)
      : undefined;
  const templateId =
    typeof candidate.templateId === "string" && candidate.templateId.trim() !== ""
      ? candidate.templateId.slice(0, 40)
      : undefined;

  return {
    id,
    name,
    description,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    widgets,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : undefined,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined,
    templateId,
  };
}

/**
 * The shipped default collection: ONE "Default" layout with the DESIGNED
 * arrangement (Phase 01 canonical order — the Phase 02 analytics widgets
 * are opt-in via the library, the default never grows under the user).
 * `order` (a legacy flat widgetOrder) only re-orders the default layout —
 * missing DESIGN keys are appended, unknown keys dropped, exactly like the
 * pre-customization merge behavior.
 */
export function createDefaultLayouts(order?: readonly string[]): DashboardLayoutDocument[] {
  let types: DashboardWidgetKey[] = [...DEFAULT_LAYOUT_WIDGET_KEYS];
  if (order && order.length > 0) {
    const valid = order.filter((key): key is DashboardWidgetKey =>
      (DASHBOARD_WIDGET_KEYS as readonly string[]).includes(key),
    );
    const unique = [...new Set(valid)];
    types = [...unique, ...DEFAULT_LAYOUT_WIDGET_KEYS.filter((key) => !unique.includes(key))];
  }
  const widgets = types.map((type) => {
    const def = WIDGET_REGISTRY[type];
    return {
      instanceId: `win_${type.toLowerCase()}`,
      type: def.type,
      visible: true,
      w: def.defaultW,
      h: def.defaultH,
    } satisfies DashboardWidgetItem;
  });
  return [
    {
      id: DEFAULT_LAYOUT_ID,
      name: "Default",
      description: "The designed dashboard - every widget, full width.",
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      widgets,
    },
  ];
}

/**
 * Full-collection normalization (Phase 01 §17): parse each layout, skip the
 * malformed ones, guarantee at least one layout, and guarantee the active
 * id points at a member. Duplicate layout ids keep the FIRST occurrence.
 */
export function normalizeCustomization(
  layouts: readonly unknown[],
  activeLayoutId: unknown,
  options?: { defaultLayoutId?: unknown; userTemplates?: unknown },
): CustomizationSnapshot {
  const byId = new Map<string, DashboardLayoutDocument>();
  for (const raw of layouts) {
    const layout = normalizeLayout(raw);
    if (layout && !byId.has(layout.id)) byId.set(layout.id, layout);
  }
  let collection = [...byId.values()];
  if (collection.length === 0) collection = createDefaultLayouts();

  // Phase 06 fallback chain: stored active → explicit default → first.
  const storedDefault =
    typeof options?.defaultLayoutId === "string" && byId.has(options.defaultLayoutId)
      ? options.defaultLayoutId
      : null;
  const activeId = resolveActiveLayoutId(collection, typeof activeLayoutId === "string" ? activeLayoutId : undefined, storedDefault);
  return {
    layouts: collection,
    activeLayoutId: activeId,
    defaultLayoutId: storedDefault,
    userTemplates: normalizeUserTemplates(options?.userTemplates),
  };
}

/** Read + migrate a stored dashboard domain document into a safe snapshot. */
export function readStoredCustomization(
  stored:
    | Pick<
        import("@cosmoz/shared").DashboardPreferences,
        "layouts" | "activeLayoutId" | "widgetOrder" | "defaultLayoutId" | "userTemplates"
      >
    | undefined,
): CustomizationSnapshot {
  if (stored?.layouts && stored.layouts.length > 0) {
    return normalizeCustomization(stored.layouts, stored.activeLayoutId, {
      defaultLayoutId: stored.defaultLayoutId,
      userTemplates: stored.userTemplates,
    });
  }
  // Legacy document (widgetOrder only) — synthesize the default collection.
  return {
    layouts: createDefaultLayouts(stored?.widgetOrder),
    activeLayoutId: DEFAULT_LAYOUT_ID,
    defaultLayoutId: null,
    userTemplates: normalizeUserTemplates(stored?.userTemplates),
  };
}

/**
 * Visible widget types in display order — the legacy widgetOrder view.
 * Derived ONLY from the layout's actual visible instances: opt-in widgets
 * (Phase 02 analytics) the user never added must NOT leak into the stored
 * order, and removed ones must stay removed through a backup/restore
 * round-trip. Completeness of the SHIPPED default is the default-layout
 * builder's job (createDefaultLayouts), not the derived order's.
 */
export function widgetOrderOf(layout: DashboardLayoutDocument): DashboardWidgetKey[] {
  return layout.widgets.filter((w) => w.visible).map((w) => w.type);
}

/** Deep copy with a NEW layout id and fresh instance ids (§10.3 independence). */
export function cloneLayout(
  layout: DashboardLayoutDocument,
  overrides?: { name?: string; templateId?: string },
): DashboardLayoutDocument {
  const now = new Date().toISOString();
  return {
    id: newLayoutId(),
    name: overrides?.name ?? `${layout.name} copy`,
    description: layout.description,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    widgets: layout.widgets.map((widget) => ({ ...widget, instanceId: newWidgetInstanceId(widget.type) })),
    createdAt: now,
    updatedAt: now,
    templateId: overrides?.templateId ?? layout.templateId,
  };
}

/** A layout with zero widget instances — structurally valid, renders empty. */
export function createEmptyLayout(name: string): DashboardLayoutDocument {
  return {
    id: newLayoutId(),
    name,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    widgets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** The singleton rule: an instance of `type` already on the layout? */
export function hasWidgetType(layout: DashboardLayoutDocument, type: DashboardWidgetKey): boolean {
  return layout.widgets.some((widget) => widget.type === type);
}

/** Add a widget instance (registry defaults) at the END of the layout. */
export function addWidget(
  layout: DashboardLayoutDocument,
  type: DashboardWidgetKey,
): DashboardLayoutDocument | null {
  const def = WIDGET_REGISTRY[type];
  if (def.singleton && hasWidgetType(layout, type)) return null;
  if (layout.widgets.length >= MAX_WIDGETS_PER_LAYOUT) return null;
  const instance: DashboardWidgetItem = {
    instanceId: newWidgetInstanceId(type),
    type: def.type,
    visible: true,
    w: def.defaultW,
    h: def.defaultH,
  };
  return { ...layout, widgets: [...layout.widgets, instance], updatedAt: new Date().toISOString() };
}

/** Remove one instance — never touches data or other instances. */
export function removeWidget(
  layout: DashboardLayoutDocument,
  instanceId: string,
): DashboardLayoutDocument {
  return {
    ...layout,
    widgets: layout.widgets.filter((widget) => widget.instanceId !== instanceId),
    updatedAt: new Date().toISOString(),
  };
}

/** Hide/show one instance — config fully preserved. */
export function setWidgetVisible(
  layout: DashboardLayoutDocument,
  instanceId: string,
  visible: boolean,
): DashboardLayoutDocument {
  return {
    ...layout,
    widgets: layout.widgets.map((widget) =>
      widget.instanceId === instanceId ? { ...widget, visible } : widget,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** Reorder: move an instance to a target index (bounds-clamped). */
export function moveWidgetTo(
  layout: DashboardLayoutDocument,
  instanceId: string,
  toIndex: number,
): DashboardLayoutDocument {
  const from = layout.widgets.findIndex((widget) => widget.instanceId === instanceId);
  if (from < 0) return layout;
  const clamped = Math.min(layout.widgets.length - 1, Math.max(0, Math.round(toIndex)));
  if (clamped === from) return layout;
  const widgets = [...layout.widgets];
  const [moved] = widgets.splice(from, 1);
  widgets.splice(clamped, 0, moved!);
  return { ...layout, widgets, updatedAt: new Date().toISOString() };
}

/** Reorder by relative offset (-1 | 1) — the keyboard path. */
export function moveWidgetByOffset(
  layout: DashboardLayoutDocument,
  instanceId: string,
  direction: -1 | 1,
): DashboardLayoutDocument {
  const from = layout.widgets.findIndex((widget) => widget.instanceId === instanceId);
  if (from < 0) return layout;
  return moveWidgetTo(layout, instanceId, from + direction);
}

/** Resize one instance (registry-clamped; no-op for non-resizable widgets). */
export function resizeWidget(
  layout: DashboardLayoutDocument,
  instanceId: string,
  patch: { w?: number; h?: number },
): DashboardLayoutDocument {
  const def = WIDGET_REGISTRY[layout.widgets.find((w) => w.instanceId === instanceId)?.type ?? "ALERTS"];
  if (!def.resizable) return layout;
  let changed = false;
  const widgets = layout.widgets.map((widget) => {
    if (widget.instanceId !== instanceId) return widget;
    const next = { ...widget };
    if (patch.w !== undefined) {
      const w = clampW(def.type, patch.w);
      if (w !== widget.w) { next.w = w; changed = true; }
    }
    if (patch.h !== undefined) {
      const h = clampH(def.type, patch.h);
      if (h !== widget.h) { next.h = h; changed = true; }
    }
    return next;
  });
  return changed ? { ...layout, widgets, updatedAt: new Date().toISOString() } : layout;
}

/**
 * Layout name validation — non-empty, ≤60 chars, unique per collection
 * (case-insensitive, excluding the layout being renamed).
 */
export function validateLayoutName(
  name: string,
  layouts: readonly DashboardLayoutDocument[],
  excludeId?: string,
): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Layout name is required.";
  if (trimmed.length > 60) return "Keep the name under 60 characters.";
  const conflict = layouts.some(
    (layout) => layout.id !== excludeId && layout.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (conflict) return "A layout with this name already exists.";
  return null;
}

/**
 * Replace one instance's per-widget configuration (Phase 02 §6). The config
 * is validated first — an invalid payload is a no-op, never a corrupted
 * layout. Returns the layout unchanged when the instance does not exist.
 */
export function setWidgetConfig(
  layout: DashboardLayoutDocument,
  instanceId: string,
  config: DashboardWidgetItem["config"],
): DashboardLayoutDocument {
  const target = layout.widgets.find((widget) => widget.instanceId === instanceId);
  if (!target) return layout;
  if (config !== undefined) {
    const resolution = resolveWidgetConfig(target.type, config);
    if (resolution.status !== "ok") return layout; // invalid payload — never persist it
  }
  if (configEquals(target.config, config)) return layout; // no-op — identical content
  const widgets = layout.widgets.map((widget) => {
    if (widget.instanceId !== instanceId) return widget;
    if (config === undefined) {
      // Drop the optional key entirely so stored documents stay minimal.
      const next: DashboardWidgetItem = {
        instanceId: widget.instanceId,
        type: widget.type,
        visible: widget.visible,
        w: widget.w,
        h: widget.h,
      };
      return next;
    }
    return { ...widget, config };
  });
  return { ...layout, widgets, updatedAt: new Date().toISOString() };
}

/** Deep structural equality for widget config arrays (dirty tracking). */
export function widgetsEqual(
  a: readonly DashboardWidgetItem[],
  b: readonly DashboardWidgetItem[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((widget, index) => {
    const other = b[index]!;
    return (
      widget.instanceId === other.instanceId &&
      widget.type === other.type &&
      widget.visible === other.visible &&
      widget.w === other.w &&
      widget.h === other.h &&
      configEquals(widget.config, other.config)
    );
  });
}

export function layoutsEqual(
  a: DashboardLayoutDocument,
  b: DashboardLayoutDocument,
): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    (a.description ?? "") === (b.description ?? "") &&
    (a.templateId ?? "") === (b.templateId ?? "") &&
    widgetsEqual(a.widgets, b.widgets)
  );
}

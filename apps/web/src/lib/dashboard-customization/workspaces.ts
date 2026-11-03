import type { DashboardLayoutDocument, DashboardUserTemplate } from "@cosmoz/shared";
import { dashboardUserTemplateSchema } from "@cosmoz/shared";

import { LAYOUT_SCHEMA_VERSION } from "./layout-model";

/**
 * Workspace model (Phase 06) - pure helpers for the workspace layer on top
 * of the Phase 01 layout collection.
 *
 * CONCEPT MAP (spec §3 - one source of truth each, never merged):
 *  - Workspace = the stored layout document (name, description, widgets with
 *    their per-instance configs). The Phase 01 layout IS the workspace
 *    record; no second model exists.
 *  - Layout = the widget arrangement INSIDE the workspace document.
 *  - Widget configuration = the per-instance config of Phase 02, owned by
 *    the workspace's widget item (stable instanceId).
 *  - Saved analytical view = the Phase 03 filter context - a SEPARATE,
 *    workspace-independent pool (documented §9 convention: filters are
 *    global user state; switching workspaces never touches them, applying a
 *    view never moves widgets).
 *
 * A user template is a FROZEN deep copy of one workspace; applying it
 * clones the layout (fresh layout id + fresh instance ids), so template and
 * spawned workspace never share mutable state (spec §5/§6).
 */

/** Hard cap on user-created templates (mirrors the domain schema max). */
export const MAX_USER_TEMPLATES = 10;

/**
 * Stored document → safe user-template collection. Every item is validated
 * individually (one malformed template never destroys the collection), ids
 * deduplicated (first wins), capped at MAX_USER_TEMPLATES.
 */
export function normalizeUserTemplates(raw: unknown): DashboardUserTemplate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const templates: DashboardUserTemplate[] = [];
  for (const candidate of raw) {
    if (templates.length >= MAX_USER_TEMPLATES) break;
    const parsed = dashboardUserTemplateSchema.safeParse(candidate);
    if (!parsed.success) continue;
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    templates.push(parsed.data);
  }
  return templates;
}

/**
 * The active-workspace fallback chain (spec §4 "no workspace exists / the
 * default workspace is deleted / loading fails"):
 *  1. the stored active layout id when it still resolves;
 *  2. the default workspace when set and valid;
 *  3. the first layout (the collection is never empty).
 * An invalid stored id degrades - it never locks the dashboard.
 */
export function resolveActiveLayoutId(
  layouts: readonly Pick<DashboardLayoutDocument, "id">[],
  activeLayoutId: string | undefined,
  defaultLayoutId: string | null | undefined,
): string {
  if (activeLayoutId && layouts.some((layout) => layout.id === activeLayoutId)) {
    return activeLayoutId;
  }
  if (defaultLayoutId && layouts.some((layout) => layout.id === defaultLayoutId)) {
    return defaultLayoutId;
  }
  return layouts[0]!.id;
}

/**
 * Freeze the CURRENT state of a workspace into a user template - a deep
 * copy (structuredClone), so later workspace edits never leak into the
 * template and template applications never leak back (spec §5/§14).
 */
export function layoutToUserTemplate(
  layout: DashboardLayoutDocument,
  id: string,
  name: string,
  description?: string,
): DashboardUserTemplate {
  return {
    id,
    name,
    description,
    schemaVersion: 1,
    layout: structuredClone(layout),
    createdAt: new Date().toISOString(),
  };
}

export interface UserTemplateNameCheck {
  ok: boolean;
  reason: string | null;
}

/** Template name rules: non-empty after trim, ≤ 60 chars, unique within the
 * user's template pool (case-insensitive - same rule as workspace names). */
export function validateUserTemplateName(
  name: string,
  existing: readonly DashboardUserTemplate[],
): UserTemplateNameCheck {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, reason: "Give the template a name." };
  if (trimmed.length > 60) return { ok: false, reason: "Template names are limited to 60 characters." };
  const clash = existing.some(
    (template) => template.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) return { ok: false, reason: "A template with this name already exists." };
  return { ok: true, reason: null };
}

export const USER_TEMPLATE_ID_PREFIX = "utpl_";

/** Deterministic-enough client id for a new user template (uuid-shaped is
 * NOT required by the contract - uniqueness within the user scope is). */
export function newUserTemplateId(): string {
  return `${USER_TEMPLATE_ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export { LAYOUT_SCHEMA_VERSION };

import {
  dashboardSavedViewSchema,
  type DashboardFilters,
  type DashboardSavedView,
} from "@cosmoz/shared";

import { filtersEqual } from "./filters";

/**
 * Saved analytical views — pure operations (Phase 03 §10).
 *
 * A saved view is a NAME + a validated filter context, persisted inside the
 * dashboard preferences domain (same mechanism as the Phase 01 layout
 * collection — an additive optional `savedViews` key, max 30). Views are
 * strictly separate from layouts and widget configs: applying a view never
 * touches widget arrangement, and CRUD here never touches layouts.
 *
 * Every function is immutable and degrades safely, mirroring the layout
 * model house pattern: unknown/malformed views are dropped individually
 * (one invalid view never destroys the collection), ids are deduplicated
 * first-wins, names are unique case-insensitively (first wins), and the
 * collection is capped. No React, no I/O — fully unit-testable.
 */

export const VIEW_SCHEMA_VERSION = 1;
export const MAX_SAVED_VIEWS = 30;
export const MAX_VIEW_NAME_LENGTH = 60;

/** Deterministic-enough ids for user actions (layout-model convention). */
function randomId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `view_${time}${rand}`;
}

export type SavedViewError =
  | "INVALID_NAME"
  | "NAME_TAKEN"
  | "LIMIT_REACHED"
  | "NOT_FOUND"
  | "INVALID_FILTERS";

export type SavedViewResult<T> = { ok: true; value: T } | { ok: false; error: SavedViewError };

/**
 * Normalize an untrusted candidate list into valid views: schema-parse each
 * item individually, drop invalid ones, dedupe ids and names (first wins),
 * cap at MAX_SAVED_VIEWS. Array order is the user's display order.
 */
export function normalizeSavedViews(candidate: unknown): DashboardSavedView[] {
  if (!Array.isArray(candidate)) return [];
  const views: DashboardSavedView[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const raw of candidate) {
    if (views.length >= MAX_SAVED_VIEWS) break;
    const parsed = dashboardSavedViewSchema.safeParse(raw);
    if (!parsed.success) continue;
    const idKey = parsed.data.id;
    const nameKey = parsed.data.name.trim().toLowerCase();
    if (seenIds.has(idKey) || seenNames.has(nameKey)) continue;
    seenIds.add(idKey);
    seenNames.add(nameKey);
    views.push(parsed.data);
  }
  return views;
}

/** Trimmed name validation (non-empty, ≤ 60 — same bounds as layout names). */
function validName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_VIEW_NAME_LENGTH) return null;
  return trimmed;
}

function nameTaken(views: DashboardSavedView[], name: string, exceptId?: string): boolean {
  const key = name.toLowerCase();
  return views.some((v) => v.name.trim().toLowerCase() === key && v.id !== exceptId);
}

function withTimestamps(
  view: DashboardSavedView,
  now: string,
): DashboardSavedView {
  return { ...view, createdAt: view.createdAt ?? now, updatedAt: now };
}

/** Create a view from the current validated filter combination. */
export function createSavedView(
  views: DashboardSavedView[],
  input: { name: string; description?: string; filters: DashboardFilters },
  now = new Date().toISOString(),
): SavedViewResult<DashboardSavedView[]> {
  const name = validName(input.name);
  if (!name) return { ok: false, error: "INVALID_NAME" };
  if (views.length >= MAX_SAVED_VIEWS) return { ok: false, error: "LIMIT_REACHED" };
  if (nameTaken(views, name)) return { ok: false, error: "NAME_TAKEN" };
  const view: DashboardSavedView = {
    id: randomId(),
    name,
    ...(input.description?.trim() ? { description: input.description.trim().slice(0, 200) } : {}),
    schemaVersion: VIEW_SCHEMA_VERSION,
    filters: input.filters,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, value: [...views, withTimestamps(view, now)] };
}

/** Rename — validates the new name and preserves the filter definition. */
export function renameSavedView(
  views: DashboardSavedView[],
  id: string,
  name: string,
  now = new Date().toISOString(),
): SavedViewResult<DashboardSavedView[]> {
  const trimmed = validName(name);
  if (!trimmed) return { ok: false, error: "INVALID_NAME" };
  const target = views.find((v) => v.id === id);
  if (!target) return { ok: false, error: "NOT_FOUND" };
  if (nameTaken(views, trimmed, id)) return { ok: false, error: "NAME_TAKEN" };
  return {
    ok: true,
    value: views.map((v) =>
      v.id === id ? { ...v, name: trimmed, updatedAt: now } : v,
    ),
  };
}

/**
 * Duplicate — a NEW id and a DEEP, independent copy of the filter document
 * (later edits to one view never mutate the other — spec §10.5). The name
 * gets a unique "copy" suffix; timestamps are fresh (a new view identity).
 */
export function duplicateSavedView(
  views: DashboardSavedView[],
  id: string,
  now = new Date().toISOString(),
): SavedViewResult<DashboardSavedView[]> {
  const source = views.find((v) => v.id === id);
  if (!source) return { ok: false, error: "NOT_FOUND" };
  if (views.length >= MAX_SAVED_VIEWS) return { ok: false, error: "LIMIT_REACHED" };
  const baseName = `${source.name} copy`.slice(0, MAX_VIEW_NAME_LENGTH);
  let name = baseName;
  let n = 2;
  while (nameTaken(views, name)) {
    const suffix = ` copy ${n++}`;
    name = `${source.name.slice(0, MAX_VIEW_NAME_LENGTH - suffix.length)}${suffix}`;
  }
  const copy: DashboardSavedView = {
    id: randomId(),
    name,
    schemaVersion: VIEW_SCHEMA_VERSION,
    filters: structuredClone(source.filters),
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, value: [...views, copy] };
}

/** Delete — removes ONLY the view; never touches filters, layouts or data. */
export function deleteSavedView(
  views: DashboardSavedView[],
  id: string,
): SavedViewResult<DashboardSavedView[]> {
  if (!views.some((v) => v.id === id)) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, value: views.filter((v) => v.id !== id) };
}

/**
 * Active-view detection: the FIRST view whose filters exactly equal the
 * current authoritative filters. Manual filter edits make this undefined —
 * the UI renders "diverged from saved view" through a separate dirty check
 * (current filters ≠ selected view's filters).
 */
export function findActiveView(
  views: DashboardSavedView[],
  filters: DashboardFilters,
): DashboardSavedView | undefined {
  return views.find((v) => filtersEqual(v.filters, filters));
}

/** The selected view's filters vs the current filters (divergence flag). */
export function viewIsDiverged(
  view: DashboardSavedView,
  filters: DashboardFilters,
): boolean {
  return !filtersEqual(view.filters, filters);
}

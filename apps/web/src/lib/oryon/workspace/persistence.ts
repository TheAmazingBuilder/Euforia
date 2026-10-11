import {
  oryonChartTemplateSchema,
  oryonChartTemplatesFileSchema,
  oryonIndicatorSchema,
  oryonLayoutsFileV2Schema,
  oryonWorkspaceLayoutSchema,
  oryonWorkspaceLayoutV2Schema,
  type OryonChartTemplate,
  type OryonWorkspaceLayoutV2,
} from "@cosmoz/shared";
import { z } from "zod";

import { migrateLayoutV1toV2 } from "./layouts";

/**
 * Oryon workspace configuration persistence — browser-local adapters
 * (Phase 6 spec §8, §9).
 *
 * PERSISTENCE SCOPE — an explicit, audited product decision (Phase 6 §2):
 * the authenticated backend exists (NestJS settings module) but its
 * preferences document has 9 FIXED domains with no oryon domain and no
 * multi-record collections, and the canonical deployment of this
 * environment serves those preferences from the MSW mock store — an
 * IN-MEMORY document that resets on every reload. Routing user layouts
 * through it would display a server contract while storing less durably
 * than localStorage — exactly the "local storage pretending to be cloud
 * sync" the spec forbids. Layouts/templates therefore persist in this
 * browser, under the SAME versioned/validated conventions as every other
 * Oryon record (drawings, indicators, alerts), and the UI says so in plain
 * copy. The adapters below are the ONLY files that know the storage keys —
 * a future backend integration swaps them without touching the store or UI.
 *
 * Robustness contract (spec §9):
 *  - every load validates the ENVELOPE then each RECORD independently —
 *    one corrupt layout never nukes the others (per-record salvage);
 *  - BOTH schema generations load: a v1 envelope (Phase 6 single-chart
 *    records) migrates deterministically to v2 (one-panel grid, sync off,
 *    indicator stacks "not managed"); a v2 envelope parses directly. A
 *    record that fails ITS generation's schema is dropped individually —
 *    never one bad record nuking the file;
 *  - a template whose indicator LIST is partially invalid is salvaged
 *    indicator-by-indicator (the frame must still be valid);
 *  - a dangling activeLayoutId (record dropped by salvage) normalizes to
 *    null — the default layout, never a crash;
 *  - corrupt JSON / wrong version / unavailable storage → empty state,
 *    never a throw;
 *  - writes pass through the SAME schemas (validate before save) and are
 *    always v2 — the migration is a read path only;
 *  - saves debounce 300 ms and flush on demand (unmount safety).
 */

const LAYOUTS_KEY = "euforia.oryon.layouts.v1";
const TEMPLATES_KEY = "euforia.oryon.templates.v1";
const SAVE_DEBOUNCE_MS = 300;

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false; // Privacy mode / disabled storage — features degrade safely.
  }
}

// ── Layouts ──────────────────────────────────────────────────────────────────

export interface LoadedLayouts {
  layouts: OryonWorkspaceLayoutV2[];
  activeLayoutId: string | null;
}

/**
 * Loose envelope read — only the frame is trusted here so individual
 * records can be salvaged one by one.
 */
const rawLayoutsEnvelopeSchema = z.object({
  version: z.number(),
  savedAt: z.number(),
  layouts: z.array(z.unknown()),
  activeLayoutId: z.unknown(),
});

/**
 * Parses ONE persisted layout record against its generation's schema. v1
 * records migrate to v2; invalid records return null (per-record salvage —
 * the caller keeps the survivors).
 */
function parseLayoutRecord(record: unknown, version: number): OryonWorkspaceLayoutV2 | null {
  if (version === 1) {
    const v1 = oryonWorkspaceLayoutSchema.safeParse(record);
    return v1.success ? migrateLayoutV1toV2(v1.data) : null;
  }
  const v2 = oryonWorkspaceLayoutV2Schema.safeParse(record);
  return v2.success ? v2.data : null;
}

/** Loads + validates the persisted layouts (v1 and v2 files). Never throws. */
export function loadLayouts(): LoadedLayouts {
  const fallback: LoadedLayouts = { layouts: [], activeLayoutId: null };

  if (!isStorageAvailable()) return fallback;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LAYOUTS_KEY);
  } catch {
    return fallback;
  }
  if (raw === null || raw === "") return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[oryon] layouts: corrupt JSON dropped — default layout in use.");
    return fallback;
  }

  const envelope = rawLayoutsEnvelopeSchema.safeParse(parsed);
  if (!envelope.success || (envelope.data.version !== 1 && envelope.data.version !== 2)) {
    console.warn("[oryon] layouts: invalid or outdated payload dropped — default layout in use.");
    return fallback;
  }

  const layouts: OryonWorkspaceLayoutV2[] = [];
  for (const record of envelope.data.layouts) {
    const parsedRecord = parseLayoutRecord(record, envelope.data.version);
    if (parsedRecord !== null) {
      layouts.push(parsedRecord);
    } else {
      console.warn("[oryon] layouts: invalid layout record dropped.");
    }
  }

  // The active pointer must reference a SURVIVING record — otherwise the
  // workspace opens on the default layout, never on a dangling id.
  const active = envelope.data.activeLayoutId;
  const activeLayoutId =
    typeof active === "string" && layouts.some((layout) => layout.id === active)
      ? active
      : null;

  return { layouts, activeLayoutId };
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleWrite(key: string, write: () => void): void {
  const pending = pendingTimers.get(key);
  if (pending !== undefined) clearTimeout(pending);
  pendingTimers.set(
    key,
    setTimeout(() => {
      pendingTimers.delete(key);
      write();
    }, SAVE_DEBOUNCE_MS),
  );
}

function cancelPending(key: string): void {
  const pending = pendingTimers.get(key);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingTimers.delete(key);
  }
}

function writeLayouts(layouts: readonly OryonWorkspaceLayoutV2[], activeLayoutId: string | null): void {
  try {
    const file = {
      version: 2 as const,
      savedAt: Date.now(),
      layouts: [...layouts],
      activeLayoutId,
    };
    const check = oryonLayoutsFileV2Schema.safeParse(file);
    if (!check.success) {
      console.warn("[oryon] layouts save skipped — payload invalid.");
      return;
    }
    window.localStorage.setItem(LAYOUTS_KEY, JSON.stringify(check.data));
  } catch {
    // Quota exceeded / storage evicted — the session keeps working in memory.
  }
}

/** Debounced layouts save (300 ms) — always the v2 envelope. */
export function saveLayouts(
  layouts: readonly OryonWorkspaceLayoutV2[],
  activeLayoutId: string | null,
): void {
  if (!isStorageAvailable()) return;
  scheduleWrite(LAYOUTS_KEY, () => writeLayouts(layouts, activeLayoutId));
}

/** Flushes a pending layouts write immediately (unmount safety). */
export function flushLayouts(
  layouts: readonly OryonWorkspaceLayoutV2[],
  activeLayoutId: string | null,
): void {
  if (!isStorageAvailable()) return;
  cancelPending(LAYOUTS_KEY);
  writeLayouts(layouts, activeLayoutId);
}

// ── Templates ────────────────────────────────────────────────────────────────

export interface LoadedTemplates {
  templates: OryonChartTemplate[];
}

/** Loose envelope read for per-record template salvage. */
const rawTemplatesEnvelopeSchema = z.object({
  version: z.number(),
  savedAt: z.number(),
  templates: z.array(z.unknown()),
});

/**
 * Salvages ONE template record: the frame (id/name/chart/timestamps) must
 * be valid; invalid indicator ENTRIES are dropped individually so one bad
 * indicator cannot erase a template that is otherwise reusable. The apply
 * layer re-checks business rules anyway — this pass only removes entries
 * the shared schema no longer accepts (e.g. an indicator type this build
 * predates).
 */
function salvageTemplate(record: unknown): OryonChartTemplate | null {
  const direct = oryonChartTemplateSchema.safeParse(record);
  if (direct.success) return direct.data;

  if (record === null || typeof record !== "object") return null;
  const raw = record as Record<string, unknown>;
  const frame = z
    .object({
      id: z.string().min(8).max(64),
      name: z.string().min(1).max(48),
      chart: z.object({
        type: z.enum(["candles", "line"]),
        interval: z.enum(["1m", "5m", "15m", "30m", "1H", "4H", "1D"]).nullable(),
      }),
      createdAt: z.number().finite().int(),
      updatedAt: z.number().finite().int(),
    })
    .safeParse(raw);
  if (!frame.success || !Array.isArray(raw.indicators)) return null;

  const indicators = raw.indicators
    .map((entry) => oryonIndicatorSchema.safeParse(entry))
    .filter((entry) => entry.success)
    .map((entry) => entry.data);

  return { ...frame.data, indicators };
}

/** Loads + validates the persisted templates. Never throws. */
export function loadTemplates(): LoadedTemplates {
  const fallback: LoadedTemplates = { templates: [] };

  if (!isStorageAvailable()) return fallback;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(TEMPLATES_KEY);
  } catch {
    return fallback;
  }
  if (raw === null || raw === "") return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[oryon] templates: corrupt JSON dropped — starting empty.");
    return fallback;
  }

  const envelope = rawTemplatesEnvelopeSchema.safeParse(parsed);
  if (!envelope.success || envelope.data.version !== 1) {
    console.warn("[oryon] templates: invalid or outdated payload dropped — starting empty.");
    return fallback;
  }

  const templates: OryonChartTemplate[] = [];
  for (const record of envelope.data.templates) {
    const salvaged = salvageTemplate(record);
    if (salvaged !== null) {
      templates.push(salvaged);
    } else {
      console.warn("[oryon] templates: invalid template record dropped.");
    }
  }

  return { templates };
}

function writeTemplates(templates: readonly OryonChartTemplate[]): void {
  try {
    const file = {
      version: 1 as const,
      savedAt: Date.now(),
      templates: [...templates],
    };
    const check = oryonChartTemplatesFileSchema.safeParse(file);
    if (!check.success) {
      console.warn("[oryon] templates save skipped — payload invalid.");
      return;
    }
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(check.data));
  } catch {
    // Quota exceeded / storage evicted — the session keeps working in memory.
  }
}

/** Debounced templates save (300 ms). */
export function saveTemplates(templates: readonly OryonChartTemplate[]): void {
  if (!isStorageAvailable()) return;
  scheduleWrite(TEMPLATES_KEY, () => writeTemplates(templates));
}

/** Flushes a pending templates write immediately (unmount safety). */
export function flushTemplates(templates: readonly OryonChartTemplate[]): void {
  if (!isStorageAvailable()) return;
  cancelPending(TEMPLATES_KEY);
  writeTemplates(templates);
}

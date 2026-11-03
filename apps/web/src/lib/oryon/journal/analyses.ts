"use client";

import {
  oryonAnalysesFileSchema,
  oryonChartAnalysisSchema,
  type CreateOryonChartAnalysisInput,
  type OryonChartAnalysis,
} from "@cosmoz/shared";

/**
 * Oryon chart-analysis store (Phase 10 - Trade Journal bridge).
 *
 * SINGLE SOURCE OF TRUTH for the workspace's saved analyses, shared through
 * the module singleton below. Every consumer (Oryon dialogs, the journal's
 * trade-detail section, the deep-link restore) reads the same instance, so
 * a save is visible everywhere without a refresh.
 *
 * Persistence scope (the audited Phase 10 decision, mirrored in the shared
 * schema): browser-local under `euforia.oryon.analyses.v1`, following the
 * SAME versioned/validated conventions as layouts/templates/chart-prefs -
 * an in-memory mock API would store LESS durably than localStorage, so no
 * server round-trip is faked. Not cross-device; the UI states it in plain
 * copy.
 *
 * Robustness contract (mirrors layouts/templates):
 *  - corrupt envelope → empty store, never a throw;
 *  - PER-RECORD salvage: one invalid analysis is dropped alone (console
 *    warning), the others survive;
 *  - writes validate through the SAME schema before the debounced save;
 *  - 200-record cap - the OLDEST record is pruned when full;
 *  - unlinking a trade NEVER mutates the trade: only the analysis' local
 *    reference is cleared.
 */

const ANALYSES_KEY = "euforia.oryon.analyses.v1";
const SAVE_DEBOUNCE_MS = 300;
const MAX_ANALYSES = 200;

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false;
  }
}

/** Per-record salvage loader - the ONLY reader of the storage key. */
function loadAnalyses(): OryonChartAnalysis[] {
  if (!isStorageAvailable()) return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ANALYSES_KEY);
  } catch {
    return [];
  }
  if (raw === null || raw === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[oryon] analyses: corrupt JSON dropped - empty store.");
    return [];
  }

  // Loose envelope read so one poisoned record cannot nuke the others.
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { analyses?: unknown }).analyses)
  ) {
    console.warn("[oryon] analyses: invalid envelope dropped - empty store.");
    return [];
  }
  const records: unknown[] = (parsed as { analyses: unknown[] }).analyses;
  const analyses: OryonChartAnalysis[] = [];
  for (const record of records) {
    const check = oryonChartAnalysisSchema.safeParse(record);
    if (check.success) {
      analyses.push(check.data);
    } else {
      console.warn("[oryon] analyses: invalid record dropped (Zod validation failed).");
    }
  }
  return analyses.sort((a, b) => b.createdAt - a.createdAt);
}

export interface OryonAnalysesSnapshot {
  analyses: readonly OryonChartAnalysis[];
  /** Bumped on every commit - cheap reactivity signal. */
  version: number;
}

class OryonAnalysesStore {
  private state: OryonAnalysesSnapshot = { analyses: [], version: 0 };
  private listeners = new Set<() => void>();
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  // ── React external store contract ─────────────────────────────────────────

  getSnapshot = (): OryonAnalysesSnapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Client-side load - first call pulls the persisted records. Public:
   *  module init runs it eagerly (see the singleton), so every getSnapshot
   *  read observes the persisted state even on a fresh page load. */
  ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.state = { analyses: loadAnalyses(), version: this.state.version + 1 };
  }

  private commit(analyses: OryonChartAnalysis[]): void {
    this.ensureLoaded();
    this.state = {
      analyses: [...analyses].sort((a, b) => b.createdAt - a.createdAt),
      version: this.state.version + 1,
    };
    this.scheduleSave();
    for (const listener of this.listeners) listener();
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  get all(): readonly OryonChartAnalysis[] {
    this.ensureLoaded();
    return this.state.analyses;
  }

  byId(id: string): OryonChartAnalysis | null {
    return this.all.find((analysis) => analysis.id === id) ?? null;
  }

  byTrade(tradeId: string): readonly OryonChartAnalysis[] {
    return this.all.filter((analysis) => analysis.tradeId === tradeId);
  }

  bySymbol(symbol: string): readonly OryonChartAnalysis[] {
    return this.all.filter((analysis) => analysis.symbol === symbol);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /** Creates an analysis (identity + timestamps store-assigned). Returns
   *  the stored record, or null when the payload is invalid - the caller
   *  reports the failure, nothing is silently half-saved. */
  add(input: CreateOryonChartAnalysisInput): OryonChartAnalysis | null {
    const now = Date.now();
    const candidate = {
      ...input,
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `a-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1 as const,
    };
    const check = oryonChartAnalysisSchema.safeParse(candidate);
    if (!check.success) {
      console.warn("[oryon] analyses: create rejected - payload invalid.");
      return null;
    }
    // 200-cap: prune the OLDEST records to make room (never the new one).
    const room = MAX_ANALYSES - 1;
    const kept = this.all
      .filter((analysis) => analysis.id !== check.data.id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(Math.max(0, this.all.length - room));
    this.commit([...kept, check.data]);
    return check.data;
  }

  /** Updates editable metadata (title / notes / trade link / snapshot ref).
   *  The linked trade record itself is NEVER touched - only this local
   *  reference. Returns the updated record, or null when absent/invalid. */
  update(
    id: string,
    patch: Partial<Pick<OryonChartAnalysis, "title" | "notes" | "tradeId" | "snapshot">>,
  ): OryonChartAnalysis | null {
    const current = this.byId(id);
    if (current === null) return null;
    const candidate: OryonChartAnalysis = { ...current, ...patch, updatedAt: Date.now() };
    const check = oryonChartAnalysisSchema.safeParse(candidate);
    if (!check.success) {
      console.warn("[oryon] analyses: update rejected - payload invalid.");
      return null;
    }
    this.commit(this.all.map((analysis) => (analysis.id === id ? check.data : analysis)));
    return check.data;
  }

  /** Removes an analysis (and nothing else - journal attachments stay). */
  remove(id: string): boolean {
    const current = this.byId(id);
    if (current === null) return false;
    this.commit(this.all.filter((analysis) => analysis.id !== id));
    return true;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  private scheduleSave(): void {
    if (!isStorageAvailable()) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  saveNow(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!isStorageAvailable()) return;
    try {
      const file = {
        version: 1 as const,
        savedAt: Date.now(),
        analyses: [...this.all],
      };
      const check = oryonAnalysesFileSchema.safeParse(file);
      if (!check.success) {
        console.warn("[oryon] analyses save skipped - payload invalid.");
        return;
      }
      window.localStorage.setItem(ANALYSES_KEY, JSON.stringify(check.data));
    } catch {
      // Quota exceeded / storage evicted - the session keeps working in memory.
    }
  }
}

/** Workspace-wide singleton (the drawings registry follows the same shape). */
export const oryonAnalyses = new OryonAnalysesStore();

// EAGER first load (client only): useSyncExternalStore consumers read
// getSnapshot during render - a lazy first read there would show an EMPTY
// store forever on fresh page loads (the drawer section renders before any
// commit ever happens). One localStorage read at module init; server
// imports skip it (typeof window guard).
if (typeof window !== "undefined") {
  oryonAnalyses.ensureLoaded();
}

/** Flushes a pending save on tab hide - no lost tail write. */
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => oryonAnalyses.saveNow());
}

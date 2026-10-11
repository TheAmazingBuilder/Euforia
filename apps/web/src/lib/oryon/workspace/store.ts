import type {
  MarketInterval,
  OryonChartTemplate,
  OryonGrid,
  OryonIndicatorInstance,
  OryonLayoutChartType,
  OryonSyncSettings,
  OryonWorkspaceLayoutV2,
} from "@cosmoz/shared";

import {
  ORYON_DEFAULT_SESSION,
  buildLayout,
  defaultPanelState,
  layoutSessionOf,
  newConfigId,
  newPanelId,
  normalizeActivePanel,
  panelsForGrid,
  sessionStateEqual,
  type OryonConfigOpError,
  type OryonPanelSessionState,
  type OryonWorkspaceSessionState,
} from "./layouts";
import { configNameTaken, normalizeConfigName, uniqueCopyName } from "./naming";
import {
  flushLayouts,
  flushTemplates,
  loadLayouts,
  loadTemplates,
  saveLayouts,
  saveTemplates,
} from "./persistence";

/**
 * Oryon workspace configuration store (Phase 6 spec §4, §7, §10, §14 +
 * Phase 7 spec §4, §5, §8, §9, §12).
 *
 * Single source of truth for the workspace ARRANGEMENT (the live session
 * state: grid + panels + sync + shell), the saved layouts, the chart
 * templates and which layout is active. Built on the same discipline as the
 * indicator/drawing/alert stores: one class per workspace, shared through a
 * React context, leaves subscribe with useSyncExternalStore, immutable
 * updates.
 *
 * Panel identity discipline (Phase 7 spec §4): panel ids are stable and
 * independent of instrument/timeframe. Grid transitions reuse ids (charts
 * are not recreated); added panels get fresh ids with a deterministic
 * default config; removed panels leave no stale references (the active
 * pointer normalizes, the sync group derives its membership from the live
 * panel list).
 *
 * Sync propagation (spec §8): instrument and timeframe linking are STATE
 * rules enforced here — a change on one panel patches every panel when the
 * feature is enabled. Time-scale and crosshair linking are CHART-ENGINE
 * concerns and live in the sync coordinator, not in this store.
 *
 * Unsaved-changes model (spec §10): the live session is compared
 * field-by-field against the ACTIVE layout's saved arrangement. The dirty
 * flag participates in the snapshot, so the UI can surface an honest
 * indicator — and only an honest one: with the default layout active there
 * is no saved record to diverge from, and the flag is structurally false.
 *
 * Persistence model: layout/template mutations schedule debounced writes;
 * session-only changes (moving a timeframe, toggling a panel) NEVER touch
 * storage — saving is always an explicit user action. Switching layouts
 * applies the target's SAVED configuration (unsaved changes are discarded —
 * the UI prompts first; a reload re-applies the saved layout, both
 * behaviors documented in the interface).
 *
 * Restoration discipline (spec §14): applying a layout/template is a
 * controlled configuration update — it patches session fields and indicator
 * stacks through the existing update paths. It never re-initializes a
 * chart, never duplicates subscriptions (stable panel ids + the indicator
 * series manager diffs by id), and never touches drawings, alerts or
 * positions (different stores entirely).
 */

export interface WorkspaceConfigSnapshot {
  /** Live workspace arrangement. */
  session: OryonWorkspaceSessionState;
  layouts: readonly OryonWorkspaceLayoutV2[];
  templates: readonly OryonChartTemplate[];
  /** null = the built-in default layout is active. */
  activeLayoutId: string | null;
  /** True when the live session diverges from the ACTIVE SAVED layout. */
  dirty: boolean;
  /** True after hydrate() replayed the persisted state (client only). */
  hydrated: boolean;
  /** Bumped on every commit — cheap reactivity for subscribers. */
  version: number;
}

export interface TemplateCapture {
  chart: { type: OryonChartTemplate["chart"]["type"]; interval: OryonChartTemplate["chart"]["interval"] };
  indicators: readonly OryonIndicatorInstance[];
}

export type WorkspaceOpResult = { ok: true } | { ok: false; error: OryonConfigOpError };

const MAX_LAYOUTS = 20;
const MAX_TEMPLATES = 30;

function now(): number {
  return Date.now();
}

export class OryonWorkspaceConfigStore {
  private state: WorkspaceConfigSnapshot = {
    session: ORYON_DEFAULT_SESSION,
    layouts: [],
    templates: [],
    activeLayoutId: null,
    dirty: false,
    hydrated: false,
    version: 0,
  };
  private listeners = new Set<() => void>();

  /**
   * Panel-indicator capture hook — wired by the provider so a layout save
   * can record each panel's CURRENT analysis stack. Default: not managed
   * (null), which keeps the store testable without a registry.
   */
  private capturePanelIndicators: (panelId: string) => readonly OryonIndicatorInstance[] | null = () => null;

  /** Wires the indicator-stack capture (called once by the provider). */
  setPanelIndicatorsCapture(capture: (panelId: string) => readonly OryonIndicatorInstance[] | null): void {
    this.capturePanelIndicators = capture;
  }

  // ── React external store contract ─────────────────────────────────────────

  getSnapshot = (): WorkspaceConfigSnapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // ── Hydration (client mount only — SSR keeps the defaults) ────────────────

  /**
   * Replays the persisted state. When a saved layout was active, its saved
   * configuration becomes the live session — the workspace returns to the
   * arrangement the user last committed (spec §1 product vision). Corrupt
   * or dangling data degrades to the default layout, never a crash.
   */
  hydrate(): void {
    const { layouts, activeLayoutId } = loadLayouts();
    const { templates } = loadTemplates();
    const active =
      activeLayoutId !== null ? layouts.find((l) => l.id === activeLayoutId) ?? null : null;
    const session = active !== null ? layoutSessionOf(active) : this.state.session;

    this.state = {
      session,
      layouts,
      templates,
      activeLayoutId: active?.id ?? null,
      dirty: false,
      hydrated: true,
      version: this.state.version + 1,
    };
    this.emit();
  }

  /** Flushes pending debounced writes (provider unmount). */
  flush(): void {
    flushLayouts(this.state.layouts, this.state.activeLayoutId);
    flushTemplates(this.state.templates);
  }

  // ── Live session mutations (never persist by themselves) ──────────────────

  /** Activates a chart panel (click / focus — spec §7). */
  setActivePanel(panelId: string): void {
    if (this.state.session.activePanelId === panelId) return;
    this.patchSession({ activePanelId: panelId });
  }

  /**
   * Changes ONE panel's instrument. With instrument linking enabled the
   * change propagates to every panel (one implicit group — spec §8.3); a
   * null symbol (default selection) never propagates.
   */
  setPanelSymbol(panelId: string, symbol: string | null): void {
    const { session } = this.state;
    const target = session.panels.find((p) => p.id === panelId);
    if (target === undefined) return;
    if (session.sync.instrument && symbol !== null) {
      this.patchSession({
        panels: session.panels.map((p) => (p.symbol === symbol ? p : { ...p, symbol })),
      });
      return;
    }
    this.patchSession({
      panels: session.panels.map((p) => (p.id === panelId ? { ...p, symbol } : p)),
    });
  }

  /**
   * Changes ONE panel's timeframe. With timeframe linking enabled the
   * change propagates to every panel (spec §8.4). A target that cannot
   * serve the interval surfaces its own per-panel error state — the
   * requested timeframe is never silently substituted.
   */
  setPanelInterval(panelId: string, interval: MarketInterval): void {
    const { session } = this.state;
    const target = session.panels.find((p) => p.id === panelId);
    if (target === undefined) return;
    if (session.sync.timeframe) {
      if (session.panels.every((p) => p.interval === interval)) return;
      this.patchSession({
        panels: session.panels.map((p) => (p.interval === interval ? p : { ...p, interval })),
      });
      return;
    }
    this.patchSession({
      panels: session.panels.map((p) => (p.id === panelId ? { ...p, interval } : p)),
    });
  }

  /** Changes ONE panel's chart type — never propagated (per-panel setting). */
  setPanelChartType(panelId: string, chartType: OryonLayoutChartType): void {
    this.patchSession({
      panels: this.state.session.panels.map((p) =>
        p.id === panelId ? { ...p, chartType } : p,
      ),
    });
  }

  /**
   * Toggles synchronization features INDEPENDENTLY (spec §8) — enabling
   * one never enables another.
   */
  setSync(partial: Partial<OryonSyncSettings>): void {
    this.patchSession({ sync: { ...this.state.session.sync, ...partial } });
  }

  setMagnet(magnet: boolean): void {
    this.patchSession({ magnet });
  }

  setLowerOpen(lowerOpen: boolean): void {
    this.patchSession({ lowerOpen });
  }

  setUtilityOpen(utilityOpen: boolean): void {
    this.patchSession({ utilityOpen });
  }

  /** Opens the utility rail on a specific panel (existing toolbar semantics). */
  openUtility(panel: OryonWorkspaceSessionState["utilityPanel"]): void {
    this.patchSession({ utilityOpen: true, utilityPanel: panel });
  }

  // ── Grid arrangement (Phase 7 spec §5) ────────────────────────────────────

  /**
   * Switches the grid arrangement. Panel identities are reused (charts are
   * NOT recreated on grid transitions); missing panels are added with
   * deterministic defaults, `single` keeps only the active panel. The
   * invariants live in panelsForGrid — this mutation stays declarative.
   */
  setGrid(grid: OryonGrid): void {
    const { session } = this.state;
    if (session.grid === grid) return;
    const adjusted = panelsForGrid(grid, session.panels, session.activePanelId);
    this.patchSession({ grid, panels: adjusted.panels, activePanelId: adjusted.activePanelId });
  }

  /**
   * Duplicates a panel — an INDEPENDENT copy of its configuration (fresh
   * stable id, same instrument/timeframe/chart type). The copy becomes
   * active. Capacity: the workspace holds at most four panels (the quad
   * grid); a single grid grows to side-by-side to make room.
   */
  duplicatePanel(panelId: string): WorkspaceOpResult {
    const { session } = this.state;
    if (session.panels.length >= 4) return { ok: false, error: "panel_capacity" };
    const source = session.panels.find((p) => p.id === panelId);
    if (source === undefined) return { ok: false, error: "not_found" };

    const copy: OryonPanelSessionState = {
      id: newPanelId(),
      symbol: source.symbol,
      interval: source.interval,
      chartType: source.chartType,
    };
    const panels = [...session.panels, copy];
    const grid = session.grid === "single" ? "twoHorizontal" : session.grid;
    this.patchSession({ grid, panels, activePanelId: copy.id });
    return { ok: true };
  }

  /**
   * Removes a chart panel. The last remaining panel cannot be removed
   * (the workspace always shows one chart). Removing the active panel
   * activates the first survivor; a one-panel workspace collapses to the
   * `single` grid. Removing a chart NEVER touches alerts, drawings or
   * positions (independent domains — spec §11).
   */
  removePanel(panelId: string): WorkspaceOpResult {
    const { session } = this.state;
    if (session.panels.length <= 1) return { ok: false, error: "panel_capacity" };
    const target = session.panels.find((p) => p.id === panelId);
    if (target === undefined) return { ok: false, error: "not_found" };

    const panels = session.panels.filter((p) => p.id !== panelId);
    const grid = panels.length === 1 ? "single" : session.grid;
    const activePanelId = normalizeActivePanel(panels, session.activePanelId);
    this.patchSession({ grid, panels, activePanelId });
    return { ok: true };
  }

  /**
   * Template-chart application (called by the provider's applyTemplate):
   * the chart type always applies to the TARGET panel; the timeframe only
   * when the template defines one. Flows through the same patch path —
   * the active layout's dirty flag reflects the change honestly.
   */
  applyTemplateChart(
    panelId: string,
    chartType: OryonWorkspaceSessionState["panels"][number]["chartType"],
    interval: MarketInterval | null,
  ): void {
    const { session } = this.state;
    const target = session.panels.find((p) => p.id === panelId);
    if (target === undefined) return;
    if (target.chartType === chartType && (interval === null || target.interval === interval)) return;
    this.patchSession({
      panels: session.panels.map((p) =>
        p.id === panelId
          ? { ...p, chartType, interval: interval !== null ? interval : p.interval }
          : p,
      ),
    });
  }

  private patchSession(partial: Partial<OryonWorkspaceSessionState>): void {
    const session = { ...this.state.session, ...partial };
    const dirty = this.computeDirty(session);
    if (
      session === this.state.session ||
      (dirty === this.state.dirty && sessionStateEqual(session, this.state.session))
    ) {
      return;
    }
    this.state = { ...this.state, session, dirty, version: this.state.version + 1 };
    this.emit();
  }

  private computeDirty(session: OryonWorkspaceSessionState): boolean {
    if (this.state.activeLayoutId === null) return false;
    const active = this.state.layouts.find((l) => l.id === this.state.activeLayoutId);
    if (active === undefined) return false;
    return !sessionStateEqual(session, layoutSessionOf(active));
  }

  // ── Layout operations (spec §4, §7) ───────────────────────────────────────

  /**
   * Saves the CURRENT session into the active SAVED layout. Only a custom
   * active layout can be saved over — with the default active, the UI
   * offers "save as new" instead (the default is immutable by design).
   * Per-panel indicator stacks are captured through the provider-wired
   * hook at save time.
   */
  saveActiveLayout(): WorkspaceOpResult {
    if (this.state.activeLayoutId === null) return { ok: false, error: "default_immutable" };
    const index = this.state.layouts.findIndex((l) => l.id === this.state.activeLayoutId);
    if (index === -1) return { ok: false, error: "not_found" };

    const current = this.state.layouts[index]!;
    const updated = buildLayout(
      current.id,
      current.name,
      this.state.session,
      this.captureAllPanelIndicators(),
      now(),
    );
    // Preserve the original creation timestamp — an update, not a re-create.
    updated.createdAt = current.createdAt;

    const layouts = this.state.layouts.map((l, i) => (i === index ? updated : l));
    this.commitLayouts(layouts, this.state.activeLayoutId);
    return { ok: true };
  }

  /** Creates an independent layout from the CURRENT session and activates it. */
  saveAsNewLayout(rawName: string): WorkspaceOpResult {
    const name = normalizeConfigName(rawName);
    if (name === null) return { ok: false, error: "name_invalid" };
    if (this.state.layouts.length >= MAX_LAYOUTS) return { ok: false, error: "capacity" };
    if (configNameTaken(name, this.state.layouts.map((l) => l.name))) {
      return { ok: false, error: "name_taken" };
    }

    const layout = buildLayout(
      newConfigId("layout"),
      name,
      this.state.session,
      this.captureAllPanelIndicators(),
      now(),
    );
    this.commitLayouts([...this.state.layouts, layout], layout.id);
    return { ok: true };
  }

  /** Renames a saved layout (uniqueness policy: case-insensitive). */
  renameLayout(id: string, rawName: string): WorkspaceOpResult {
    const name = normalizeConfigName(rawName);
    if (name === null) return { ok: false, error: "name_invalid" };
    const target = this.state.layouts.find((l) => l.id === id);
    if (target === undefined) return { ok: false, error: "not_found" };
    if (
      name.toLowerCase() !== target.name.toLowerCase() &&
      configNameTaken(name, this.state.layouts.map((l) => l.name))
    ) {
      return { ok: false, error: "name_taken" };
    }

    const layouts = this.state.layouts.map((l) =>
      l.id === id ? { ...l, name, updatedAt: now() } : l,
    );
    this.commitLayouts(layouts, this.state.activeLayoutId);
    return { ok: true };
  }

  /**
   * Duplicates a SAVED record (an independent copy of the saved
   * configuration — never an alias, spec §7). The copy is NOT activated:
   * duplicating answers "branch this setup", switching stays explicit.
   */
  duplicateLayout(id: string): WorkspaceOpResult {
    const target = this.state.layouts.find((l) => l.id === id);
    if (target === undefined) return { ok: false, error: "not_found" };
    if (this.state.layouts.length >= MAX_LAYOUTS) return { ok: false, error: "capacity" };

    const name = uniqueCopyName(target.name, this.state.layouts.map((l) => l.name));
    const copy: OryonWorkspaceLayoutV2 = {
      ...structuredClone(target),
      id: newConfigId("layout"),
      name,
      createdAt: now(),
      updatedAt: now(),
    };
    this.commitLayouts([...this.state.layouts, copy], this.state.activeLayoutId);
    return { ok: true };
  }

  /**
   * Deletes a saved layout. Deleting the ACTIVE one leaves the workspace
   * arrangement untouched (the user removed the bookmark, not the
   * arrangement) and the default layout becomes active.
   */
  deleteLayout(id: string): WorkspaceOpResult {
    const target = this.state.layouts.find((l) => l.id === id);
    if (target === undefined) return { ok: false, error: "not_found" };

    const layouts = this.state.layouts.filter((l) => l.id !== id);
    const activeLayoutId = this.state.activeLayoutId === id ? null : this.state.activeLayoutId;
    this.commitLayouts(layouts, activeLayoutId);
    return { ok: true };
  }

  /**
   * Switches to a saved layout by applying its SAVED configuration. The
   * unsaved-changes prompt is the UI's responsibility — by the time this
   * runs, the user has confirmed the discard (or saved) decision. The
   * PROVIDER applies the record's per-panel indicator stacks afterwards
   * (the store owns the session, the registry owns the stacks).
   */
  switchLayout(id: string): WorkspaceOpResult {
    if (id === this.state.activeLayoutId) return { ok: true };
    const target = this.state.layouts.find((l) => l.id === id);
    if (target === undefined) return { ok: false, error: "not_found" };

    const session = layoutSessionOf(target);
    this.state = {
      ...this.state,
      session,
      activeLayoutId: id,
      dirty: false,
      version: this.state.version + 1,
    };
    this.persistLayouts();
    this.emit();
    return { ok: true };
  }

  /**
   * Restores the deterministic default arrangement. Saved layouts and
   * templates are KEPT (spec §7) — only the active pointer resets; the
   * default itself is a code constant and always recoverable.
   */
  restoreDefaultLayout(): void {
    this.state = {
      ...this.state,
      session: ORYON_DEFAULT_SESSION,
      activeLayoutId: null,
      dirty: false,
      version: this.state.version + 1,
    };
    this.persistLayouts();
    this.emit();
  }

  // ── Template operations (spec §6) ─────────────────────────────────────────

  /** Creates a template from a captured analysis configuration. */
  saveTemplate(rawName: string, capture: TemplateCapture): WorkspaceOpResult {
    const name = normalizeConfigName(rawName);
    if (name === null) return { ok: false, error: "name_invalid" };
    if (this.state.templates.length >= MAX_TEMPLATES) return { ok: false, error: "capacity" };
    if (configNameTaken(name, this.state.templates.map((t) => t.name))) {
      return { ok: false, error: "name_taken" };
    }

    const template: OryonChartTemplate = {
      id: newConfigId("tpl"),
      name,
      chart: { type: capture.chart.type, interval: capture.chart.interval },
      indicators: [...capture.indicators],
      createdAt: now(),
      updatedAt: now(),
    };
    this.commitTemplates([...this.state.templates, template]);
    return { ok: true };
  }

  renameTemplate(id: string, rawName: string): WorkspaceOpResult {
    const name = normalizeConfigName(rawName);
    if (name === null) return { ok: false, error: "name_invalid" };
    const target = this.state.templates.find((t) => t.id === id);
    if (target === undefined) return { ok: false, error: "not_found" };
    if (
      name.toLowerCase() !== target.name.toLowerCase() &&
      configNameTaken(name, this.state.templates.map((t) => t.name))
    ) {
      return { ok: false, error: "name_taken" };
    }

    this.commitTemplates(
      this.state.templates.map((t) => (t.id === id ? { ...t, name, updatedAt: now() } : t)),
    );
    return { ok: true };
  }

  deleteTemplate(id: string): WorkspaceOpResult {
    if (!this.state.templates.some((t) => t.id === id)) return { ok: false, error: "not_found" };
    this.commitTemplates(this.state.templates.filter((t) => t.id !== id));
    return { ok: true };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Captures every live panel's indicator stack at layout-save time. */
  private captureAllPanelIndicators(): Record<string, readonly OryonIndicatorInstance[] | null> {
    const capture: Record<string, readonly OryonIndicatorInstance[] | null> = {};
    for (const panel of this.state.session.panels) {
      capture[panel.id] = this.capturePanelIndicators(panel.id);
    }
    return capture;
  }

  /** Layout-list/pointer commit: state + debounced persist (single write). */
  private commitLayouts(
    layouts: OryonWorkspaceLayoutV2[],
    activeLayoutId: string | null,
  ): void {
    // Dirty is recomputed against the NEW list — a save/update that lands
    // the session back in sync clears the flag honestly.
    const dirty =
      activeLayoutId !== null
        ? (() => {
            const active = layouts.find((l) => l.id === activeLayoutId);
            return active !== undefined
              ? !sessionStateEqual(this.state.session, layoutSessionOf(active))
              : false;
          })()
        : false;
    this.state = { ...this.state, layouts, activeLayoutId, dirty, version: this.state.version + 1 };
    this.persistLayouts();
    this.emit();
  }

  private commitTemplates(templates: OryonChartTemplate[]): void {
    this.state = { ...this.state, templates, version: this.state.version + 1 };
    saveTemplates(templates);
    this.emit();
  }

  private persistLayouts(): void {
    saveLayouts(this.state.layouts, this.state.activeLayoutId);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

import type {
  MarketInterval,
  OryonGrid,
  OryonIndicatorInstance,
  OryonLayoutChartType,
  OryonLayoutPanel,
  OryonPanelAnalysis,
  OryonPanelContext,
  OryonSyncSettings,
  OryonWorkspaceLayout,
  OryonWorkspaceLayoutV2,
  OryonWorkspaceLayoutV3,
  OryonWorkspaceLayoutV4,
} from "@cosmoz/shared";

import {
  ORYON_DEFAULT_PANEL_ANALYSIS,
  ORYON_DEFAULT_PANEL_CONTEXT,
  ORYON_MAX_PANELS,
  ORYON_SYNC_ALL_OFF,
} from "@cosmoz/shared";

/**
 * Oryon workspace layout domain — pure data functions (Phase 6 spec §4, §5,
 * §7 + Phase 7 spec §4, §5, §8, §9, §12).
 *
 * A workspace layout captures HOW THE WORKSPACE IS ARRANGED. This module
 * owns the in-memory session shape (what the live workspace state looks
 * like), the deterministic DEFAULT (never persisted — always recoverable),
 * the layout↔session conversions, the v1→v2 migration and the dirty
 * comparison. No storage, no React, no chart engine — the store and the UI
 * build on these primitives.
 *
 * Phase 7 session state: the single-chart flat fields moved INTO an explicit
 * panel list. The workspace renders `panels` inside `grid`; every panel has
 * a stable id independent of its instrument or timeframe. The workspace
 * shell (magnet, lower panel, utility rail) stays workspace-level — it is
 * not per-chart state. Sync preferences are four independent flags (one
 * implicit group — see the shared contract note).
 *
 * Session state is exactly the arrangement the current application can
 * apply (spec §5): panel configurations, grid, sync flags and shell
 * visibility. Transient UI state (tooltips, gestures, drag states, menus,
 * loading/error surfaces) does not exist here by construction.
 */

/** One live chart panel — the session mirror of OryonChartPanel. */
export interface OryonPanelSessionState {
  /** Stable panel identity — survives grid changes and layout saves. */
  id: string;
  /** Instrument SYMBOL, or null = the app's default selection. */
  symbol: string | null;
  interval: MarketInterval;
  chartType: OryonLayoutChartType;
  /** Temporal-context display prefs (Phase 8 §12) — per panel by design. */
  context: OryonPanelContext;
  /** Structure & key-level analysis prefs (Phase 9 §9) — per panel. */
  analysis: OryonPanelAnalysis;
}

/** The live workspace arrangement — one-to-one with the v3 layout contract
 *  (minus per-panel indicator stacks, which live in the indicator store
 *  registry and are captured only when a layout is explicitly saved). */
export interface OryonWorkspaceSessionState {
  grid: OryonGrid;
  panels: readonly OryonPanelSessionState[];
  /** The panel that receives chart-specific toolbar actions. */
  activePanelId: string;
  sync: OryonSyncSettings;
  /** Magnet crosshair mode (toolbar toggle — workspace-level). */
  magnet: boolean;
  /** Lower positions panel visibility. */
  lowerOpen: boolean;
  /** Right utility rail visibility. */
  utilityOpen: boolean;
  /** Right utility rail active panel (relevant while open, kept anyway). */
  utilityPanel: OryonLayoutPanel;
}

/**
 * The deterministic default arrangement — the Phase 1 startup state as a
 * one-panel workspace. This is a CODE-LEVEL constant, never persisted: the
 * default layout stays recoverable even if every saved record is deleted or
 * corrupted (spec §4, §7 restore-defaults semantics).
 */
export const ORYON_DEFAULT_SESSION: OryonWorkspaceSessionState = {
  grid: "single",
  panels: [
    {
      id: "panel-main",
      symbol: null,
      interval: "5m",
      chartType: "candles",
      context: { ...ORYON_DEFAULT_PANEL_CONTEXT },
      analysis: {
        structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure },
        levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels },
      },
    },
  ],
  activePanelId: "panel-main",
  sync: ORYON_SYNC_ALL_OFF,
  magnet: false,
  lowerOpen: false,
  utilityOpen: false,
  utilityPanel: "notifications",
};

/** Operation error codes shared by the layout/template store mutations. */
export type OryonConfigOpError =
  | "name_invalid"
  | "name_taken"
  | "capacity"
  | "not_found"
  | /** Rename/delete/duplicate/save targeted at the built-in default. */ "default_immutable"
  | /** Panel operation that would violate a grid invariant. */ "panel_capacity";

/** Stable record id (same discipline as indicator/drawing ids). */
export function newConfigId(prefix: string): string {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${unique}`;
}

/** Stable NEW panel id (the default panel's id is the shared constant). */
export function newPanelId(): string {
  return newConfigId("panel");
}

/** Builds a default panel config — added panels inherit the analysis
 *  shape of the panel the user was looking at (interval + chart type +
 *  context + structure/levels prefs) and take the app's default instrument
 *  (symbol null), never a guessed one. */
export function defaultPanelState(
  interval: MarketInterval,
  chartType: OryonLayoutChartType,
  context: OryonPanelContext = ORYON_DEFAULT_PANEL_CONTEXT,
  analysis: OryonPanelAnalysis = ORYON_DEFAULT_PANEL_ANALYSIS,
): OryonPanelSessionState {
  return {
    id: newPanelId(),
    symbol: null,
    interval,
    chartType,
    context: { ...context },
    analysis: {
      structure: { ...analysis.structure },
      levels: { ...analysis.levels },
    },
  };
}

/** Extracts the live session shape a v4 layout restores. */
export function layoutSessionOf(layout: OryonWorkspaceLayoutV4): OryonWorkspaceSessionState {
  return {
    grid: layout.grid,
    panels: layout.panels.map((panel) => ({
      id: panel.id,
      symbol: panel.symbol,
      interval: panel.interval,
      chartType: panel.chartType,
      context: { ...panel.context },
      analysis: {
        structure: { ...panel.analysis.structure },
        levels: { ...panel.analysis.levels },
      },
    })),
    activePanelId: layout.activePanelId,
    sync: { ...layout.sync },
    magnet: layout.magnet,
    lowerOpen: layout.lowerPanel,
    utilityOpen: layout.utilityRail.open,
    utilityPanel: layout.utilityRail.panel,
  };
}

function panelContextEqual(a: OryonPanelContext, b: OryonPanelContext): boolean {
  return (
    a.sessionShading === b.sessionShading &&
    a.eventMarkers === b.eventMarkers &&
    a.eventMinImportance === b.eventMinImportance
  );
}

/** Field-by-field analysis equality — a toggled overlay must flag the
 *  layout dirty exactly like any other persisted arrangement field. */
function panelAnalysisEqual(a: OryonPanelAnalysis, b: OryonPanelAnalysis): boolean {
  const s = a.structure;
  const t = b.structure;
  const l = a.levels;
  const m = b.levels;
  return (
    s.enabled === t.enabled &&
    s.showSwingHighs === t.showSwingHighs &&
    s.showSwingLows === t.showSwingLows &&
    s.showLabels === t.showLabels &&
    s.showProvisional === t.showProvisional &&
    s.leftBars === t.leftBars &&
    s.rightBars === t.rightBars &&
    s.minDistancePips === t.minDistancePips &&
    s.minSeparationBars === t.minSeparationBars &&
    s.breaksEnabled === t.breaksEnabled &&
    s.breakMode === t.breakMode &&
    l.prevDayHighLow === m.prevDayHighLow &&
    l.prevDayOpenClose === m.prevDayOpenClose &&
    l.prevWeekHighLow === m.prevWeekHighLow &&
    l.prevWeekOpenClose === m.prevWeekOpenClose &&
    l.openingRange === m.openingRange &&
    l.orSessionId === m.orSessionId &&
    l.orDurationMinutes === m.orDurationMinutes &&
    l.orShowDeveloping === m.orShowDeveloping
  );
}

function panelStateEqual(a: OryonPanelSessionState, b: OryonPanelSessionState): boolean {
  return (
    a.id === b.id &&
    a.symbol === b.symbol &&
    a.interval === b.interval &&
    a.chartType === b.chartType &&
    panelContextEqual(a.context, b.context) &&
    panelAnalysisEqual(a.analysis, b.analysis)
  );
}

/**
 * Field-by-field session equality — the UNSAVED-CHANGES detector (spec §10).
 *
 * Every persisted arrangement field participates; `activePanelId` is
 * deliberately EXCLUDED: which chart is active is a view preference
 * (spec §7), not part of the saved arrangement a user could lose —
 * clicking another chart must never flag the layout dirty or block a
 * layout switch. There are no hidden fields, so the comparison can never
 * report a false dirty state from transient data.
 */
export function sessionStateEqual(
  a: OryonWorkspaceSessionState,
  b: OryonWorkspaceSessionState,
): boolean {
  if (
    a.grid !== b.grid ||
    a.sync.timeScale !== b.sync.timeScale ||
    a.sync.crosshair !== b.sync.crosshair ||
    a.sync.instrument !== b.sync.instrument ||
    a.sync.timeframe !== b.sync.timeframe ||
    a.magnet !== b.magnet ||
    a.lowerOpen !== b.lowerOpen ||
    a.utilityOpen !== b.utilityOpen ||
    a.utilityPanel !== b.utilityPanel ||
    a.panels.length !== b.panels.length
  ) {
    return false;
  }
  for (let i = 0; i < a.panels.length; i += 1) {
    if (!panelStateEqual(a.panels[i]!, b.panels[i]!)) return false;
  }
  return true;
}

/**
 * Full session identity INCLUDING the active pointer — used ONLY as the
 * no-change guard between two in-memory sessions (a dirty computation
 * must never use this: the active pointer is a view preference).
 */
export function sessionStateIdentical(
  a: OryonWorkspaceSessionState,
  b: OryonWorkspaceSessionState,
): boolean {
  return a.activePanelId === b.activePanelId && sessionStateEqual(a, b);
}

// ── Grid invariants (Phase 7 spec §5) ────────────────────────────────────────

/**
 * Adjusts the panel list to a grid arrangement:
 *  - `single` keeps ONLY the active panel (one large chart);
 *  - `twoHorizontal`/`twoVertical` ensure at least two panels (adding
 *    defaults that inherit the active panel's analysis shape) and NEVER
 *    trim — a third or fourth configured panel wraps onto an implicit CSS
 *    row (auto-placement), so switching quad → side-by-side loses nothing;
 *  - `quad` fills up to four (the workspace capacity).
 * Added panels take the app's default instrument — never an invented
 * symbol. The active pointer is normalized to a surviving panel.
 */
export function panelsForGrid(
  grid: OryonGrid,
  panels: readonly OryonPanelSessionState[],
  activePanelId: string,
): { panels: OryonPanelSessionState[]; activePanelId: string } {
  const active =
    panels.find((p) => p.id === activePanelId) ?? panels[0] ?? defaultPanelState("5m", "candles");

  if (grid === "single") {
    return { panels: [active], activePanelId: active.id };
  }

  const minCount = grid === "quad" ? ORYON_MAX_PANELS : 2;
  const next = [...panels];
  // Defensive cap (corrupt/hand-edited file): trim from the END, never the
  // active panel — normal flows cannot exceed ORYON_MAX_PANELS.
  while (
    grid === "quad" &&
    next.length > ORYON_MAX_PANELS &&
    next.length > 1 &&
    next[next.length - 1]!.id !== active.id
  ) {
    next.pop();
  }
  // Fill with defaults inheriting the active panel's analysis shape.
  while (next.length < minCount && next.length < ORYON_MAX_PANELS) {
    next.push(defaultPanelState(active.interval, active.chartType));
  }
  if (!next.some((p) => p.id === active.id)) next.unshift(active);

  return { panels: next.slice(0, ORYON_MAX_PANELS), activePanelId: active.id };
}

/**
 * Normalizes the active pointer: it must reference a surviving panel.
 * A removed active panel falls back to the FIRST remaining one (spec §7 —
 * a sensible remaining active panel).
 */
export function normalizeActivePanel(
  panels: readonly OryonPanelSessionState[],
  activePanelId: string,
): string {
  return panels.some((p) => p.id === activePanelId) ? activePanelId : panels[0]!.id;
}

/** Builds a validated-shaped v4 layout record from a live session snapshot.
 *  `panelIndicators` maps panel ids to the stack captured at save time; a
 *  missing entry records `null` ("not managed by this layout"). Captured
 *  stacks are COPIED into the record — the layout owns its snapshot. */
export function buildLayout(
  id: string,
  name: string,
  session: OryonWorkspaceSessionState,
  panelIndicators: Record<string, readonly OryonIndicatorInstance[] | null>,
  now: number = Date.now(),
): OryonWorkspaceLayoutV4 {
  return {
    id,
    name,
    grid: session.grid,
    panels: session.panels.map((panel) => {
      const captured = panelIndicators[panel.id] ?? null;
      return {
        id: panel.id,
        symbol: panel.symbol,
        interval: panel.interval,
        chartType: panel.chartType,
        indicators: captured !== null ? [...captured] : null,
        context: { ...panel.context },
        analysis: {
          structure: { ...panel.analysis.structure },
          levels: { ...panel.analysis.levels },
        },
      };
    }),
    activePanelId: session.activePanelId,
    sync: { ...session.sync },
    magnet: session.magnet,
    lowerPanel: session.lowerOpen,
    utilityRail: { open: session.utilityOpen, panel: session.utilityPanel },
    createdAt: now,
    updatedAt: now,
  };
}

// ── migrations (deterministic, spec §12 backward compatibility) ─────────────

/**
 * v2 → v3 (Phase 8): the ONLY change is the per-panel `context` field;
 * every migrated panel takes the documented default (shading on, markers
 * on, MEDIUM threshold) — a deterministic choice, never a guess.
 */
export function migrateLayoutV2toV3(layout: OryonWorkspaceLayoutV2): OryonWorkspaceLayoutV3 {
  return {
    ...layout,
    panels: layout.panels.map((panel) => ({
      ...panel,
      context: { ...ORYON_DEFAULT_PANEL_CONTEXT },
    })),
  };
}

/**
 * v3 → v4 (Phase 9): the ONLY change is the per-panel `analysis` field;
 * every migrated panel takes the documented default (every overlay OFF —
 * a restored old layout renders exactly as it did before Phase 9).
 */
export function migrateLayoutV3toV4(layout: OryonWorkspaceLayoutV3): OryonWorkspaceLayoutV4 {
  return {
    ...layout,
    panels: layout.panels.map((panel) => ({
      ...panel,
      analysis: {
        structure: { ...ORYON_DEFAULT_PANEL_ANALYSIS.structure },
        levels: { ...ORYON_DEFAULT_PANEL_ANALYSIS.levels },
      },
    })),
  };
}

/** v2 → v4 — the composed deterministic path (context default + analysis
 *  default; never a guess at either generation). */
export function migrateLayoutV2toV4(layout: OryonWorkspaceLayoutV2): OryonWorkspaceLayoutV4 {
  return migrateLayoutV3toV4(migrateLayoutV2toV3(layout));
}

/**
 * Migrates a Phase 6 single-chart layout record directly to the v4 shape:
 * the flat arrangement becomes the ONE panel of a `single` grid, sync is
 * all-off, the panel's indicator stack is `null` — a v1 layout never
 * managed analysis stacks, so applying the migrated layout must leave them
 * untouched (honest "not managed" semantics, never a silent wipe) — and
 * the context/analysis prefs take the documented defaults.
 */
export function migrateLayoutV1toV4(layout: OryonWorkspaceLayout): OryonWorkspaceLayoutV4 {
  return migrateLayoutV3toV4(migrateLayoutV1toV3(layout));
}

/**
 * v2 → v3 legacy path (kept for the v3 envelope readers; the v4 loader
 * composes through it via migrateLayoutV2toV4).
 */
export function migrateLayoutV1toV3(layout: OryonWorkspaceLayout): OryonWorkspaceLayoutV3 {
  return migrateLayoutV2toV3({
    id: layout.id,
    name: layout.name,
    grid: "single",
    panels: [
      {
        id: "panel-main",
        symbol: layout.symbol,
        interval: layout.interval,
        chartType: layout.chartType,
        indicators: null,
      },
    ],
    activePanelId: "panel-main",
    sync: { ...ORYON_SYNC_ALL_OFF },
    magnet: layout.magnet,
    lowerPanel: layout.lowerPanel,
    utilityRail: { ...layout.utilityRail },
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt,
  });
}

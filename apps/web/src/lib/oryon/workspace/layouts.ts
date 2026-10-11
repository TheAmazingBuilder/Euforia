import type {
  MarketInterval,
  OryonLayoutPanel,
  OryonLayoutChartType,
  OryonWorkspaceLayout,
} from "@cosmoz/shared";

/**
 * Oryon workspace layout domain — pure data functions (Phase 6 spec §4, §5, §7).
 *
 * A workspace layout captures HOW THE WORKSPACE IS ARRANGED. This module
 * owns the in-memory session shape (what the live workspace state looks
 * like), the deterministic DEFAULT (never persisted — always recoverable),
 * the layout↔session conversions and the dirty comparison. No storage, no
 * React, no chart engine — the store and the UI build on these primitives.
 *
 * Session state is exactly the arrangement the current application can
 * apply (spec §5): instrument symbol, timeframe, chart type, crosshair
 * magnet mode, lower-panel visibility and the utility rail (open + active
 * panel). Transient UI state (tooltips, gestures, drag states, menus,
 * loading/error surfaces) does not exist here by construction.
 */

/** The live workspace arrangement — one-to-one with the layout contract. */
export interface OryonWorkspaceSessionState {
  /** Active instrument SYMBOL, or null = the app's default selection. */
  symbol: string | null;
  interval: MarketInterval;
  chartType: OryonLayoutChartType;
  /** Magnet crosshair mode (toolbar toggle). */
  magnet: boolean;
  /** Lower positions panel visibility. */
  lowerOpen: boolean;
  /** Right utility rail visibility. */
  utilityOpen: boolean;
  /** Right utility rail active panel (relevant while open, kept anyway). */
  utilityPanel: OryonLayoutPanel;
}

/**
 * The deterministic default arrangement — the Phase 1 startup state. This
 * is a CODE-LEVEL constant, never persisted: the default layout stays
 * recoverable even if every saved record is deleted or corrupted
 * (spec §4, §7 restore-defaults semantics).
 */
export const ORYON_DEFAULT_SESSION: OryonWorkspaceSessionState = {
  symbol: null,
  interval: "5m",
  chartType: "candles",
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
  | /** Rename/delete/duplicate/save targeted at the built-in default. */ "default_immutable";

/** Extracts the live session shape a layout restores. */
export function layoutSessionOf(layout: OryonWorkspaceLayout): OryonWorkspaceSessionState {
  return {
    symbol: layout.symbol,
    interval: layout.interval,
    chartType: layout.chartType,
    magnet: layout.magnet,
    lowerOpen: layout.lowerPanel,
    utilityOpen: layout.utilityRail.open,
    utilityPanel: layout.utilityRail.panel,
  };
}

/**
 * Field-by-field session equality — the unsaved-changes detector
 * (spec §10). Every persisted arrangement field participates; there are no
 * hidden fields, so the comparison can never report a false dirty state
 * from transient data.
 */
export function sessionStateEqual(
  a: OryonWorkspaceSessionState,
  b: OryonWorkspaceSessionState,
): boolean {
  return (
    a.symbol === b.symbol &&
    a.interval === b.interval &&
    a.chartType === b.chartType &&
    a.magnet === b.magnet &&
    a.lowerOpen === b.lowerOpen &&
    a.utilityOpen === b.utilityOpen &&
    a.utilityPanel === b.utilityPanel
  );
}

/** Stable record id (same discipline as indicator/drawing ids). */
export function newConfigId(prefix: string): string {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${unique}`;
}

/** Builds a validated-shaped layout record from a live session snapshot. */
export function buildLayout(
  id: string,
  name: string,
  session: OryonWorkspaceSessionState,
  now: number = Date.now(),
): OryonWorkspaceLayout {
  return {
    id,
    name,
    symbol: session.symbol,
    interval: session.interval,
    chartType: session.chartType,
    magnet: session.magnet,
    lowerPanel: session.lowerOpen,
    utilityRail: { open: session.utilityOpen, panel: session.utilityPanel },
    createdAt: now,
    updatedAt: now,
  };
}

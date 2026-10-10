"use client";

import * as React from "react";

import type { OryonDrawingTool } from "@/lib/oryon/drawings/interaction";
import { OryonDrawingStore } from "@/lib/oryon/drawings/store";

/**
 * Oryon drawings context — the shared drawing state for the workspace.
 *
 * Lives at the OryonView level so the LEFT RAIL (tools, undo/redo, list
 * toggle) and the CHART LAYER (engine wiring, interaction, panels) share
 * one store and one active tool without prop drilling through the chart
 * panel. The store is engine-independent: it is created once per workspace
 * mount; per-instrument loading happens in the chart layer (it knows the
 * displayed symbol).
 *
 * Re-render discipline: consuming components subscribe to the store
 * themselves (useSyncExternalStore) — commits are rare (drag end, style
 * change); pointer drags never touch this context.
 */

export interface OryonDrawingsContextValue {
  store: OryonDrawingStore;
  activeTool: OryonDrawingTool;
  setActiveTool: (tool: OryonDrawingTool) => void;
  listOpen: boolean;
  setListOpen: (open: boolean) => void;
}

const OryonDrawingsContext = React.createContext<OryonDrawingsContextValue | null>(null);

export function OryonDrawingsProvider({ children }: { children: React.ReactNode }) {
  // One store instance per workspace mount (lazy state initializer — the
  // sanctioned "expensive instance" pattern; never re-created on re-render).
  const [store] = React.useState(() => new OryonDrawingStore());

  const [activeTool, setActiveTool] = React.useState<OryonDrawingTool>("cursor");
  const [listOpen, setListOpen] = React.useState(false);

  const value = React.useMemo(
    () => ({ store, activeTool, setActiveTool, listOpen, setListOpen }),
    [store, activeTool, listOpen],
  );

  return <OryonDrawingsContext.Provider value={value}>{children}</OryonDrawingsContext.Provider>;
}

export function useOryonDrawings(): OryonDrawingsContextValue {
  const value = React.useContext(OryonDrawingsContext);
  if (value === null) {
    throw new Error("useOryonDrawings must be used within OryonDrawingsProvider");
  }
  return value;
}

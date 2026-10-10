"use client";

import * as React from "react";

import {
  AlignJustify,
  ArrowUpRight,
  List,
  Minus,
  MousePointer2,
  MoveVertical,
  Redo2,
  Ruler,
  Square,
  Type,
  TrendingUp,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { useDict } from "@/i18n/i18n-provider";
import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { OryonIconButton } from "@/components/oryon/oryon-icon-button";
import type { OryonDrawingTool } from "@/lib/oryon/drawings/interaction";

/**
 * Oryon left tool rail — the REAL drawing tools (Phase 2, RF-04).
 *
 * Groups (spec §9): selection · line tools (trend, hline, vline, ray) ·
 * shapes (rect, fib, measure) · text · history + object list. Every button
 * is functional; the active tool is visually distinct; tooltips carry the
 * interaction shape. No decorative button, no emoji, no dead control.
 *
 * State discipline: tool + list live in the drawings context (shared with
 * the chart layer); undo/redo counts subscribe to the store — commits are
 * rare, pointer drags never re-render this rail.
 */
export function OryonToolRail() {
  const dict = useDict();
  const S = dict.oryon.rail;
  const { store, activeTool, setActiveTool, listOpen, setListOpen } = useOryonDrawings();

  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
  const hasObjects = snapshot.drawings.length > 0;

  const selectTool = React.useCallback(
    (tool: OryonDrawingTool) => setActiveTool(tool),
    [setActiveTool],
  );

  return (
    <nav
      aria-label={S.toolsGroup}
      data-testid="oryon-tool-rail"
      className="hidden w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2 md:flex"
    >
      <OryonToolButton
        tool="cursor"
        icon={MousePointer2}
        label={S.pointerHint}
        activeTool={activeTool}
        onSelect={selectTool}
        testid="oryon-tool-pointer"
      />

      <RailDivider />

      <OryonToolButton tool="trend" icon={TrendingUp} label={S.trendline} activeTool={activeTool} onSelect={selectTool} testid="oryon-tool-trendline" />
      <OryonToolButton tool="hline" icon={Minus} label={S.hline} activeTool={activeTool} onSelect={selectTool} testid="oryon-tool-hline" />
      <OryonToolButton tool="vline" icon={MoveVertical} label={S.vline} activeTool={activeTool} onSelect={selectTool} testid="oryon-tool-vline" />
      <OryonToolButton tool="ray" icon={ArrowUpRight} label={S.ray} activeTool={activeTool} onSelect={selectTool} testid="oryon-tool-ray" />

      <RailDivider />

      <OryonToolButton tool="rect" icon={Square} label={S.rect} activeTool={activeTool} onSelect={selectTool} testid="oryon-tool-rect" />
      <OryonToolButton tool="fib" icon={AlignJustify} label={S.fib} activeTool={activeTool} onSelect={selectTool} testid="oryon-tool-fib" />
      <OryonToolButton tool="measure" icon={Ruler} label={S.measure} activeTool={activeTool} onSelect={selectTool} testid="oryon-tool-measure" />
      <OryonToolButton tool="text" icon={Type} label={S.text} activeTool={activeTool} onSelect={selectTool} testid="oryon-tool-text" />

      <RailDivider />

      <OryonIconButton
        icon={Undo2}
        label={S.undoHint}
        disabled={!store.canUndo}
        onClick={() => store.undo()}
        testid="oryon-drawing-undo"
      />
      <OryonIconButton
        icon={Redo2}
        label={S.redoHint}
        disabled={!store.canRedo}
        onClick={() => store.redo()}
        testid="oryon-drawing-redo"
      />
      <OryonIconButton
        icon={List}
        label={S.listHint}
        active={listOpen}
        disabled={!hasObjects && !listOpen}
        onClick={() => setListOpen(!listOpen)}
        testid="oryon-drawing-list-toggle"
      />
    </nav>
  );
}

function OryonToolButton({
  tool,
  icon,
  label,
  activeTool,
  onSelect,
  testid,
}: {
  tool: OryonDrawingTool;
  icon: LucideIcon;
  label: string;
  activeTool: OryonDrawingTool;
  onSelect: (tool: OryonDrawingTool) => void;
  testid: string;
}) {
  return (
    <OryonIconButton
      icon={icon}
      label={label}
      active={activeTool === tool}
      onClick={() => onSelect(tool)}
      testid={testid}
    />
  );
}

function RailDivider() {
  return <div className="my-1 h-px w-6 bg-border" aria-hidden />;
}

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
import type { OryonDrawing } from "@cosmoz/shared";
import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { OryonIconButton } from "@/components/oryon/oryon-icon-button";
import type { OryonDrawingTool } from "@/lib/oryon/drawings/interaction";

/**
 * Oryon left tool rail — the REAL drawing tools (Phase 2, RF-04 + Phase 7
 * active-chart targeting).
 *
 * Groups (spec §9): selection · line tools (trend, hline, vline, ray) ·
 * shapes (rect, fib, measure) · text · history + object list. Every button
 * is functional; the active tool is visually distinct; tooltips carry the
 * interaction shape. No decorative button, no emoji, no dead control.
 *
 * Phase 7: the tool is a WORKSPACE-level selection — the ACTIVE panel's
 * chart layer receives it (the interaction controller gates new
 * interactions on the active panel, so an armed tool can never modify a
 * chart the user is not looking at). Undo/redo and the object list operate
 * on the store the active panel publishes (the drawings actually
 * displayed); with no bound store yet the history buttons stay disabled.
 *
 * State discipline: tool + list live in the drawings context; undo/redo
 * counts subscribe to the bound store — commits are rare, pointer drags
 * never re-render this rail.
 */
export function OryonToolRail() {
  const dict = useDict();
  const S = dict.oryon.rail;
  const { activeStore, activeTool, setActiveTool, listOpen, setListOpen } = useOryonDrawings();

  const snapshot = React.useSyncExternalStore(
    activeStore?.subscribe ?? noopSubscribe,
    activeStore?.getSnapshot ?? (() => EMPTY_DRAWING_SNAPSHOT),
  );
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
        disabled={activeStore === null || !activeStore.canUndo}
        onClick={() => activeStore?.undo()}
        testid="oryon-drawing-undo"
      />
      <OryonIconButton
        icon={Redo2}
        label={S.redoHint}
        disabled={activeStore === null || !activeStore.canRedo}
        onClick={() => activeStore?.redo()}
        testid="oryon-drawing-redo"
      />
      <OryonIconButton
        icon={List}
        label={S.listHint}
        active={listOpen}
        disabled={activeStore === null || (!hasObjects && !listOpen)}
        onClick={() => setListOpen(!listOpen)}
        testid="oryon-drawing-list-toggle"
      />
    </nav>
  );
}

const EMPTY_DRAWING_SNAPSHOT = { drawings: [] as readonly OryonDrawing[], selectedId: null, version: 0 };
const noopSubscribe = () => () => {};

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

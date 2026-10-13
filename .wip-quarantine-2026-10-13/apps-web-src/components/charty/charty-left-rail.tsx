"use client";

import * as React from "react";
import { Crosshair, Eraser, Undo2 } from "lucide-react";

import type { DrawingKind, DrawingObject } from "@cosmoz/shared";
import { DRAWING_TOOLS } from "@/lib/utils/drawings";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { CHARTY_TOOL_ICONS } from "./charty-tools";

/**
 * Charty LEFT RAIL — the vertical drawing toolbar, TradingView-style.
 * Cursor (disarm) + the seven real placement tools + undo/clear. Tool state
 * and drawings are owned by the workspace (same contract as the previous
 * popover toolbar — testids `drawing-tool-{KIND}` preserved).
 */

interface ChartyLeftRailProps {
  tool: DrawingKind | null;
  onToolChange: (tool: DrawingKind | null) => void;
  drawings: DrawingObject[];
  onUndo: () => void;
  onClear: () => void;
}

export function ChartyLeftRail({ tool, onToolChange, drawings, onUndo, onClear }: ChartyLeftRailProps) {
  const { dict } = useI18n();
  const S = dict.session;

  return (
    <div
      role="toolbar"
      aria-label={S.toolRail.drawingsAria}
      data-testid="charty-left-rail"
      className="hidden w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2 lg:flex"
    >
      {/* Cursor — disarms any armed placement tool */}
      <RailButton
        active={tool === null}
        title={S.charty.cursorTitle}
        ariaLabel={S.charty.cursorTitle}
        testid="charty-tool-cursor"
        onClick={() => onToolChange(null)}
      >
        <Crosshair className="size-4" aria-hidden="true" />
      </RailButton>

      <span className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      {DRAWING_TOOLS.map((meta) => {
        const Icon = CHARTY_TOOL_ICONS[meta.kind];
        const active = tool === meta.kind;
        return (
          <RailButton
            key={meta.kind}
            active={active}
            title={meta.label}
            ariaLabel={`${meta.label}${active ? S.toolRail.armedSuffix : ""}`}
            ariaPressed={active}
            testid={`drawing-tool-${meta.kind}`}
            onClick={() => onToolChange(active ? null : meta.kind)}
          >
            <Icon className="size-4" />
          </RailButton>
        );
      })}

      <span className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <RailButton
        title={S.toolRail.undoAria}
        ariaLabel={S.toolRail.undoAria}
        testid="charty-undo"
        disabled={drawings.length === 0}
        onClick={onUndo}
      >
        <Undo2 className="size-4" aria-hidden="true" />
      </RailButton>
      <RailButton
        title={S.toolRail.clearAria}
        ariaLabel={S.toolRail.clearAria}
        testid="charty-clear"
        disabled={drawings.length === 0}
        destructive
        onClick={onClear}
      >
        <Eraser className="size-4" aria-hidden="true" />
      </RailButton>

      {drawings.length > 0 ? (
        <span
          className="mt-auto rounded-full border border-warning/40 bg-warning/10 px-1.5 font-mono text-[10px] font-semibold text-warning"
          data-testid="charty-drawing-count"
          aria-label={`${drawings.length} drawings on chart`}
        >
          {drawings.length}
        </span>
      ) : null}
    </div>
  );
}

function RailButton({
  active = false,
  title,
  ariaLabel,
  ariaPressed,
  testid,
  disabled = false,
  destructive = false,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  ariaLabel: string;
  ariaPressed?: boolean;
  testid: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "bg-accent/15 text-accent"
            : destructive
              ? "text-muted-foreground hover:bg-loss/10 hover:text-loss"
              : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

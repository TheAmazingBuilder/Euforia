"use client";

import * as React from "react";
import {
  Crosshair,
  Minus,
  MousePointer2,
  MoveUpRight,
  MoveVertical,
  Ruler,
  Sigma,
  Square,
  TrendingUp,
  Type,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDict } from "@/i18n/i18n-provider";
import { setActiveTool, useOryonActiveTool } from "@/components/oryon/drawings/drawing-store";
import type { OryonTool } from "@/components/oryon/drawings/types";

/**
 * Oryon left drawing-tool rail — Phase 2 (docs/specs/oryon-prd.md §8.1).
 * The rail reads the tool registry: every Phase-2 tool is LIVE (cursor,
 * crosshair, trend line, horizontal, vertical, ray, rectangle, fibonacci,
 * text) with distinct active states and shortcut hints. Only the measure
 * tool remains deferred (PRD P1) and stays honestly disabled — no
 * decorative buttons (cahier de charge Phase 1 §4/§6).
 */

interface RailTool {
  tool: OryonTool;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: keyof ReturnType<typeof useDict>["oryon"]["drawing"];
  hint?: keyof ReturnType<typeof useDict>["oryon"]["drawing"];
  shortcut?: string;
  testId: string;
}

const TOOL_GROUPS: RailTool[][] = [
  [
    { tool: "cursor", icon: MousePointer2, label: "cursor", hint: "cursorHint", shortcut: "V", testId: "oryon-tool-cursor" },
    { tool: "crosshair", icon: Crosshair, label: "crosshair", hint: "crosshairHint", testId: "oryon-tool-crosshair" },
  ],
  [
    { tool: "trendLine", icon: TrendingUp, label: "trendLine", shortcut: "Alt+T", testId: "oryon-tool-trendLine" },
    { tool: "horizontalLine", icon: Minus, label: "horizontalLine", shortcut: "Alt+H", testId: "oryon-tool-horizontalLine" },
    { tool: "verticalLine", icon: MoveVertical, label: "verticalLine", shortcut: "Alt+V", testId: "oryon-tool-verticalLine" },
    { tool: "ray", icon: MoveUpRight, label: "ray", shortcut: "Alt+Y", testId: "oryon-tool-ray" },
  ],
  [
    { tool: "rectangle", icon: Square, label: "rectangle", shortcut: "Alt+R", testId: "oryon-tool-rectangle" },
    { tool: "fibonacci", icon: Sigma, label: "fibonacci", shortcut: "Alt+F", testId: "oryon-tool-fibonacci" },
  ],
  [
    { tool: "text", icon: Type, label: "text", shortcut: "Alt+X", testId: "oryon-tool-text" },
  ],
];

export function OryonDrawingRail({ className = "" }: { className?: string }) {
  const dict = useDict().oryon;
  const activeTool = useOryonActiveTool();

  return (
    <aside
      aria-label={dict.drawing.railLabel}
      className={`w-11 shrink-0 flex-col items-center border-r border-border bg-surface py-1.5 ${className}`}
      data-testid="oryon-drawing-rail"
    >
      {TOOL_GROUPS.map((group, groupIndex) => (
        <React.Fragment key={group[0]!.tool}>
          {groupIndex > 0 ? (
            <span className="my-1.5 h-px w-6 bg-border" aria-hidden />
          ) : null}
          {group.map(({ tool, icon: Icon, label, hint, shortcut, testId }) => {
            const active = activeTool === tool;
            return (
              <Tooltip key={tool}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setActiveTool(tool)}
                    aria-pressed={active}
                    data-testid={testId}
                    className={`flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "bg-accent/15 text-accent"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <span className="font-semibold">
                    {dict.drawing[label]}
                    {shortcut ? <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{shortcut}</span> : null}
                  </span>
                  {hint ? (
                    <span className="block text-xs text-muted-foreground">{dict.drawing[hint]}</span>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </React.Fragment>
      ))}

      <span className="my-1.5 h-px w-6 bg-border" aria-hidden />

      {/* Measure stays a PRD-P1 deferred tool — honestly disabled. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              disabled
              aria-disabled
              data-testid="oryon-tool-deferred-measure"
              className="flex size-8 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/50 focus-visible:outline-none"
            >
              <Ruler className="size-4" aria-hidden />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span className="font-semibold">{dict.drawing.measure}</span>
          <span className="block text-xs text-muted-foreground">
            {dict.drawing.measureDeferredTooltip}
          </span>
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}

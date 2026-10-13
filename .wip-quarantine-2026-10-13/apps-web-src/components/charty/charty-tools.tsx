"use client";

import { Minus, MoveUpRight, PencilLine, Ruler, Square, Type } from "lucide-react";

import type { DrawingKind } from "@cosmoz/shared";

/**
 * Shared drawing-tool presentation for the Charty terminal (left rail +
 * bottom bar). Pure icon mapping — placement logic lives on the chart
 * (analysis-chart.tsx), tool state in the workspace (same DrawingKind
 * contract as the previous popover toolbar).
 */

export const CHARTY_TOOL_ICONS: Record<DrawingKind, React.ComponentType<{ className?: string }>> = {
  HLINE: Minus,
  TREND: TrendLineIcon,
  RAY: MoveUpRight,
  RECT: Square,
  TEXT: Type,
  MEASURE: Ruler,
  FIB: PencilLine,
};

function TrendLineIcon({ className }: { className?: string }) {
  // Diagonal line — the TradingView trend-line glyph.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 20 20 4" />
      <circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="4" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

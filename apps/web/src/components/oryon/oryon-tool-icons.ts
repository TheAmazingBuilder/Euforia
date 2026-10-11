import {
  AlignEndHorizontal,
  AlignJustify,
  ArrowDownToLine,
  ArrowDownUp,
  ArrowRightLeft,
  ArrowUpFromLine,
  ArrowUpRight,
  Circle,
  CircleDot,
  Crosshair,
  Eraser,
  Minus,
  MousePointer2,
  MoveUpRight,
  MoveVertical,
  Plus,
  Ruler,
  Square,
  TrendingUp,
  Type,
  type LucideIcon,
} from "lucide-react";

import type { OryonDrawingTool } from "@/lib/oryon/drawings/interaction";

/**
 * Tool → icon map for the Drawing toolbar v2 surfaces (rail, flyouts,
 * favorites bar). The object list keeps its own drawing-TYPE map (icons
 * there describe persisted objects); this one describes INTERACTION tools
 * — cursor variants and the eraser have no persisted type.
 */
export const ORYON_TOOL_ICONS: Record<OryonDrawingTool, LucideIcon> = {
  cursor: MousePointer2,
  "cursor-cross": Crosshair,
  "cursor-dot": CircleDot,
  eraser: Eraser,
  trend: TrendingUp,
  hline: Minus,
  vline: MoveVertical,
  ray: ArrowUpRight,
  extended: MoveUpRight,
  crossline: Plus,
  rect: Square,
  ellipse: Circle,
  text: Type,
  measure: Ruler,
  pricerange: ArrowDownUp,
  daterange: ArrowRightLeft,
  fib: AlignJustify,
  fibext: AlignEndHorizontal,
  longpos: ArrowUpFromLine,
  shortpos: ArrowDownToLine,
};

import {
  Activity,
  BarChart3,
  BellRing,
  CalendarDays,
  CalendarRange,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon resolution for the widget registry — registry stays metadata-only
 * (iconId strings), the UI layer owns the Lucide mapping.
 */
const WIDGET_ICONS: Record<string, LucideIcon> = {
  pnl: BarChart3,
  equity: Activity,
  goals: Target,
  weeks: CalendarRange,
  heatmap: CalendarDays,
  bestworst: Trophy,
  alerts: BellRing,
};

export function widgetIcon(iconId: string): LucideIcon {
  return WIDGET_ICONS[iconId] ?? BarChart3;
}

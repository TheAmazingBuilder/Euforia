import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  BellRing,
  CalendarDays,
  CalendarRange,
  Gauge,
  GitCompareArrows,
  Grid3x3,
  Lightbulb,
  LineChart,
  PieChart,
  Target,
  TrendingDown,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon resolution for the widget registry - registry stays metadata-only
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
  metrics: Gauge,
  strategies: GitCompareArrows,
  longshort: ArrowLeftRight,
  activity: Grid3x3,
  breakdown: PieChart,
  insights: Lightbulb,
  streaks: TrendingDown,
  trend: LineChart,
};

export function widgetIcon(iconId: string): LucideIcon {
  return WIDGET_ICONS[iconId] ?? BarChart3;
}

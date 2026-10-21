"use client";

import * as React from "react";
import type {
  AnalyticsSuiteResponse,
  DashboardFilters,
  DashboardWidgetConfig,
  DashboardWidgetKey,
  StatsOverviewResponse,
} from "@cosmoz/shared";
import { formatMoney, formatNumber } from "@cosmoz/shared";

import { useAlerts, useRulesStatus } from "@/lib/api/queries";
import type { RangeDays } from "@/components/dashboard/period-chips";
import { defaultWidgetConfig } from "@/lib/dashboard-customization/widget-configs";
import type { SuiteStatus } from "@/lib/dashboard-customization/insights-view";
import { ActivityHeatmapWidget } from "@/components/dashboard/activity-heatmap-card";
import { AlertsFeed } from "@/components/dashboard/alerts-feed";
import { BehavioralInsightsWidget } from "@/components/dashboard/behavioral-insights-card";
import { BestWorstCard } from "@/components/dashboard/best-worst-card";
import { CalendarHeatmap } from "@/components/dashboard/calendar-heatmap";
import { CoachInsights } from "@/components/dashboard/coach-insights";
import { DisciplineSavedCard } from "@/components/dashboard/discipline-saved-card";
import { EquityConstellation } from "@/components/dashboard/equity-constellation";
import { GoalsPaceCard } from "@/components/dashboard/goals-pace-card";
import { LongShortWidget } from "@/components/dashboard/long-short-card";
import { LossStreaksWidget } from "@/components/dashboard/loss-streaks-card";
import { MetricsCardWidget } from "@/components/dashboard/metrics-card";
import { OpenPositionsCard } from "@/components/dashboard/open-positions-card";
import { PerformanceBreakdownWidget } from "@/components/dashboard/performance-breakdown-card";
import { PerformanceTrendWidget } from "@/components/dashboard/performance-trend-card";
import { CumulativePnlCard, DailyPnlCard } from "@/components/dashboard/pnl-charts";
import { RiskBudgetCard } from "@/components/dashboard/risk-budget-card";
import { StrategyCompareWidget } from "@/components/dashboard/strategy-compare-card";
import { WeekCompareCard } from "@/components/dashboard/week-compare-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Widget renderer map (Phase 01 §4.3, extended by Phase 02) — the RUNTIME
 * counterpart of the widget registry. Persisted layouts reference `type`
 * keys only; this layer resolves them to the real components with the real
 * data props and the instance's resolved configuration. Nothing here is
 * serialized, and unknown types never reach this map (the model layer drops
 * them on read).
 */

export type RulesStatusData = NonNullable<Awaited<ReturnType<typeof useRulesStatus>>["data"]> & object;
export type AlertsData = NonNullable<Awaited<ReturnType<typeof useAlerts>>["data"]>;

export interface DashboardWidgetData {
  overview: StatsOverviewResponse;
  rulesStatus: RulesStatusData;
  alerts: AlertsData;
  /** Analytics-suite aggregates for the server-computed widgets (null while
   * the dashboard-level fetch is not needed / not resolved). */
  suite: AnalyticsSuiteResponse | null;
  /** The shared fetch's status — suite-fed widgets render loading/error
   * states from THIS (Phase 05 §10: one shared query, one source of truth). */
  suiteStatus: SuiteStatus;
}

function HeroChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-muted-foreground">
      {label}
      <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

export interface WidgetContentProps {
  type: DashboardWidgetKey;
  data: DashboardWidgetData;
  /** The instance's RESOLVED config (undefined = widget defaults). */
  config?: DashboardWidgetConfig;
  /** The authoritative global filter context (Phase 03 §7) — only the
   * suite-fed widgets consume it (registry filterSupport FULL); the others
   * render their normal data and the grid badges them instead. */
  globalFilters?: DashboardFilters;
  /** Config-aware range changes (PNL_BAND period chips → widget config). */
  onRangeChange?: (range: RangeDays) => void;
}

/** One widget instance's content — moved verbatim from the previous
 * inline registry in dashboard-view (same markup, same data wiring). */
export function WidgetContent({ type, data, config, globalFilters, onRangeChange }: WidgetContentProps) {
  const insights = React.useMemo(
    () => data.alerts.alerts.filter((alert) => alert.type === "STRATEGY_DECAY"),
    [data.alerts.alerts],
  );
  // The config the component renders with: the instance's stored config when
  // valid, otherwise the widget's defaults — a FRESHLY ADDED instance has no
  // stored config yet and must still render (never a blank card).
  const resolvedConfig =
    config?.kind === type ? config : (defaultWidgetConfig(type) ?? undefined);

  switch (type) {
    case "PNL_BAND": {
      const pnlConfig = resolvedConfig?.kind === "PNL_BAND" ? resolvedConfig : undefined;
      return (
        <React.Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <CumulativePnlCard overview={data.overview} chartConfig={pnlConfig} onRangeChange={onRangeChange} />
            <DailyPnlCard overview={data.overview} chartConfig={pnlConfig} onRangeChange={onRangeChange} />
          </div>
        </React.Suspense>
      );
    }
    case "EQUITY_ROW":
      return (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
          <Card className="bg-surface lg:col-span-3">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                Equity trajectory
              </CardTitle>
              <CardDescription>
                Each star is a trading day — the plotted line of your decisions, drawdown
                zones shaded in loss ink.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                <HeroChip
                  label="Peak"
                  value={formatMoney(data.overview.equityPeak, data.overview.currency)}
                />
                <HeroChip
                  label="Max drawdown"
                  value={`${formatNumber(data.overview.maxDrawdownPct, 1)} %`}
                />
              </div>
              <EquityConstellation points={data.overview.equityCurve} currency={data.overview.currency} />
            </CardContent>
          </Card>
          <div className="space-y-3 sm:space-y-4 lg:col-span-2">
            <OpenPositionsCard />
            <RiskBudgetCard status={data.rulesStatus} />
            <CoachInsights insights={insights} />
          </div>
        </div>
      );
    case "GOALS_PACE":
      return <GoalsPaceCard />;
    case "WEEK_COMPARE":
      return (
        <WeekCompareCard weeklyCompare={data.overview.weeklyCompare} currency={data.overview.currency} />
      );
    case "HEATMAP":
      return (
        <CalendarHeatmap
          dailyPnl={data.overview.dailyPnl}
          currency={data.overview.currency}
          showCellValues={resolvedConfig?.kind === "HEATMAP" ? resolvedConfig.showCellValues : true}
        />
      );
    case "BEST_WORST":
      return (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <BestWorstCard />
          <DisciplineSavedCard
            rSaved={data.overview.disciplineSaved.rSaved}
            settledCount={data.overview.disciplineSaved.settledCount}
          />
        </div>
      );
    case "ALERTS":
      return <AlertsFeed alerts={data.alerts.alerts} unreadCount={data.alerts.unreadCount} />;
    case "METRICS_CARD":
      return resolvedConfig?.kind === "METRICS_CARD" ? (
        <MetricsCardWidget config={resolvedConfig} globalFilters={globalFilters} />
      ) : null;
    case "STRATEGY_COMPARE":
      return resolvedConfig?.kind === "STRATEGY_COMPARE" ? (
        <StrategyCompareWidget config={resolvedConfig} suite={data.suite} status={data.suiteStatus} />
      ) : null;
    case "LONG_SHORT":
      return resolvedConfig?.kind === "LONG_SHORT" ? (
        <LongShortWidget config={resolvedConfig} suite={data.suite} status={data.suiteStatus} />
      ) : null;
    case "ACTIVITY_HEATMAP":
      return resolvedConfig?.kind === "ACTIVITY_HEATMAP" ? (
        <ActivityHeatmapWidget config={resolvedConfig} suite={data.suite} status={data.suiteStatus} />
      ) : null;
    case "PERFORMANCE_BREAKDOWN":
      return resolvedConfig?.kind === "PERFORMANCE_BREAKDOWN" ? (
        <PerformanceBreakdownWidget config={resolvedConfig} suite={data.suite} status={data.suiteStatus} />
      ) : null;
    case "BEHAVIORAL_INSIGHTS":
      return <BehavioralInsightsWidget suite={data.suite} status={data.suiteStatus} />;
    case "LOSS_STREAKS":
      return <LossStreaksWidget suite={data.suite} status={data.suiteStatus} />;
    case "PERFORMANCE_TREND":
      return <PerformanceTrendWidget suite={data.suite} status={data.suiteStatus} />;
    default:
      return null;
  }
}

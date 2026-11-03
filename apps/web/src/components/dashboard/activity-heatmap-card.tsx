"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { RefreshCcw } from "lucide-react";
import type { ActivityHeatmapWidgetConfig, AnalyticsSuiteResponse } from "@cosmoz/shared";
import { ANALYTICS_HOUR_BUCKETS, formatNumber, formatR, parseDecimal } from "@cosmoz/shared";
import type { EChartsCoreOption } from "echarts/core";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EChart } from "@/components/charts/echart";
import type { SuiteStatus } from "@/lib/dashboard-customization/insights-view";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * Activity heatmap widget (Phase 02 §12.3) - weekday × UTC-hour-bucket grid
 * over the server-computed analytics-suite cells. Metric configurable:
 * average R (signed - profit/loss ink) or trade count (volume - accent
 * scale). Empty cells stay visually distinct from zero (honest gaps).
 */

const WEEKDAY_ROWS = [
  { index: 0, label: "SUN" },
  { index: 1, label: "MON" },
  { index: 2, label: "TUE" },
  { index: 3, label: "WED" },
  { index: 4, label: "THU" },
  { index: 5, label: "FRI" },
  { index: 6, label: "SAT" },
];

export function ActivityHeatmapWidget({
  config,
  suite,
  status,
}: {
  config: ActivityHeatmapWidgetConfig;
  suite: AnalyticsSuiteResponse | null;
  status: SuiteStatus;
}) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo(() => getChartTheme(), [resolvedTheme]);

  // Phase 05 §10: the dashboard-level, filter-aware suite fetch IS the data
  // source (the previous ALL-window fetch ignored the global filters).
  const heatmapCells = suite?.heatmap;
  const cells = React.useMemo(() => heatmapCells ?? [], [heatmapCells]);

  const option = React.useMemo<EChartsCoreOption | null>(() => {
    if (cells.length === 0) return null;
    type Point = readonly [number, number, number];
    const points = cells.flatMap<Point>((cell) => {
      const raw =
        config.metric === "AVG_R" ? parseDecimal(cell.avgR) : cell.trades;
      if (raw === null) return [];
      return [[cell.hourBucket, cell.weekday, raw]];
    });

    const values: number[] = points.map((point) => point[2]);
    if (config.metric === "AVG_R") {
      const maxAbs = Math.max(0.25, ...values.map((value) => Math.abs(value)));
      return {
        tooltip: {
          position: "top",
          backgroundColor: theme.surfaceRaised,
          borderColor: theme.border,
          textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
          formatter: (params: unknown) => {
            const typed = params as { value: [number, number, number]; dataIndex: number };
            const cell = cells[typed.dataIndex];
            if (!cell) return "";
            return [
              `${WEEKDAY_ROWS.find((row) => row.index === cell.weekday)?.label ?? ""} · ${ANALYTICS_HOUR_BUCKETS[cell.hourBucket]?.label ?? ""}`,
              `avg ${formatR(cell.avgR)}`,
              `${cell.trades} trade${cell.trades === 1 ? "" : "s"} · ${cell.wins} won`,
            ].join("<br/>");
          },
        },
        grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
        xAxis: {
          type: "category",
          data: ANALYTICS_HOUR_BUCKETS.map((bucket) => bucket.label),
          splitArea: { show: true },
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: theme.textMuted, fontSize: 9, fontFamily: theme.monoFont },
        },
        yAxis: {
          type: "category",
          data: WEEKDAY_ROWS.map((row) => row.label),
          splitArea: { show: true },
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: theme.textMuted, fontSize: 9, fontFamily: theme.monoFont },
        },
        visualMap: {
          min: -maxAbs,
          max: maxAbs,
          calculable: false,
          orient: "horizontal",
          left: "center",
          bottom: 0,
          itemHeight: 60,
          textStyle: { color: theme.textMuted, fontSize: 9, fontFamily: theme.monoFont },
          inRange: {
            color: [theme.loss, withAlpha(theme.loss, 0.35), theme.surfaceRaised, withAlpha(theme.profit, 0.35), theme.profit],
          },
        },
        series: [
          {
            type: "heatmap",
            data: points.map((point) => [point[0], point[1], point[2]] as [number, number, number]),
            label: {
              show: values.length > 0,
              formatter: (params: unknown) => {
                const typed = params as { dataIndex: number };
                const cell = cells[typed.dataIndex];
                if (!cell) return "";
                return config.metric === "AVG_R"
                  ? (cell.avgR === null ? "" : formatNumber(parseDecimal(cell.avgR), 1))
                  : String(cell.trades);
              },
              color: theme.textPrimary,
              fontSize: 8,
              fontFamily: theme.monoFont,
            },
            itemStyle: {
              borderColor: theme.surface,
              borderWidth: 2,
              borderRadius: 3,
            },
            emphasis: { itemStyle: { shadowBlur: 6, shadowColor: withAlpha(theme.accent, 0.5) } },
          },
        ],
      } satisfies EChartsCoreOption;
    }
    // Trades mode - accent intensity scale from 0 to the busiest cell.
    const maxTrades = Math.max(1, ...values);
    return {
      tooltip: {
        position: "top",
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { dataIndex: number };
          const cell = cells[typed.dataIndex];
          if (!cell) return "";
          return [
            `${WEEKDAY_ROWS.find((row) => row.index === cell.weekday)?.label ?? ""} · ${ANALYTICS_HOUR_BUCKETS[cell.hourBucket]?.label ?? ""}`,
            `${cell.trades} trade${cell.trades === 1 ? "" : "s"} · ${cell.wins} won`,
            `avg ${formatR(cell.avgR)}`,
          ].join("<br/>");
        },
      },
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: ANALYTICS_HOUR_BUCKETS.map((bucket) => bucket.label),
        splitArea: { show: true },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontSize: 9, fontFamily: theme.monoFont },
      },
      yAxis: {
        type: "category",
        data: WEEKDAY_ROWS.map((row) => row.label),
        splitArea: { show: true },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: theme.textMuted, fontSize: 9, fontFamily: theme.monoFont },
      },
      visualMap: {
        min: 0,
        max: maxTrades,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemHeight: 60,
        textStyle: { color: theme.textMuted, fontSize: 9, fontFamily: theme.monoFont },
        inRange: {
          color: [theme.surfaceRaised, withAlpha(theme.accent, 0.55), theme.accent],
        },
      },
      series: [
        {
          type: "heatmap",
          data: points.map((point) => [point[0], point[1], point[2]] as [number, number, number]),
          label: {
            show: true,
            formatter: (params: unknown) => {
              const typed = params as { dataIndex: number };
              const cell = cells[typed.dataIndex];
              return cell ? String(cell.trades) : "";
            },
            color: theme.textPrimary,
            fontSize: 8,
            fontFamily: theme.monoFont,
          },
          itemStyle: {
            borderColor: theme.surface,
            borderWidth: 2,
            borderRadius: 3,
          },
          emphasis: { itemStyle: { shadowBlur: 6, shadowColor: withAlpha(theme.accent, 0.5) } },
        },
      ],
    } satisfies EChartsCoreOption;
  }, [cells, config.metric, theme]);

  return (
    <Card className="bg-surface" data-testid="activity-heatmap-widget" data-metric={config.metric}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">Activity heatmap</CardTitle>
          <CardDescription className="text-xs">
            {config.metric === "AVG_R"
              ? "Average R per weekday and UTC hour bucket."
              : "Trade volume per weekday and UTC hour bucket."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <Skeleton className="h-56 w-full rounded-lg" aria-busy="true" aria-label="Loading heatmap" />
        ) : status.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">The heatmap could not load.</p>
            <Button variant="outline" size="sm" onClick={() => status.refetch()}>
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : option ? (
          <EChart
            option={option}
            className="h-56 w-full sm:h-64"
            ariaLabel="Performance heatmap by weekday and hour"
          />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="activity-heatmap-empty">
            No closed trades yet - the grid lights up as you journal.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

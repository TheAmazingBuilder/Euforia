"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { PanelLine } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTokens } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

import { formatPanelAxis, formatPanelValue } from "./panel-format";
import { inkToken } from "./panel-bars";

/**
 * Multi-series line panel with optional percentile bands (Monte Carlo
 * corridors). Bands stack as base (transparent) + width (area) pairs per
 * corridor, so several bands can nest without covering each other. Lines
 * stay straight-edged — smoothing would lie about the sample.
 */

interface TooltipParam {
  dataIndex: number;
  seriesName: string;
}

export function PanelLine({ panel, currency }: { panel: PanelLine; currency: string }) {
  const t = useChartTokens();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const series: Record<string, unknown>[] = [];
    const legend: { name: string; itemStyle?: Record<string, unknown> }[] = [];

    // Bands first (under the lines): each = lower (invisible base) + width.
    (panel.bands ?? []).forEach((band) => {
      const color = inkToken(band.ink, t);
      series.push({
        name: `${band.name} · base`,
        type: "line",
        stack: `band-${band.name}`,
        data: band.lower.map((p) => (p === null ? null : Number(p))),
        lineStyle: { width: 0 },
        symbol: "none",
        silent: true,
        tooltip: { show: false },
        legendHoverLink: false,
      });
      series.push({
        name: band.name,
        type: "line",
        stack: `band-${band.name}`,
        data: band.upper.map((p, i) => {
          const lower = band.lower[i];
          if (p === null || lower === null) return null;
          return Number(p) - Number(lower);
        }),
        itemStyle: { color },
        lineStyle: { width: 0 },
        symbol: "none",
        areaStyle: { color: withAlpha(color, 0.16) },
        silent: true,
        tooltip: { show: false },
        legendHoverLink: false,
      });
      legend.push({ name: band.name });
    });

    panel.series.forEach((s) => {
      const color = inkToken(s.ink, t);
      series.push({
        name: s.name,
        type: "line",
        data: s.points.map((p) => (p === null ? null : Number(p))),
        symbol: panel.xLabels.length > 40 ? "none" : "circle",
        symbolSize: 5,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        emphasis: { focus: "series" },
      });
      legend.push({ name: s.name });
    });

    const showLegend = panel.series.length > 1 || (panel.bands ?? []).length > 0;

    return {
      legend: showLegend
        ? {
            data: legend.map((l) => l.name),
            top: 0,
            textStyle: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10 },
            itemWidth: 14,
            itemHeight: 8,
            icon: "roundRect",
          }
        : undefined,
      grid: { left: 6, right: 10, top: showLegend ? 30 : 16, bottom: 2, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
      xAxis: {
        type: "category",
        data: panel.xLabels,
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          // Thin the labels on dense x axes instead of rotating them.
          interval: panel.xLabels.length > 20 ? Math.ceil(panel.xLabels.length / 10) : 0,
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          formatter: (value: number) => formatPanelAxis(value, panel.unit, currency),
        },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.55 } },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: withAlpha(t.accent, 0.5) } },
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const list = Array.isArray(params) ? params : [params];
          const rows = (list as TooltipParam[])
            .filter((p) => {
              const s = panel.series.find((candidate) => candidate.name === p.seriesName);
              return s !== undefined;
            })
            .map((p) => {
              const s = panel.series.find((candidate) => candidate.name === p.seriesName);
              const raw = s?.points[p.dataIndex];
              const value = raw === null || raw === undefined ? "—" : formatPanelValue(Number(raw), panel.unit, currency);
              return `<div>${p.seriesName}&nbsp;&nbsp;<b>${value}</b></div>`;
            })
            .join("");
          const xLabel = panel.xLabels[(list[0] as TooltipParam | undefined)?.dataIndex ?? 0] ?? "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${xLabel}</div>`,
            rows || "<div>—</div>",
          ].join("");
        },
      },
      series,
    };
  }, [panel, currency, t]);

  return (
    <div style={{ height: 280 }}>
      <EChart option={option} className="h-full w-full" ariaLabel={panel.ariaLabel} />
    </div>
  );
}

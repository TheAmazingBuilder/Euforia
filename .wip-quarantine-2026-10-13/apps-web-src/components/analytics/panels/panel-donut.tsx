"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { PanelDonut } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTokens } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

import { inkToken } from "./panel-bars";

/**
 * Share-of-total donut with the total printed in the hole (HTML overlay,
 * immune to canvas font quirks) and a right-hand legend that repeats each
 * slice's value — a share without its count is a vibe, not a statistic.
 */

interface TooltipParam {
  dataIndex: number;
}

export function PanelDonut({ panel }: { panel: PanelDonut }) {
  const t = useChartTokens();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const total = panel.slices.reduce((sum, slice) => sum + slice.value, 0);
    return {
      legend: {
        orient: "vertical",
        right: 4,
        top: "middle",
        textStyle: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
        icon: "circle",
        formatter: (name: string) => {
          const slice = panel.slices.find((s) => s.label === name);
          if (!slice || total === 0) return name;
          const share = Math.round((slice.value / total) * 100);
          return `${name}  ${slice.value} (${share}%)`;
        },
      },
      tooltip: {
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as TooltipParam | undefined;
          const slice = typed ? panel.slices[typed.dataIndex] : undefined;
          if (!slice || total === 0) return "";
          const share = Math.round((slice.value / total) * 100);
          return `<div>${slice.label}</div><div><b>${slice.value}</b> · ${share}%</div>`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["62%", "86%"],
          center: ["32%", "50%"],
          avoidLabelOverlap: true,
          label: { show: false },
          emphasis: {
            scaleSize: 4,
            itemStyle: { borderColor: t.accent, borderWidth: 1.5 },
          },
          data: panel.slices.map((slice) => ({
            name: slice.label,
            value: slice.value,
            itemStyle: {
              color: withAlpha(inkToken(slice.ink, t), 0.85),
              borderColor: t.surface,
              borderWidth: 2,
              borderRadius: 4,
            },
          })),
        },
      ],
    };
  }, [panel, t]);

  return (
    <div className="relative" style={{ height: 240 }}>
      <EChart option={option} className="h-full w-full" ariaLabel={panel.ariaLabel} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[32%] top-1/2 w-28 -translate-x-1/2 -translate-y-1/2 text-center"
      >
        <p className="font-mono text-lg font-semibold tabular-nums">{panel.centerLabel}</p>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { ExcursionPoint } from "@cosmoz/shared";
import { formatNumber, formatR } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * MAE/MFE map (Phase 9 What-If lab): every closed trade with excursions,
 * exit R against peak favorable excursion. The diagonal y = x is the
 * capture ceiling — distance below it is R left on the table. Dot color
 * carries P&L semantics only.
 */

interface ScatterDatum {
  value: [number, number];
  payload: ExcursionPoint;
  itemStyle: Record<string, unknown>;
}

interface TooltipParam {
  dataIndex: number;
}

export function MaeMfeScatter({ points }: { points: ExcursionPoint[] }) {
  const theme = useChartTheme();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const t = theme;

    const data: ScatterDatum[] = points
      .filter((point) => point.mfeR !== null)
      .map((point) => {
        const exit = Number(point.rMultiple);
        const mfe = Number(point.mfeR);
        const color = exit > 0 ? t.profit : exit < 0 ? t.loss : t.textMuted;
        return {
          value: [mfe, exit],
          payload: point,
          itemStyle: { color: withAlpha(color, 0.75) },
        };
      });

    const maxMfe = Math.max(2, ...data.map((datum) => datum.value[0]));

    return {
      grid: { left: 6, right: 14, top: 14, bottom: 2, containLabel: true },
      xAxis: {
        type: "value",
        min: 0,
        max: Math.ceil(maxMfe),
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          formatter: (value: number) => `${value}R`,
        },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.55 } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          formatter: (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}R`,
        },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.55 } },
      },
      tooltip: {
        trigger: "item",
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as TooltipParam | undefined;
          const datum = typed ? data[typed.dataIndex] : undefined;
          if (!datum) return "";
          const point = datum.payload;
          const kept =
            Number(point.rMultiple) > 0 && point.mfeR !== null
              ? ` · kept ${formatNumber(Math.min(Number(point.rMultiple) / Math.max(Number(point.mfeR), 0.01), 1) * 100, 0)}% of peak`
              : "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${point.date} · ${point.strategyName ?? "Out of playbook"}</div>`,
            `<div>Exit ${formatR(point.rMultiple)} · MFE ${formatR(point.mfeR)}${point.maeR === null ? "" : ` · MAE ${formatR(point.maeR)}`}${kept}</div>`,
          ].join("");
        },
      },
      series: [
        {
          type: "scatter",
          data,
          symbolSize: 9,
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: withAlpha(t.accent, 0.65), type: "dashed", width: 1 },
            data: [
              [
                // Capture ceiling: exit = MFE (perfect runner).
                { coord: [0, 0] },
                { coord: [Math.ceil(maxMfe), Math.ceil(maxMfe)] },
              ],
              {
                yAxis: 0,
                lineStyle: { color: withAlpha(t.textMuted, 0.5), type: "dashed", width: 1 },
                label: { show: false },
              },
            ],
          },
        },
      ],
    };
    // Rebuild with fresh tokens on theme switch (design-tokens.md §8).
  }, [points, theme]);

  return (
    <div className="h-[300px]" role="img" aria-label="Exit R against maximum favorable excursion scatter">
      <EChart
        option={option}
        className="h-full w-full"
        ariaLabel="Exit R against maximum favorable excursion scatter"
      />
    </div>
  );
}

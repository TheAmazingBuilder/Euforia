"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { PanelScatter } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTokens } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

import { formatPanelValue } from "./panel-format";
import { inkToken } from "./panel-bars";

/**
 * XY scatter with an optional y = x guide. Ink per point: explicit when the
 * server sends one, otherwise the sign of y — the register's rule that color
 * always answers "did it pay?".
 */

interface ScatterDatum {
  value: [number, number];
  itemStyle: Record<string, unknown>;
  meta: { label: string; x: number; y: number };
}

export function PanelScatter({ panel, currency }: { panel: PanelScatter; currency: string }) {
  const t = useChartTokens();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const data: ScatterDatum[] = panel.points.map((point) => {
      const x = Number(point.x);
      const y = Number(point.y);
      const ink = point.ink ?? (y >= 0 ? "profit" : "loss");
      return {
        value: [x, y],
        itemStyle: { color: withAlpha(inkToken(ink, t), 0.78) },
        meta: { label: point.label, x, y },
      };
    });

    // Diagonal guide (y = x) spanning the observed range.
    const all = panel.points.flatMap((p) => [Number(p.x), Number(p.y)]);
    const lo = all.length > 0 ? Math.min(...all) : 0;
    const hi = all.length > 0 ? Math.max(...all) : 1;

    return {
      grid: { left: 8, right: 14, top: 16, bottom: 2, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
      xAxis: {
        type: "value",
        scale: true,
        name: panel.xLabel,
        nameGap: 24,
        nameLocation: "middle",
        nameTextStyle: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10 },
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.4 } },
        axisLabel: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        scale: true,
        name: panel.yLabel,
        nameGap: 14,
        nameTextStyle: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10, align: "left" },
        axisLabel: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10 },
        splitLine: { lineStyle: { color: t.border, type: "dashed", opacity: 0.4 } },
      },
      tooltip: {
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as { dataIndex: number } | undefined;
          const meta = typed ? data[typed.dataIndex]?.meta : undefined;
          if (!meta) return "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${meta.label}</div>`,
            `<div>${panel.xLabel}: ${formatPanelValue(meta.x, panel.unit, currency)}</div>`,
            `<div>${panel.yLabel}: ${formatPanelValue(meta.y, panel.unit, currency)}</div>`,
          ].join("");
        },
      },
      series: [
        {
          type: "scatter",
          data,
          symbolSize: 9,
          emphasis: { itemStyle: { borderColor: t.accent, borderWidth: 1.5 } },
          ...(panel.diagonal
            ? {
                markLine: {
                  silent: true,
                  symbol: "none",
                  label: {
                    show: true,
                    position: "end",
                    formatter: "y = x",
                    color: t.textMuted,
                    fontFamily: t.monoFont,
                    fontSize: 9,
                  },
                  lineStyle: { color: withAlpha(t.textMuted, 0.5), type: "dashed", width: 1 },
                  data: [[{ coord: [lo, lo] }, { coord: [hi, hi] }]],
                },
              }
            : {}),
        },
      ],
    };
  }, [panel, currency, t]);

  return (
    <div style={{ height: 280 }}>
      <EChart option={option} className="h-full w-full" ariaLabel={panel.ariaLabel} />
    </div>
  );
}

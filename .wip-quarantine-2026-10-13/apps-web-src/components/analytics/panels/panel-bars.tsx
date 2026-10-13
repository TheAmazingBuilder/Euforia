"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { PanelBars, PanelInk } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTokens, type ChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

import { formatPanelAxis, formatPanelValue } from "./panel-format";

/**
 * Signed-bars panel — histograms, monthly P&L, cost of mistakes, timelines.
 * Bar color: the item's explicit ink when the server sends one (a count has
 * no sign), otherwise the sign of the value (profit ≥ 0, loss < 0). Every
 * bar carries its n under the axis; empty buckets render as a muted stub.
 */

export function inkToken(ink: PanelInk, t: ChartTheme): string {
  switch (ink) {
    case "profit":
      return t.profit;
    case "loss":
      return t.loss;
    case "warning":
      return t.warning;
    case "accent":
    default:
      return t.accent;
  }
}

interface TooltipParam {
  dataIndex: number;
}

export function PanelBars({ panel, currency }: { panel: PanelBars; currency: string }) {
  const t = useChartTokens();

  const option = React.useMemo<EChartsCoreOption>(() => {
    const data = panel.items.map((item) => {
      const value = item.value === null ? null : Number(item.value);
      const ink: PanelInk =
        item.ink ?? (value === null ? "accent" : value >= 0 ? "profit" : "loss");
      return {
        value,
        itemStyle: {
          color:
            value === null
              ? withAlpha(t.textMuted, 0.18)
              : withAlpha(inkToken(ink, t), 0.82),
          borderRadius: [3, 3, 0, 0],
        },
        label: {
          show: value !== null,
          position: "top",
          formatter: () => formatPanelValue(value ?? 0, panel.unit, currency, "compact"),
          color: value === null ? t.textMuted : inkToken(ink, t),
          fontFamily: t.monoFont,
          fontSize: 10,
        },
      };
    });

    const hasN = panel.items.some((item) => item.n !== null);
    const nHasLow = panel.items.some((item) => item.n !== null && item.n > 0 && item.n < 10);

    return {
      grid: { left: 6, right: 8, top: 24, bottom: 2, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
      xAxis: {
        type: "category",
        data: panel.items.map((item) => item.label),
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          interval: 0,
          rotate: panel.items.length > 8 ? 32 : 0,
          formatter: hasN
            ? (value: string, index: number) => {
                const item = panel.items[index];
                if (!item) return value;
                const n = item.n ?? 0;
                return n === 0 ? `{zero|${value}}\n{zero|n=0}` : `{v|${value}}\n{n|n=${n}}`;
              }
            : undefined,
          rich: {
            v: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10, lineHeight: 14, align: "center" },
            n: {
              color: nHasLow ? t.warning : t.textMuted,
              fontFamily: t.monoFont,
              fontSize: 9,
              lineHeight: 12,
              align: "center",
              fontWeight: nHasLow ? ("bold" as const) : ("normal" as const),
            },
            zero: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 9, lineHeight: 12, align: "center" },
          },
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
        axisPointer: { type: "shadow", shadowStyle: { color: withAlpha(t.accent, 0.08) } },
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown): string => {
          const typed = (Array.isArray(params) ? params[0] : params) as TooltipParam | undefined;
          const item = typed ? panel.items[typed.dataIndex] : undefined;
          if (!item) return "";
          const value = item.value === null ? "—" : formatPanelValue(Number(item.value), panel.unit, currency);
          const n = item.n === null || item.n === undefined ? "" : ` · n=${item.n}`;
          const lowNote =
            item.n !== null && item.n !== undefined && item.n > 0 && item.n < 10
              ? `<div style="color:${t.warning};margin-top:2px">Low sample — treat with caution</div>`
              : "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${item.label}</div>`,
            `<div>${value}${n}</div>`,
            lowNote,
          ].join("");
        },
      },
      series: [
        {
          type: "bar",
          data,
          barMaxWidth: 34,
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: withAlpha(t.textMuted, 0.5), type: "dashed", width: 1 },
            data: [{ yAxis: 0 }],
          },
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

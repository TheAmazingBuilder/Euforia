"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { Currency, TiltPoint } from "@cosmoz/shared";
import { formatMoney, formatMoneyCompact, formatR } from "@cosmoz/shared";

import { EChart } from "@/components/charts/echart";
import { useChartTokens } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";

/**
 * Tilt timeline (Phase 9): the size of every closed trade, in order. Three
 * states read at a glance — calm (accent), danger building (ochre, two or
 * more losses in a row), and the classic tilt tell (carmine): a bigger risk
 * taken right after a losing streak. A rate without its n is a lie, so the
 * tooltip always carries the streak and the R the trade actually returned.
 */

interface TiltTimelineProps {
  points: TiltPoint[];
  currency: Currency;
  className?: string;
}

interface TooltipParam {
  dataIndex: number;
}

interface BarDatum {
  value: number;
  itemStyle: Record<string, unknown>;
}

export function TiltTimeline({ points, currency, className }: TiltTimelineProps) {
  const t = useChartTokens();

  const option = React.useMemo<EChartsCoreOption>(() => {

    const data: BarDatum[] = points.map((point) => {
      const risk = Number(point.riskAmount);
      const itemStyle =
        point.isSpike
          ? { color: withAlpha(t.loss, 0.85), borderRadius: [3, 3, 0, 0] }
          : point.priorLossStreak >= 2
            ? { color: withAlpha(t.warning, 0.45), borderRadius: [3, 3, 0, 0] }
            : { color: withAlpha(t.accent, 0.3), borderRadius: [3, 3, 0, 0] };
      return { value: risk, itemStyle };
    });

    const avgRisk = points.length > 0
      ? points.reduce((sum, point) => sum + Number(point.riskAmount), 0) / points.length
      : 0;

    return {
      grid: { left: 6, right: 8, top: 24, bottom: 2, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
      xAxis: {
        type: "category",
        data: points.map((point) => point.date.slice(5)),
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        axisLabel: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 9 },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          formatter: (value: number) => formatMoneyCompact(value, currency),
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
          const point = typed ? points[typed.dataIndex] : undefined;
          if (!point) return "";
          const state = point.isSpike
            ? `<div style="color:${t.loss};margin-top:2px">TILT — risk raised after ${point.priorLossStreak} losses</div>`
            : point.priorLossStreak >= 2
              ? `<div style="color:${t.warning};margin-top:2px">Danger building — ${point.priorLossStreak} losses in a row</div>`
              : "";
          return [
            `<div style="color:${t.textMuted};font-size:10px">${point.date}</div>`,
            `<div>Risk ${formatMoney(point.riskAmount, currency)} · result ${formatR(point.rMultiple)}</div>`,
            state,
          ].join("");
        },
      },
      series: [
        {
          type: "bar",
          data,
          barMaxWidth: 12,
          markLine: {
            silent: true,
            symbol: "none",
            label: {
              show: true,
              position: "insideEndTop",
              formatter: `avg ${formatMoneyCompact(avgRisk, currency)}`,
              color: t.textMuted,
              fontFamily: t.monoFont,
              fontSize: 9,
            },
            lineStyle: { color: withAlpha(t.textMuted, 0.5), type: "dashed", width: 1 },
            data: [{ yAxis: avgRisk }],
          },
        },
      ],
    };
  }, [points, currency, t]);

  const spikeCount = points.filter((point) => point.isSpike).length;

  return (
    <div className={className}>
      <div style={{ height: 220 }}>
        <EChart
          option={option}
          className="h-full w-full"
          ariaLabel="Risk taken per closed trade in order, tilt spikes highlighted"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-sm bg-accent/30" /> Calm
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-sm bg-warning/45" /> 2+ losses in a row
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-sm bg-loss/85" /> Risk raised after losses
        </span>
        <span className="ml-auto font-mono tabular-nums">
          {spikeCount === 0 ? "No tilt spikes in this sample" : `${spikeCount} tilt spike${spikeCount > 1 ? "s" : ""}`}
        </span>
      </div>
    </div>
  );
}

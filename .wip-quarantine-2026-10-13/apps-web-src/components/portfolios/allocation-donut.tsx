"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { graphic } from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "@/components/charts/echart";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";
import type { PortfolioOverviewResponse } from "@cosmoz/shared";

/**
 * Capital allocation donut — one slice per account, painted strictly with
 * the four semantic inks (accent / profit / warning / loss) plus alpha
 * variations when the desk grows beyond four accounts. Center reads the
 * total balance in the desk currency.
 */

const SLICE_ORDER: Array<keyof ChartTheme | "accent55" | "profit55" | "warning55" | "loss55"> = [
  "accent",
  "profit",
  "warning",
  "loss",
  "accent55",
  "profit55",
  "warning55",
  "loss55",
];

function sliceColors(theme: ChartTheme): string[] {
  return SLICE_ORDER.map((key) => {
    if (key === "accent55") return withAlpha(theme.accent, 0.55);
    if (key === "profit55") return withAlpha(theme.profit, 0.55);
    if (key === "warning55") return withAlpha(theme.warning, 0.55);
    if (key === "loss55") return withAlpha(theme.loss, 0.55);
    return theme[key] as string;
  });
}

export function AllocationDonut({
  accounts,
  totalBalance,
  currency,
}: {
  accounts: PortfolioOverviewResponse["accounts"];
  totalBalance: string;
  currency: string;
}) {
  const { resolvedTheme } = useTheme();
  // Tokens are re-read only on theme switch (same idiom as dashboard charts).
  // resolvedTheme is an intentional dependency even though tokens are read
  // from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const option = React.useMemo<EChartsCoreOption>(() => {
    const colors = sliceColors(theme);
    const rows = [...accounts].sort((a, b) => Number(b.balance) - Number(a.balance));

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: { name?: string; value?: number; percent?: number }) => {
          const value = Number(params.value ?? 0);
          const share = Number(params.percent ?? 0);
          return [
            `<strong>${params.name ?? "—"}</strong>`,
            `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`,
            `${share.toFixed(1)}% of the desk`,
          ].join("<br/>");
        },
      },
      title: {
        text: Number(totalBalance).toLocaleString("en-US", { maximumFractionDigits: 0 }),
        subtext: `TOTAL · ${currency}`,
        left: "center",
        top: "42%",
        itemGap: 4,
        textStyle: {
          color: theme.textPrimary,
          fontFamily: theme.monoFont,
          fontSize: 20,
          fontWeight: 600,
        },
        subtextStyle: {
          color: theme.textMuted,
          fontFamily: theme.monoFont,
          fontSize: 10,
          letterSpacing: 2,
        },
      },
      series: [
        {
          type: "pie",
          radius: ["58%", "84%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          padAngle: 1.5,
          itemStyle: {
            borderColor: theme.surface,
            borderWidth: 2,
            borderRadius: 3,
          },
          label: { show: false },
          emphasis: {
            label: { show: false },
            itemStyle: { shadowBlur: 14, shadowColor: withAlpha(theme.accent, 0.35) },
          },
          data: rows.map((row, index) => ({
            name: row.name,
            value: Number(row.balance),
            itemStyle: {
              color: new graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: colors[index % colors.length]! },
                { offset: 1, color: withAlpha(colors[index % colors.length]!, 0.72) },
              ]),
            },
          })),
        },
      ],
    };
    // Rebuild on theme switch so canvas pixels match the active tokens.
  }, [theme, accounts, totalBalance, currency]);

  return (
    <EChart
      option={option}
      className="h-64 w-full sm:h-72"
      ariaLabel="Capital allocation by account"
    />
  );
}

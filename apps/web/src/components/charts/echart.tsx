"use client";

import * as React from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTheme } from "next-themes";
import type { EChartsCoreOption } from "echarts/core";

// Tree-shaken registration — only what the dashboard consumes today.
echarts.use([LineChart, GridComponent, TooltipComponent, MarkAreaComponent, CanvasRenderer]);

interface EChartProps {
  option: EChartsCoreOption;
  className?: string;
  ariaLabel: string;
}

/**
 * Minimal ECharts bridge for React: init, ResizeObserver-driven resize,
 * dispose, and a FULL re-init whenever useTheme().resolvedTheme changes so
 * canvas pixels always match the active tokens (design-tokens.md §8).
 * Options must be rebuilt with fresh getChartTheme() values on the same
 * dependency — see components/dashboard/*.
 */
export function EChart({ option, className, ariaLabel }: EChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // Re-create the canvas on theme switch (dispose + init with fresh tokens).
  }, [resolvedTheme]);

  React.useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
    />
  );
}

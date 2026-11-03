"use client";

import * as React from "react";

import { withAlpha } from "@/lib/utils/color";

interface SparklineProps {
  /** Chronological values (decimal strings straight from the API). */
  points: string[];
  /** Token color (from getChartTheme()) for stroke + soft area fill. */
  color: string;
  className?: string;
  /** Accessible description of the trend; omit for decorative use. */
  ariaLabel?: string;
}

const WIDTH = 100;
const HEIGHT = 28;
const PAD = 3;

/**
 * Tiny inline SVG sparkline for KPI cards - deliberately NOT an ECharts
 * instance (5 extra canvases would be waste). Colors come from theme tokens
 * via getChartTheme(); the parent re-renders on theme switch.
 */
export function Sparkline({ points, color, className, ariaLabel }: SparklineProps) {
  const values = React.useMemo(
    () =>
      points
        .map((point) => Number(point))
        .filter((value) => Number.isFinite(value)),
    [points],
  );

  if (values.length < 2) {
    return <div className={className} aria-hidden="true" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (WIDTH - PAD * 2) / (values.length - 1);
  const coords = values.map((value, index) => {
    const x = PAD + index * step;
    const y = HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${PAD},${HEIGHT - PAD} ${line} ${(WIDTH - PAD).toFixed(2)},${HEIGHT - PAD}`;
  const last = coords[coords.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <polygon points={area} fill={withAlpha(color, 0.22)} />
      <polygon points={area} fill={withAlpha(color, 0.08)} transform="translate(0 1.5)" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* End-point halo: a soft glow disc behind the current-value dot. */}
      <circle cx={last[0]} cy={last[1]} r={5} fill={withAlpha(color, 0.22)} />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={2.4}
        fill={color}
        stroke={withAlpha(color, 0.35)}
        strokeWidth={1}
      />
    </svg>
  );
}

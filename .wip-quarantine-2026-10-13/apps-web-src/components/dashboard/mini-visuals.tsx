"use client";

import * as React from "react";

/**
 * Micro-visuals for stat cells — the light grammar between full sparklines
 * and plain figures. All colors come from theme tokens (no hex in TSX):
 * callers pass getChartTheme() values or Tailwind-mapped token classes.
 * Everything is decorative-unless-labelled SVG/div chrome sized for the
 * stat-cell rhythm (full width, ≤ 32px tall).
 */

interface MiniBarsProps {
  /** Chronological values; zeros render as hairline stubs (honest gaps). */
  points: number[];
  /** Token color for the bars (from getChartTheme()). */
  color: string;
  className?: string;
  /** Accessible description; omit for purely decorative use. */
  ariaLabel?: string;
}

const BARS_WIDTH = 100;
const BARS_HEIGHT = 28;
const BARS_PAD = 1;

/**
 * Tiny inline SVG bar chart (activity per day) — deliberately NOT an ECharts
 * instance, same trade-off as Sparkline. The last bar renders solid, earlier
 * bars at reduced alpha; zeros draw a 2px stub so gaps stay visible.
 */
export function MiniBars({ points, color, className, ariaLabel }: MiniBarsProps) {
  const values = React.useMemo(() => points.map((v) => Math.max(0, v)), [points]);

  if (values.length < 2) {
    return <div className={className} aria-hidden="true" />;
  }

  const max = Math.max(...values);
  const span = BARS_WIDTH / values.length;
  const barWidth = span - BARS_PAD * 2;

  return (
    <svg
      viewBox={`0 0 ${BARS_WIDTH} ${BARS_HEIGHT}`}
      preserveAspectRatio="none"
      className={className}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {values.map((value, index) => {
        const h = max > 0 ? Math.max((value / max) * (BARS_HEIGHT - BARS_PAD), 2) : 2;
        const isLast = index === values.length - 1;
        return (
          <rect
            key={index}
            x={index * span + BARS_PAD}
            y={BARS_HEIGHT - h}
            width={Math.max(barWidth, 1)}
            height={h}
            fill={color}
            opacity={isLast ? 1 : 0.38}
            rx={1}
          />
        );
      })}
    </svg>
  );
}

interface MiniMeterProps {
  /** Filled fraction 0–1 (clamped). */
  ratio: number;
  /** Tailwind bg class for the fill (token color). */
  fillClassName: string;
  className?: string;
  ariaLabel?: string;
}

/** Hairline progress track with a token-colored fill (drawdown gauge, shares). */
export function MiniMeter({ ratio, fillClassName, className, ariaLabel }: MiniMeterProps) {
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <div
      className={className ?? "h-1.5 w-full overflow-hidden rounded-full bg-border/60"}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <div
        className={`h-full rounded-full ${fillClassName}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface MiniSplitMeterProps {
  /** Share of the first segment 0–1 (rest fills the remainder). */
  ratio: number;
  /** Tailwind bg classes for the two segments (token colors). */
  leadClassName: string;
  trailClassName: string;
  className?: string;
  ariaLabel?: string;
}

/** Two-segment stacked meter (win vs loss balance, month share). */
export function MiniSplitMeter({
  ratio,
  leadClassName,
  trailClassName,
  className,
  ariaLabel,
}: MiniSplitMeterProps) {
  const lead = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <div
      className={className ?? "flex h-1.5 w-full overflow-hidden rounded-full bg-border/60"}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <div className={`h-full ${leadClassName}`} style={{ width: `${lead}%` }} />
      <div className={`h-full flex-1 ${trailClassName}`} />
    </div>
  );
}

interface MiniRingProps {
  /** Progress fraction 0–1. */
  ratio: number;
  /** Center label (short mono readout, e.g. "15/30"). */
  center: string;
  className?: string;
  ariaLabel?: string;
}

const RING_RADIUS = 17;
const RING_C = 2 * Math.PI * RING_RADIUS;

/**
 * 40px progress ring — the festive unit for ratio KPIs (retention 30d).
 * Track = border token, progress = accent, center = mono readout.
 */
export function MiniRing({ ratio, center, className, ariaLabel }: MiniRingProps) {
  const pct = Math.min(Math.max(ratio, 0), 1);
  return (
    <span
      className={`relative inline-flex size-10 shrink-0 ${className ?? ""}`}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <svg viewBox="0 0 40 40" className="size-full -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="4"
          className="stroke-border/60"
        />
        <circle
          cx="20"
          cy="20"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - pct)}
          className="stroke-accent transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-medium tabular-nums text-foreground">
        {center}
      </span>
    </span>
  );
}

interface MiniSparkProps {
  /** Chronological values; null = week without data (gap in the polyline). */
  points: (number | null)[];
  /** Token color for the line (from getChartTheme()). */
  color: string;
  className?: string;
  ariaLabel?: string;
}

const SPARK_WIDTH = 100;
const SPARK_HEIGHT = 24;
const SPARK_PAD = 2;

/**
 * Tiny polyline sparkline for week-over-week strips (8 rolling weeks).
 * Null weeks split the path into segments so gaps read as gaps, not zeros.
 */
export function MiniSpark({ points, color, className, ariaLabel }: MiniSparkProps) {
  const finite = points.filter((v): v is number => v !== null);
  if (finite.length < 2) {
    return <div className={className} aria-hidden="true" />;
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const step = SPARK_WIDTH / Math.max(points.length - 1, 1);
  const yOf = (value: number) =>
    SPARK_HEIGHT - SPARK_PAD - ((value - min) / span) * (SPARK_HEIGHT - SPARK_PAD * 2);

  // Build path segments, breaking at nulls.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(
      `${current.length === 0 ? "M" : "L"}${(index * step).toFixed(1)},${yOf(value).toFixed(1)}`,
    );
  });
  if (current.length > 1) segments.push(current.join(" "));

  const lastValue = points.at(-1);
  const lastX = ((points.length - 1) * step).toFixed(1);

  return (
    <svg
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      className={className}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {segments.map((segment, index) => (
        <path
          key={index}
          d={segment}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {lastValue !== null && lastValue !== undefined ? (
        <circle
          cx={lastX}
          cy={yOf(lastValue).toFixed(1)}
          r="2"
          fill={color}
        />
      ) : null}
    </svg>
  );
}

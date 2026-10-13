"use client";

import * as React from "react";
import type { ProductMetricsResponse } from "@cosmoz/shared";
import { formatNumber, formatPercent } from "@cosmoz/shared";

import { MiniBars, MiniSplitMeter, MiniRing } from "@/components/dashboard/mini-visuals";
import { useUsageTracker, startUsageTracking } from "@/lib/hooks/use-usage-tracker";
import { useChartTheme } from "@/lib/utils/chart-theme";

/** Minutes → "1h 05m" / "42m" (mono-friendly, no trailing zero noise). */
function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

interface ProductCellProps {
  label: string;
  value: string;
  sub: React.ReactNode;
  testId: string;
  /** Bottom-slot visual (bars/meters) pinned to the cell's base. */
  visual?: React.ReactNode;
  /** Trailing inline visual beside the value (retention ring). */
  aside?: React.ReactNode;
}

function ProductCell({ label, value, sub, testId, visual, aside }: ProductCellProps) {
  return (
    <div className="stat-cell flex flex-col gap-2" data-testid={testId}>
      <span className="ledger-label">{label}</span>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
          {value}
        </span>
        {aside}
      </div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
      {visual ? <div className="mt-auto">{visual}</div> : <div className="mt-auto" />}
    </div>
  );
}

/**
 * Product & usage band — the account-level engagement row. Session time comes
 * from the local usage tracker (client-owned); trades logged and retention
 * come from GET /stats/product (server-computed). Each cell carries a light
 * visual: month-share meter, 14-day usage bars, retention ring.
 */
export function ProductBand({ metrics }: { metrics: ProductMetricsResponse }) {
  const usage = useUsageTracker();
  React.useEffect(() => startUsageTracking, []);

  const theme = useChartTheme();

  const totalLogged = metrics.totalTradesLogged;
  const monthShare =
    totalLogged > 0 ? Math.min(metrics.tradesThisMonth / totalLogged, 1) : 0;
  const usageBars = usage.ready && usage.recentDays.some((m) => m > 0) ? usage.recentDays : null;
  const retentionRatio = Math.min(metrics.activeDays30d / 30, 1);

  return (
    <section
      aria-label="Product and usage metrics"
      className="stat-strip reveal-stagger grid-cols-2 lg:grid-cols-4"
      data-testid="product-band"
    >
      <ProductCell
        label="Active users"
        value={String(metrics.activeUsers)}
        sub={
          <span className="inline-flex items-center gap-1.5" data-testid="active-users-sub">
            <span className="relative inline-flex size-1.5" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-profit opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-profit" />
            </span>
            You · signed in
          </span>
        }
        testId="product-active-users"
      />
      <ProductCell
        label="Trades logged"
        value={formatNumber(totalLogged, 0)}
        sub={
          <>
            This month&nbsp;<span className="font-mono">{formatNumber(metrics.tradesThisMonth, 0)}</span>
          </>
        }
        visual={
          <MiniSplitMeter
            ratio={monthShare}
            leadClassName="bg-chart-5/85"
            trailClassName="bg-border/40"
            ariaLabel="Trades logged this month as a share of the total book"
          />
        }
        testId="product-trades-logged"
      />
      <ProductCell
        label="Usage time"
        value={formatMinutes(usage.todayMinutes)}
        sub={
          <>
            <span className="font-mono" data-testid="usage-month">
              {formatMinutes(usage.monthMinutes)}
            </span>
            &nbsp;this month · tracked in-app
          </>
        }
        visual={
          usageBars ? (
            <MiniBars
              points={usageBars}
              color={theme.chartPalette[1] ?? theme.accent}
              className="h-7 w-full"
              ariaLabel="In-app usage minutes over the last 14 days"
            />
          ) : null
        }
        testId="product-usage"
      />
      <ProductCell
        label="Retention 30d"
        value={formatPercent(metrics.retentionPct)}
        sub={
          <>
            <span className="font-mono">{metrics.activeDays30d}</span>&nbsp;of 30 active days
          </>
        }
        aside={
          <MiniRing
            ratio={retentionRatio}
            center={`${metrics.activeDays30d}/30`}
            ariaLabel={`${metrics.activeDays30d} of 30 days active`}
          />
        }
        testId="product-retention"
      />
    </section>
  );
}

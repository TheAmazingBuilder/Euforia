"use client";

import * as React from "react";
import type { AnalyticsResponse, StatsOverviewResponse } from "@cosmoz/shared";

import { EquityConstellation } from "@/components/dashboard/equity-constellation";
import { RHeatmap } from "@/components/analytics/r-heatmap";
import { SummaryCards } from "@/components/analytics/summary-cards";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Overview tab (Phase 9): the five edge ratios, the constellation equity
 * curve (the Phase 6 signature, reused verbatim) and the weekday × hour
 * heatmap. Every rate ships with its n; low-sample cells are flagged.
 */

interface OverviewTabProps {
  analytics: AnalyticsResponse;
  overview: StatsOverviewResponse;
}

export function OverviewTab({ analytics, overview }: OverviewTabProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <SummaryCards cards={analytics.cards} />

      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Equity trajectory
          </CardTitle>
          <CardDescription>
            Each star is a trading day — the constellation of your decisions, drawdown
            zones shaded in loss red.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EquityConstellation points={overview.equityCurve} currency={overview.currency} />
        </CardContent>
      </Card>

      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Temporal edge — weekday × hour
          </CardTitle>
          <CardDescription>
            Average R per UTC window. Dashed borders flag cells below 10 trades —
            treat them as anecdotes, not patterns.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <RHeatmap cells={analytics.heatmap} />
        </CardContent>
      </Card>
    </div>
  );
}

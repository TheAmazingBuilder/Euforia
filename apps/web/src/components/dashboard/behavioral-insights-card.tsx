"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import type { AnalyticsSuiteResponse } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  INSIGHTS_EMPTY_COPY,
  insightMetricText,
  reliabilityCopy,
  type SuiteStatus,
} from "@/lib/dashboard-customization/insights-view";

/**
 * Behavioral insights widget (Phase 05 §9D) — deterministic, rule-based
 * findings computed INSIDE the analytics suite (no AI/ML/LLM anywhere).
 * Each finding ships its observation count, reliability label and analyzed
 * period; the methodology footnotes explain the thresholds so no label is
 * mistaken for a statistical claim (spec §8: they are observation counts).
 */

export function BehavioralInsightsWidget({
  suite,
  status,
}: {
  suite: AnalyticsSuiteResponse | null;
  status: SuiteStatus;
}) {
  const insights = suite?.insights.insights ?? [];
  const methodology = suite?.insights.methodology ?? [];

  return (
    <Card className="bg-surface" data-testid="behavioral-insights-widget">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">Behavioral insights</CardTitle>
          <CardDescription className="text-xs">
            Rule-based observations over the filtered journal — measured facts, never diagnoses or predictions.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading behavioral insights">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : status.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">The insights could not load.</p>
            <Button variant="outline" size="sm" onClick={() => status.refetch()}>
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : insights.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="behavioral-insights-empty">
            {INSIGHTS_EMPTY_COPY}
          </p>
        ) : (
          <ul className="space-y-3" data-testid="behavioral-insights-list">
            {insights.map((insight) => {
              const reliability = reliabilityCopy(insight.reliability);
              return (
                <li key={insight.id} className="rounded-lg border border-border bg-surface-raised p-3" data-testid={`insight-${insight.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{insight.title}</h3>
                    <span
                      className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      title={reliability.hint}
                    >
                      {reliability.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.description}</p>
                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {insight.metrics.map((metric) => (
                      <div key={metric.label} className="flex items-baseline gap-1.5">
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{metric.label}</dt>
                        <dd className="font-mono text-sm font-medium tabular-nums">
                          {insightMetricText(metric, suite?.currency ?? null)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    n = {insight.observations} · {insight.periodFrom ?? "?"} → {insight.periodTo ?? "?"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {insights.length > 0 && methodology.length > 0 && (
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium">How these findings are labeled</summary>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {methodology.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

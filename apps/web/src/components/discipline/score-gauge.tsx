"use client";

import * as React from "react";
import { formatNumber, type DisciplineScoreResponse } from "@cosmoz/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { getThemeToken } from "@/lib/utils/theme";
import { cn } from "@/lib/utils";

/**
 * Euforia Discipline Score (Phase 8) — large circular SVG gauge in the
 * accent color + the four process components + the product note, verbatim:
 * "Score measures process, not profit — you can be disciplined in a losing
 * week." The value comes from GET /discipline/score (server-computed).
 */

const RADIUS = 54;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function pct(value: string | null): string {
  if (value === null) return "—";
  return `${formatNumber(value, 0)}%`;
}

interface ScoreGaugeProps {
  score: DisciplineScoreResponse | undefined;
  isLoading: boolean;
}

export function ScoreGauge({ score, isLoading }: ScoreGaugeProps) {
  const accent = getThemeToken("--accent");
  const border = getThemeToken("--border");
  const value = score?.score !== undefined && score?.score !== null ? Number(score.score) : null;

  const dashOffset = value === null ? CIRCUMFERENCE : CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, value)) / 100);

  const components: { label: string; value: string; tone?: "loss" }[] = [
    {
      label: "Plan adherence",
      value: pct(score?.planAdherencePct ?? null),
    },
    {
      label: "Checklist completion",
      value: pct(score?.checklistCompletionPct ?? null),
    },
    {
      label: "Rule violations",
      value: score ? String(score.violationsCount) : "—",
      tone: score !== undefined && score.violationsCount > 0 ? "loss" : undefined,
    },
    {
      label: "Journaling consistency",
      value: pct(score?.journalingConsistencyPct ?? null),
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-surface" aria-label="Euforia Discipline Score">
      <div className="flex flex-col items-center gap-6 p-5 sm:p-6 md:flex-row md:items-center md:gap-8">
        <div className="relative shrink-0" role="img" aria-label={`Discipline score ${value === null ? "unavailable" : formatNumber(value, 0)} out of 100`}>
          <svg width={140} height={140} viewBox="0 0 140 140" className="-rotate-90">
            <circle
              cx={70}
              cy={70}
              r={RADIUS}
              fill="none"
              stroke={border}
              strokeWidth={STROKE}
            />
            <circle
              cx={70}
              cy={70}
              r={RADIUS}
              fill="none"
              stroke={accent}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
                {value === null ? "—" : formatNumber(value, 0)}
              </span>
            )}
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">/ 100</span>
          </div>
        </div>

        <div className="w-full space-y-3">
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground">
              Euforia Discipline Score
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Rolling 30 days — four process components, one index.
            </p>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            {components.map((component) => (
              <div
                key={component.label}
                className="flex items-baseline justify-between gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2"
              >
                <dt className="text-xs text-muted-foreground">{component.label}</dt>
                <dd
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    component.tone === "loss" ? "text-loss" : "text-foreground",
                  )}
                >
                  {component.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs italic leading-relaxed text-muted-foreground">
            Score measures process, not profit — you can be disciplined in a losing week.
          </p>
        </div>
      </div>
    </section>
  );
}

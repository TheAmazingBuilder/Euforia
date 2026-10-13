"use client";

import * as React from "react";
import type { AnalyticsExtendedResponse } from "@cosmoz/shared";
import { formatNumber, formatPercent } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricCard, MethodNote } from "@/components/analytics/metric-card";
import type { AnalyticsDict } from "@/i18n/dictionaries/en/analytics";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Execution tab (MASTER PROMPT §11) — PLAN vs REALITY on the trades that
 * carried one. Every figure arrives server-computed on the SAME filtered
 * dataset as the other tabs; measurements the data model cannot support are
 * DECLARED by the engine and rendered as such (§34 — never fabricated).
 * Labels resolve through dict.analytics.execution (the dict.* pattern).
 */

type Extended = AnalyticsExtendedResponse;

/** Small factual tile (risk grid reuse of the RiskTab bucket tiles). */
function Tile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "profit" | "loss" | "warning";
}) {
  const toneClass = {
    neutral: "text-foreground",
    profit: "text-profit",
    loss: "text-loss",
    warning: "text-warning",
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-xl font-semibold tabular-nums", toneClass)}>{value}</p>
      {hint !== undefined && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ExecutionTab({ data }: { data: Extended }) {
  const { dict } = useI18n();
  const T: AnalyticsDict["execution"] = dict.analytics.execution;
  const execution = data.execution;
  const total = execution.planCoverage.withPlan + execution.planCoverage.withoutPlan;

  if (total === 0) {
    return (
      <div data-testid="analytics-tab-execution">
        <Card className="bg-surface">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{T.empty}</CardContent>
        </Card>
      </div>
    );
  }

  const coveragePct = total === 0 ? null : execution.planCoverage.withPlan / total;
  const floor = execution.plannedVsRealized.floorRR === null ? null : Number(execution.plannedVsRealized.floorRR);

  return (
    <div className="space-y-4" data-testid="analytics-tab-execution">
      {/* KPI band — every card carries its definition (§55). */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label={T.planCoverage}
          value={coveragePct === null ? "—" : formatPercent(coveragePct, 0)}
          definition={T.planCoverageDef}
          tone={coveragePct !== null && coveragePct >= 0.7 ? "profit" : "warning"}
          sub={`${execution.planCoverage.withPlan} ${T.withPlan.toLowerCase()} · ${execution.planCoverage.withoutPlan} ${T.withoutPlan.toLowerCase()}`}
          insufficient={total === 0}
        />
        <MetricCard
          label={T.avgPlannedRR}
          value={execution.plannedVsRealized.avgPlannedRR === null ? "—" : `1:${formatNumber(execution.plannedVsRealized.avgPlannedRR, 2)}`}
          definition={T.plannedVsRealizedDesc}
          sub={floor !== null ? `${T.floorChip} 1:${Number.isInteger(floor) ? floor.toFixed(0) : floor.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}` : undefined}
          insufficient={execution.plannedVsRealized.avgPlannedRR === null}
        />
        <MetricCard
          label={T.avgRealizedR}
          value={execution.plannedVsRealized.avgRealizedR === null ? "—" : `${Number(execution.plannedVsRealized.avgRealizedR) >= 0 ? "+" : ""}${formatNumber(execution.plannedVsRealized.avgRealizedR, 2)}R`}
          definition={T.plannedVsRealizedDesc}
          tone={
            execution.plannedVsRealized.avgRealizedR === null
              ? "neutral"
              : Number(execution.plannedVsRealized.avgRealizedR) >= 0
                ? "profit"
                : "loss"
          }
          insufficient={execution.plannedVsRealized.avgRealizedR === null}
        />
        <MetricCard
          label={T.belowFloor}
          value={String(execution.plannedVsRealized.belowFloorTrades)}
          definition={T.belowFloorDef}
          tone={execution.plannedVsRealized.belowFloorTrades > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label={T.moved}
          value={execution.stopDiscipline.movePct === null ? "—" : formatNumber(execution.stopDiscipline.movePct, 1) + " %"}
          definition={T.stopDisciplineDesc}
          sub={`${execution.stopDiscipline.moved} ${T.moved.toLowerCase()} / ${execution.stopDiscipline.tradesWithStop}`}
          insufficient={execution.stopDiscipline.tradesWithStop === 0}
        />
        <MetricCard
          label={T.followedPct}
          value={execution.planAdherence.followedPct === null ? "—" : formatNumber(execution.planAdherence.followedPct, 0) + " %"}
          definition={T.planAdherenceDesc}
          sub={`${execution.planAdherence.followed} ${T.followed.toLowerCase()} · ${execution.planAdherence.violated} ${T.violated.toLowerCase()} · ${execution.planAdherence.unknown} ${T.unknown.toLowerCase()}`}
          insufficient={execution.planAdherence.followed + execution.planAdherence.violated === 0}
        />
      </div>

      {/* Stop discipline — widened vs tightened (risk direction matters). */}
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.stopDisciplineTitle}</CardTitle>
          <CardDescription className="text-xs">{T.stopDisciplineDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={T.tradesWithStop} value={String(execution.stopDiscipline.tradesWithStop)} />
            <Tile label={T.moved} value={String(execution.stopDiscipline.moved)} />
            <Tile
              label={T.widened}
              value={String(execution.stopDiscipline.widened)}
              tone={execution.stopDiscipline.widened > 0 ? "warning" : "neutral"}
              hint={T.widenedDef}
            />
            <Tile
              label={T.tightened}
              value={String(execution.stopDiscipline.tightened)}
              hint={T.tightenedDef}
            />
          </div>
        </CardContent>
      </Card>

      {/* Plan adherence (self-report, judged before the reveal). */}
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{T.planAdherenceTitle}</CardTitle>
          <CardDescription className="text-xs">{T.planAdherenceDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <Tile
              label={T.followed}
              value={String(execution.planAdherence.followed)}
              tone="profit"
            />
            <Tile
              label={T.violated}
              value={String(execution.planAdherence.violated)}
              tone={execution.planAdherence.violated > 0 ? "loss" : "neutral"}
            />
            <Tile label={T.unknown} value={String(execution.planAdherence.unknown)} />
          </div>
        </CardContent>
      </Card>

      {/* Declared-unavailable measurements (engine copy, rendered verbatim). */}
      {execution.unavailable.length > 0 && (
        <div className="space-y-1.5" data-testid="analytics-execution-unavailable">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {T.unavailableTitle}
          </p>
          {execution.unavailable.map((note) => (
            <MethodNote key={note}>{note}</MethodNote>
          ))}
        </div>
      )}
    </div>
  );
}

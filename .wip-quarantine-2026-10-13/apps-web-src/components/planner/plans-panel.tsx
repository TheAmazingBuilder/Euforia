"use client";

/**
 * PlansPanel — the plan list: status filter chips + plan cards. Each card
 * links into the editor (?plan=<id>). Data comes from the module queries;
 * instrument symbols and strategy names resolve through their catalogs.
 */

import * as React from "react";
import { ChevronRight, Clock3, Plus } from "lucide-react";
import type { Currency, TradePlan, TradePlanStatus } from "@cosmoz/shared";
import { formatMoney, formatNumber } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n-provider";
import { useInstruments, useAccounts, useStrategies, useTradePlans } from "@/lib/api/queries";
import { formatShortTimestamp } from "@/components/import/import-shared";
import {
  DirectionMark,
  PlanStatusBadge,
  ReadinessChip,
} from "./planner-shared";

const FILTERS: readonly (TradePlanStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "READY",
  "EXECUTED",
  "CANCELLED",
  "EXPIRED",
];

export function PlansPanel({ onOpenPlan, onNewPlan }: {
  onOpenPlan: (planId: string) => void;
  onNewPlan: () => void;
}) {
  const { dict } = useI18n();
  const L = dict.planner.list;
  const [filter, setFilter] = React.useState<TradePlanStatus | "ALL">("ALL");

  const plansQuery = useTradePlans();
  const instrumentsQuery = useInstruments();
  const strategiesQuery = useStrategies();
  const accountsQuery = useAccounts();
  const currency =
    (accountsQuery.data?.accounts.find((a) => a.isDefault) ?? accountsQuery.data?.accounts[0])
      ?.currency ?? "USD";

  if (plansQuery.isLoading || instrumentsQuery.isLoading) {
    return (
      <div className="space-y-3" data-testid="planner-list-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (plansQuery.isError) {
    return (
      <Card data-testid="planner-list-error">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-muted-foreground">{dict.planner.errors.LOAD_FAILED}</p>
          <Button variant="outline" size="sm" onClick={() => void plansQuery.refetch()}>
            {dict.common.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const plans = plansQuery.data?.plans ?? [];
  const symbolById = new Map(
    (instrumentsQuery.data?.instruments ?? []).map((i) => [i.id, i.symbol]),
  );
  const strategyById = new Map(
    (strategiesQuery.data?.strategies ?? []).map((s) => [s.id, s.name]),
  );

  const visible = filter === "ALL" ? plans : plans.filter((p) => p.status === filter);
  const countByStatus = (status: TradePlanStatus | "ALL") =>
    status === "ALL" ? plans.length : plans.filter((p) => p.status === status).length;

  return (
    <div className="space-y-4" data-testid="planner-plans-panel">
      {/* Status filter chips */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={dict.planner.filters.filterAria}
        data-testid="planner-filters"
      >
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
            data-testid={`planner-filter-${status.toLowerCase()}`}
            className={
              filter === status
                ? "inline-flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-xs font-semibold text-background"
                : "inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            }
          >
            {status === "ALL" ? dict.planner.filters.all : dict.planner.filters[status]}
            <span className="font-mono tabular-nums opacity-70">{countByStatus(status)}</span>
          </button>
        ))}
        <Button
          size="sm"
          className="ml-auto"
          onClick={onNewPlan}
          data-testid="planner-new-plan"
          aria-label={dict.planner.view.newCtaAria}
        >
          <Plus className="size-4" aria-hidden />
          {dict.planner.view.newCta}
        </Button>
      </div>

      {/* Empty states */}
      {plans.length === 0 ? (
        <Card data-testid="planner-empty">
          <CardContent className="flex flex-col items-start gap-3 p-8">
            <h2 className="font-heading text-lg font-semibold">{L.emptyTitle}</h2>
            <p className="max-w-xl text-sm text-muted-foreground">{L.emptyBody}</p>
            <Button size="sm" onClick={onNewPlan}>
              <Plus className="size-4" aria-hidden />
              {L.emptyCta}
            </Button>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card data-testid="planner-filtered-empty">
          <CardContent className="p-8">
            <p className="text-sm text-muted-foreground">{L.filteredEmpty}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="planner-plan-list">
          {visible.map((plan) => (
            <li key={plan.id}>
              <PlanCard
                plan={plan}
                symbol={symbolById.get(plan.instrumentId) ?? "—"}
                strategyName={
                  plan.strategyId ? (strategyById.get(plan.strategyId) ?? null) : null
                }
                currency={currency}
                onOpen={() => onOpenPlan(plan.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanCard({ plan, symbol, strategyName, currency, onOpen }: {
  plan: TradePlan;
  symbol: string;
  strategyName: string | null;
  currency: Currency;
  onOpen: () => void;
}) {
  const { dict } = useI18n();
  const L = dict.planner.list;
  return (
    <Card
      className="group h-full cursor-pointer transition-colors hover:border-accent/60"
      data-testid="planner-plan-card"
    >
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 flex-col gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          aria-label={`${L.openPlanAria}: ${symbol}`}
          data-testid="planner-plan-open"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-heading text-base font-semibold">{symbol}</span>
                <DirectionMark direction={plan.direction} />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {plan.timeframe}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {strategyName ?? dict.planner.editor.strategyNone}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <PlanStatusBadge status={plan.status} />
              <ReadinessChip readiness={plan.readiness} compact />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {dict.planner.editor.riskLabel}
              </p>
              <p className="font-mono text-sm font-semibold tabular-nums">
                {formatNumber(plan.riskPercent, 2)}%
              </p>
              <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-label={L.riskAria}>
                {plan.riskAmount === null ? "—" : formatMoney(plan.riskAmount, currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {dict.planner.editor.previewRR}
              </p>
              <p className="font-mono text-sm font-semibold tabular-nums" aria-label={L.rrAria}>
                {plan.riskRewardRatio === null ? "—" : `1 : ${formatNumber(plan.riskRewardRatio, 2)}`}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {dict.planner.editor.previewPositionSize}
              </p>
              <p className="font-mono text-sm font-semibold tabular-nums">
                {plan.positionSize ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1" aria-label={L.updatedAria}>
              <Clock3 className="size-3" aria-hidden />
              {formatShortTimestamp(plan.updatedAt)}
            </span>
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

export type { TradePlan };

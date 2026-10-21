"use client";

import * as React from "react";
import { Gauge } from "lucide-react";
import type { RulesStatusResponse } from "@cosmoz/shared";
import { formatNumber, parseDecimal } from "@cosmoz/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Caution threshold on the vertical gauge (% of the daily risk budget). */
const CAUTION_PCT = 70;

type BudgetLevel = "safe" | "caution" | "limit";

const LEVEL_FILL: Record<BudgetLevel, string> = {
  safe: "bg-accent",
  caution: "bg-warning",
  limit: "bg-loss",
};

const LEVEL_BADGE: Record<BudgetLevel, string> = {
  safe: "bg-accent/10 text-accent",
  caution: "bg-warning/10 text-warning",
  limit: "bg-loss/10 text-loss",
};

const LEVEL_LABEL: Record<BudgetLevel, string> = {
  safe: "Safe zone",
  caution: "Near limit",
  limit: "Limit reached",
};

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

/**
 * "Today's risk budget" — vertical gauge of the daily budget already
 * committed, from GET /rules/status. Warning color near the threshold,
 * loss color past the limit (discipline semantics, per design-tokens.md).
 */
export function RiskBudgetCard({ status }: { status: RulesStatusResponse }) {
  const spentPct = parseDecimal(status.riskBudgetSpentPct) ?? 0;
  const level: BudgetLevel =
    spentPct >= 100 ? "limit" : spentPct >= CAUTION_PCT ? "caution" : "safe";
  const dailyLossRule = status.limits.find((limit) => limit.type === "MAX_DAILY_LOSS_PCT");
  const tradesRule = status.limits.find((limit) => limit.type === "MAX_TRADES_PER_DAY");

  return (
    <Card className="bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Gauge className="size-4 text-accent" aria-hidden="true" />
          Today&apos;s risk budget
        </CardTitle>
        <CardDescription>Risk committed across today&apos;s entries.</CardDescription>
        <span
          className={cn(
            "mt-1 inline-flex w-fit items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-medium",
            LEVEL_BADGE[level],
          )}
          role="status"
        >
          {LEVEL_LABEL[level]}
        </span>
      </CardHeader>
      <CardContent>
        <div className="flex items-stretch gap-5">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Spent today</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {formatNumber(status.riskBudgetSpentPct, 1)}&nbsp;%
              </p>
            </div>
            <div className="space-y-1.5">
              <StatRow label="Trades today" value={String(status.tradesToday)} />
              <StatRow label="Losses today" value={String(status.lossesToday)} />
              {dailyLossRule ? (
                <StatRow
                  label="Daily loss limit"
                  value={`${formatNumber(dailyLossRule.current, 1)} / ${formatNumber(dailyLossRule.limit, 1)} %`}
                />
              ) : null}
              {tradesRule ? (
                <StatRow
                  label="Trade cap"
                  value={`${formatNumber(tradesRule.current, 0)} / ${formatNumber(tradesRule.limit, 0)}`}
                />
              ) : null}
            </div>
          </div>

          {/* Vertical gauge: spent (bottom fill) vs 100% limit (top tick). */}
          <div className="flex flex-col items-center">
            <div
              className="relative h-40 w-3 shrink-0 overflow-visible rounded-full bg-surface-raised"
              role="img"
              aria-label={`Risk budget: ${formatNumber(status.riskBudgetSpentPct, 1)} percent of the daily limit spent`}
            >
              <div
                className={cn("absolute inset-x-0 bottom-0 rounded-full", LEVEL_FILL[level])}
                style={{ height: `${Math.min(Math.max(spentPct, 0), 100)}%` }}
              />
              {/* Caution threshold tick */}
              <div
                className="absolute inset-x-[-4px] h-px bg-warning"
                style={{ bottom: `${CAUTION_PCT}%` }}
                aria-hidden="true"
              />
              {/* Limit tick (top) */}
              <div
                className="absolute inset-x-[-4px] top-0 h-px bg-loss"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex w-24 justify-between font-mono text-[9px] text-muted-foreground">
              <span>{CAUTION_PCT} %</span>
              <span>100 %</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

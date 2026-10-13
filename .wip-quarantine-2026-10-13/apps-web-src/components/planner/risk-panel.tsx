"use client";

/**
 * RiskPanel — the Risk & Money Management view (spec §22–§36). A
 * COMPOSITION of existing feeds, never a new math engine: the /planner/risk
 * aggregate (which itself reuses the rulesStatus methodology, Trade
 * riskAmount and the equity curve) + the live Rules Engine limits from
 * /rules/status. Planned vs actual risk stays visually separated.
 */

import * as React from "react";
import type { Currency, RiskExposureRow, RiskLimitState } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatSignedMoney } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n-provider";
import { useAccounts, usePlannerRisk, useRulesStatus } from "@/lib/api/queries";
import { DirectionMark } from "./planner-shared";

export function RiskPanel() {
  const { dict } = useI18n();
  const R = dict.planner.risk;
  const riskQuery = usePlannerRisk();
  const rulesStatusQuery = useRulesStatus();
  const accountsQuery = useAccounts();
  const currency =
    (accountsQuery.data?.accounts.find((a) => a.isDefault) ?? accountsQuery.data?.accounts[0])?.currency ?? "USD";

  if (riskQuery.isLoading) {
    return (
      <div className="space-y-3" data-testid="planner-risk-loading">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (riskQuery.isError || riskQuery.data === undefined) {
    return (
      <Card data-testid="planner-risk-error">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-muted-foreground">{R.loadFailedToast}</p>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm"
            onClick={() => void riskQuery.refetch()}
          >
            {dict.common.retry}
          </button>
        </CardContent>
      </Card>
    );
  }

  const data = riskQuery.data;
  const lossRatio = data.daily.lossLimitPct > 0 ? data.daily.realizedLossPct / data.daily.lossLimitPct : 0;

  return (
    <div className="space-y-4" data-testid="planner-risk-panel">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold">{R.title}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{R.subtitle}</p>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card data-testid="planner-risk-account">
          <CardHeader className="pb-2">
            <CardDescription>{R.cardAccount}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatMoney(data.account.balance, currency)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p className="flex justify-between">
              <span>{R.cardAccountStarting}</span>
              <span className="font-mono tabular-nums">{formatMoney(data.account.startingBalance, currency)}</span>
            </p>
            <p className="flex justify-between">
              <span>{R.cardAccountPeak}</span>
              <span className="font-mono tabular-nums">
                {data.account.equityPeak === null ? "—" : formatMoney(data.account.equityPeak, currency)}
              </span>
            </p>
            <p className="flex justify-between">
              <span>{R.cardDailyLimit}</span>
              <span className="font-mono tabular-nums">{formatNumber(data.preferences.dailyLossLimitPct, 2)}%</span>
            </p>
          </CardContent>
        </Card>

        <Card data-testid="planner-risk-daily">
          <CardHeader className="pb-2">
            <CardDescription>{R.cardDaily}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatNumber(data.daily.riskBudgetSpentPct, 2)}%
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs text-muted-foreground">
            <p className="flex justify-between">
              <span>{R.cardDailySpent}</span>
              <span className="font-mono tabular-nums">{formatNumber(data.daily.riskBudgetSpentPct, 2)}%</span>
            </p>
            <p className="flex justify-between">
              <span>{R.cardDailyRealized}</span>
              <span className="font-mono tabular-nums">
                {formatSignedMoney(data.daily.realizedPnl, currency)}
              </span>
            </p>
            <p className="flex justify-between">
              <span>{R.cardDailyTrades}</span>
              <span className="font-mono tabular-nums">{data.daily.tradesToday}</span>
            </p>
            <div className="pt-1">
              <LimitStateChip state={data.daily.state} ratio={lossRatio} testid="planner-risk-daily-state" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="planner-risk-open">
          <CardHeader className="pb-2">
            <CardDescription>{R.cardOpen}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatNumber(data.openRisk.totalRiskPct, 2)}%
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs text-muted-foreground">
            <p className="flex justify-between">
              <span>{countText(R.cardOpenCount, data.openRisk.count)}</span>
              <span className="font-mono tabular-nums">
                {formatMoney(data.openRisk.totalRiskAmount, currency)}
              </span>
            </p>
            <p className="pt-1 italic leading-snug">{R.actualBanner}</p>
          </CardContent>
        </Card>

        <Card data-testid="planner-risk-planned">
          <CardHeader className="pb-2">
            <CardDescription>{R.cardPlanned}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatNumber(data.plannedRisk.totalRiskPct, 2)}%
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs text-muted-foreground">
            <p className="flex justify-between">
              <span>{countText(R.cardPlannedCount, data.plannedRisk.count)}</span>
              <span className="font-mono tabular-nums">
                {formatMoney(data.plannedRisk.totalRiskAmount, currency)}
              </span>
            </p>
            <p className="pt-1 italic leading-snug">{R.plannedBanner}</p>
          </CardContent>
        </Card>
      </div>

      {/* Drawdown */}
      <Card data-testid="planner-risk-drawdown">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{R.cardDrawdown}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{R.drawdownCurrent}</p>
            <p
              className="font-mono text-lg font-semibold tabular-nums"
              data-testid="planner-risk-drawdown-current"
            >
              {data.drawdown.currentPct === null ? "—" : `${formatNumber(data.drawdown.currentPct, 2)}%`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{R.drawdownMax}</p>
            <p className="font-mono text-lg font-semibold tabular-nums">
              {data.drawdown.maxPct === null ? "—" : `${formatNumber(data.drawdown.maxPct, 2)}%`}
            </p>
          </div>
          <div className="col-span-2 flex items-center">
            <LimitStateChip state={data.drawdown.state} testid="planner-risk-drawdown-state" />
          </div>
        </CardContent>
      </Card>

      {/* Exposure tables */}
      <ExposureBlock
        title={R.cardOpen}
        rows={data.openRisk.rows}
        currency={currency}
        emptyText={R.emptyOpen}
        testidPrefix="planner-risk-open"
      />
      <ExposureBlock
        title={R.cardPlanned}
        rows={data.plannedRisk.rows}
        currency={currency}
        emptyText={R.emptyPlanned}
        testidPrefix="planner-risk-planned"
      />

      {/* Rules Engine limits */}
      <Card data-testid="planner-risk-limits">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{R.limitsTitle}</CardTitle>
          <CardDescription>{R.limitsSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {(rulesStatusQuery.data?.limits ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{dict.planner.list.filteredEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{R.limitsRule}</th>
                    <th className="py-2 pr-3 font-medium">{R.limitsLimit}</th>
                    <th className="py-2 pr-3 font-medium">{R.limitsCurrent}</th>
                    <th className="py-2 font-medium">{R.limitsState}</th>
                  </tr>
                </thead>
                <tbody>
                  {rulesStatusQuery.data!.limits.map((limit) => {
                    const hasCurrent = MEASURED_RULE_TYPES.has(limit.type);
                    const limitValue = Number(limit.limit);
                    const currentValue = Number(limit.current);
                    const ratio =
                      !hasCurrent || limitValue <= 0
                        ? null
                        : currentValue / limitValue;
                    return (
                      <tr key={limit.ruleId} className="border-b border-border/40 last:border-0" data-testid="planner-risk-limit-row">
                        <td className="py-2 pr-3">{ruleTypeLabel(dict, limit.type)}</td>
                        <td className="py-2 pr-3 font-mono tabular-nums">{formatNumber(limit.limit, 2)}</td>
                        <td className="py-2 pr-3 font-mono tabular-nums">
                          {hasCurrent ? formatNumber(limit.current, 2) : "—"}
                        </td>
                        <td className="py-2">
                          <LimitStateChip
                            state={ratio === null ? "DATA_UNAVAILABLE" : limitState(ratio)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Rule types whose "current" is actually measured by /rules/status. */
const MEASURED_RULE_TYPES = new Set([
  "MAX_TRADES_PER_DAY",
  "MAX_LOSSES_PER_DAY",
  "MAX_RISK_PCT_PER_TRADE",
]);

function ruleTypeLabel(dict: ReturnType<typeof useI18n>["dict"], type: string): string {
  const map = dict.planner.risk.ruleTypes as Record<string, string>;
  return map[type] ?? type;
}

function limitState(ratio: number): RiskLimitState {
  if (ratio >= 1) return "LIMIT_REACHED";
  if (ratio >= 0.7) return "WARNING";
  return "WITHIN_LIMIT";
}

function LimitStateChip({ state, ratio, testid }: { state: RiskLimitState; ratio?: number; testid?: string }) {
  const { dict } = useI18n();
  const R = dict.planner.risk;
  const label = R.states[state];
  const variant =
    state === "LIMIT_REACHED" ? "destructive" : state === "WARNING" ? "secondary" : "outline";
  return (
    <Badge variant={variant} data-testid={testid} data-state={state}>
      {label}
      {ratio !== undefined && state === "WARNING" ? ` — ${formatNumber(ratio * 100, 0)}%` : ""}
    </Badge>
  );
}

function countText(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function ExposureBlock({ title, rows, currency, emptyText, testidPrefix }: {
  title: string;
  rows: RiskExposureRow[];
  currency: Currency;
  emptyText: string;
  testidPrefix: string;
}) {
  const { dict } = useI18n();
  const R = dict.planner.risk;
  if (rows.length === 0) {
    return (
      <Card data-testid={`${testidPrefix}-block`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid={`${testidPrefix}-empty`}>
            {emptyText}
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card data-testid={`${testidPrefix}-block`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{R.tableSymbol}</th>
                <th className="py-2 pr-3 font-medium">{R.tableDirection}</th>
                <th className="py-2 pr-3 font-medium">{R.tableSource}</th>
                <th className="py-2 pr-3 font-medium">{R.tableRisk}</th>
                <th className="py-2 font-medium">{R.tableRiskPct}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/40 last:border-0" data-testid={`${testidPrefix}-row`}>
                  <td className="py-2 pr-3 font-medium">{row.symbol}</td>
                  <td className="py-2 pr-3">
                    <DirectionMark direction={row.direction} />
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{row.label ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">
                    {row.riskAmount === null ? "—" : formatMoney(row.riskAmount, currency)}
                  </td>
                  <td className="py-2 font-mono tabular-nums">
                    {row.riskPct === null ? "—" : `${formatNumber(row.riskPct, 2)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <ul className="space-y-2 md:hidden" data-testid={`${testidPrefix}-cards`}>
          {rows.map((row) => (
            <li key={row.id} className="rounded-md border border-border/60 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{row.symbol}</span>
                <DirectionMark direction={row.direction} />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{row.label ?? "—"}</span>
                <span className="font-mono tabular-nums">
                  {row.riskAmount === null ? "—" : formatMoney(row.riskAmount, currency)}
                  {row.riskPct === null ? "" : ` · ${formatNumber(row.riskPct, 2)}%`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

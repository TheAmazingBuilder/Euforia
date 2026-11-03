"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, FileCheck2, ListChecks, Plus, ScrollText, TrendingUp } from "lucide-react";
import type { PlaybookOverviewResponse, Strategy } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  healthFlagLabels,
  STATUS_DOT,
  statusLabels,
} from "@/components/playbook/playbook-labels";
import { formatSignedMoney } from "@cosmoz/shared";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Playbook Overview (§5): counts, recency, performance + adherence summary
 * and the quick actions. Everything comes from GET /playbook/overview - the
 * client renders, never recomputes.
 */

interface OverviewPanelProps {
  overview: PlaybookOverviewResponse | undefined;
  strategies: Strategy[];
  onOpenDetail: (strategy: Strategy) => void;
  onCreateStrategy: () => void;
  onGoTo: (tab: string) => void;
}

export function OverviewPanel({
  overview,
  strategies,
  onOpenDetail,
  onCreateStrategy,
  onGoTo,
}: OverviewPanelProps) {
  const { dict } = useI18n();
  const V = dict.playbook.overview;
  const FLAG_LABELS = healthFlagLabels(dict.playbook.labels.healthFlag);
  const STATUS = statusLabels(dict.playbook.labels.status);

  if (!overview) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label={V.loadingAria}>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl sm:col-span-2" />
      </div>
    );
  }

  const { counts, compliance, performanceSummary, recentlyUpdated, recentlyUsed, health } = overview;
  const strategiesWithFlags = health.filter((entry) => entry.flags.length > 0);
  // Flags that describe completeness debt (draft/archived status is a choice,
  // not debt - surface it separately and quieter).
  const attention = strategiesWithFlags.filter((entry) =>
    entry.flags.some((flag) => flag !== "DRAFT" && flag !== "ARCHIVED"),
  );
  const nameOf = (strategyId: string) =>
    recentlyUpdated.find((entry) => entry.strategyId === strategyId)?.name ??
    recentlyUsed.find((entry) => entry.strategyId === strategyId)?.name ??
    V.strategyFallback;

  return (
    <div className="space-y-4">
      {/* ── Quick actions (§5) ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onCreateStrategy}>
          <Plus className="size-3.5" aria-hidden="true" /> {V.createStrategy}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onGoTo("setups")}>
          <TrendingUp className="size-3.5" aria-hidden="true" /> {V.createSetup}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onGoTo("rules")}>
          <ScrollText className="size-3.5" aria-hidden="true" /> {V.createRule}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onGoTo("checklists")}>
          <ListChecks className="size-3.5" aria-hidden="true" /> {V.createChecklist}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onGoTo("strategies")}>
          <Copy className="size-3.5" aria-hidden="true" /> {V.duplicateStrategy}
        </Button>
      </div>

      {/* ── Counts (§5) ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountTile label={V.countTotalStrategies} value={counts.totalStrategies} testid="overview-total-strategies" />
        <CountTile label={V.countActive} value={counts.active} testid="overview-active-strategies" />
        <CountTile label={V.countDraft} value={counts.draft} testid="overview-draft-strategies" />
        <CountTile label={V.countArchived} value={counts.archived} testid="overview-archived-strategies" />
        <CountTile label={V.countSetups} value={counts.totalSetups} testid="overview-total-setups" />
        <CountTile label={V.countRules} value={counts.totalRules} testid="overview-total-rules" />
        <CountTile label={V.countChecklists} value={counts.totalChecklists} testid="overview-total-checklists" />
        <CountTile label={V.countPaused} value={counts.paused} testid="overview-paused-strategies" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Live compliance - % of recent trades matched to the playbook ──── */}
        <Card className="bg-surface" data-testid="compliance-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between font-heading text-base font-semibold">
              {V.complianceTitle}
              <Badge variant="outline" className="border-border px-1.5 py-0 font-mono text-[10px] text-muted-foreground">
                {V.windowA} {compliance.windowSize} {V.windowB}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {compliance.reviewed === 0 ? (
              <p className="text-sm text-muted-foreground">{V.complianceEmpty}</p>
            ) : (
              <>
                <div className="flex items-end gap-3">
                  <span
                    className={cn(
                      "font-mono text-4xl font-bold leading-none tabular-nums",
                      compliance.scorePct !== null && compliance.scorePct >= 80
                        ? "text-profit"
                        : compliance.scorePct !== null && compliance.scorePct >= 50
                          ? "text-warning"
                          : "text-loss",
                    )}
                    data-testid="compliance-score"
                  >
                    {compliance.scorePct === null ? "-" : `${compliance.scorePct.toFixed(0)}%`}
                  </span>
                  <span className="pb-1 text-xs text-muted-foreground">
                    {compliance.matched} {V.matchedOf} {compliance.reviewed} {V.reviewedTail}
                  </span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" data-testid="compliance-bar">
                  {[
                    { count: compliance.matched, className: "bg-profit" },
                    { count: compliance.partial, className: "bg-warning" },
                    { count: compliance.offPlaybook, className: "bg-loss" },
                  ].map((segment, index) =>
                    segment.count === 0 ? null : (
                      <span
                        key={index}
                        className={cn("h-full", segment.className)}
                        style={{ width: `${(segment.count / compliance.reviewed) * 100}%` }}
                      />
                    ),
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-profit" aria-hidden="true" /> {V.legendMatched} {compliance.matched}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-warning" aria-hidden="true" /> {V.legendPartial} {compliance.partial}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-loss" aria-hidden="true" /> {V.legendOff} {compliance.offPlaybook}
                  </span>
                  {compliance.unreviewed > 0 ? (
                    <span className="italic">{compliance.unreviewed} {V.notReviewedSuffix}</span>
                  ) : null}
                </div>
              </>
            )}
            <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
              {V.complianceNote}
            </p>
          </CardContent>
        </Card>

        {/* ── Performance summary (§5, §19 feeds from here) ─────────────────── */}
        <Card className="bg-surface">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base font-semibold">{V.performanceTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {performanceSummary.trades === 0 ? (
              <p className="text-sm text-muted-foreground">{V.performanceEmpty}</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{V.netPnlLabel}</span>
                  <span
                    className={`font-mono text-lg font-semibold tabular-nums ${
                      Number(performanceSummary.netPnl) >= 0 ? "text-profit" : "text-loss"
                    }`}
                    data-testid="overview-net-pnl"
                  >
                    {formatSignedMoney(performanceSummary.netPnl, performanceSummary.currency)}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <SummaryLine label={V.statClosedTrades} value={String(performanceSummary.trades)} />
                  <SummaryLine
                    label={V.statWinRate}
                    value={performanceSummary.winRate === null ? "-" : `${performanceSummary.winRate.toFixed(1)}%`}
                  />
                  <SummaryLine
                    label={V.statExpectancy}
                    value={performanceSummary.expectancyR === null ? "-" : Number(performanceSummary.expectancyR).toFixed(2)}
                  />
                  <SummaryLine
                    label={V.statPlanFollowed}
                    value={performanceSummary.followedPlanPct === null ? "-" : `${performanceSummary.followedPlanPct.toFixed(0)}%`}
                  />
                </dl>
              </>
            )}
            <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
              {V.perfNoteA}{" "}
              <Link href="/analytics" className="text-accent underline-offset-2 hover:underline">
                {V.analyticsLink}
              </Link>
              {V.perfNoteB}
            </p>
          </CardContent>
        </Card>

        {/* ── Completeness attention (§20) ───────────────────────────────────── */}
        <Card className="bg-surface">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base font-semibold">{V.completenessTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">{V.completenessEmpty}</p>
            ) : (
              attention.slice(0, 4).map((entry) => (
                <div key={entry.strategyId} className="rounded-md border border-border bg-surface-raised px-3 py-2">
                  <button
                    type="button"
                    className="text-sm font-medium text-foreground hover:text-accent"
                    onClick={() => {
                      const target = strategies.find((s) => s.id === entry.strategyId);
                      if (target) onOpenDetail(target);
                    }}
                  >
                    {nameOf(entry.strategyId)}
                  </button>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {entry.flags
                      .filter((flag) => flag !== "DRAFT" && flag !== "ARCHIVED")
                      .map((flag) => (
                        <Badge key={flag} variant="outline" className="border-warning/40 text-warning">
                          {FLAG_LABELS[flag]}
                        </Badge>
                      ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recency (§5) ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base font-semibold">{V.recentlyUpdatedTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {recentlyUpdated.length === 0 ? (
              <p className="text-sm text-muted-foreground">{V.noStrategyYet}</p>
            ) : (
              recentlyUpdated.map((entry) => (
                <div key={entry.strategyId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[entry.status]}`} aria-hidden="true" />
                    <span className="truncate text-foreground">{entry.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    v{entry.version} · {shortDate(entry.updatedAt)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base font-semibold">{V.recentlyUsedTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {recentlyUsed.length === 0 ? (
              <p className="text-sm text-muted-foreground">{V.recentlyUsedEmpty}</p>
            ) : (
              recentlyUsed.map((entry) => (
                <div key={entry.strategyId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color ?? "var(--muted-foreground)" }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-foreground">{entry.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {entry.tradesCount} {entry.tradesCount === 1 ? V.tradeOne : V.tradeMany} · {V.lastPrefix} {shortDate(entry.lastTradeAt)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <FileCheck2 className="size-3.5" aria-hidden="true" />
        {V.statusesPrefix} {STATUS.ACTIVE}, {STATUS.DRAFT}, {STATUS.PAUSED},{" "}
        {STATUS.RETIRED} {V.statusesSuffix}
      </p>
    </div>
  );
}

function CountTile({ label, value, testid }: { label: string; value: number; testid: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3" data-testid={testid}>
      <p className="font-mono text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function shortDate(iso: string | null): string {
  if (iso === null) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

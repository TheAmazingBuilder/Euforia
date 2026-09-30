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
  HEALTH_FLAG_LABELS,
  STATUS_DOT,
  STATUS_LABELS,
} from "@/components/playbook/playbook-labels";
import { formatSignedMoney } from "@cosmoz/shared";

/**
 * Playbook Overview (§5): counts, recency, performance + adherence summary
 * and the quick actions. Everything comes from GET /playbook/overview — the
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
  if (!overview) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading overview">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl sm:col-span-2" />
      </div>
    );
  }

  const { counts, performanceSummary, recentlyUpdated, recentlyUsed, health } = overview;
  const strategiesWithFlags = health.filter((entry) => entry.flags.length > 0);
  // Flags that describe completeness debt (draft/archived status is a choice,
  // not debt — surface it separately and quieter).
  const attention = strategiesWithFlags.filter((entry) =>
    entry.flags.some((flag) => flag !== "DRAFT" && flag !== "ARCHIVED"),
  );
  const nameOf = (strategyId: string) =>
    recentlyUpdated.find((entry) => entry.strategyId === strategyId)?.name ??
    recentlyUsed.find((entry) => entry.strategyId === strategyId)?.name ??
    "Strategy";

  return (
    <div className="space-y-4">
      {/* ── Quick actions (§5) ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onCreateStrategy}>
          <Plus className="size-3.5" aria-hidden="true" /> Create Strategy
        </Button>
        <Button size="sm" variant="outline" onClick={() => onGoTo("setups")}>
          <TrendingUp className="size-3.5" aria-hidden="true" /> Create Setup
        </Button>
        <Button size="sm" variant="outline" onClick={() => onGoTo("rules")}>
          <ScrollText className="size-3.5" aria-hidden="true" /> Create Rule
        </Button>
        <Button size="sm" variant="outline" onClick={() => onGoTo("checklists")}>
          <ListChecks className="size-3.5" aria-hidden="true" /> Create Checklist
        </Button>
        <Button size="sm" variant="outline" onClick={() => onGoTo("strategies")}>
          <Copy className="size-3.5" aria-hidden="true" /> Duplicate Strategy
        </Button>
      </div>

      {/* ── Counts (§5) ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountTile label="Total strategies" value={counts.totalStrategies} testid="overview-total-strategies" />
        <CountTile label="Active" value={counts.active} testid="overview-active-strategies" />
        <CountTile label="Draft" value={counts.draft} testid="overview-draft-strategies" />
        <CountTile label="Archived" value={counts.archived} testid="overview-archived-strategies" />
        <CountTile label="Setups" value={counts.totalSetups} testid="overview-total-setups" />
        <CountTile label="Operating rules" value={counts.totalRules} testid="overview-total-rules" />
        <CountTile label="Checklists" value={counts.totalChecklists} testid="overview-total-checklists" />
        <CountTile label="Paused" value={counts.paused} testid="overview-paused-strategies" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Performance summary (§5, §19 feeds from here) ─────────────────── */}
        <Card className="bg-surface">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base font-semibold">Performance summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {performanceSummary.trades === 0 ? (
              <p className="text-sm text-muted-foreground">
                No closed playbook trade yet — run the system first, the numbers will follow.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Net P&L (playbook trades)</span>
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
                  <SummaryLine label="Closed trades" value={String(performanceSummary.trades)} />
                  <SummaryLine
                    label="Win rate"
                    value={performanceSummary.winRate === null ? "—" : `${performanceSummary.winRate.toFixed(1)}%`}
                  />
                  <SummaryLine
                    label="Expectancy (R)"
                    value={performanceSummary.expectancyR === null ? "—" : Number(performanceSummary.expectancyR).toFixed(2)}
                  />
                  <SummaryLine
                    label="Plan followed"
                    value={performanceSummary.followedPlanPct === null ? "—" : `${performanceSummary.followedPlanPct.toFixed(0)}%`}
                  />
                </dl>
              </>
            )}
            <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
              Playbook trades only (a strategy was linked). Out-of-playbook trades live in{" "}
              <Link href="/analytics" className="text-accent underline-offset-2 hover:underline">
                Analytics
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        {/* ── Completeness attention (§20) ───────────────────────────────────── */}
        <Card className="bg-surface">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base font-semibold">Completeness to fix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every strategy is complete on the fundamentals: risk, entry conditions, invalidation,
                checklist. These are completeness indicators — never a performance judgment.
              </p>
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
                          {HEALTH_FLAG_LABELS[flag]}
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
            <CardTitle className="font-heading text-base font-semibold">Recently updated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {recentlyUpdated.length === 0 ? (
              <p className="text-sm text-muted-foreground">No strategy yet.</p>
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
            <CardTitle className="font-heading text-base font-semibold">Recently used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {recentlyUsed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No trade linked to a strategy yet — associate one at entry to build history.
              </p>
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
                    {entry.tradesCount} {entry.tradesCount === 1 ? "trade" : "trades"} · last {shortDate(entry.lastTradeAt)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <FileCheck2 className="size-3.5" aria-hidden="true" />
        Statuses on this page: {STATUS_LABELS.ACTIVE}, {STATUS_LABELS.DRAFT}, {STATUS_LABELS.PAUSED},{" "}
        {STATUS_LABELS.RETIRED} — lifecycle labels only, never profitability scores.
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
  if (iso === null) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

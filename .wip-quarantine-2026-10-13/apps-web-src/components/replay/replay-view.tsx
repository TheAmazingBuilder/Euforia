"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  FlaskConical,
  History,
  Play,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@cosmoz/shared";
import type { ReplaySession } from "@cosmoz/shared";
import {
  useReplayDeleteSession,
  useReplayOverview,
  useReplaySessions,
} from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Replay overview (REPLAY MASTER PROMPT §12/§13/§32) — the module landing:
 * hero, real-data metrics (never vanity), the session list with lifecycle
 * states, and the New Replay entry. Every performance figure on this page
 * comes from SIMULATED replay records — labeled, never mixed with the
 * live journal.
 */

const STATUS_TONE: Record<ReplaySession["status"], string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  IN_PROGRESS: "border-warning/40 bg-warning/10 text-warning",
  COMPLETED: "border-profit/40 bg-profit/10 text-profit",
  ARCHIVED: "border-border bg-muted/60 text-muted-foreground/70",
};

function utcClock(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(ms));
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3" data-testid="replay-metric">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums text-foreground" title={hint}>
        {value}
      </p>
    </div>
  );
}

export function ReplayView() {
  const { dict } = useI18n();
  const T = dict.replay;
  const overview = useReplayOverview();
  const sessions = useReplaySessions();
  const remove = useReplayDeleteSession();
  const [pendingDelete, setPendingDelete] = React.useState<ReplaySession | null>(null);


  const resumable = sessions.data?.sessions.find(
    (session) => session.status === "IN_PROGRESS" || session.status === "DRAFT",
  );

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8" data-testid="replay-hero">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--chart-1)]/10 via-transparent to-[var(--chart-3)]/10" aria-hidden="true" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-3 gap-1.5 border-accent/40 bg-accent/10 text-accent">
              <FlaskConical className="size-3" aria-hidden="true" />
              {T.workspace.simulatedBadge}
            </Badge>
            <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {T.overview.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{T.overview.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {resumable ? (
              <Button asChild variant="outline" data-testid="replay-continue">
                <Link href={`/replay/${resumable.id}`}>
                  <Play className="size-4" aria-hidden="true" />
                  {T.overview.continueReplay}
                </Link>
              </Button>
            ) : null}
            <Button asChild data-testid="replay-new-cta">
              <Link href="/replay/new">
                <Plus className="size-4" aria-hidden="true" />
                {T.overview.newReplay}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Metrics — only from real replay records (§13) */}
      <section aria-label={T.overview.metricsLabel}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {overview.isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-[74px] rounded-xl" />
            ))
          ) : (
            <>
              <MetricCard label={T.overview.total} value={String(overview.data?.total ?? 0)} />
              <MetricCard label={T.overview.completed} value={String(overview.data?.completed ?? 0)} />
              <MetricCard label={T.overview.inProgress} value={String(overview.data?.inProgress ?? 0)} />
              <MetricCard label={T.overview.simulatedTrades} value={String(overview.data?.simulatedTrades ?? 0)} />
              <MetricCard
                label={T.overview.avgWinRate}
                value={overview.data?.avgWinRatePct != null ? `${overview.data.avgWinRatePct.toFixed(0)}%` : "—"}
              />
              <MetricCard
                label={T.overview.bestReplay}
                hint={T.overview.bestPnlHint}
                value={
                  overview.data?.bestSessionNetPnl != null
                    ? formatMoney(overview.data.bestSessionNetPnl, "USD")
                    : "—"
                }
              />
            </>
          )}
        </div>
      </section>

      {/* Sessions */}
      <section aria-label={T.list.title} data-testid="replay-list">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
            <History className="size-4 text-muted-foreground" aria-hidden="true" />
            {T.list.title}
          </h3>
        </header>

        {sessions.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (sessions.data?.sessions.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {T.list.empty}
          </p>
        ) : (
          <ul className="space-y-2">
            {sessions.data!.sessions.map((session) => {
              const best = overview.data?.bestSessionId === session.id;
              return (
                <li
                  key={session.id}
                  data-testid="replay-card"
                  className={cn(
                    "group relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-surface p-3 transition-colors hover:border-accent/40",
                    best ? "border-accent/40" : "border-border",
                  )}
                >
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                      STATUS_TONE[session.status],
                    )}
                    data-testid="replay-card-status"
                  >
                    {T.status[session.status]}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-heading text-sm font-semibold text-foreground">
                      {session.config.symbol} · {session.config.interval}
                      {best ? <Trophy className="size-3.5 text-accent" aria-hidden="true" /> : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {T.list.windowLabel} {utcClock(session.config.fromMs)} → {utcClock(session.config.toMs)} UTC ·{" "}
                      {session.counts.trades} {T.list.tradesCount} · {session.counts.decisions} {T.list.decisionsCount}
                      {session.lastPlayedAt
                        ? ` · ${T.list.lastPlayed} ${new Date(session.lastPlayedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        : ""}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    {session.result?.netPnl != null ? (
                      <span
                        className={cn(
                          "font-mono text-sm font-semibold tabular-nums",
                          session.result.netPnl >= 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {formatMoney(session.result.netPnl, "USD")}
                      </span>
                    ) : null}
                    <Button asChild variant="outline" size="sm" data-testid={`replay-open-${session.id}`}>
                      <Link href={`/replay/${session.id}`}>
                        {session.status === "IN_PROGRESS" ? T.list.resume : T.list.open}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                    <button
                      type="button"
                      aria-label={`${T.list.delete} — ${session.config.symbol}`}
                      data-testid={`replay-delete-${session.id}`}
                      onClick={() => setPendingDelete(session)}
                      className="hidden rounded p-1.5 text-muted-foreground/60 transition-colors hover:bg-loss/10 hover:text-loss group-hover:block"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Delete confirmation */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="max-w-md" data-testid="replay-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{T.list.deleteConfirmTitle}</DialogTitle>
            <DialogDescription>{T.list.deleteConfirmBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {dict.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              data-testid="replay-delete-confirm"
              onClick={() => {
                if (!pendingDelete) return;
                remove.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
              }}
            >
              {remove.isPending ? dict.common.saving : T.list.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

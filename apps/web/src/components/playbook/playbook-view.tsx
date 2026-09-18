"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, RefreshCcw, Stars } from "lucide-react";
import type { Strategy } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UnderperformingBanner } from "@/components/playbook/underperforming-banner";
import { StrategyCard } from "@/components/playbook/strategy-card";
import { StrategyDetailDialog } from "@/components/playbook/strategy-detail-dialog";
import { StrategyFormDialog } from "@/components/playbook/strategy-form-dialog";
import {
  useStrategies,
  useStrategiesStats,
} from "@/lib/api/queries";

/**
 * Playbook screen (Phase 8): the trader's documented setups with live
 * per-strategy stats, the computed decay banner, and full strategy CRUD.
 * Stats come from GET /strategies/stats — server-computed aggregates, the
 * client only renders them.
 */

function PlaybookSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading playbook">
      <Skeleton className="h-10 w-64 rounded-md" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    </div>
  );
}

function ErrorPlaybook({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">Playbook unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your strategies could not be loaded. Check your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function PlaybookView() {
  const strategiesQuery = useStrategies();
  const statsQuery = useStrategiesStats();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Strategy | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<Strategy | null>(null);

  const isLoading = strategiesQuery.isLoading || statsQuery.isLoading;
  const isError = strategiesQuery.isError || statsQuery.isError;
  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  const strategies = strategiesQuery.data?.strategies ?? [];
  const statsById = new Map(
    (statsQuery.data?.stats ?? []).map((stat) => [stat.strategyId, stat]),
  );

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };
  const openEdit = (strategy: Strategy) => {
    setDetailTarget(null);
    setEditTarget(strategy);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Playbook</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your documented setups — trade them as written, or change the page, never the moment.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          New Strategy
        </Button>
      </header>

      {isLoading ? (
        <PlaybookSkeleton />
      ) : isError ? (
        <ErrorPlaybook onRetry={retry} />
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {statsQuery.data ? (
            <UnderperformingBanner underperforming={statsQuery.data.underperforming} />
          ) : null}

          {strategies.length === 0 ? (
            <Card className="bg-surface">
              <CardContent className="flex flex-col items-center py-14 text-center">
                <BookOpen className="size-8 text-muted-foreground" aria-hidden="true" />
                <h2 className="mt-4 font-heading text-lg font-semibold">Your playbook is empty</h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Write down the setups you actually trade: entry, exit and risk rules. The coach
                  grades your executions against them.
                </p>
                <Button className="mt-6" onClick={openCreate}>
                  <Plus className="size-4" aria-hidden="true" />
                  New Strategy
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {strategies.map((strategy) => (
                <StrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  stat={statsById.get(strategy.id)}
                  onOpen={setDetailTarget}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <StrategyDetailDialog
        strategy={detailTarget}
        stat={detailTarget !== null ? statsById.get(detailTarget.id) : undefined}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
        onEdit={openEdit}
      />
      <StrategyFormDialog
        key={editTarget?.id ?? "create"}
        open={formOpen}
        onOpenChange={setFormOpen}
        strategy={editTarget}
      />
    </div>
  );
}

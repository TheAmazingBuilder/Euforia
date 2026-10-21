"use client";

import * as React from "react";
import { BookOpen, Copy, Search } from "lucide-react";
import type { Strategy, StrategyStat, StrategyStatus } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StrategyCard } from "@/components/playbook/strategy-card";
import { DuplicateStrategyDialog } from "@/components/playbook/duplicate-strategy-dialog";
import {
  ChipToggle,
  healthFlagLabels,
  statusLabels,
} from "@/components/playbook/playbook-labels";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * My Strategies (§6 + §20 + §25): the strategy grid with search/status
 * filtering, per-strategy completeness health flags and the duplicate quick
 * action. Opening a card still opens the rich detail dialog.
 */

/** Status filter machine ids — labels resolve through dict.playbook.labels.status. */
const STATUS_FILTER_IDS = ["ALL", "ACTIVE", "DRAFT", "PAUSED", "RETIRED"] as const;

interface StrategiesPanelProps {
  strategies: Strategy[];
  statsById: Map<string, StrategyStat>;
  healthById: Map<string, import("@cosmoz/shared").StrategyHealthFlag[]>;
  isLoading: boolean;
  onOpenDetail: (strategy: Strategy) => void;
}

export function StrategiesPanel({ strategies, statsById, healthById, isLoading, onOpenDetail }: StrategiesPanelProps) {
  const { dict } = useI18n();
  const V = dict.playbook.strategies;
  const STATUS = statusLabels(dict.playbook.labels.status);
  const FLAG_LABELS = healthFlagLabels(dict.playbook.labels.healthFlag);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | StrategyStatus>("ALL");
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return strategies.filter((strategy) => {
      if (statusFilter !== "ALL" && strategy.status !== statusFilter) return false;
      if (needle === "") return true;
      const haystack = [strategy.name, strategy.description ?? "", ...(strategy.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [strategies, query, statusFilter]);

  const duplicateFirst = strategies[0];
  const anyStrategy = duplicateFirst !== undefined;

  return (
    <div className="space-y-4">
      {/* ── Toolbar (§25 search + filter) ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={V.searchPlaceholder}
            aria-label={V.searchAria}
            className="h-9 w-64 pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTER_IDS.map((filter) => (
            <ChipToggle
              key={filter}
              selected={statusFilter === filter}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === "ALL" ? V.allFilter : STATUS[filter]}
            </ChipToggle>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={!anyStrategy}
          onClick={() => setDuplicateOpen(true)}
          data-testid="strategies-duplicate"
        >
          <Copy className="size-3.5" aria-hidden="true" /> {V.duplicate}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={V.loadingAria}>
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-surface">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-4 font-heading text-lg font-semibold">
              {strategies.length === 0 ? V.emptyTitle : V.noMatchTitle}
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {strategies.length === 0 ? V.emptyBody : V.noMatchBody}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((strategy) => {
            const flags = healthById.get(strategy.id) ?? [];
            const actionable = flags.filter((flag) => flag !== "DRAFT" && flag !== "ARCHIVED");
            return (
              <div key={strategy.id} className="space-y-1.5" data-strategy-id={strategy.id}>
                <StrategyCard
                  strategy={strategy}
                  stat={statsById.get(strategy.id)}
                  onOpen={onOpenDetail}
                />
                {actionable.length > 0 ? (
                  <div className="flex flex-wrap gap-1 px-0.5">
                    {actionable.map((flag) => (
                      <Badge
                        key={flag}
                        variant="outline"
                        className="border-warning/40 px-1.5 py-0 text-[10px] text-warning"
                      >
                        {FLAG_LABELS[flag]}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <DuplicateStrategyDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        strategies={strategies}
      />
    </div>
  );
}

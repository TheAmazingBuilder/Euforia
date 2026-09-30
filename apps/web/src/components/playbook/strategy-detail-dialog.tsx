"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Pencil, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/playbook/markdown";
import { GradeBadge } from "@/components/playbook/strategy-card";
import { StrategyVersionsDialog } from "@/components/playbook/strategy-versions-dialog";
import { formatPercent, formatR, type Strategy, type StrategyStat } from "@cosmoz/shared";
import { apiErrorMessage } from "@/lib/api/client";

import { useDeleteStrategy } from "@/lib/api/queries";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { cn } from "@/lib/utils";

/**
 * Strategy detail dialog (Phase 8): the playbook rules RENDERED, the live
 * stats row and the "Trade this setup" primary action — which opens the
 * capture modal pre-filled with this strategy (the instrument stays with
 * the user).
 */

interface StrategyDetailDialogProps {
  strategy: Strategy | null;
  stat: StrategyStat | undefined;
  onOpenChange: (open: boolean) => void;
  onEdit: (strategy: Strategy) => void;
}

function RuleSection({ title, source }: { title: string; source: string | null }) {
  return (
    <section>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <Markdown source={source} />
    </section>
  );
}

export function StrategyDetailDialog({ strategy, stat, onOpenChange, onEdit }: StrategyDetailDialogProps) {
  const deleteStrategy = useDeleteStrategy();
  const router = useRouter();
  const [versionsOpen, setVersionsOpen] = React.useState(false);

  if (strategy === null) return null;

  const avgR = stat ? Number(stat.avgR) : null;

  const tradeThisSetup = () => {
    onOpenChange(false);
    openTradeModal({
      // The instrument stays the user's choice — only the playbook context
      // is pre-filled (Phase 8 brief).
      instrumentId: null,
      direction: "BUY",
      strategyId: strategy.id,
      outOfPlaybook: false,
      emotionBefore: null,
      entryAtISO: new Date().toISOString(),
    });
  };

  const remove = async () => {
    try {
      await deleteStrategy.mutateAsync(strategy.id);
      toast.success("Strategy deleted", { description: strategy.name });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error("Could not delete the strategy", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <Dialog open={strategy !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <GradeBadge grade={strategy.grade} />
            <DialogTitle className="min-w-0 font-heading text-lg font-semibold">
              {strategy.name}
            </DialogTitle>
          </div>
          <DialogDescription className="whitespace-pre-line">
            {strategy.description ?? "No description yet."}
          </DialogDescription>
        </DialogHeader>

        {stat !== undefined ? (
          <div className="grid grid-cols-4 gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-xs tabular-nums">
            <div>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Trades</span>
              <span className="text-foreground">{String(stat.trades)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Win rate</span>
              <span className="text-foreground">{formatPercent(stat.winRate, 0)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Avg R</span>
              <span className={cn(avgR !== null && avgR < 0 ? "text-loss" : "text-profit")}>
                {formatR(stat.avgR)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Last 20</span>
              <span className={cn(Number(stat.last20Expectancy) < 0 ? "text-loss" : "text-profit")}>
                {formatR(stat.last20Expectancy)}
              </span>
            </div>
          </div>
        ) : null}

        <Separator />

        <div className="space-y-4">
          <RuleSection title="Entry rules" source={strategy.entryRules} />
          <RuleSection title="Exit rules" source={strategy.exitRules} />
          <RuleSection title="Risk rules" source={strategy.riskRules} />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-loss"
            onClick={() => void remove()}
            disabled={deleteStrategy.isPending}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setVersionsOpen(true)}
              data-testid="strategy-versions-open"
            >
              <History className="size-3.5" aria-hidden="true" />
              Version history
            </Button>
            <Button variant="outline" onClick={() => onEdit(strategy)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
            <Button onClick={tradeThisSetup}>
              <Play className="size-4" aria-hidden="true" />
              Trade this setup
            </Button>
          </div>
        </DialogFooter>

        <StrategyVersionsDialog
          strategy={strategy}
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
        />
      </DialogContent>
    </Dialog>
  );
}

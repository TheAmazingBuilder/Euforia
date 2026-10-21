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
import { NofyLinkedNotesSection } from "@/components/nofy/nofy-linked-notes";
import { formatPercent, formatR, type Strategy, type StrategyStat } from "@cosmoz/shared";
import { apiErrorMessage } from "@/lib/api/client";

import { useCreateNofyNote, useDeleteStrategy } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
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
  const { dict } = useI18n();
  const V = dict.playbook.detail;
  const S = dict.playbook.shared;
  const deleteStrategy = useDeleteStrategy();
  const router = useRouter();
  const [versionsOpen, setVersionsOpen] = React.useState(false);

  // Nofy integration — the strategy side of the knowledge loop: take notes
  // that stay linked to this strategy, and see every note that already is.
  const createNofyNote = useCreateNofyNote({
    onCreated: (note) => {
      onOpenChange(false);
      toast.success(S.nofyToast, {
        description: `${S.nofyLinkedA}${strategy?.name ?? S.strategyFallback}${S.nofyLinkedB}`,
      });
      router.push(`/nofy?tab=notes&note=${note.id}`);
    },
  });

  const takeNofyNotes = () => {
    if (!strategy) return;
    createNofyNote.mutate({
      title: `${strategy.name}${V.noteTitleSuffix}`,
      blocks: [
        { id: `nb-${Math.random().toString(36).slice(2, 10)}`, type: "ref", text: "", ref: { kind: "STRATEGY", id: strategy.id } },
        { id: `nb-${Math.random().toString(36).slice(2, 10)}`, type: "paragraph", text: "" },
      ],
    });
  };

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
      toast.success(V.toastDeleted, { description: strategy.name });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(V.toastDeleteFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
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
            {strategy.description ?? V.noDescription}
          </DialogDescription>
        </DialogHeader>

        {stat !== undefined ? (
          <div className="grid grid-cols-4 gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-xs tabular-nums">
            <div>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{V.statTrades}</span>
              <span className="text-foreground">{String(stat.trades)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{V.statWinRate}</span>
              <span className="text-foreground">{formatPercent(stat.winRate, 0)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{V.statAvgR}</span>
              <span className={cn(avgR !== null && avgR < 0 ? "text-loss" : "text-profit")}>
                {formatR(stat.avgR)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{V.statLast20}</span>
              <span className={cn(Number(stat.last20Expectancy) < 0 ? "text-loss" : "text-profit")}>
                {formatR(stat.last20Expectancy)}
              </span>
            </div>
          </div>
        ) : null}

        <Separator />

        <div className="space-y-4">
          <RuleSection title={V.entryRulesTitle} source={strategy.entryRules} />
          <RuleSection title={V.exitRulesTitle} source={strategy.exitRules} />
          <RuleSection title={V.riskRulesTitle} source={strategy.riskRules} />
        </div>

        <NofyLinkedNotesSection
          kind="STRATEGY"
          id={strategy.id}
          onCreateNote={takeNofyNotes}
          creating={createNofyNote.isPending}
          testidPrefix="strategy"
        />

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-loss"
            onClick={() => void remove()}
            disabled={deleteStrategy.isPending}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {V.deleteBtn}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setVersionsOpen(true)}
              data-testid="strategy-versions-open"
            >
              <History className="size-3.5" aria-hidden="true" />
              {V.versionsBtn}
            </Button>
            <Button variant="outline" onClick={() => onEdit(strategy)}>
              <Pencil className="size-4" aria-hidden="true" />
              {V.editBtn}
            </Button>
            <Button onClick={tradeThisSetup}>
              <Play className="size-4" aria-hidden="true" />
              {V.tradeBtn}
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

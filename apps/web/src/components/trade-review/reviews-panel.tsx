"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDashed, Pencil, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import type { ReviewRow } from "@cosmoz/shared";
import { formatR, formatSignedMoney } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api/client";
import { useDeleteReview, useReviews } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { GradeBadge, PLAYBOOK_MATCH_META } from "@/components/trade-review/trade-review-shared";
import { ReviewDialog } from "@/components/trade-review/review-dialog";

/**
 * Reviews tab — the queue first: every closed trade without a review waits
 * in "Awaiting review" (newest first), graded trades sit in "Reviewed" with
 * their execution verdict and lesson. The dialog does the workflow.
 */

function DirectionIcon({ direction }: { direction: "BUY" | "SELL" }) {
  return direction === "BUY" ? (
    <ArrowUpRight className="size-3.5 text-profit" aria-hidden="true" />
  ) : (
    <ArrowDownRight className="size-3.5 text-loss" aria-hidden="true" />
  );
}

function ReviewRowItem({ row, onReview, onUndo }: { row: ReviewRow; onReview: (row: ReviewRow) => void; onUndo: (row: ReviewRow) => void }) {
  const isWin = (row.pnlNet ?? 0) > 0;
  const isPending = row.reviewStatus === "PENDING";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors sm:flex-nowrap",
        isPending ? "border-dashed bg-muted/30 hover:bg-muted/50" : "bg-card hover:bg-muted/40",
      )}
      data-testid="review-row"
      data-review-status={row.reviewStatus}
    >
      <span className="flex w-24 shrink-0 items-center gap-1.5">
        {isPending ? (
          <CircleDashed className="size-4 text-amber-500" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
        )}
        <span className="font-mono text-sm font-semibold">{row.symbol}</span>
      </span>

      <span className="hidden w-16 shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground sm:flex">
        <DirectionIcon direction={row.direction} />
        {row.tradingDate.slice(5)}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        <GradeBadge grade={row.executionGrade} />
        {!isPending && row.playbookMatch && (
          <Badge variant="outline" className={cn("hidden text-[10px] md:inline-flex", PLAYBOOK_MATCH_META[row.playbookMatch].className)}>
            {PLAYBOOK_MATCH_META[row.playbookMatch].label}
          </Badge>
        )}
        {isPending && row.decisionGrade && (
          <Badge variant="outline" className="hidden text-[10px] text-muted-foreground md:inline-flex">
            decision {row.decisionGrade}
          </Badge>
        )}
      </span>

      {row.lesson && (
        <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground lg:block" title={row.lesson}>
          {row.lesson}
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-3">
        <span className={cn("font-mono text-sm font-semibold", isWin ? "text-profit" : "text-loss")}>
          {formatR(row.rMultiple)}
        </span>
        <span className="hidden w-20 text-right font-mono text-xs text-muted-foreground sm:block">
          {formatSignedMoney(row.pnlNet, row.currency)}
        </span>
        {isPending ? (
          <Button size="sm" variant="outline" className="h-7 gap-1 border-violet-500/40 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300" onClick={() => onReview(row)} data-testid="review-open">
            Review
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => onReview(row)} data-testid="review-edit">
            <Pencil className="size-3" aria-hidden="true" />
            Edit
          </Button>
        )}
        {!isPending && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-loss"
            onClick={() => onUndo(row)}
            aria-label="Undo review"
            title="Undo review - the trade returns to the queue"
          >
            <RefreshCcw className="size-3" aria-hidden="true" />
          </Button>
        )}
      </span>
    </div>
  );
}

export function ReviewsPanel() {
  const reviewsQuery = useReviews();
  const deleteReview = useDeleteReview();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogRow, setDialogRow] = React.useState<ReviewRow | null>(null);

  const rows = reviewsQuery.data?.reviews ?? [];
  const pending = rows.filter((row) => row.reviewStatus === "PENDING");
  const reviewed = rows.filter((row) => row.reviewStatus === "REVIEWED");

  const openReview = (row: ReviewRow) => {
    setDialogRow(row);
    setDialogOpen(true);
  };

  const undoReview = (row: ReviewRow) => {
    deleteReview.mutate(row.tradeId, {
      onSuccess: () => toast.success("Review undone", { description: `${row.symbol} is back in the queue.` }),
      onError: (error) => toast.error("Could not undo the review", { description: apiErrorMessage(error, "Unexpected error - try again.") }),
    });
  };

  if (reviewsQuery.isLoading) {
    return (
      <div className="space-y-2" data-testid="reviews-panel">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="reviews-panel">
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          Awaiting review
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 font-mono text-amber-500" data-testid="pending-count">
            {pending.length}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          Closed trades still waiting for their verdict. Grade the execution while the chart is still fresh.
        </p>
        {pending.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
              Queue clear - every closed trade has been reviewed.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {pending.map((row) => (
              <ReviewRowItem key={row.tradeId} row={row} onReview={openReview} onUndo={undoReview} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          Reviewed
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 font-mono text-emerald-500" data-testid="reviewed-count">
            {reviewed.length}
          </Badge>
        </h2>
        {reviewed.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing reviewed yet - the first verdict is one click away.</p>
        ) : (
          <div className="space-y-2">
            {reviewed.map((row) => (
              <ReviewRowItem key={row.tradeId} row={row} onReview={openReview} onUndo={undoReview} />
            ))}
          </div>
        )}
      </section>

      <ReviewDialog row={dialogRow} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

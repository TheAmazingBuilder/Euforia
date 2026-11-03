"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, History, NotebookPen, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { Grade, NofyBlockInput, PlaybookMatch, ReviewRow } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NofyLinkedNotesSection } from "@/components/nofy/nofy-linked-notes";
import { useCreateNofyNote, useReviewOverview, useUpsertReview } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { GRADE_STYLES, PLAYBOOK_MATCH_META } from "@/components/trade-review/trade-review-shared";

/**
 * The review workflow dialog - grade execution against the playbook, score
 * entry/exit/risk quality, tick the frozen checklist and capture THE lesson.
 * One review per trade (upsert): the same dialog edits an existing review.
 */

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];
const MATCHES: PlaybookMatch[] = ["MATCHED", "PARTIAL", "OFF_PLAYBOOK"];
const QUALITY_STEPS = [1, 2, 3, 4, 5] as const;

interface ReviewDialogProps {
  row: ReviewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewDialog({ row, open, onOpenChange }: ReviewDialogProps) {
  const upsert = useUpsertReview();
  const router = useRouter();
  // The overview is already cached by the module - the recurring-lesson
  // template comes from it (shared query key, no extra round-trip).
  const { data: overviewData } = useReviewOverview();
  const lastImprovementNote = overviewData?.lastImprovementNote ?? null;

  // Nofy integration - the trade side of the knowledge loop: the review's
  // lesson becomes the seed of a note that stays linked to this trade.
  const createNofyNote = useCreateNofyNote({
    onCreated: (note) => {
      onOpenChange(false);
      toast.success("Note created in Nofy.", { description: `Linked to ${row?.symbol ?? "trade"}.` });
      router.push(`/nofy?tab=notes&note=${note.id}`);
    },
  });

  const [executionGrade, setExecutionGrade] = React.useState<Grade>("B");
  const [playbookMatch, setPlaybookMatch] = React.useState<PlaybookMatch>("MATCHED");
  const [followedPlan, setFollowedPlan] = React.useState(true);
  const [checklist, setChecklist] = React.useState<Array<{ label: string; passed: boolean }>>([]);
  const [entryQuality, setEntryQuality] = React.useState(3);
  const [exitQuality, setExitQuality] = React.useState(3);
  const [riskManagement, setRiskManagement] = React.useState(3);
  const [lessons, setLessons] = React.useState("");
  const [improvementNote, setImprovementNote] = React.useState("");

  // Re-hydrate whenever the dialog opens (or the row swaps - the caller also
  // remounts by key). Guarded render-time adjustment per the React docs
  // "You might not need an effect" pattern.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && row) {
      setExecutionGrade(row.executionGrade ?? "B");
      setPlaybookMatch(row.playbookMatch ?? "MATCHED");
      setFollowedPlan(row.followedPlan ?? true);
      setChecklist((row.checklistResults ?? []).map((item) => ({ ...item })));
      setEntryQuality(row.entryQuality ?? 3);
      setExitQuality(row.exitQuality ?? 3);
      setRiskManagement(row.riskManagement ?? 3);
      setLessons(row.lesson ?? "");
      setImprovementNote(row.improvementNote ?? "");
    }
  }

  const takeNofyNotes = () => {
    if (!row) return;
    const blockId = () => `nb-${Math.random().toString(36).slice(2, 10)}`;
    const blocks: NofyBlockInput[] = [
      { id: blockId(), type: "ref", text: "", ref: { kind: "TRADE", id: row.tradeId } },
      { id: blockId(), type: "paragraph", text: "" },
    ];
    if (lessons.trim() !== "") {
      blocks.push({ id: blockId(), type: "h3", text: "The lesson" });
      blocks.push({ id: blockId(), type: "paragraph", text: lessons.trim() });
    }
    if (improvementNote.trim() !== "") {
      blocks.push({ id: blockId(), type: "todo", text: improvementNote.trim(), checked: false });
    }
    createNofyNote.mutate({ title: `${row.symbol} ${row.tradingDate} - review notes`, blocks });
  };

  if (!row) return null;

  const isWin = (row.pnlNet ?? 0) > 0;

  const submit = () => {
    if (lessons.trim().length < 3) {
      toast.error("Capture the lesson first", {
        description: "The review exists for the lesson - one sentence is enough.",
      });
      return;
    }
    upsert.mutate(
      {
        tradeId: row.tradeId,
        executionGrade,
        followedPlan,
        playbookMatch,
        checklistResults: checklist.length > 0 ? checklist : null,
        entryQuality,
        exitQuality,
        riskManagement,
        lessons: lessons.trim(),
        improvementNote: improvementNote.trim() ? improvementNote.trim() : null,
      },
      {
        onSuccess: () => {
          toast.success(row.reviewStatus === "PENDING" ? "Trade reviewed" : "Review updated", {
            description: `${row.symbol} - execution graded ${executionGrade}.`,
          });
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("Could not save the review", { description: error.message });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="review-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="size-5 text-muted-foreground" aria-hidden="true" />
            {row.reviewStatus === "PENDING" ? "Review trade" : "Edit review"} - {row.symbol}
          </DialogTitle>
          <DialogDescription>
            {row.tradingDate} · {row.direction} · {row.strategyName ?? "Off playbook"}
            {row.setupName ? ` · ${row.setupName}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Verdict strip - the result stays visible while judging execution */}
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3" data-testid="review-verdict">
          <div>
            <p className="text-xs text-muted-foreground">Result (revealed)</p>
            <p className={cn("font-mono text-lg font-bold", isWin ? "text-profit" : "text-loss")} data-testid="review-r">
              {formatR(row.rMultiple)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Decision grade (pre-reveal)</p>
            <p className="font-mono text-sm font-semibold">{row.decisionGrade ?? "-"}</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Execution grade */}
          <div>
            <Label className="text-sm font-medium">Execution grade</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Your post-trade verdict - did the execution deserve the result?
            </p>
            <div className="flex gap-2" data-testid="execution-grade-picker">
              {GRADES.map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => setExecutionGrade(grade)}
                  aria-pressed={executionGrade === grade}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg border font-mono text-sm font-bold transition-all",
                    "hover:scale-105 hover:shadow-md",
                    GRADE_STYLES[grade],
                    executionGrade !== grade && "opacity-40",
                    executionGrade === grade && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>

          {/* Playbook match + followed plan */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-sm font-medium">Playbook match</Label>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border p-1" data-testid="playbook-match-picker">
                {MATCHES.map((match) => (
                  <button
                    key={match}
                    type="button"
                    onClick={() => setPlaybookMatch(match)}
                    aria-pressed={playbookMatch === match}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      playbookMatch === match
                        ? PLAYBOOK_MATCH_META[match].className
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {PLAYBOOK_MATCH_META[match].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5">
                <Label htmlFor="followed-plan" className="text-sm font-medium">
                  Followed the plan
                </Label>
                <Switch
                  id="followed-plan"
                  checked={followedPlan}
                  onCheckedChange={setFollowedPlan}
                  data-testid="followed-plan-switch"
                />
              </div>
            </div>
          </div>

          {/* Frozen checklist */}
          {checklist.length > 0 && (
            <div data-testid="review-checklist">
              <Label className="text-sm font-medium">Checklist (frozen at entry)</Label>
              <div className="mt-2 space-y-1.5">
                {checklist.map((item, index) => (
                  <button
                    key={`${item.label}-${index}`}
                    type="button"
                    onClick={() =>
                      setChecklist((current) =>
                        current.map((entry, i) => (i === index ? { ...entry, passed: !entry.passed } : entry)),
                      )
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.passed ? (
                      <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quality scores */}
          <div className="grid gap-4 sm:grid-cols-3" data-testid="quality-scores">
            {(
              [
                { label: "Entry", value: entryQuality, set: setEntryQuality },
                { label: "Exit", value: exitQuality, set: setExitQuality },
                { label: "Risk", value: riskManagement, set: setRiskManagement },
              ] as const
            ).map(({ label, value, set }) => (
              <div key={label}>
                <Label className="text-sm font-medium">{label} quality</Label>
                <div className="mt-2 flex gap-1">
                  {QUALITY_STEPS.map((step) => (
                    <button
                      key={step}
                      type="button"
                      aria-label={`${label} quality ${step} of 5`}
                      onClick={() => set(step)}
                      className={cn(
                        "h-6 flex-1 rounded-md border transition-all hover:scale-105",
                        step <= value
                          ? "border-foreground/50 bg-foreground/70"
                          : "border-border bg-muted/50 opacity-50",
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* The lesson - the point of the module */}
          <div>
            <Label htmlFor="review-lessons" className="text-sm font-medium">
              The lesson you keep
            </Label>
            <Textarea
              id="review-lessons"
              value={lessons}
              onChange={(event) => setLessons(event.target.value)}
              placeholder="What actually happened, what you control, and what you repeat or never do again…"
              rows={3}
              className="mt-2"
              data-testid="review-lessons-input"
            />
          </div>

          <div>
            <Label htmlFor="review-improvement" className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Next time I will…
            </Label>
            <Input
              id="review-improvement"
              value={improvementNote}
              onChange={(event) => setImprovementNote(event.target.value)}
              placeholder="One concrete commitment for the next execution"
              className="mt-2"
              data-testid="review-improvement-input"
            />
            {/* Recurring-lesson template: start from the last commitment. */}
            {improvementNote.trim() === "" && lastImprovementNote !== null ? (
              <button
                type="button"
                onClick={() => setImprovementNote(lastImprovementNote)}
                className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40"
                data-testid="review-reuse-note"
              >
                <History className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">Reuse from your last review - “{lastImprovementNote}”</span>
              </button>
            ) : null}
          </div>

          {/* Nofy bridge - notes linked to this trade */}
          <NofyLinkedNotesSection
            kind="TRADE"
            id={row.tradeId}
            onCreateNote={takeNofyNotes}
            creating={createNofyNote.isPending}
            testidPrefix="review"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={upsert.isPending} data-testid="review-save">
            {row.reviewStatus === "PENDING" ? "Save review" : "Update review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

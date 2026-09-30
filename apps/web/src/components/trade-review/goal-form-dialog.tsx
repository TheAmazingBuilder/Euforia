"use client";

import * as React from "react";
import { toast } from "sonner";
import type { GoalColor, GoalMetric, GoalPeriod, GoalWithProgress } from "@cosmoz/shared";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateGoal, useUpdateGoal } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { GOAL_DOTS, GOAL_GRADIENTS, METRIC_META, PERIOD_LABELS } from "@/components/trade-review/trade-review-shared";

/**
 * Create / edit a goal. The trader picks WHAT (metric), HOW MUCH (target)
 * and OVER WHAT (period) — the direction, the unit and every progress number
 * are derived server-side from real trading behavior, never self-entered.
 */

const METRICS = Object.keys(METRIC_META) as GoalMetric[];
const PERIODS = Object.keys(PERIOD_LABELS) as GoalPeriod[];
const COLORS = Object.keys(GOAL_GRADIENTS) as GoalColor[];

/** Suggested target per metric — a starting point, editable. */
const DEFAULT_TARGETS: Record<GoalMetric, number> = {
  WIN_RATE: 50,
  R_EARNED: 10,
  AVG_R: 0.3,
  PROFIT_TARGET: 1000,
  DISCIPLINE_SCORE: 80,
  FOLLOWED_PLAN_PCT: 90,
  MAX_TRADES_PER_DAY: 3,
  MAX_DAILY_LOSS_R: -2,
};

const UNIT_SUFFIX: Record<GoalMetric, string> = {
  WIN_RATE: "%",
  R_EARNED: "R",
  AVG_R: "R",
  PROFIT_TARGET: "$",
  DISCIPLINE_SCORE: "/100",
  FOLLOWED_PLAN_PCT: "%",
  MAX_TRADES_PER_DAY: "trades",
  MAX_DAILY_LOSS_R: "R",
};

interface GoalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget: GoalWithProgress | null;
}

export function GoalFormDialog({ open, onOpenChange, editTarget }: GoalFormDialogProps) {
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();

  const [title, setTitle] = React.useState("");
  const [metric, setMetric] = React.useState<GoalMetric>("WIN_RATE");
  const [target, setTarget] = React.useState("50");
  const [period, setPeriod] = React.useState<GoalPeriod>("MONTH");
  const [color, setColor] = React.useState<GoalColor>("VIOLET");

  // Re-hydrate whenever the dialog opens (or the edit target swaps — the
  // caller also remounts by key). Guarded render-time adjustment per the
  // React docs "You might not need an effect" pattern.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      if (editTarget) {
        setTitle(editTarget.goal.title);
        setMetric(editTarget.goal.metric);
        setTarget(String(editTarget.goal.target));
        setPeriod(editTarget.goal.period);
        setColor(editTarget.goal.color);
      } else {
        setTitle("");
        setMetric("WIN_RATE");
        setTarget(String(DEFAULT_TARGETS.WIN_RATE));
        setPeriod("MONTH");
        setColor("VIOLET");
      }
    }
  }

  const targetNumber = Number(target);
  const targetValid = Number.isFinite(targetNumber) && targetNumber !== 0;

  const submit = () => {
    if (!title.trim()) {
      toast.error("Give the goal a title");
      return;
    }
    if (!targetValid) {
      toast.error("The target must be a non-zero number");
      return;
    }
    if (editTarget) {
      updateGoal.mutate(
        { goalId: editTarget.goal.id, input: { title: title.trim(), metric, target: targetNumber, period, color } },
        {
          onSuccess: () => {
            toast.success("Goal updated", { description: title.trim() });
            onOpenChange(false);
          },
          onError: (error) => toast.error("Could not update the goal", { description: apiErrorMessage(error, "Unexpected error — try again.") }),
        },
      );
    } else {
      createGoal.mutate(
        { title: title.trim(), metric, target: targetNumber, period, color },
        {
          onSuccess: (created) => {
            toast.success("Goal created", {
              description: `${created.goal.title} — progress is tracked against real trades from now on.`,
            });
            onOpenChange(false);
          },
          onError: (error) => toast.error("Could not create the goal", { description: apiErrorMessage(error, "Unexpected error — try again.") }),
        },
      );
    }
  };

  const pending = createGoal.isPending || updateGoal.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="goal-form-dialog">
        <DialogHeader>
          <DialogTitle>{editTarget ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>
            Pick what to hold yourself to — Cosmoz compares it with your real trading behavior over the period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Keep win rate at 50% or above"
              className="mt-1.5"
              data-testid="goal-title-input"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>What to track</Label>
              <Select value={metric} onValueChange={(value) => {
                const next = value as GoalMetric;
                setMetric(next);
                setTarget(String(DEFAULT_TARGETS[next]));
              }}>
                <SelectTrigger className="mt-1.5" data-testid="goal-metric-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {METRIC_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">{METRIC_META[metric].hint}</p>
            </div>

            <div>
              <Label htmlFor="goal-target">Target ({UNIT_SUFFIX[metric]})</Label>
              <Input
                id="goal-target"
                type="number"
                step="any"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="mt-1.5 font-mono"
                data-testid="goal-target-input"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Period</Label>
              <Select value={period} onValueChange={(value) => setPeriod(value as GoalPeriod)}>
                <SelectTrigger className="mt-1.5" data-testid="goal-period-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {PERIOD_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Color</Label>
              <div className="mt-2 flex gap-1.5" data-testid="goal-color-picker">
                {COLORS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={`Color ${key.toLowerCase()}`}
                    aria-pressed={color === key}
                    onClick={() => setColor(key)}
                    className={cn(
                      "size-6 rounded-full bg-gradient-to-br transition-transform hover:scale-110",
                      GOAL_GRADIENTS[key],
                      color !== key && "opacity-35",
                      color === key && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="goal-save">
            {editTarget ? "Save changes" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small helper re-used by the goals panel header. */
export function GoalColorDot({ color, className }: { color: GoalColor; className?: string }) {
  return <span className={cn("inline-block size-2.5 rounded-full", GOAL_DOTS[color], className)} aria-hidden="true" />;
}

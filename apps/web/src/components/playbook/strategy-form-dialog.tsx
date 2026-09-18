"use client";

import * as React from "react";
import { toast } from "sonner";
import type { StrategyGrade, StrategyStatus, Strategy } from "@cosmoz/shared";
import { PLAYBOOK_COLOR_PALETTE } from "@cosmoz/shared";

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
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  useCreateStrategy,
  useUpdateStrategy,
} from "@/lib/api/queries";

/**
 * [New Strategy] / [Edit] dialog (Phase 8): name, description, the three
 * markdown rule bodies, grade A+/A/B/C, color from the preset palette and
 * status. One component for both modes.
 */

const GRADE_OPTIONS: { value: StrategyGrade; label: string }[] = [
  { value: "A_PLUS", label: "A+ — core edge" },
  { value: "A", label: "A — proven" },
  { value: "B", label: "B — developing" },
  { value: "C", label: "C — experimental" },
];

const STATUS_OPTIONS: readonly StrategyStatus[] = ["ACTIVE", "DRAFT", "PAUSED", "RETIRED"];

const STATUS_LABELS: Record<StrategyStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  PAUSED: "Paused",
  RETIRED: "Retired",
};

export interface StrategyFormValues {
  name: string;
  description: string;
  entryRules: string;
  exitRules: string;
  riskRules: string;
  grade: StrategyGrade | "none";
  status: StrategyStatus;
  color: string | null;
}

function valuesFromStrategy(strategy: Strategy | null): StrategyFormValues {
  return {
    name: strategy?.name ?? "",
    description: strategy?.description ?? "",
    entryRules: strategy?.entryRules ?? "",
    exitRules: strategy?.exitRules ?? "",
    riskRules: strategy?.riskRules ?? "",
    grade: strategy?.grade ?? "none",
    status: strategy?.status ?? "ACTIVE",
    color: strategy?.color ?? PLAYBOOK_COLOR_PALETTE[0] ?? null,
  };
}

interface StrategyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode. */
  strategy: Strategy | null;
}

export function StrategyFormDialog({ open, onOpenChange, strategy }: StrategyFormDialogProps) {
  const isEdit = strategy !== null;
  const createStrategy = useCreateStrategy();
  const updateStrategy = useUpdateStrategy();
  const [values, setValues] = React.useState<StrategyFormValues>(() => valuesFromStrategy(strategy));

  // Re-hydrate whenever the dialog opens (or the edit target swaps — the
  // caller also remounts by key). Guarded render-time adjustment per the
  // React docs "You might not need an effect" pattern.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(valuesFromStrategy(strategy));
  }

  const patch = (partial: Partial<StrategyFormValues>) =>
    setValues((previous) => ({ ...previous, ...partial }));

  const pending = createStrategy.isPending || updateStrategy.isPending;
  const nameError = values.name.trim() === "" ? "Name is required" : null;

  const submit = async () => {
    if (nameError !== null) return;
    const payload = {
      name: values.name.trim(),
      description: values.description.trim() === "" ? null : values.description,
      entryRules: values.entryRules.trim() === "" ? null : values.entryRules,
      exitRules: values.exitRules.trim() === "" ? null : values.exitRules,
      riskRules: values.riskRules.trim() === "" ? null : values.riskRules,
      grade: values.grade === "none" ? null : values.grade,
      status: values.status,
      color: values.color,
    };
    try {
      if (isEdit && strategy !== null) {
        await updateStrategy.mutateAsync({ strategyId: strategy.id, input: payload });
        toast.success("Strategy updated", { description: payload.name });
      } else {
        await createStrategy.mutateAsync(payload);
        toast.success("Strategy added to your playbook", { description: payload.name });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(isEdit ? "Could not update the strategy" : "Could not create the strategy", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-semibold">
            {isEdit ? "Edit strategy" : "New strategy"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Refine the setup — the playbook evolves, your history stays true."
              : "Define the setup once; grade it, color it, trade it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="strategy-name">Name</Label>
            <Input
              id="strategy-name"
              value={values.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Breakout BOOM500 NY open"
              aria-invalid={nameError !== null}
              autoFocus
            />
            {nameError !== null ? (
              <p className="text-xs text-loss">{nameError}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="strategy-description">Description</Label>
            <Textarea
              id="strategy-description"
              value={values.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder="What this setup is, when it appears, what makes it valid…"
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="strategy-grade">Grade</Label>
              <Select
                value={values.grade}
                onValueChange={(next) => patch({ grade: next as StrategyGrade | "none" })}
              >
                <SelectTrigger id="strategy-grade" aria-label="Strategy grade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ungraded</SelectItem>
                  {GRADE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="strategy-status">Status</Label>
              <Select
                value={values.status}
                onValueChange={(next) => patch({ status: next as StrategyStatus })}
              >
                <SelectTrigger id="strategy-status" aria-label="Strategy status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-foreground">Color</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Strategy color">
              {PLAYBOOK_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={values.color === color}
                  aria-label={`Color ${color}`}
                  onClick={() => patch({ color })}
                  className={cn(
                    "size-7 rounded-full border-2 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring",
                    values.color === color
                      ? "scale-110 border-foreground"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="strategy-entry">Entry rules (markdown)</Label>
            <Textarea
              id="strategy-entry"
              value={values.entryRules}
              onChange={(event) => patch({ entryRules: event.target.value })}
              placeholder={"1. Wait for the pre-open range…\n2. Enter on the 1m close beyond…"}
              rows={4}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-exit">Exit rules (markdown)</Label>
            <Textarea
              id="strategy-exit"
              value={values.exitRules}
              onChange={(event) => patch({ exitRules: event.target.value })}
              placeholder={"- Stop to breakeven at +1R\n- Scale out 50% at 1.5R"}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-risk">Risk rules (markdown)</Label>
            <Textarea
              id="strategy-risk"
              value={values.riskRules}
              onChange={(event) => patch({ riskRules: event.target.value })}
              placeholder={"- Max 1% risk per trade\n- Max 2 concurrent positions"}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={pending || nameError !== null}>
            {isEdit ? "Save changes" : "Create strategy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

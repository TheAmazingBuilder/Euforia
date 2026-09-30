"use client";

import * as React from "react";
import { toast } from "sonner";
import type { CreateSetupInput, Setup, Strategy, UpdateSetupInput } from "@cosmoz/shared";

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
import {
  MARKET_CONDITION_LABELS,
  STATUS_LABELS,
  parseTags,
} from "@/components/playbook/playbook-labels";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateSetup, useUpdateSetup } from "@/lib/api/queries";

/**
 * Setup create/edit dialog (§9). The invalidation field is deliberately
 * prominent (§12: a setup must also say when it is NO LONGER valid).
 */

interface SetupFormValues {
  strategyId: string;
  name: string;
  status: Setup["status"];
  description: string;
  context: string;
  marketCondition: string; // "" = none
  trigger: string;
  confirmation: string;
  entryModel: string;
  stopModel: string;
  targetModel: string;
  invalidation: string;
  notes: string;
  tags: string;
}

function valuesFromSetup(setup: Setup | null, strategies: Strategy[]): SetupFormValues {
  return {
    strategyId: setup?.strategyId ?? strategies[0]?.id ?? "",
    name: setup?.name ?? "",
    status: setup?.status ?? "ACTIVE",
    description: setup?.description ?? "",
    context: setup?.context ?? "",
    marketCondition: setup?.marketCondition ?? "",
    trigger: setup?.trigger ?? "",
    confirmation: setup?.confirmation ?? "",
    entryModel: setup?.entryModel ?? "",
    stopModel: setup?.stopModel ?? "",
    targetModel: setup?.targetModel ?? "",
    invalidation: setup?.invalidation ?? "",
    notes: setup?.notes ?? "",
    tags: (setup?.tags ?? []).join(", "),
  };
}

const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export function SetupFormDialog({
  open,
  onOpenChange,
  setup,
  strategies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setup: Setup | null;
  strategies: Strategy[];
}) {
  const isEdit = setup !== null;
  const createSetup = useCreateSetup();
  const updateSetup = useUpdateSetup();

  const [values, setValues] = React.useState<SetupFormValues>(() =>
    valuesFromSetup(setup, strategies),
  );
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(valuesFromSetup(setup, strategies));
  }
  const patch = (partial: Partial<SetupFormValues>) =>
    setValues((previous) => ({ ...previous, ...partial }));

  const nameError = values.name.trim() === "" ? "Name is required" : null;
  const strategyError = values.strategyId === "" ? "Choose a strategy" : null;
  const pending = createSetup.isPending || updateSetup.isPending;

  const submit = async () => {
    const base: Omit<CreateSetupInput, "strategyId"> = {
      name: values.name.trim(),
      status: values.status,
      description: orNull(values.description),
      context: orNull(values.context),
      marketCondition: orNull(values.marketCondition) as CreateSetupInput["marketCondition"],
      trigger: orNull(values.trigger),
      confirmation: orNull(values.confirmation),
      entryModel: orNull(values.entryModel),
      stopModel: orNull(values.stopModel),
      targetModel: orNull(values.targetModel),
      invalidation: orNull(values.invalidation),
      notes: orNull(values.notes),
      tags: parseTags(values.tags),
    };
    try {
      if (isEdit) {
        const input: UpdateSetupInput = { ...base, strategyId: values.strategyId };
        await updateSetup.mutateAsync({ setupId: setup.id, input });
        toast.success("Setup updated", { description: "The recipe is current again." });
      } else {
        await createSetup.mutateAsync({ ...base, strategyId: values.strategyId });
        toast.success("Setup added", {
          description: "Define its invalidation before you trade it — that is the exit door.",
        });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(isEdit ? "Could not update the setup" : "Could not create the setup", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading">{isEdit ? "Edit setup" : "New setup"}</DialogTitle>
          <DialogDescription>
            The recipe: when it triggers, what confirms it, how it is executed — and what kills it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="setup-strategy">Strategy</Label>
              <Select value={values.strategyId} onValueChange={(value) => patch({ strategyId: value })}>
                <SelectTrigger id="setup-strategy" aria-label="Strategy">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((strategy) => (
                    <SelectItem key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {strategyError ? <p className="text-xs text-loss">{strategyError}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-name">Name</Label>
              <Input
                id="setup-name"
                value={values.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="Breakout + Retest"
              />
              {nameError ? <p className="text-xs text-loss">{nameError}</p> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="setup-status">Status</Label>
              <Select
                value={values.status}
                onValueChange={(value) => patch({ status: value as Setup["status"] })}
              >
                <SelectTrigger id="setup-status" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["ACTIVE", "PAUSED", "DRAFT", "RETIRED"] as const).map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-condition">Market condition</Label>
              <Select
                value={values.marketCondition}
                onValueChange={(value) => patch({ marketCondition: value })}
              >
                <SelectTrigger id="setup-condition" aria-label="Market condition">
                  <SelectValue placeholder="Any / not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any / not specified</SelectItem>
                  {Object.entries(MARKET_CONDITION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="setup-description">Short description</Label>
            <Input
              id="setup-description"
              value={values.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder="One sentence a future-you will understand."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="setup-context">Context</Label>
            <Textarea
              id="setup-context"
              rows={2}
              value={values.context}
              onChange={(event) => patch({ context: event.target.value })}
              placeholder="When does this setup apply? Regime, session, preconditions…"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="setup-trigger" label="Trigger" value={values.trigger} onChange={(value) => patch({ trigger: value })} />
            <Field id="setup-confirmation" label="Confirmation" value={values.confirmation} onChange={(value) => patch({ confirmation: value })} />
            <Field id="setup-entry" label="Entry model" value={values.entryModel} onChange={(value) => patch({ entryModel: value })} />
            <Field id="setup-stop" label="Stop model" value={values.stopModel} onChange={(value) => patch({ stopModel: value })} />
            <Field id="setup-target" label="Target model" value={values.targetModel} onChange={(value) => patch({ targetModel: value })} />
            <Field id="setup-tags" label="Tags (comma-separated)" value={values.tags} onChange={(value) => patch({ tags: value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="setup-invalidation" className="text-loss">
              Invalidation — when is this setup NO LONGER valid?
            </Label>
            <Textarea
              id="setup-invalidation"
              rows={2}
              value={values.invalidation}
              onChange={(event) => patch({ invalidation: event.target.value })}
              placeholder="e.g. Candle body closes back through the level."
              className="border-loss/40 focus-visible:ring-loss/40"
            />
            <p className="text-[11px] text-muted-foreground">
              A setup without an invalidation is an open door to hoping. Fill it.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="setup-notes">Notes / examples</Label>
            <Textarea
              id="setup-notes"
              rows={2}
              value={values.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder="Past examples, edge cases, references…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={pending || nameError !== null || strategyError !== null}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create setup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

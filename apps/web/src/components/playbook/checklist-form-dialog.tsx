"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { ChecklistTemplate, Strategy } from "@cosmoz/shared";

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
import { Switch } from "@/components/ui/switch";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateChecklist, useUpdateChecklist } from "@/lib/api/queries";

/**
 * Checklist template editor (§16): name, scope, and the ordered item list
 * with required/optional toggles, reordering and removal. Items are replaced
 * wholesale on save; trades already taken keep their frozen checklistSnap.
 */

interface ItemDraft {
  id: string;
  label: string;
  required: boolean;
}

export function ChecklistFormDialog({
  open,
  onOpenChange,
  checklist,
  strategies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklist: ChecklistTemplate | null;
  strategies: Strategy[];
}) {
  const isEdit = checklist !== null;
  const createChecklist = useCreateChecklist();
  const updateChecklist = useUpdateChecklist();

  const [name, setName] = React.useState("");
  const [globalScope, setGlobalScope] = React.useState(true);
  const [strategyId, setStrategyId] = React.useState("");
  const [items, setItems] = React.useState<ItemDraft[]>([]);
  const [wasOpen, setWasOpen] = React.useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(checklist?.name ?? "");
      setGlobalScope(checklist ? checklist.strategyId === null : true);
      setStrategyId(checklist?.strategyId ?? strategies[0]?.id ?? "");
      setItems(
        (checklist?.items ?? []).map((item) => ({ ...item })),
      );
    }
  }

  const pending = createChecklist.isPending || updateChecklist.isPending;
  const nameError = name.trim() === "" ? "Name is required" : null;
  const cleanItems = items.filter((item) => item.label.trim() !== "");
  const itemsError = cleanItems.length === 0 ? "Add at least one item" : null;
  const strategyError =
    !globalScope && strategyId === "" ? "Choose a strategy (or mark the checklist global)" : null;

  const addItem = () => {
    setItems((previous) => [
      ...previous,
      { id: `item-${Date.now()}-${previous.length}`, label: "", required: true },
    ]);
  };

  const move = (index: number, direction: -1 | 1) => {
    setItems((previous) => {
      const next = [...previous];
      const target = index + direction;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const submit = async () => {
    if (nameError !== null || itemsError !== null || strategyError !== null) return;
    const payloadItems = cleanItems.map((item) => ({
      id: item.id,
      label: item.label.trim(),
      required: item.required,
    }));
    try {
      if (isEdit) {
        await updateChecklist.mutateAsync({
          checklistId: checklist.id,
          input: {
            name: name.trim(),
            strategyId: globalScope ? null : strategyId,
            items: payloadItems,
          },
        });
        toast.success("Checklist updated", {
          description: "Trades already taken keep their frozen checklist snapshot.",
        });
      } else {
        await createChecklist.mutateAsync({
          name: name.trim(),
          strategyId: globalScope ? null : strategyId,
          items: payloadItems,
        });
        toast.success("Checklist created");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(isEdit ? "Could not update the checklist" : "Could not create the checklist", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{isEdit ? "Edit checklist" : "New checklist"}</DialogTitle>
          <DialogDescription>
            Ordered pre-trade items. Required items are the ones that MUST pass before entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="checklist-name">Name</Label>
            <Input
              id="checklist-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Breakout NY — pre-flight"
            />
            {nameError ? <p className="text-xs text-loss">{nameError}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="checklist-scope">Scope</Label>
              <Select
                value={globalScope ? "GLOBAL" : "STRATEGY"}
                onValueChange={(value) => setGlobalScope(value === "GLOBAL")}
              >
                <SelectTrigger id="checklist-scope" aria-label="Scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GLOBAL">Global — any strategy</SelectItem>
                  <SelectItem value="STRATEGY">Scoped to one strategy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!globalScope ? (
              <div className="space-y-1.5">
                <Label htmlFor="checklist-strategy">Strategy</Label>
                <Select value={strategyId} onValueChange={setStrategyId}>
                  <SelectTrigger id="checklist-strategy" aria-label="Strategy">
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
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items ({cleanItems.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="size-3.5" aria-hidden="true" /> Add item
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No item yet — start with the non-negotiables.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item, index) => (
                  <li key={item.id} className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-2 py-1.5">
                    <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <Input
                      value={item.label}
                      onChange={(event) =>
                        setItems((previous) =>
                          previous.map((row) =>
                            row.id === item.id ? { ...row, label: event.target.value } : row,
                          ),
                        )
                      }
                      aria-label={`Item ${index + 1} label`}
                      className="h-8 flex-1"
                      placeholder="Market structure confirmed…"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <Switch
                          checked={item.required}
                          onCheckedChange={(checked) =>
                            setItems((previous) =>
                              previous.map((row) =>
                                row.id === item.id ? { ...row, required: checked } : row,
                              ),
                            )
                          }
                          aria-label={`Item ${index + 1} required`}
                        />
                        req.
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={`Move item ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-3" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={`Move item ${index + 1} down`}
                        disabled={index === items.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-3" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 hover:text-destructive"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => setItems((previous) => previous.filter((row) => row.id !== item.id))}
                      >
                        <X className="size-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {itemsError ? <p className="text-xs text-loss">{itemsError}</p> : null}
            {strategyError ? <p className="text-xs text-loss">{strategyError}</p> : null}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={pending || nameError !== null || itemsError !== null || strategyError !== null}
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create checklist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

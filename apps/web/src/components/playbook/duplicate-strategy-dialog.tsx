"use client";

import * as React from "react";
import { toast } from "sonner";
import type { Strategy } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api/client";
import { useDuplicateStrategy } from "@/lib/api/queries";

/**
 * Duplicate Strategy quick action (§5): pick a source, get a fresh DRAFT copy
 * — definition deep-copied, grade reset, setups + checklists duplicated,
 * history does NOT follow. The copy starts unproven, on purpose.
 */
export function DuplicateStrategyDialog({
  open,
  onOpenChange,
  strategies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategies: Strategy[];
}) {
  const [strategyId, setStrategyId] = React.useState<string>("");
  const duplicate = useDuplicateStrategy();

  const submit = async () => {
    if (strategyId === "") return;
    try {
      const copy = await duplicate.mutateAsync(strategyId);
      toast.success("Strategy duplicated as a draft", {
        description: `"${copy.name}" is ready to edit — its copy starts unproven (grade reset, history not carried over).`,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not duplicate the strategy", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Duplicate a strategy</DialogTitle>
          <DialogDescription>
            Creates a new DRAFT with the same definition, its setups and its checklists. Version
            history stays with the original.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="duplicate-source">Source strategy</Label>
          <Select value={strategyId} onValueChange={setStrategyId}>
            <SelectTrigger id="duplicate-source" aria-label="Source strategy">
              <SelectValue placeholder="Choose a strategy…" />
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
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={strategyId === "" || duplicate.isPending}>
            {duplicate.isPending ? "Duplicating…" : "Duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

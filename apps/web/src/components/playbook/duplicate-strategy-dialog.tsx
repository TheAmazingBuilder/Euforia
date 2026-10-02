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
import { useI18n } from "@/i18n/i18n-provider";

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
  const { dict } = useI18n();
  const V = dict.playbook.duplicate;
  const S = dict.playbook.shared;

  const submit = async () => {
    if (strategyId === "") return;
    try {
      const copy = await duplicate.mutateAsync(strategyId);
      toast.success(V.toastCreated, {
        description: `${V.toastCreatedDescA}${copy.name}${V.toastCreatedDescB}`,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(V.toastFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{V.title}</DialogTitle>
          <DialogDescription>
            {V.desc}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="duplicate-source">{V.sourceLabel}</Label>
          <Select value={strategyId} onValueChange={setStrategyId}>
            <SelectTrigger id="duplicate-source" aria-label={V.sourceAria}>
              <SelectValue placeholder={V.sourcePlaceholder} />
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
            {S.cancel}
          </Button>
          <Button onClick={() => void submit()} disabled={strategyId === "" || duplicate.isPending}>
            {duplicate.isPending ? V.duplicating : V.duplicateBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

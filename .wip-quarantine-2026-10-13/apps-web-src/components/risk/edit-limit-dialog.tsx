"use client";

import * as React from "react";
import { toast } from "sonner";
import { parseDecimal, type Rule, type RuleType, type Severity } from "@cosmoz/shared";

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
import { SeverityBadge } from "@/components/discipline/severity-badge";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateRule, useUpdateRule } from "@/lib/api/queries";

/**
 * Guardrail limit editor (Risk Command Center): edits ONE rule's limit,
 * severity and active toggle against PATCH /rules/:id; creates the rule
 * when it is missing (POST /rules). The store re-runs the account risk
 * engine on every rule mutation, so tightened limits alert immediately.
 */

const SEVERITY_OPTIONS: readonly Severity[] = ["NOTIFY", "WARN", "ALERT", "LOCK"];

export interface EditLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rule to edit; null → create mode using `type`. */
  rule: Rule | null;
  /** Rule type used in create mode (immutable once created). */
  type: RuleType;
  /** Human label for the limit input ("Daily loss limit"). */
  limitLabel: string;
  step?: number;
  suffix?: string;
  /** Inclusive upper bound for the limit (validation). */
  max?: number;
}

export function EditLimitDialog({
  open,
  onOpenChange,
  rule,
  type,
  limitLabel,
  step = 0.5,
  suffix = "%",
  max = 100,
}: EditLimitDialogProps) {
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const [limit, setLimit] = React.useState("");
  const [severity, setSeverity] = React.useState<Severity>("WARN");
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const pending = createRule.isPending || updateRule.isPending;

  // Reset the draft each time the dialog opens — guarded render-time
  // adjustment per the React docs "You might not need an effect" pattern
  // (same idiom as the discipline RuleFormDialog).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const current = rule !== null ? (rule.params as { limit?: number }).limit : undefined;
      setLimit(typeof current === "number" ? String(current) : "");
      setSeverity(rule?.severity ?? "WARN");
      setIsActive(rule?.isActive ?? true);
      setError(null);
    }
  }

  const submit = async () => {
    const parsed = parseDecimal(limit.replace(",", "."));
    if (parsed === null || parsed <= 0 || parsed > max) {
      setError(`Enter a limit between 0 and ${formatBound(max)}${suffix}.`);
      return;
    }
    try {
      if (rule !== null) {
        await updateRule.mutateAsync({
          ruleId: rule.id,
          input: { params: { limit: parsed }, severity, isActive },
        });
        toast.success("Guardrail updated");
      } else {
        await createRule.mutateAsync({ type, params: { limit: parsed }, severity, isActive });
        toast.success("Guardrail created");
      }
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the guardrail. Try again."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="risk-edit-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {rule !== null ? "Edit guardrail" : "Create guardrail"}
          </DialogTitle>
          <DialogDescription>
            {limitLabel} — saved limits apply immediately and re-run the risk engine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="risk-limit-input">{limitLabel}</Label>
            <div className="relative">
              <Input
                id="risk-limit-input"
                data-testid="risk-limit-input"
                inputMode="decimal"
                step={step}
                value={limit}
                onChange={(event) => {
                  setLimit(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                placeholder={step >= 1 ? "3" : "2.0"}
                autoComplete="off"
                className="pr-8 font-mono tabular-nums"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-muted-foreground">
                {suffix}
              </span>
            </div>
            {error !== null ? (
              <p className="text-xs font-medium text-loss" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="risk-limit-severity">Severity when breached</Label>
            <Select value={severity} onValueChange={(value) => setSeverity(value as Severity)}>
              <SelectTrigger id="risk-limit-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    <SeverityBadge severity={option} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <Label htmlFor="risk-limit-active" className="text-sm">
              Guardrail active
            </Label>
            <Switch id="risk-limit-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="success" onClick={() => void submit()} disabled={pending} data-testid="risk-limit-save">
            {pending ? "Saving…" : "Save limit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatBound(max: number): string {
  return Number.isInteger(max) ? String(max) : String(max).replace(".", ",");
}

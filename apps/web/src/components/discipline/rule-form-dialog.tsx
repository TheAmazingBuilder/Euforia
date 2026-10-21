"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  defaultRuleParams,
  ruleParamFields,
  RULE_TYPE_LABELS,
  type RuleType,
  type Severity,
} from "@cosmoz/shared";

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
import { SeverityBadge } from "@/components/discipline/severity-badge";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateRule } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * [Add rule] dialog (Phase 8): pick the RuleType from the shared enum, see
 * the relevant param fields for that type (shared ruleParamFields table),
 * choose a severity. Creates against POST /rules.
 */

const RULE_TYPES = Object.keys(RULE_TYPE_LABELS) as RuleType[];
const SEVERITY_OPTIONS: readonly Severity[] = ["NOTIFY", "WARN", "ALERT", "LOCK"];

export function RuleFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createRule = useCreateRule();
  const [type, setType] = React.useState<RuleType>("MAX_TRADES_PER_DAY");
  const [severity, setSeverity] = React.useState<Severity>("WARN");
  const [paramValues, setParamValues] = React.useState<Record<string, string>>(() =>
    stringsFromParams(defaultRuleParams("MAX_TRADES_PER_DAY")),
  );

  const fields = React.useMemo(() => ruleParamFields(type), [type]);

  // Reset the draft each time the dialog opens — guarded render-time
  // adjustment per the React docs "You might not need an effect" pattern.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setType("MAX_TRADES_PER_DAY");
      setSeverity("WARN");
      setParamValues(stringsFromParams(defaultRuleParams("MAX_TRADES_PER_DAY")));
    }
  }

  const changeType = (next: RuleType) => {
    setType(next);
    setParamValues(stringsFromParams(defaultRuleParams(next)));
  };

  const submit = async () => {
    const params: Record<string, string | number> = {};
    let invalid = false;
    for (const field of fields) {
      const raw = (paramValues[field.key] ?? "").trim();
      if (raw === "") {
        invalid = true;
        continue;
      }
      params[field.key] = field.kind === "number" ? Number(raw) : raw;
    }
    if (invalid) {
      toast.error("All parameters are required");
      return;
    }
    try {
      await createRule.mutateAsync({ type, severity, params });
      toast.success("Rule created", { description: RULE_TYPE_LABELS[type] });
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not create the rule", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-semibold">Add rule</DialogTitle>
          <DialogDescription>
            The discipline engine evaluates active rules on every trade and writes the violations
            here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-type">Type</Label>
            <Select value={type} onValueChange={(next) => changeType(next as RuleType)}>
              <SelectTrigger id="rule-type" aria-label="Rule type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((ruleType) => (
                  <SelectItem key={ruleType} value={ruleType}>
                    {RULE_TYPE_LABELS[ruleType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`new-rule-${field.key}`}>
                  {field.label}
                  {field.suffix !== undefined ? ` (${field.suffix})` : ""}
                </Label>
                <Input
                  id={`new-rule-${field.key}`}
                  type={field.kind === "number" ? "number" : "time"}
                  step={field.kind === "number" ? (field.step ?? 1) : undefined}
                  inputMode={field.kind === "number" ? "decimal" : undefined}
                  value={paramValues[field.key] ?? ""}
                  onChange={(event) =>
                    setParamValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                  }
                  className={cn("w-28 font-mono tabular-nums", field.kind === "time" && "w-32")}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="new-rule-severity">Severity</Label>
              <div className="flex items-center gap-2">
                <Select value={severity} onValueChange={(next) => setSeverity(next as Severity)}>
                  <SelectTrigger id="new-rule-severity" className="w-28" aria-label="Severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0) + option.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SeverityBadge severity={severity} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createRule.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={createRule.isPending}>
            Create rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stringsFromParams(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = value === null || value === undefined ? "" : String(value);
  }
  return out;
}

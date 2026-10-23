"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronDown, Trash2 } from "lucide-react";
import {
  describeRule,
  ruleParamFields,
  RULE_TYPE_LABELS,
  type Rule,
  type RuleViolationView,
  type Severity,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useDeleteRule, useUpdateRule } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Discipline rule card (Phase 8): active toggle, severity badge, the
 * month's violation count in mono, and an expanded view with the param
 * editor (per-type fields), severity selector and a 30-day violation
 * history mini-timeline. All mutations hit the mocked API.
 */

const SEVERITY_OPTIONS: readonly Severity[] = ["NOTIFY", "WARN", "ALERT", "LOCK"];

const SEVERITY_DOT: Record<Severity, string> = {
  NOTIFY: "bg-muted-foreground",
  WARN: "bg-warning",
  ALERT: "bg-accent",
  LOCK: "bg-loss",
};

interface RuleCardProps {
  rule: Rule;
  /** Violations of THIS rule inside the aggregation window (30 days). */
  violations: RuleViolationView[];
  windowStart: string;
  windowDays: number;
}

function ViolationMiniTimeline({
  violations,
  windowStart,
  windowDays,
}: {
  violations: RuleViolationView[];
  windowStart: string;
  windowDays: number;
}) {
  if (violations.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">No violations in the last 30 days.</p>
    );
  }
  const startMs = Date.parse(`${windowStart}T00:00:00Z`);
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Violation history - last 30 days
      </p>
      <div className="relative h-8 rounded-md border border-border bg-surface-raised">
        {violations.map((violation) => {
          const occurredMs = Date.parse(`${violation.occurredAt.slice(0, 10)}T00:00:00Z`);
          const dayIndex = Math.round((occurredMs - startMs) / 86_400_000);
          const leftPct = Math.min(100, Math.max(0, (dayIndex / Math.max(1, windowDays - 1)) * 100));
          return (
            <span
              key={violation.id}
              title={`${violation.occurredAt.slice(0, 10)}${violation.acknowledgedAt === null ? " - pending" : " - acknowledged"}`}
              className={cn(
                "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-raised",
                SEVERITY_DOT[violation.ruleSeverity],
                violation.acknowledgedAt !== null && "opacity-40",
              )}
              style={{ left: `${leftPct}%` }}
            />
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Bright = pending acknowledgment · faded = acknowledged.
      </p>
    </div>
  );
}

export function RuleCard({ rule, violations, windowStart, windowDays }: RuleCardProps) {
  const updateRule = useUpdateRule();
  const [expanded, setExpanded] = React.useState(false);

  const toggleActive = async (isActive: boolean) => {
    try {
      await updateRule.mutateAsync({ ruleId: rule.id, input: { isActive } });
      toast.success(isActive ? "Rule activated" : "Rule paused", {
        description: RULE_TYPE_LABELS[rule.type],
      });
    } catch (error) {
      toast.error("Could not update the rule", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <Card className={cn("bg-surface", !rule.isActive && "opacity-80")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <Switch
          checked={rule.isActive}
          onCheckedChange={(checked) => void toggleActive(checked)}
          aria-label={`${rule.isActive ? "Pause" : "Activate"} rule ${RULE_TYPE_LABELS[rule.type]}`}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {RULE_TYPE_LABELS[rule.type]}
          </h3>
          <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
            {describeRule(rule.type, rule.params)}
          </p>
        </div>
        <SeverityBadge severity={rule.severity} />
        <span
          className="font-mono text-xs tabular-nums text-muted-foreground"
          title="Violations in the last 30 days"
        >
          <span className={cn("font-bold", violations.length > 0 ? "text-loss" : "text-foreground")}>
            {violations.length}
          </span>{" "}
          <abbr title="violations in the last 30 days" className="no-underline">
            viol./30d
          </abbr>
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
          className="px-2"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
          <span className="sr-only">{expanded ? "Collapse" : "Edit rule"}</span>
        </Button>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-border p-4">
          {/* Remounts on every expand — the draft re-hydrates from the rule. */}
          <RuleEditor rule={rule} onDone={() => setExpanded(false)} />
          <ViolationMiniTimeline
            violations={violations}
            windowStart={windowStart}
            windowDays={windowDays}
          />
        </div>
      ) : null}
    </Card>
  );
}

/** Param editor + severity + delete, mounted only while expanded. */
function RuleEditor({ rule, onDone }: { rule: Rule; onDone: () => void }) {
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const [saving, setSaving] = React.useState(false);

  const fields = React.useMemo(() => ruleParamFields(rule.type), [rule.type]);
  const [paramValues, setParamValues] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const params = rule.params as Record<string, unknown> | null;
    for (const field of fields) {
      const value = params !== null ? params[field.key] : undefined;
      initial[field.key] = value === undefined || value === null ? "" : String(value);
    }
    return initial;
  });
  const [severity, setSeverity] = React.useState<Severity>(rule.severity);

  const saveEdits = async () => {
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
    setSaving(true);
    try {
      await updateRule.mutateAsync({ ruleId: rule.id, input: { params, severity } });
      toast.success("Rule updated", { description: RULE_TYPE_LABELS[rule.type] });
      onDone();
    } catch (error) {
      toast.error("Could not update the rule", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteRule.mutateAsync(rule.id);
      toast.success("Rule deleted", { description: RULE_TYPE_LABELS[rule.type] });
    } catch (error) {
      toast.error("Could not delete the rule", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`rule-${rule.id}-${field.key}`}>
            {field.label}
            {field.suffix !== undefined ? ` (${field.suffix})` : ""}
          </Label>
          <Input
            id={`rule-${rule.id}-${field.key}`}
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
        <Label htmlFor={`rule-${rule.id}-severity`}>Severity</Label>
        <Select value={severity} onValueChange={(next) => setSeverity(next as Severity)}>
          <SelectTrigger id={`rule-${rule.id}-severity`} className="w-28" aria-label="Severity">
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
      </div>
      <div className="flex gap-2 pb-0.5">
        <Button size="sm" onClick={() => void saveEdits()} disabled={saving}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-loss"
          onClick={() => void remove()}
          disabled={deleteRule.isPending}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          <span className="sr-only">Delete rule</span>
        </Button>
      </div>
    </div>
  );
}

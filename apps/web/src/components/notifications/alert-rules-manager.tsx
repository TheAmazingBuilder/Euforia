"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  createMetricAlertRuleInputSchema,
  METRIC_ALERT_REGISTRY,
  type CreateMetricAlertRuleInput,
  type MetricAlertCondition,
  type MetricAlertMetric,
  type MetricAlertPeriod,
  type MetricAlertRule,
} from "@cosmoz/shared";
import {
  ChevronDown,
  Pencil,
  Play,
  Plus,
  Target,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
  useAccounts,
  useAlertRuleEvents,
  useAlertRules,
  useCreateAlertRule,
  useDeleteAlertRule,
  useEvaluateAlertRules,
  useGoals,
  useStrategies,
  useUpdateAlertRule,
} from "@/lib/api/queries";
import { alertRuleSummary, alertEventObservation } from "@/lib/notifications/alert-rule-summary";
import { cn } from "@/lib/utils";

/**
 * Alert rules manager (Dashboard Customization Phase 07) — create/edit/
 * enable/disable/delete metric-threshold and goal rules, inspect each
 * rule's condition + scope, and browse its recent inbox events. Opened
 * from the notification center (the inbox is the alert center; this is
 * its rules section — spec §5/§8).
 */

const METRICS = Object.keys(METRIC_ALERT_REGISTRY) as MetricAlertMetric[];

const PERIODS: MetricAlertPeriod[] = [
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "THIS_QUARTER",
  "THIS_YEAR",
  "LAST_30",
  "LAST_90",
  "YTD",
  "ALL",
];

const PERIOD_LABELS: Record<MetricAlertPeriod, string> = {
  TODAY: "Today",
  THIS_WEEK: "This week",
  THIS_MONTH: "This month",
  THIS_QUARTER: "This quarter",
  THIS_YEAR: "This year",
  LAST_30: "Last 30 days",
  LAST_90: "Last 90 days",
  YTD: "Year to date",
  ALL: "All time",
};

const CONDITION_LABELS: Record<MetricAlertCondition, string> = {
  GREATER_THAN: "Greater than",
  GREATER_THAN_OR_EQUAL: "Greater than or equal",
  LESS_THAN: "Less than",
  LESS_THAN_OR_EQUAL: "Less than or equal",
  EQUAL: "Equal to",
};

// ── Per-rule recent events (lazy — hook lives in its own component) ─────────

function RuleEventsList({ ruleId }: { ruleId: string }) {
  const { data, isLoading, isError } = useAlertRuleEvents(ruleId);
  if (isLoading) {
    return <p className="px-3 pb-3 text-xs text-muted-foreground">Loading events…</p>;
  }
  if (isError) {
    return <p className="px-3 pb-3 text-xs text-loss">Events could not be loaded.</p>;
  }
  const events = data?.events ?? [];
  if (events.length === 0) {
    return (
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        No events yet - the rule fires when its condition turns true.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border/60 border-t border-border/60">
      {events.slice(0, 5).map((event) => {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        return (
          <li key={event.id} className="flex items-start gap-2 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">{event.title}</span>
              <span className="block text-muted-foreground">
                Observed {alertEventObservation({
                  observedValue:
                    typeof payload.observedValue === "number" ? payload.observedValue : null,
                  threshold: typeof payload.threshold === "number" ? payload.threshold : null,
                  unit: typeof payload.unit === "string" ? payload.unit : null,
                })}
                {" · "}
                {new Date(event.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </span>
            {event.dismissedAt !== null ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">dismissed</Badge>
            ) : event.readAt !== null ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">read</Badge>
            ) : (
              <Badge className="shrink-0 text-[10px]">new</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Create / edit form ───────────────────────────────────────────────────────

interface FormState {
  name: string;
  kind: "THRESHOLD" | "GOAL";
  metric: MetricAlertMetric;
  condition: MetricAlertCondition;
  threshold: string;
  period: MetricAlertPeriod;
  accountId: string; // "" = all accounts
  strategyId: string; // "" = any strategy, "none" = out of playbook
  goalId: string;
  goalCondition: "ACHIEVED" | "PROGRESS_BELOW";
  thresholdPct: string;
  cooldownMinutes: string;
}

const CONDITION_OPTIONS: MetricAlertCondition[] = [
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "EQUAL",
];

function freshForm(): FormState {
  return {
    name: "",
    kind: "THRESHOLD",
    metric: "NET_PNL",
    condition: "GREATER_THAN_OR_EQUAL",
    threshold: "1000",
    period: "THIS_MONTH",
    accountId: "",
    strategyId: "",
    goalId: "",
    goalCondition: "ACHIEVED",
    thresholdPct: "50",
    cooldownMinutes: "0",
  };
}

function formFromRule(rule: MetricAlertRule): FormState {
  const base = freshForm();
  return {
    ...base,
    name: rule.name,
    kind: rule.kind,
    metric: rule.kind === "THRESHOLD" ? rule.metric : base.metric,
    condition: rule.kind === "THRESHOLD" ? rule.condition : base.condition,
    threshold: rule.kind === "THRESHOLD" ? String(rule.threshold) : base.threshold,
    period: rule.kind === "THRESHOLD" ? rule.period : base.period,
    accountId: rule.accountId ?? "",
    strategyId: rule.strategyId ?? "",
    goalId: rule.kind === "GOAL" ? rule.goalId : "",
    goalCondition: rule.kind === "GOAL" ? rule.goalCondition : base.goalCondition,
    thresholdPct:
      rule.kind === "GOAL" && rule.thresholdPct !== null ? String(rule.thresholdPct) : base.thresholdPct,
    cooldownMinutes: String(rule.cooldownMinutes),
  };
}

export function AlertRuleFormDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: MetricAlertRule | null;
}) {
  const createRule = useCreateAlertRule();
  const updateRule = useUpdateAlertRule();
  const accounts = useAccounts();
  const strategies = useStrategies();
  const goals = useGoals();
  const [form, setForm] = React.useState<FormState>(freshForm);
  const [error, setError] = React.useState<string | null>(null);

  // Reset/seed the draft each time the dialog opens — guarded render-time
  // adjustment ("you might not need an effect", house pattern).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(rule === null ? freshForm() : formFromRule(rule));
      setError(null);
    }
  }

  const meta = METRIC_ALERT_REGISTRY[form.metric];
  const conditionOptions = CONDITION_OPTIONS.filter((condition) =>
    meta.conditions.includes(condition),
  );
  const pending = createRule.isPending || updateRule.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      // Keep the condition legal for the selected metric (registry-driven).
      if (key === "metric") {
        const nextMeta = METRIC_ALERT_REGISTRY[next.metric];
        if (!nextMeta.conditions.includes(next.condition)) {
          next.condition = nextMeta.conditions[0]!;
        }
      }
      return next;
    });
  };

  const submit = () => {
    setError(null);
    const threshold = Number(form.threshold);
    const thresholdPct = Number(form.thresholdPct);
    const cooldown = Number(form.cooldownMinutes);
    const payload: CreateMetricAlertRuleInput | { error: string } =
      form.kind === "THRESHOLD"
        ? {
            kind: "THRESHOLD",
            name: form.name.trim(),
            metric: form.metric,
            condition: form.condition,
            threshold,
            period: form.period,
            accountId: form.accountId || null,
            strategyId: form.strategyId ? form.strategyId : null,
            cooldownMinutes: Number.isFinite(cooldown) ? cooldown : 0,
          }
        : {
            kind: "GOAL",
            name: form.name.trim(),
            goalId: form.goalId,
            goalCondition: form.goalCondition,
            thresholdPct:
              form.goalCondition === "PROGRESS_BELOW" && Number.isFinite(thresholdPct)
                ? thresholdPct
                : null,
            cooldownMinutes: Number.isFinite(cooldown) ? cooldown : 0,
          };
    if ("error" in payload) return;
    const parsed = createMetricAlertRuleInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "The rule is invalid.");
      return;
    }
    const mutation =
      rule === null
        ? createRule.mutateAsync(parsed.data)
        : updateRule.mutateAsync({
            ruleId: rule.id,
            input: parsed.data as Parameters<typeof updateRule.mutateAsync>[0]["input"],
          });
    mutation
      .then(() => {
        toast.success(rule === null ? "Alert rule created" : "Alert rule updated");
        onOpenChange(false);
      })
      .catch((mutationError: unknown) => {
        setError(apiErrorMessage(mutationError, "The rule could not be saved."));
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" data-testid="alert-rule-form">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {rule === null ? "New alert rule" : "Edit alert rule"}
          </DialogTitle>
          <DialogDescription>
            Watch a metric Euforia computes from your journal - the alert lands in your inbox when
            the condition turns true.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="alert-rule-name">Rule name</Label>
            <Input
              id="alert-rule-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="e.g. Monthly profit target"
              maxLength={80}
            />
          </div>

          {/* Kind — immutable after creation (server-enforced). */}
          <div className="space-y-1.5">
            <Label>Rule type</Label>
            <div className="flex gap-2" role="radiogroup" aria-label="Rule type">
              {(
                [
                  { id: "THRESHOLD", label: "Metric threshold" },
                  { id: "GOAL", label: "Goal" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === option.id}
                  disabled={rule !== null}
                  onClick={() => set("kind", option.id)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    form.kind === option.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted-foreground hover:text-foreground",
                    rule !== null && "opacity-60",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {form.kind === "THRESHOLD" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Metric</Label>
                  <Select value={form.metric} onValueChange={(value) => set("metric", value as MetricAlertMetric)}>
                    <SelectTrigger aria-label="Metric"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METRICS.map((metric) => (
                        <SelectItem key={metric} value={metric}>
                          {METRIC_ALERT_REGISTRY[metric].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Condition</Label>
                  <Select
                    value={form.condition}
                    onValueChange={(value) => set("condition", value as MetricAlertCondition)}
                  >
                    <SelectTrigger aria-label="Condition"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {conditionOptions.map((condition) => (
                        <SelectItem key={condition} value={condition}>
                          {CONDITION_LABELS[condition]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="alert-rule-threshold">
                    Threshold ({meta.unit.toLowerCase()})
                  </Label>
                  <Input
                    id="alert-rule-threshold"
                    type="number"
                    value={form.threshold}
                    onChange={(event) => set("threshold", event.target.value)}
                    aria-describedby="alert-rule-threshold-hint"
                  />
                  <p id="alert-rule-threshold-hint" className="text-[11px] text-muted-foreground">
                    {meta.unit === "PERCENT" ? "Percent 0–100" : `In ${meta.unit.toLowerCase()} units`}
                    {meta.higherIsBetter === false ? " · lower is better" : ""}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Period</Label>
                  <Select value={form.period} onValueChange={(value) => set("period", value as MetricAlertPeriod)}>
                    <SelectTrigger aria-label="Period"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((period) => (
                        <SelectItem key={period} value={period}>{PERIOD_LABELS[period]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Account</Label>
                  <Select value={form.accountId} onValueChange={(value) => set("accountId", value)}>
                    <SelectTrigger aria-label="Account scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All accounts</SelectItem>
                      {(accounts.data?.accounts ?? []).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Strategy</Label>
                  <Select value={form.strategyId} onValueChange={(value) => set("strategyId", value)}>
                    <SelectTrigger aria-label="Strategy scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any strategy</SelectItem>
                      <SelectItem value="none">Out of playbook</SelectItem>
                      {(strategies.data?.strategies ?? []).map((strategy) => (
                        <SelectItem key={strategy.id} value={strategy.id}>
                          {strategy.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Goal</Label>
                <Select value={form.goalId} onValueChange={(value) => set("goalId", value)}>
                  <SelectTrigger aria-label="Goal"><SelectValue placeholder="Pick a goal" /></SelectTrigger>
                  <SelectContent>
                    {(goals.data?.goals ?? [])
                      .filter((entry) => entry.goal.active !== false)
                      .map((entry) => (
                        <SelectItem key={entry.goal.id} value={entry.goal.id}>
                          {entry.goal.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {(goals.data?.goals ?? []).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No goals yet - create one on the Journal&apos;s Goals tab first.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Alert when</Label>
                  <Select
                    value={form.goalCondition}
                    onValueChange={(value) => set("goalCondition", value as FormState["goalCondition"])}
                  >
                    <SelectTrigger aria-label="Goal condition"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACHIEVED">Goal achieved</SelectItem>
                      <SelectItem value="PROGRESS_BELOW">Progress falls below…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.goalCondition === "PROGRESS_BELOW" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="alert-rule-pct">Progress %</Label>
                    <Input
                      id="alert-rule-pct"
                      type="number"
                      min={0}
                      max={100}
                      value={form.thresholdPct}
                      onChange={(event) => set("thresholdPct", event.target.value)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="alert-rule-cooldown">Cooldown (minutes, 0 = every transition)</Label>
            <Input
              id="alert-rule-cooldown"
              type="number"
              min={0}
              max={10080}
              value={form.cooldownMinutes}
              onChange={(event) => set("cooldownMinutes", event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Rules fire when the condition turns true; a cooldown suppresses repeat alerts while
              the condition flaps around the threshold.
            </p>
          </div>

          {error !== null && (
            <p role="alert" className="rounded-md bg-loss/10 px-3 py-2 text-xs text-loss">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            {rule === null ? "Create rule" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── The manager ──────────────────────────────────────────────────────────────

export function AlertRulesManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, refetch } = useAlertRules();
  const updateRule = useUpdateAlertRule();
  const deleteRule = useDeleteAlertRule();
  const evaluate = useEvaluateAlertRules();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MetricAlertRule | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<MetricAlertRule | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const rules = data?.rules ?? [];

  const runEvaluation = () => {
    evaluate.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(
          `Evaluation done - ${result.triggeredEvents} alert${result.triggeredEvents === 1 ? "" : "s"} fired`,
          {
            description:
              result.skippedNoData > 0
                ? `${result.skippedNoData} rule(s) had no data to evaluate.`
                : undefined,
          },
        );
      },
      onError: (mutationError: unknown) =>
                    toast.error(apiErrorMessage(mutationError, "The evaluation failed.")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto" data-testid="alert-rules-manager">
        <DialogHeader>
          <DialogTitle className="font-heading">Alert rules</DialogTitle>
          <DialogDescription>
            Threshold monitoring over your journal metrics and goals. Alerts land in the
            notification center after trades close.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              data-testid="alert-rule-create"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              New rule
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={runEvaluation}
              disabled={evaluate.isPending || rules.length === 0}
            >
              <Play className="size-3.5" aria-hidden="true" />
              {evaluate.isPending ? "Evaluating…" : "Run now"}
            </Button>
          </div>

          {isLoading ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">Loading rules…</p>
          ) : isError ? (
            <div className="space-y-2 px-1 py-6 text-center">
              <p className="text-sm text-loss">Alert rules could not be loaded.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : rules.length === 0 ? (
            <div className="space-y-1 px-1 py-8 text-center" data-testid="alert-rules-empty">
              <Target className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">No alert rules yet</p>
              <p className="text-xs text-muted-foreground">
                Create one to get an inbox alert when a metric crosses your threshold.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border" data-testid="alert-rule-list">
              {rules.map((rule) => (
                <li key={rule.id} className="px-3 py-2.5" data-testid="alert-rule-row">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {rule.name}
                        </p>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {rule.kind === "GOAL" ? "Goal" : "Metric"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {alertRuleSummary(rule)}
                      </p>
                    </div>
                    <Switch
                      checked={rule.enabled}
                      aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                      onCheckedChange={(checked) =>
                        updateRule.mutate(
                          { ruleId: rule.id, input: { enabled: checked } },
                          {
                            onError: (mutationError: unknown) =>
                              toast.error(apiErrorMessage(mutationError, "The rule could not be updated.")),
                          },
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => {
                        setEditing(rule);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground hover:text-loss"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setPendingDelete(rule)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-expanded={expanded === rule.id}
                      aria-label={`Toggle events for ${rule.name}`}
                      onClick={() => setExpanded((current) => (current === rule.id ? null : rule.id))}
                    >
                      <ChevronDown
                        className={cn("size-3.5 transition-transform", expanded === rule.id && "rotate-180")}
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                  {expanded === rule.id && <RuleEventsList ruleId={rule.id} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>

      <AlertRuleFormDialog open={formOpen} onOpenChange={setFormOpen} rule={editing} />

      {/* Delete confirmation — destructive, consistent with app conventions. */}
      <Dialog open={pendingDelete !== null} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <DialogContent className="max-w-md" data-testid="alert-rule-delete-confirm">
          <DialogHeader>
            <DialogTitle className="font-heading">Delete alert rule</DialogTitle>
            <DialogDescription>
              {pendingDelete === null
                ? ""
                : `"${pendingDelete.name}" will stop evaluating. Past alerts stay in your inbox history.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
              Keep rule
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (pendingDelete === null) return;
                deleteRule.mutate(pendingDelete.id, {
                  onSuccess: () => {
                    toast.success("Alert rule deleted");
                    setPendingDelete(null);
                  },
                  onError: (mutationError: unknown) =>
                    toast.error(apiErrorMessage(mutationError, "The rule could not be deleted.")),
                });
              }}
            >
              Delete rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

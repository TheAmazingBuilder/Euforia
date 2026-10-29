"use client";

import * as React from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock3, History, Pause, Play, Plus, Trash2, Workflow } from "lucide-react";

import type { TaskyAutomationTrigger, TaskyKanbanColumn } from "@cosmoz/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCheckTaskyDueDates,
  useCreateTaskyAutomation,
  useDeleteTaskyAutomation,
  useTaskyAutomationRuns,
  useTaskyAutomations,
  useUpdateTaskyAutomation,
} from "@/lib/api/queries";

type Props = { columns: TaskyKanbanColumn[] };

const TRIGGER_LABEL: Record<TaskyAutomationTrigger, string> = {
  CARD_MOVED: "When a card enters a list",
  DUE_SOON: "Before the due date",
  OVERDUE: "After the due date",
};

function triggerSummary(
  trigger: TaskyAutomationTrigger,
  config: { destinationColumnId?: string; daysBeforeDue?: number },
  columns: TaskyKanbanColumn[],
): string {
  if (trigger === "CARD_MOVED") {
    return `When a card moves to “${columns.find((column) => column.id === config.destinationColumnId)?.title ?? config.destinationColumnId ?? "unknown list"}”.`;
  }
  if (trigger === "DUE_SOON") return `Notify ${config.daysBeforeDue ?? 1} calendar day(s) before the due date.`;
  return "Notify once when a card becomes overdue.";
}

function relativeDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function TaskyAutomationsPanel({ columns }: Props) {
  const rulesQuery = useTaskyAutomations();
  const runsQuery = useTaskyAutomationRuns();
  const createRule = useCreateTaskyAutomation();
  const updateRule = useUpdateTaskyAutomation();
  const deleteRule = useDeleteTaskyAutomation();
  const checkDueDates = useCheckTaskyDueDates();

  const [name, setName] = React.useState("");
  const [trigger, setTrigger] = React.useState<TaskyAutomationTrigger>("CARD_MOVED");
  const [destinationColumnId, setDestinationColumnId] = React.useState("");
  const [daysBeforeDue, setDaysBeforeDue] = React.useState("1");
  const [notificationMessage, setNotificationMessage] = React.useState("");

  React.useEffect(() => {
    if (!destinationColumnId && columns[0]) setDestinationColumnId(columns[0].id);
    if (destinationColumnId && !columns.some((column) => column.id === destinationColumnId)) {
      setDestinationColumnId(columns[0]?.id ?? "");
    }
  }, [columns, destinationColumnId]);

  const rules = rulesQuery.data?.rules ?? [];
  const runs = runsQuery.data?.runs ?? [];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const config = {
      ...(trigger === "CARD_MOVED" ? { destinationColumnId } : {}),
      ...(trigger === "DUE_SOON" ? { daysBeforeDue: Number(daysBeforeDue) } : {}),
      ...(notificationMessage.trim() ? { notificationMessage: notificationMessage.trim() } : {}),
    };
    createRule.mutate(
      { name: name.trim(), trigger, enabled: true, config },
      {
        onSuccess: () => {
          setName("");
          setNotificationMessage("");
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-5" data-testid="tasky-automations-panel">
      <header className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface">
            <Workflow className="size-5 text-accent" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Automations</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Create simple rules for column changes and due dates. Every rule sends a notification to Euforia’s notification inbox.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => checkDueDates.mutate()}
          disabled={checkDueDates.isPending}
          data-testid="tasky-check-due-dates"
          className="shrink-0"
        >
          <BellRing className="size-4" aria-hidden="true" />
          {checkDueDates.isPending ? "Checking…" : "Check due dates now"}
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <section className="rounded-xl border border-border bg-background/40 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Plus className="size-4" aria-hidden="true" />
            Create a rule
          </h3>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3" data-testid="tasky-automation-create-form">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tasky-automation-name" className="text-xs font-medium text-muted-foreground">Rule name</label>
              <Input
                id="tasky-automation-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Review reminder"
                maxLength={80}
                required
                data-testid="tasky-automation-name"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tasky-automation-trigger" className="text-xs font-medium text-muted-foreground">When should it run?</label>
              <select
                id="tasky-automation-trigger"
                value={trigger}
                onChange={(event) => setTrigger(event.target.value as TaskyAutomationTrigger)}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                data-testid="tasky-automation-trigger"
              >
                <option value="CARD_MOVED">{TRIGGER_LABEL.CARD_MOVED}</option>
                <option value="DUE_SOON">{TRIGGER_LABEL.DUE_SOON}</option>
                <option value="OVERDUE">{TRIGGER_LABEL.OVERDUE}</option>
              </select>
            </div>

            {trigger === "CARD_MOVED" ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tasky-automation-column" className="text-xs font-medium text-muted-foreground">Destination list</label>
                <select
                  id="tasky-automation-column"
                  value={destinationColumnId}
                  onChange={(event) => setDestinationColumnId(event.target.value)}
                  required
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  data-testid="tasky-automation-column"
                >
                  {columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}
                </select>
              </div>
            ) : null}

            {trigger === "DUE_SOON" ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tasky-automation-days" className="text-xs font-medium text-muted-foreground">Remind me how many days before?</label>
                <select
                  id="tasky-automation-days"
                  value={daysBeforeDue}
                  onChange={(event) => setDaysBeforeDue(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  data-testid="tasky-automation-days"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => <option key={day} value={day}>{day} {day === 1 ? "day" : "days"} before</option>)}
                </select>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tasky-automation-message" className="text-xs font-medium text-muted-foreground">Optional notification message</label>
              <Input
                id="tasky-automation-message"
                value={notificationMessage}
                onChange={(event) => setNotificationMessage(event.target.value)}
                placeholder="Use the default message"
                maxLength={180}
                data-testid="tasky-automation-message"
              />
            </div>

            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <BellRing className="mr-1 inline size-3.5" aria-hidden="true" />
              Action: publish an in-app notification and record the execution result.
            </p>
            <Button type="submit" disabled={createRule.isPending || !name.trim() || (trigger === "CARD_MOVED" && !destinationColumnId)} data-testid="tasky-automation-create">
              {createRule.isPending ? "Saving rule…" : "Create automation"}
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-background/40 p-4">
          <h3 className="text-sm font-semibold">Your rules <span className="ml-1 font-mono text-muted-foreground">{rules.length}</span></h3>
          {rulesQuery.isError ? (
            <p className="mt-3 text-sm text-loss" role="alert">Could not load automation rules. Try refreshing Tasky.</p>
          ) : rulesQuery.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">Loading rules…</p>
          ) : rules.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No rules yet. Create one to start receiving reminders.
            </p>
          ) : (
            <div className="mt-3 flex flex-col divide-y divide-border">
              {rules.map((rule) => (
                <article key={rule.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-testid={`tasky-automation-${rule.id}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 size-2 shrink-0 rounded-full ${rule.enabled ? "bg-profit" : "bg-muted-foreground/50"}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <h4 className="break-words text-sm font-medium">{rule.name}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {triggerSummary(rule.trigger, rule.config, columns)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{rule.enabled ? "Active" : "Paused"} · In-app notification</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-4">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updateRule.mutate({ ruleId: rule.id, input: { enabled: !rule.enabled } })}
                      disabled={updateRule.isPending}
                      data-testid={`tasky-automation-toggle-${rule.id}`}
                    >
                      {rule.enabled ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
                      {rule.enabled ? "Pause" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRule.mutate(rule.id)}
                      disabled={deleteRule.isPending}
                      data-testid={`tasky-automation-delete-${rule.id}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-background/40 p-4" data-testid="tasky-automation-history">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" aria-hidden="true" />
            Execution history
          </h3>
          <span className="font-mono text-xs text-muted-foreground">{runs.length} recent</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Successful notifications and errors stay here for troubleshooting. Deleting a rule does not delete its history.</p>

        {runsQuery.isError ? (
          <p className="mt-3 text-sm text-loss" role="alert">Could not load the automation history.</p>
        ) : runsQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">Loading execution history…</p>
        ) : runs.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-7 text-center">
            <Clock3 className="size-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">No executions yet</p>
            <p className="text-xs text-muted-foreground">Run a due-date check or move a card into a rule’s destination list.</p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {runs.map((run) => (
              <article key={run.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start" data-testid={`tasky-automation-run-${run.id}`}>
                <span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${run.status === "SUCCEEDED" ? "bg-profit/10 text-profit" : run.status === "FAILED" ? "bg-loss/10 text-loss" : "bg-muted text-muted-foreground"}`}>
                  {run.status === "SUCCEEDED" ? <CheckCircle2 className="size-3" aria-hidden="true" /> : <AlertTriangle className="size-3" aria-hidden="true" />}
                  {run.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{run.automationName}</p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">{run.cardTitle ? `“${run.cardTitle}” · ` : ""}{run.message}</p>
                  {run.error ? <p className="mt-1 break-words text-xs text-loss">Error: {run.error}</p> : null}
                </div>
                <time dateTime={run.createdAt} className="shrink-0 text-[10px] text-muted-foreground">{relativeDate(run.createdAt)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

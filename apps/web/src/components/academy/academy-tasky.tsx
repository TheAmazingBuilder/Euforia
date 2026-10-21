"use client";

import * as React from "react";
import {
  BookOpen,
  ClipboardCheck,
  Flame,
  ListTodo,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import type { AcademyTask, AcademyTaskKind, AcademyTaskPriority } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/academy/academy-shared";
import {
  useAcademyCreateTask,
  useAcademyDeleteTask,
  useAcademyTasks,
  useAcademyToggleTask,
} from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Tasky — the Academy study task manager. A prioritized backlog with due
 * dates, one-tap completion, XP and a completion streak; tasks can deep
 * link back into courses, drills or the review journal.
 */

const KIND_ICON: Record<AcademyTaskKind, React.ComponentType<{ className?: string }>> = {
  LESSON: BookOpen,
  DRILL: RefreshCw,
  REVIEW: ClipboardCheck,
  CUSTOM: ListTodo,
};

const PRIORITY_STYLE: Record<AcademyTaskPriority, string> = {
  HIGH: "border-loss/40 bg-loss/10 text-loss",
  MEDIUM: "border-warning/40 bg-warning/10 text-warning",
  LOW: "border-border bg-muted/30 text-muted-foreground",
};

function dueBand(task: AcademyTask, now: Date): { label: string; tone: string } | null {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const diffHours = (due.getTime() - now.getTime()) / 3_600_000;
  if (diffHours < 0) return { label: "Overdue", tone: "text-loss" };
  if (diffHours < 24) return { label: "Due today", tone: "text-warning" };
  if (diffHours < 72) return { label: "Due soon", tone: "text-foreground" };
  return {
    label: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    tone: "text-muted-foreground",
  };
}

function TaskRow({ task, now }: { task: AcademyTask; now: Date }) {
  const { dict } = useI18n();
  const T = dict.academy.tasky;
  const toggle = useAcademyToggleTask();
  const remove = useAcademyDeleteTask();

  const KindIcon = KIND_ICON[task.kind];
  const due = dueBand(task, now);

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border bg-surface p-3 transition-colors",
        task.done ? "opacity-60" : "hover:border-accent/40",
      )}
      data-testid={`academy-task-${task.id}`}
      data-done={task.done ? "true" : "false"}
    >
      {/* Completion toggle */}
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? T.reopen : T.done}
        data-testid={`academy-task-check-${task.id}`}
        onClick={() => toggle.mutate({ taskId: task.id, done: !task.done })}
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
          task.done ? "border-accent bg-accent text-white" : "border-border bg-background hover:border-accent",
        )}
      >
        {task.done ? (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M3 8.5 6.4 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("text-sm font-medium", task.done && "line-through")}>{task.title}</span>
          <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", PRIORITY_STYLE[task.priority])}>
            {T.priorityLabels[task.priority]}
          </span>
        </div>
        {task.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <KindIcon className="size-3" aria-hidden="true" />
            {T.kindLabels[task.kind]}
          </span>
          {due ? <span className={cn("font-medium", due.tone)}>{due.label}</span> : <span>{T.noDue}</span>}
          <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-accent">
            <Zap className="size-3" aria-hidden="true" />
            {task.xp} {T.xp}
          </span>
          {task.href ? (
            <a href={task.href} className="underline decoration-dotted underline-offset-2 hover:text-accent">
              Open
            </a>
          ) : null}
        </div>
      </div>

      {/* Delete */}
      <button
        type="button"
        aria-label={T.delete}
        title={T.delete}
        data-testid={`academy-task-delete-${task.id}`}
        onClick={() => remove.mutate({ taskId: task.id })}
        className="mt-0.5 hidden shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-loss/10 hover:text-loss group-hover:block"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

type Filter = "ALL" | "OPEN" | "DONE";

/** One snapshot per panel mount — keeps "due today" stable while reading. */
const NOW = new Date();

export function AcademyTaskyPanel() {
  const { dict } = useI18n();
  const T = dict.academy.tasky;
  const tasksQuery = useAcademyTasks();
  const createTask = useAcademyCreateTask();

  const [title, setTitle] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("ALL");

  if (tasksQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  const tasks = tasksQuery.data?.tasks ?? [];
  const streakDays = tasksQuery.data?.streakDays ?? 0;
  const totalXp = tasksQuery.data?.totalXp ?? 0;
  const doneCount = tasks.filter((task) => task.done).length;
  const openTasks = tasks.filter((task) => !task.done);
  const visible = filter === "ALL" ? tasks : filter === "OPEN" ? openTasks : tasks.filter((task) => task.done);

  const onAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "") return;
    createTask.mutate(
      { title: trimmed, kind: "CUSTOM", priority: "MEDIUM", xp: 10 },
      { onSuccess: () => setTitle("") },
    );
  };

  return (
    <div className="space-y-5" data-testid="academy-tasky-panel">
      {/* Summary band: ring + streak + XP */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-surface p-4">
        <ProgressRing percent={tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100)} size={64}>
          <span className="text-center font-mono text-[11px] font-bold tabular-nums">
            {doneCount}
            <span className="block text-[9px] font-medium text-muted-foreground">{T.completedOf} {tasks.length}</span>
          </span>
        </ProgressRing>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning">
            <Flame className="size-3.5" aria-hidden="true" />
            <span className="font-mono font-bold tabular-nums">{streakDays}</span> {T.streakDays}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent">
            <Zap className="size-3.5" aria-hidden="true" />
            <span className="font-mono font-bold tabular-nums">{totalXp}</span> {T.totalXp}
          </span>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1" role="group" aria-label={T.filterAll}>
          {(
            [
              ["ALL", T.filterAll],
              ["OPEN", T.filterOpen],
              ["DONE", T.filterDone],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              data-testid={`academy-tasky-filter-${value.toLowerCase()}`}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === value
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-background text-muted-foreground hover:border-accent/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Inline add form */}
      <form onSubmit={onAdd} className="flex gap-2" data-testid="academy-tasky-add-form">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={T.addPlaceholder}
          aria-label={T.addButton}
          data-testid="academy-tasky-input"
          maxLength={120}
          className="h-10 flex-1"
        />
        <Button type="submit" disabled={title.trim() === "" || createTask.isPending} data-testid="academy-tasky-add" className="h-10 gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          {T.addButton}
        </Button>
      </form>

      {/* Task list */}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{T.empty}</p>
      ) : (
        <div className="grid gap-2">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} now={NOW} />
          ))}
        </div>
      )}
    </div>
  );
}

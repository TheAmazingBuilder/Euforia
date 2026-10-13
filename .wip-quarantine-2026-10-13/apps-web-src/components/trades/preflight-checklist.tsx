"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, ListChecks, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Pre-flight checklist (Priorité 2 — Playbook ⇄ Session loop): three binary
 * process questions shown in the capture form whenever a playbook setup is
 * selected. Answers freeze into Trade.checklistSnap at submit time, feeding
 * the discipline score's checklist-completion component. Deliberately NOT
 * blocking: a "No" is captured honestly instead of preventing the record —
 * the journal coaches, it does not police.
 */

export const PREFLIGHT_QUESTIONS = [
  {
    key: "setup_clear",
    question: "Setup matches your playbook criteria exactly",
    hint: "Location, trigger, invalidation — all three clear",
  },
  {
    key: "risk_within_limits",
    question: "Size is within your risk budget and session heat cap",
    hint: "The sizer math is respected, no oversize",
  },
  {
    key: "news_checked",
    question: "News / economic calendar checked before entry",
    hint: "No surprise release inside your holding window",
  },
] as const;

export type ChecklistAnswers = Record<string, boolean | null>;

export function countChecklistAnswered(answers: ChecklistAnswers): number {
  return PREFLIGHT_QUESTIONS.filter((q) => answers[q.key] !== null && answers[q.key] !== undefined)
    .length;
}

/** Strips unanswered questions; returns undefined when nothing was answered. */
export function serializeChecklist(
  answers: ChecklistAnswers,
): Record<string, boolean> | undefined {
  const entries: [string, boolean][] = [];
  for (const q of PREFLIGHT_QUESTIONS) {
    const value = answers[q.key];
    if (typeof value === "boolean") entries.push([q.key, value]);
  }
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

type PreflightChecklistProps = {
  strategyName: string | null;
  entryRules: string | null;
  answers: ChecklistAnswers;
  onChange: (key: string, value: boolean) => void;
};

export function PreflightChecklist({
  strategyName,
  entryRules,
  answers,
  onChange,
}: PreflightChecklistProps) {
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const answered = countChecklistAnswered(answers);
  const anyNo = PREFLIGHT_QUESTIONS.some((q) => answers[q.key] === false);
  const hasRules = entryRules !== null && entryRules.trim() !== "";

  return (
    <section
      className="rounded-lg border border-border bg-surface"
      data-testid="preflight-checklist"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <ListChecks className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Pre-flight checklist
            {strategyName !== null ? (
              <span className="ml-1.5 text-muted-foreground">· {strategyName}</span>
            ) : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            frozen into the trade record — honesty over comfort
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {answered}/{PREFLIGHT_QUESTIONS.length}
        </span>
      </div>

      {hasRules ? (
        <div className="mx-3 mb-1">
          <button
            type="button"
            onClick={() => setRulesOpen((open) => !open)}
            aria-expanded={rulesOpen}
            className="flex w-full items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-left text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {rulesOpen ? (
              <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
            )}
            Playbook criteria — read before answering
          </button>
          {rulesOpen ? (
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-border/70 bg-background/60 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
              {entryRules}
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="divide-y divide-border/60">
        {PREFLIGHT_QUESTIONS.map((q) => {
          const value = answers[q.key] === true || answers[q.key] === false ? answers[q.key] : null;
          return (
            <li key={q.key} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{q.question}</p>
                <p className="truncate text-[10px] text-muted-foreground">{q.hint}</p>
              </div>
              <div className="flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label={q.question}>
                {([true, false] as const).map((option) => {
                  const active = value === option;
                  return (
                    <button
                      key={String(option)}
                      type="button"
                      onClick={() => onChange(q.key, option)}
                      aria-pressed={active}
                      aria-label={`${option ? "Yes" : "No"} — ${q.question}`}
                      className={cn(
                        "grid h-7 w-9 place-items-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? option
                            ? "bg-accent text-accent-foreground"
                            : "bg-foreground text-background"
                          : "bg-surface text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option ? (
                        <Check className="size-3.5" aria-hidden="true" />
                      ) : (
                        <span aria-hidden="true" className="text-xs font-bold leading-none">✕</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      {anyNo ? (
        <p className="flex items-start gap-1.5 border-t border-border/60 px-3 py-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          A red check is still a valid capture — the journal records it, the discipline score will price it.
        </p>
      ) : null}
    </section>
  );
}

"use client";

/**
 * PlanChecklist — the categorized pre-trade checklist (spec §39–§46).
 * MANUAL items toggle locally per the plan's lifecycle; AUTO items render
 * the server's evaluation with its detail code mapped through the dict.
 * Required vs optional is always textual — never color-only.
 */

import * as React from "react";
import { CircleCheck, CircleX, Hourglass } from "lucide-react";
import type { PlanChecklistCategory, PlanChecklistItem } from "@cosmoz/shared";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";
import { detailMessage } from "./planner-shared";

const CATEGORY_ORDER: readonly PlanChecklistCategory[] = [
  "MARKET_CONTEXT",
  "SETUP",
  "RISK",
  "NEWS_SESSION",
  "DISCIPLINE",
];

export function PlanChecklist({ items, onToggle, disabled }: {
  items: PlanChecklistItem[];
  /** MANUAL item state change — server is authoritative for AUTO. */
  onToggle: (itemId: string, checked: boolean) => void;
  /** Toggling is disabled while saving or on terminal plans. */
  disabled?: boolean;
}) {
  const { dict } = useI18n();
  const C = dict.planner.checklist;
  return (
    <div className="space-y-5" data-testid="planner-checklist">
      {CATEGORY_ORDER.map((category) => {
        const categoryItems = items.filter((item) => item.category === category);
        if (categoryItems.length === 0) return null;
        return (
          <section key={category} aria-label={C.categories[category]}>
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
              {C.categories[category]}
            </h4>
            <ul className="space-y-1.5">
              {categoryItems.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  onToggle={onToggle}
                  disabled={disabled}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ChecklistRow({ item, onToggle, disabled }: {
  item: PlanChecklistItem;
  onToggle: (itemId: string, checked: boolean) => void;
  disabled?: boolean;
}) {
  const { dict } = useI18n();
  const C = dict.planner.checklist;
  const testid = `planner-check-${item.id}`;

  if (item.kind === "AUTO") {
    const detail = detailMessage(dict, item.detail);
    return (
      <li
        className="flex items-start gap-2.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
        data-testid={testid}
        data-state={item.state}
      >
        <span className="mt-0.5 shrink-0" aria-hidden>
          {item.state === "PASSED" ? (
            <CircleCheck className="size-4 text-profit" />
          ) : item.state === "FAILED" ? (
            <CircleX className="size-4 text-loss" />
          ) : (
            <Hourglass className="size-4 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "text-sm",
                item.state === "FAILED" && "font-medium text-loss",
              )}
            >
              {item.label}
            </span>
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              {C.autoBadge}
            </Badge>
            <RequiredMark required={item.required} />
          </div>
          {detail && item.state !== "PASSED" && (
            <p className="mt-0.5 text-xs text-muted-foreground" data-testid={`${testid}-detail`}>
              {detail}
            </p>
          )}
          <span className="sr-only">
            {item.state === "PASSED" ? C.passedAria : item.state === "FAILED" ? C.failedAria : C.states.UNCHECKED}
          </span>
        </div>
      </li>
    );
  }

  const checked = item.state === "CHECKED" || item.state === "PASSED";
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2",
        checked ? "border-accent/40 bg-accent/5" : "border-border/60",
      )}
      data-testid={testid}
      data-state={item.state}
    >
      <Checkbox
        id={testid}
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onToggle(item.id, value === true)}
        aria-label={item.label}
      />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={testid}
          className={cn(
            "block cursor-pointer text-sm",
            checked && "text-muted-foreground line-through decoration-border",
          )}
        >
          {item.label}
        </label>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <RequiredMark required={item.required} />
        {item.state === "NOT_APPLICABLE" && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            {C.states.NOT_APPLICABLE}
          </Badge>
        )}
      </div>
    </li>
  );
}

function RequiredMark({ required }: { required: boolean }) {
  const { dict } = useI18n();
  const C = dict.planner.checklist;
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wider",
        required ? "text-foreground/70" : "text-muted-foreground/60",
      )}
    >
      {required ? C.requiredBadge : C.optionalBadge}
    </span>
  );
}

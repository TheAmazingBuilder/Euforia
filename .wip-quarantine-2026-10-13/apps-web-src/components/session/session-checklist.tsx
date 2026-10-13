"use client";

/**
 * SessionChecklist — the trading checklist INSIDE Session Live (extension
 * demanded by the roadmap). Composed server-side at session start from the
 * Playbook ChecklistTemplate (strategy-scoped first, else global — items are
 * COPIED, the template stays canonical). The trader ticks items while the
 * session runs; every toggle PATCHes the active session and the response
 * state is re-rendered verbatim (no client-side recomputation).
 *
 * Honest states, never faked:
 *  - no active session → hint, checklist appears with the session;
 *  - active session without a checklist (no template) → pointer to Playbook;
 *  - required items are badged so "5/8" is never mistaken for "done".
 */

import * as React from "react";
import { CheckCircle2, ListChecks, ClipboardEdit } from "lucide-react";
import { toast } from "sonner";
import type { TradingSession } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiErrorMessage } from "@/lib/api/client";
import { useI18n } from "@/i18n/i18n-provider";
import { useUpdateSessionLive } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

export function SessionChecklist({ activeSession }: { activeSession: TradingSession | null }) {
  const { dict } = useI18n();
  const C = dict.session.checklist;
  const update = useUpdateSessionLive();

  const checklist = activeSession?.checklist ?? null;
  const completed = checklist ? checklist.items.filter((item) => item.checked).length : 0;
  const total = checklist ? checklist.items.length : 0;
  const requiredLeft = checklist
    ? checklist.items.filter((item) => item.required && !item.checked).length
    : 0;
  const allDone = checklist !== null && total > 0 && completed === total;

  const onToggle = (itemId: string, checked: boolean) => {
    if (!activeSession) return;
    update.mutate(
      { sessionId: activeSession.id, checklistStates: [{ id: itemId, checked }] },
      {
        onError: (error) =>
          toast.error(C.updateFailed, { description: apiErrorMessage(error, C.updateFailed) }),
      },
    );
  };

  return (
    <section className="rounded-xl border border-border bg-surface" data-testid="session-checklist">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
          <ListChecks className="size-4 text-accent" aria-hidden="true" />
          {C.title}
        </h2>
        <p className="text-xs text-muted-foreground">{C.subtitle}</p>
      </header>
      <div className="p-4">
        {!activeSession ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="session-checklist-empty">
            <ClipboardEdit className="size-4 shrink-0" aria-hidden="true" />
            <p>{C.emptyHint}</p>
          </div>
        ) : !checklist || checklist.items.length === 0 ? (
          <div className="space-y-1" data-testid="session-checklist-no-template">
            <p className="text-sm font-medium text-foreground">{C.noTemplateTitle}</p>
            <p className="text-xs text-muted-foreground">{C.noTemplateHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2" data-testid="session-checklist-progress">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {completed}/{total}
                </span>
                {requiredLeft > 0 ? (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-500">
                    {C.requiredLeft.replace("{count}", String(requiredLeft))}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">
                    {C.requiredDone}
                  </Badge>
                )}
              </div>
              {checklist.templateName ? (
                <span className="max-w-[55%] truncate text-[11px] text-muted-foreground" title={checklist.templateName}>
                  {checklist.templateName}
                </span>
              ) : null}
            </div>

            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={completed}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label={C.progressAria}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  allDone ? "bg-emerald-500" : "bg-accent",
                )}
                style={{ width: `${total > 0 ? Math.round((completed / total) * 100) : 0}%` }}
              />
            </div>

            <ul className="space-y-1">
              {checklist.items.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
                    item.checked ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "hover:bg-muted/40",
                  )}
                  data-testid="session-check-item"
                  data-item-id={item.id}
                  data-checked={item.checked}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {item.checked ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <span className="size-4 shrink-0 rounded-full border border-border" aria-hidden="true" />
                    )}
                    <span className={cn("min-w-0 truncate text-sm", item.checked ? "text-foreground" : "text-muted-foreground")}>
                      {item.label}
                    </span>
                    {item.required ? (
                      <Badge variant="outline" className="shrink-0 border-accent/30 bg-accent/10 px-1.5 text-[9px] uppercase tracking-wide text-accent">
                        {C.requiredBadge}
                      </Badge>
                    ) : null}
                  </span>
                  <Switch
                    checked={item.checked}
                    onCheckedChange={(checked) => onToggle(item.id, checked)}
                    disabled={update.isPending}
                    aria-label={item.label}
                    data-testid={`session-check-toggle-${item.id}`}
                  />
                </li>
              ))}
            </ul>

            {allDone ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-400" data-testid="session-checklist-done">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {C.allDone}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

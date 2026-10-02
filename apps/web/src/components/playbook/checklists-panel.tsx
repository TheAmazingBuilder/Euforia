"use client";

import * as React from "react";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ChecklistTemplate, Strategy } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChecklistFormDialog } from "@/components/playbook/checklist-form-dialog";
import { apiErrorMessage } from "@/lib/api/client";
import { useChecklists, useDeleteChecklist } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Checklist templates (§16): required/optional ordered items per strategy (or
 * global). These templates are the SOURCE of the checklist frozen into each
 * trade's checklistSnap at entry time — templates evolve, history does not.
 */
export function ChecklistsPanel({ strategies }: { strategies: Strategy[] }) {
  const { dict } = useI18n();
  const V = dict.playbook.checklists;
  const S = dict.playbook.shared;
  const checklistsQuery = useChecklists();
  const deleteChecklist = useDeleteChecklist();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ChecklistTemplate | null>(null);

  const checklists = checklistsQuery.data?.checklists ?? [];
  const strategyById = new Map(strategies.map((strategy) => [strategy.id, strategy]));

  const remove = async (checklist: ChecklistTemplate) => {
    try {
      await deleteChecklist.mutateAsync(checklist.id);
      toast.success(V.toastDeleted);
    } catch (error) {
      toast.error(V.toastDeleteFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {checklists.length} {checklists.length === 1 ? V.templateOne : V.templateMany} {V.introTail}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> {V.newBtn}
        </Button>
      </div>

      {checklistsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label={V.loadingAria}>
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : checklists.length === 0 ? (
        <Card className="bg-surface">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <ListChecks className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 font-heading text-lg font-semibold">{V.emptyTitle}</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {V.emptyBody}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {checklists.map((checklist) => (
            <Card key={checklist.id} className="bg-surface" data-testid="checklist-card">
              <CardContent className="space-y-3 px-4 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-heading text-sm font-semibold text-foreground">
                      {checklist.name}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {checklist.strategyId === null ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {V.globalBadge}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-accent/40 px-1.5 py-0 text-[10px] text-accent"
                        >
                          {strategyById.get(checklist.strategyId)?.name ?? V.unknownStrategy}
                        </Badge>
                      )}
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {checklist.items.length} {V.itemsSuffix}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`${S.editPrefix} ${checklist.name}`}
                      onClick={() => {
                        setEditTarget(checklist);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 hover:text-destructive"
                      aria-label={`${S.deletePrefix} ${checklist.name}`}
                      onClick={() => void remove(checklist)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {checklist.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-0.5 inline-block size-3 shrink-0 rounded-sm border ${
                          item.required ? "border-accent bg-accent/15" : "border-border"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 text-foreground">{item.label}</span>
                      {!item.required ? (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {V.optionalLabel}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ChecklistFormDialog
        key={editTarget?.id ?? "create"}
        open={formOpen}
        onOpenChange={setFormOpen}
        checklist={editTarget}
        strategies={strategies}
      />
    </div>
  );
}

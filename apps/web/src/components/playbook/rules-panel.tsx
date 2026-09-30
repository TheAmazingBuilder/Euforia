"use client";

import * as React from "react";
import { Pencil, Plus, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { PlaybookRule, Strategy } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PlaybookRuleFormDialog } from "@/components/playbook/playbook-rule-form-dialog";
import { RULE_CATEGORY_LABELS } from "@/components/playbook/playbook-labels";
import { apiErrorMessage } from "@/lib/api/client";
import { useDeletePlaybookRule, usePlaybookRules, useUpdatePlaybookRule } from "@/lib/api/queries";

/**
 * Operating rules (§24): the playbook's own rule library — GLOBAL rules and
 * strategy-scoped ones. Distinct from the discipline Rules Engine: this is
 * the SOURCE the engine could evaluate where technical (evaluatable flag).
 */
export function RulesPanel({ strategies }: { strategies: Strategy[] }) {
  const rulesQuery = usePlaybookRules();
  const updateRule = useUpdatePlaybookRule();
  const deleteRule = useDeletePlaybookRule();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<PlaybookRule | null>(null);

  const rules = rulesQuery.data?.rules ?? [];
  const strategyById = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const globalRules = rules.filter((rule) => rule.scope === "GLOBAL");
  const scopedRules = rules.filter((rule) => rule.scope === "STRATEGY");

  const toggleActive = async (rule: PlaybookRule) => {
    try {
      await updateRule.mutateAsync({ ruleId: rule.id, input: { active: !rule.active } });
    } catch (error) {
      toast.error("Could not update the rule", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  const remove = async (rule: PlaybookRule) => {
    try {
      await deleteRule.mutateAsync(rule.id);
      toast.success("Rule deleted");
    } catch (error) {
      toast.error("Could not delete the rule", {
        description: apiErrorMessage(error, "Unexpected error"),
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rules.length} {rules.length === 1 ? "rule" : "rules"} — the operating constraints your
          strategies must respect. Rules the engine can check are marked.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> New Rule
        </Button>
      </div>

      {rulesQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading rules">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : rules.length === 0 ? (
        <Card className="bg-surface">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <ScrollText className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 font-heading text-lg font-semibold">No operating rule yet</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Write the constraints once — news windows, concurrency caps, cooldowns — instead of
              re-deciding them under pressure.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <RuleGroup
            title="Global rules"
            description="Apply to every strategy in the playbook."
            rules={globalRules}
            strategyById={strategyById}
            onToggle={toggleActive}
            onEdit={(rule) => {
              setEditTarget(rule);
              setFormOpen(true);
            }}
            onRemove={remove}
          />
          <RuleGroup
            title="Strategy-scoped rules"
            description="Only bind the strategy they name."
            rules={scopedRules}
            strategyById={strategyById}
            onToggle={toggleActive}
            onEdit={(rule) => {
              setEditTarget(rule);
              setFormOpen(true);
            }}
            onRemove={remove}
          />
        </>
      )}

      <PlaybookRuleFormDialog
        key={editTarget?.id ?? "create"}
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editTarget}
        strategies={strategies}
      />
    </div>
  );
}

function RuleGroup({
  title,
  description,
  rules,
  strategyById,
  onToggle,
  onEdit,
  onRemove,
}: {
  title: string;
  description: string;
  rules: PlaybookRule[];
  strategyById: Map<string, Strategy>;
  onToggle: (rule: PlaybookRule) => void;
  onEdit: (rule: PlaybookRule) => void;
  onRemove: (rule: PlaybookRule) => void;
}) {
  if (rules.length === 0) return null;
  return (
    <section aria-label={title}>
      <header className="mb-2">
        <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="space-y-2">
        {rules.map((rule) => (
          <Card key={rule.id} className="bg-surface" data-testid="playbook-rule-row">
            <CardContent className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{rule.title}</span>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {RULE_CATEGORY_LABELS[rule.category]}
                  </Badge>
                  {rule.scope === "STRATEGY" && rule.strategyId ? (
                    <Badge variant="outline" className="border-accent/40 px-1.5 py-0 text-[10px] text-accent">
                      {strategyById.get(rule.strategyId)?.name ?? "Unknown strategy"}
                    </Badge>
                  ) : null}
                  {rule.evaluatable ? (
                    <span
                      className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                      title={rule.evaluationHint ?? "The Rules Engine can evaluate this rule."}
                    >
                      Rules engine
                    </span>
                  ) : null}
                  {!rule.active ? (
                    <Badge variant="outline" className="border-border px-1.5 py-0 text-[10px] text-muted-foreground">
                      Inactive
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{rule.detail}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rule.active}
                  onCheckedChange={() => onToggle(rule)}
                  aria-label={rule.active ? `Deactivate ${rule.title}` : `Activate ${rule.title}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Edit ${rule.title}`}
                  onClick={() => onEdit(rule)}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 hover:text-destructive"
                  aria-label={`Delete ${rule.title}`}
                  onClick={() => void onRemove(rule)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

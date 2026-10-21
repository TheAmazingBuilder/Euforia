"use client";

import * as React from "react";
import { toast } from "sonner";
import type { CreatePlaybookRuleInput, PlaybookRule, Strategy, UpdatePlaybookRuleInput } from "@cosmoz/shared";

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
import { Textarea } from "@/components/ui/textarea";
import { ruleCategoryLabels } from "@/components/playbook/playbook-labels";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreatePlaybookRule, useUpdatePlaybookRule } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Operating-rule create/edit dialog (§24): scope (global vs strategy),
 * category, and the honest "evaluatable by the Rules Engine" flag with its
 * hint — never pretend a rule is executable when it is not.
 */

interface RuleFormValues {
  title: string;
  detail: string;
  category: PlaybookRule["category"];
  scope: "GLOBAL" | "STRATEGY";
  strategyId: string;
  active: boolean;
  evaluatable: boolean;
  evaluationHint: string;
}

function valuesFromRule(rule: PlaybookRule | null, strategies: Strategy[]): RuleFormValues {
  return {
    title: rule?.title ?? "",
    detail: rule?.detail ?? "",
    category: rule?.category ?? "RISK",
    scope: rule?.scope ?? "GLOBAL",
    strategyId: rule?.strategyId ?? strategies[0]?.id ?? "",
    active: rule?.active ?? true,
    evaluatable: rule?.evaluatable ?? false,
    evaluationHint: rule?.evaluationHint ?? "",
  };
}

export function PlaybookRuleFormDialog({
  open,
  onOpenChange,
  rule,
  strategies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: PlaybookRule | null;
  strategies: Strategy[];
}) {
  const { dict } = useI18n();
  const V = dict.playbook.ruleForm;
  const S = dict.playbook.shared;
  const RULE_CATEGORY_LABELS = ruleCategoryLabels(dict.playbook.labels.ruleCategory);
  const isEdit = rule !== null;
  const createRule = useCreatePlaybookRule();
  const updateRule = useUpdatePlaybookRule();

  const [values, setValues] = React.useState<RuleFormValues>(() => valuesFromRule(rule, strategies));
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(valuesFromRule(rule, strategies));
  }
  const patch = (partial: Partial<RuleFormValues>) =>
    setValues((previous) => ({ ...previous, ...partial }));

  const titleError = values.title.trim() === "" ? V.titleRequired : null;
  const strategyError =
    values.scope === "STRATEGY" && values.strategyId === "" ? V.strategyRequired : null;
  const pending = createRule.isPending || updateRule.isPending;

  const submit = async () => {
    const payload: CreatePlaybookRuleInput = {
      title: values.title.trim(),
      detail: values.detail,
      category: values.category,
      scope: values.scope,
      strategyId: values.scope === "STRATEGY" ? values.strategyId : null,
      active: values.active,
      evaluatable: values.evaluatable,
      evaluationHint: values.evaluationHint.trim() === "" ? null : values.evaluationHint.trim(),
    };
    try {
      if (isEdit) {
        await updateRule.mutateAsync({ ruleId: rule.id, input: payload as UpdatePlaybookRuleInput });
        toast.success(V.toastUpdated);
      } else {
        await createRule.mutateAsync(payload);
        toast.success(V.toastCreated);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(isEdit ? V.toastUpdateFailed : V.toastCreateFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{isEdit ? V.editTitle : V.createTitle}</DialogTitle>
          <DialogDescription>
            {V.desc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-title">{V.titleLabel}</Label>
            <Input
              id="rule-title"
              value={values.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder={V.titlePlaceholder}
            />
            {titleError ? <p className="text-xs text-loss">{titleError}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-detail">{V.detailLabel}</Label>
            <Textarea
              id="rule-detail"
              rows={3}
              value={values.detail}
              onChange={(event) => patch({ detail: event.target.value })}
              placeholder={V.detailPlaceholder}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-category">{V.categoryLabel}</Label>
              <Select
                value={values.category}
                onValueChange={(value) => patch({ category: value as PlaybookRule["category"] })}
              >
                <SelectTrigger id="rule-category" aria-label={V.categoryAria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RULE_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-scope">{V.scopeLabel}</Label>
              <Select
                value={values.scope}
                onValueChange={(value) => patch({ scope: value as RuleFormValues["scope"] })}
              >
                <SelectTrigger id="rule-scope" aria-label={V.scopeAria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GLOBAL">{V.scopeGlobal}</SelectItem>
                  <SelectItem value="STRATEGY">{V.scopeStrategy}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {values.scope === "STRATEGY" ? (
            <div className="space-y-1.5">
              <Label htmlFor="rule-strategy">{V.strategyLabel}</Label>
              <Select value={values.strategyId} onValueChange={(value) => patch({ strategyId: value })}>
                <SelectTrigger id="rule-strategy" aria-label={V.strategyAria}>
                  <SelectValue placeholder={V.choosePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((strategy) => (
                    <SelectItem key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {strategyError ? <p className="text-xs text-loss">{strategyError}</p> : null}
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="rule-evaluatable">{V.evaluatableLabel}</Label>
                <p className="text-[11px] text-muted-foreground">
                  {V.evaluatableHint}
                </p>
              </div>
              <Switch
                id="rule-evaluatable"
                checked={values.evaluatable}
                onCheckedChange={(checked) => patch({ evaluatable: checked })}
              />
            </div>
            {values.evaluatable ? (
              <div className="space-y-1.5">
                <Label htmlFor="rule-hint">{V.hintLabel}</Label>
                <Input
                  id="rule-hint"
                  value={values.evaluationHint}
                  onChange={(event) => patch({ evaluationHint: event.target.value })}
                  placeholder={V.hintPlaceholder}
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <Label htmlFor="rule-active">{V.activeLabel}</Label>
              <Switch
                id="rule-active"
                checked={values.active}
                onCheckedChange={(checked) => patch({ active: checked })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {S.cancel}
          </Button>
          <Button onClick={() => void submit()} disabled={pending || titleError !== null || strategyError !== null}>
            {pending ? S.saving : isEdit ? S.saveChanges : V.createBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

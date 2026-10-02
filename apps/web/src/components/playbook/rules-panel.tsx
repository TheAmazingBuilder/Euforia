"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, ScrollText, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { PlaybookRule, Strategy } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { NofyLinkedNotesSection } from "@/components/nofy/nofy-linked-notes";
import { PlaybookRuleFormDialog } from "@/components/playbook/playbook-rule-form-dialog";
import { ruleCategoryLabels } from "@/components/playbook/playbook-labels";
import { apiErrorMessage } from "@/lib/api/client";
import { useCreateNofyNote, useDeletePlaybookRule, usePlaybookRules, useUpdatePlaybookRule } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Operating rules (§24): the playbook's own rule library — GLOBAL rules and
 * strategy-scoped ones. Distinct from the discipline Rules Engine: this is
 * the SOURCE the engine could evaluate where technical (evaluatable flag).
 */
export function RulesPanel({ strategies }: { strategies: Strategy[] }) {
  const { dict } = useI18n();
  const V = dict.playbook.rules;
  const S = dict.playbook.shared;
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
      toast.error(V.toastUpdateFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
      });
    }
  };

  const remove = async (rule: PlaybookRule) => {
    try {
      await deleteRule.mutateAsync(rule.id);
      toast.success(V.toastDeleted);
    } catch (error) {
      toast.error(V.toastDeleteFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rules.length} {rules.length === 1 ? V.ruleOne : V.ruleMany} {V.introTail}
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

      {rulesQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label={V.loadingAria}>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : rules.length === 0 ? (
        <Card className="bg-surface">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <ScrollText className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 font-heading text-lg font-semibold">{V.emptyTitle}</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {V.emptyBody}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <RuleGroup
            title={V.globalTitle}
            description={V.globalDesc}
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
            title={V.scopedTitle}
            description={V.scopedDesc}
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
  // Inline notes expansion — the RULE side of the Nofy knowledge loop.
  // Mounted lazily per expanded rule so the linked-notes queries stay O(1).
  const { dict } = useI18n();
  const V = dict.playbook.rules;
  const S = dict.playbook.shared;
  const RULE_CATEGORY_LABELS = ruleCategoryLabels(dict.playbook.labels.ruleCategory);
  const [notesFor, setNotesFor] = React.useState<string | null>(null);

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
                      {strategyById.get(rule.strategyId)?.name ?? V.unknownStrategy}
                    </Badge>
                  ) : null}
                  {rule.evaluatable ? (
                    <span
                      className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                      title={rule.evaluationHint ?? V.engineHintFallback}
                    >
                      {V.engineChip}
                    </span>
                  ) : null}
                  {!rule.active ? (
                    <Badge variant="outline" className="border-border px-1.5 py-0 text-[10px] text-muted-foreground">
                      {V.inactiveBadge}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{rule.detail}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn("size-7", notesFor === rule.id && "text-accent")}
                  aria-label={`${V.notesAriaPrefix} ${rule.title}`}
                  aria-expanded={notesFor === rule.id}
                  data-testid="rule-notes-toggle"
                  onClick={() => setNotesFor(notesFor === rule.id ? null : rule.id)}
                >
                  <StickyNote className="size-3.5" aria-hidden="true" />
                </Button>
                <Switch
                  checked={rule.active}
                  onCheckedChange={() => onToggle(rule)}
                  aria-label={rule.active ? `${V.deactivatePrefix} ${rule.title}` : `${V.activatePrefix} ${rule.title}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`${S.editPrefix} ${rule.title}`}
                  onClick={() => onEdit(rule)}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 hover:text-destructive"
                  aria-label={`${S.deletePrefix} ${rule.title}`}
                  onClick={() => void onRemove(rule)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
            {notesFor === rule.id ? (
              <div className="border-t border-border px-4 py-3" data-testid="rule-notes-area">
                <RuleNotesArea rule={rule} />
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * The RULE side of the Nofy integration (increment ③): linked notes with
 * real RULE refs, "Take notes" spawning a connected note in Nofy. Mounted
 * only while a rule's notes area is expanded.
 */
function RuleNotesArea({ rule }: { rule: PlaybookRule }) {
  const router = useRouter();
  const { dict } = useI18n();
  const V = dict.playbook.rules;
  const S = dict.playbook.shared;
  const createNofyNote = useCreateNofyNote({
    onCreated: (note) => {
      toast.success(S.nofyToast, { description: `${S.nofyLinkedA}${rule.title}${S.nofyLinkedB}` });
      router.push(`/nofy?tab=notes&note=${note.id}`);
    },
  });
  const takeNofyNotes = () => {
    createNofyNote.mutate({
      title: `${rule.title}${V.noteTitleSuffix}`,
      blocks: [
        { id: `nb-${Math.random().toString(36).slice(2, 10)}`, type: "ref", text: "", ref: { kind: "RULE", id: rule.id } },
        { id: `nb-${Math.random().toString(36).slice(2, 10)}`, type: "paragraph", text: "" },
      ],
    });
  };
  return (
    <NofyLinkedNotesSection
      kind="RULE"
      id={rule.id}
      onCreateNote={takeNofyNotes}
      creating={createNofyNote.isPending}
      testidPrefix="rule"
    />
  );
}

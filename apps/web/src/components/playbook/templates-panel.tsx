"use client";

import * as React from "react";
import { LayoutTemplate, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  marketConditionLabels,
  styleLabels,
} from "@/components/playbook/playbook-labels";
import { useInstantiateTemplate, usePlaybookTemplates } from "@/lib/api/queries";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/api/client";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Template library (§18): ten starting points that pre-fill identity, market
 * profile, conditions, risk frame and invalidations of a new DRAFT strategy.
 * They are starting points — NEVER claims that these approaches are profitable.
 */
export function TemplatesPanel() {
  const { dict } = useI18n();
  const V = dict.playbook.templates;
  const S = dict.playbook.shared;
  const STYLE_LABELS = styleLabels(dict.playbook.labels.style);
  const MARKET_CONDITION_LABELS = marketConditionLabels(dict.playbook.labels.marketCondition);
  const templatesQuery = usePlaybookTemplates();
  const instantiate = useInstantiateTemplate();
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const templates = templatesQuery.data?.templates ?? [];
  const [createdKeys, setCreatedKeys] = React.useState<string[]>([]);

  const create = async (key: string) => {
    setBusyKey(key);
    try {
      const strategy = await instantiate.mutateAsync({ key });
      toast.success(`${V.toastCreatedA}${strategy.name}${V.toastCreatedB}`, {
        description: V.toastCreatedDesc,
      });
      setCreatedKeys((previous) => [...previous, key]);
    } catch (error) {
      toast.error(V.toastFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (templatesQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={V.loadingAria}>
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">{V.intro}</p>

      {templates.length === 0 ? (
        <Card className="bg-surface">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <LayoutTemplate className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 font-heading text-lg font-semibold">{V.emptyTitle}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="templates-grid">
          {templates.map((template) => {
            const created = createdKeys.includes(template.key);
            return (
              <Card key={template.key} className="flex flex-col bg-surface" data-testid="template-card">
                <CardContent className="flex flex-1 flex-col gap-3 px-4 py-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-heading text-sm font-semibold text-foreground">{template.name}</h3>
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {STYLE_LABELS[template.tradingStyle]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {template.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {template.marketConditions.map((condition) => (
                      <span
                        key={condition}
                        className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {MARKET_CONDITION_LABELS[condition]}
                      </span>
                    ))}
                    {template.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <Button
                      size="sm"
                      variant={created ? "outline" : "default"}
                      disabled={busyKey === template.key}
                      onClick={() => void create(template.key)}
                      data-testid={`template-create-${template.key}`}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      {busyKey === template.key
                        ? V.creating
                        : created
                          ? V.createAnother
                          : V.createDraft}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">{V.draftBadge}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">{V.reminder}</p>
    </div>
  );
}

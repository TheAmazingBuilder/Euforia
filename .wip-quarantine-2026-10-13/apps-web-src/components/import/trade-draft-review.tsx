"use client";

/**
 * TradeDraftReview — the review interface for the assembled draft
 * (spec §24): Basic Information, Execution, Risk Management (with R:R when
 * calculable), Result and Timing. Every value stays a string at the exact
 * reviewed precision (spec §47). Cross-field validation runs here and the
 * user can jump back to the fields to correct anything.
 */

import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { plannedRiskReward } from "@/lib/recognition/constants";
import type { TradeDraftValidation, DraftFieldSlug } from "@/lib/recognition/schemas";
import type { TradeDraft } from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";
import { formatRiskReward, pnlTone } from "./import-shared";

type Row = {
  slug: DraftFieldSlug | "pnl" | "currency" | "riskReward" | "notes" | "platform";
  label: string;
  value: string;
  tone?: "profit" | "loss" | "neutral";
};

function Section({
  title,
  rows,
  errors,
  testid,
}: {
  title: string;
  rows: Row[];
  errors: Partial<Record<DraftFieldSlug, string>>;
  testid: string;
}) {
  return (
    <Card size="sm" data-testid={testid}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map((row) => {
          const error =
            row.slug in errors ? errors[row.slug as DraftFieldSlug] : undefined;
          return (
            <div
              key={row.slug}
              className="flex items-center justify-between gap-3 text-sm"
              data-testid={`import-draft-row-${row.slug.replace(/([A-Z])/g, "-$1").toLowerCase()}`}
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="min-w-0 text-right">
                {error ? (
                  <span className="inline-flex items-center gap-1 text-loss">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    {error}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      row.tone === "profit" && "text-profit font-semibold",
                      row.tone === "loss" && "text-loss font-semibold",
                    )}
                  >
                    {row.value}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function TradeDraftReview({
  draft,
  riskReward,
  validation,
  onBack,
  onContinue,
  submitting,
}: {
  draft: TradeDraft;
  /** Planned R:R (number) or null when not calculable. */
  riskReward: number | null;
  validation: TradeDraftValidation;
  onBack: () => void;
  onContinue: () => void;
  submitting: boolean;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.draft;
  const F = dict.recognition.fields;
  const errors: Partial<Record<DraftFieldSlug, string>> =
    validation.ok ? {} : validation.errors;

  const money = (value: string | null) => value ?? dict.recognition.result.noValue;
  const time = (value: string | null) => value?.replace("T", " ") ?? dict.recognition.result.noValue;

  const pnlValue = money(draft.pnl);
  const pnlToneClass =
    draft.pnl && pnlTone(draft.pnl) !== "neutral" ? pnlTone(draft.pnl) : undefined;

  return (
    <div className="space-y-4" data-testid="import-draft">
      <div>
        <h2 className="text-lg font-semibold">{V.title}</h2>
        <p className="text-sm text-muted-foreground">{V.subtitle}</p>
      </div>

      {!validation.ok && (
        <p
          role="alert"
          className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss"
          data-testid="import-draft-invalid"
        >
          <span className="font-medium">{V.invalidTitle} — </span>
          {V.invalidBody}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section
          testid="import-draft-basic"
          title={V.sections.basic}
          rows={[
            { slug: "symbol", label: F.symbol, value: draft.symbol },
            { slug: "direction", label: F.direction, value: draft.direction },
            { slug: "platform", label: F.platform, value: draft.platform },
          ]}
          errors={errors}
        />
        <Section
          testid="import-draft-execution"
          title={V.sections.execution}
          rows={[
            { slug: "entryPrice", label: F.entryPrice, value: draft.entryPrice },
            { slug: "exitPrice", label: F.exitPrice, value: money(draft.exitPrice) },
            { slug: "volume", label: F.volume, value: draft.volume },
          ]}
          errors={errors}
        />
        <Section
          testid="import-draft-risk"
          title={V.sections.risk}
          rows={[
            { slug: "stopLoss", label: F.stopLoss, value: money(draft.stopLoss) },
            { slug: "takeProfit", label: F.takeProfit, value: money(draft.takeProfit) },
            {
              slug: "riskReward",
              label: V.riskReward,
              value: riskReward !== null ? formatRiskReward(riskReward) : V.riskRewardNone,
            },
          ]}
          errors={errors}
        />
        <Section
          testid="import-draft-result"
          title={V.sections.result}
          rows={[
            {
              slug: "pnl",
              label: F.pnl,
              value: pnlValue,
              tone: pnlToneClass as Row["tone"],
            },
            { slug: "currency", label: F.currency, value: draft.currency ?? dict.recognition.result.noValue },
          ]}
          errors={errors}
        />
        <Section
          testid="import-draft-timing"
          title={V.sections.timing}
          rows={[
            { slug: "openTime", label: F.openTime, value: time(draft.openTime) },
            { slug: "closeTime", label: F.closeTime, value: time(draft.closeTime) },
          ]}
          errors={errors}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={submitting}
          data-testid="import-draft-back"
        >
          <ArrowLeft aria-hidden />
          {V.reviewFields}
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={submitting || !validation.ok}
          data-testid="import-draft-confirm"
          aria-label={V.confirmAria}
        >
          {V.confirm}
        </Button>
      </div>
    </div>
  );
}

/** Re-exported so the workspace can compute R:R without touching constants. */
export { plannedRiskReward };

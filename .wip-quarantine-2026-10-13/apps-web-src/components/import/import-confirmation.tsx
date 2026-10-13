"use client";

/**
 * Confirmation + Success — the import gate (spec §28) and its success
 * state (spec §29). The final action is EXPLICIT (summary + dedicated
 * confirm button), notifications go through the existing sonner toasts.
 */

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TradeDraft } from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";


export function ImportConfirmation({
  draft,
  onConfirm,
  onBack,
  processing,
}: {
  draft: TradeDraft;
  onConfirm: () => void;
  onBack: () => void;
  processing: boolean;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.confirm;
  const F = dict.recognition.fields;

  const rows: { label: string; value: string; tone?: "profit" | "loss" }[] = [
    { label: F.symbol, value: draft.symbol },
    { label: F.direction, value: draft.direction, tone: draft.direction === "BUY" ? "profit" : "loss" },
    { label: F.volume, value: draft.volume },
    { label: F.entryPrice, value: draft.entryPrice },
    ...(draft.exitPrice ? [{ label: F.exitPrice, value: draft.exitPrice }] : []),
    { label: F.pnl, value: draft.pnl ?? dict.recognition.result.noValue },
  ];

  return (
    <Card className="mx-auto max-w-xl" data-testid="import-confirmation">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          {V.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{V.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl
          className="space-y-2 rounded-xl border bg-surface-raised p-4"
          aria-label={V.summaryAria}
          data-testid="import-confirmation-summary"
        >
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd
                className={cn(
                  "font-mono text-base font-semibold tabular-nums",
                  row.tone === "profit" && "text-profit",
                  row.tone === "loss" && "text-loss",
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {V.privacyNote}
        </p>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={processing}
            data-testid="import-confirm-back"
          >
            {V.back}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={processing}
            data-testid="import-confirm-import"
            aria-label={V.confirmAria}
          >
            {processing ? V.processing : V.confirm}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ImportSuccess({
  tradeId,
  onViewTrade,
  onImportAnother,
}: {
  tradeId: string;
  onViewTrade: () => void;
  onImportAnother: () => void;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.success;

  return (
    <Card className="mx-auto max-w-xl border-profit/30" data-testid="import-success">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircle2 className="size-10 text-profit" aria-hidden />
        <div className="space-y-1">
          <p className="text-lg font-semibold" data-testid="import-success-title">
            {V.title}
          </p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{V.body}</p>
          <p className="pt-1 font-mono text-xs text-muted-foreground">
            #{tradeId.slice(0, 8)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            onClick={onViewTrade}
            data-testid="import-success-view-trade"
            aria-label={V.viewTradeAria}
          >
            {V.viewTrade}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onImportAnother}
            data-testid="import-success-again"
            aria-label={V.importAnotherAria}
          >
            {V.importAnother}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

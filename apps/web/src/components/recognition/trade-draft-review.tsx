"use client";

import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrRecognition } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";
import {
  DRAFT_SECTIONS,
  formatExtractedTime,
  formatFinancial,
  platformLabel,
  profitTone,
  type FieldKey,
} from "@/components/recognition/recognition-model";
import { recognitionFieldLabel, type RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * TradeDraftReview — the final look before confirmation (PROMPT 3 §23/§24/
 * §28). Sections mirror the trade form (Basic / Execution / Risk / Result /
 * Timing); risk-reward is computed only when entry, stop and target are all
 * readable. The explicit "Confirm & import" action is the ONLY path that
 * makes the reviewed values authoritative (§28) — until then this stays a
 * draft, never a Trade (contract invariant).
 */

/** Risk/reward from entry, stop, target and direction — 1 : X, when computable. */
export function riskReward(entry: string | null, stop: string | null, target: string | null, direction: string | null): number | null {
  if (!entry || !stop || !target) return null;
  const e = Number(entry.replace(",", "."));
  const s = Number(stop.replace(",", "."));
  const t = Number(target.replace(",", "."));
  if (!Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(t)) return null;
  const risk = direction === "SELL" ? s - e : e - s;
  const reward = direction === "SELL" ? e - t : t - e;
  if (risk <= 0) return null;
  return Math.round((reward / risk) * 100) / 100;
}

export function TradeDraftReview({
  recognition,
  dict,
  effectiveValues,
  onBack,
  onConfirm,
  pending = false,
}: {
  recognition: OcrRecognition;
  dict: RecognitionDict;
  effectiveValues: Record<string, string | null>;
  onBack: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const value = (field: FieldKey): string | null => {
    if (field in effectiveValues) return effectiveValues[field];
    return recognition.fields.find((f) => f.field === field)?.normalizedValue ?? null;
  };
  const display = (field: FieldKey): string => {
    const raw = value(field);
    if (raw === null || raw === "") return dict.draft.notDetected;
    if (field === "openTime" || field === "closeTime") return formatExtractedTime(raw);
    return formatFinancial(raw);
  };
  const direction = value("direction");
  const rr = riskReward(value("entryPrice"), value("stopLoss"), value("takeProfit"), direction);

  return (
    <div className="flex flex-col gap-5" data-testid="recognition-draft">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold">{dict.draft.title}</h2>
          <p className="text-sm text-muted-foreground">{dict.draft.subtitle}</p>
        </div>
        <RecognitionStatusBadge status={recognition.status} dict={dict} />
      </header>

      <div className="flex flex-col">
        {DRAFT_SECTIONS.map((section) => (
          <section key={section.titleKey} aria-label={dict.draft.sections[section.titleKey]} className="border-t border-border pt-3 first:border-t-0">
            <p className="ledger-label">{dict.draft.sections[section.titleKey]}</p>
            <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] gap-x-6">
              {section.fields.map((field) => {
                const tone = field === "profit" ? profitTone(value(field)) : null;
                return (
                  <div key={field} className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-border/60 py-2" data-testid={`draft-${field}`}>
                    <dt className="text-sm text-muted-foreground">{recognitionFieldLabel(dict, field)}</dt>
                    <dd
                      className={cn(
                        "text-right font-mono text-[15px] tabular-nums",
                        tone === "profit" && "text-profit",
                        tone === "loss" && "text-loss",
                        (value(field) === null || value(field) === "") && "italic text-muted-foreground/70",
                      )}
                    >
                      {display(field)}
                    </dd>
                  </div>
                );
              })}
              {section.titleKey === "risk" ? (
                <div className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-border/60 py-2" data-testid="draft-risk-reward">
                  <dt className="text-sm text-muted-foreground">{dict.draft.riskReward}</dt>
                  <dd className="text-right font-mono text-[15px] tabular-nums" title={dict.draft.riskRewardCalc}>
                    {rr === null ? <span className="italic text-muted-foreground/70">{dict.draft.notDetected}</span> : `1 : ${rr.toFixed(2)}`}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        ))}
        <div className="border-t border-border pt-3">
          <p className="ledger-label">{dict.draft.sections.basic}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {dict.draft.platform} — {platformLabel(dict, recognition.classification)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="recognition-confirm-zone">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
          {dict.draft.confirmHint}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending} data-testid="recognition-back-to-result">
            {dict.draft.backToResult}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending} data-testid="recognition-confirm">
            {pending ? "…" : dict.draft.confirmAndImport}
          </Button>
        </div>
      </div>
    </div>
  );
}

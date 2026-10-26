"use client";

import * as React from "react";
import { PenLine, ShieldCheck, SquareCheckBig, Square } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import type { OcrRecognition } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";
import {
  ACCOUNT_FIELD_SECTIONS,
  CHART_FIELD_SECTIONS,
  DRAFT_SECTIONS,
  formatExtractedTime,
  formatFinancial,
  platformLabel,
  profileMetaKey,
  profitTone,
  type FieldKey,
} from "@/components/recognition/recognition-model";
import { recognitionFieldLabel, type RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * TradeDraftReview - the final look before confirmation (PROMPT 3 §23/§24/
 * §28 + grouped confirmation, engine quality §2.2). Sections mirror the
 * trade form (Basic / Execution / Risk / Result / Timing); risk-reward is
 * computed only when entry, stop and target are all readable. The explicit
 * "Confirm & import" action is the ONLY path that makes the reviewed values
 * authoritative (§28) - until then this stays a draft, never a Trade
 * (contract invariant).
 *
 * Grouped confirmation: when the recognition carries N candidate drafts,
 * each draft renders as its own ruled card with an include decision -
 * the user imports exactly the drafts they checked.
 */

/** Risk/reward from entry, stop, target and direction - 1 : X, when computable. */
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

interface DraftCardProps {
  index: number;
  total: number;
  fields: OcrRecognition["fields"];
  effectiveValues: Record<string, string | null>;
  include: boolean;
  onToggle: (include: boolean) => void;
  dict: RecognitionDict;
  platform: string;
}

/** One draft card - the ruled form-mirror summary with an include decision. */
function DraftCard({ index, total, fields, effectiveValues, include, onToggle, dict, platform }: DraftCardProps) {
  const value = (field: FieldKey): string | null => {
    if (field in effectiveValues) return effectiveValues[field];
    return fields.find((f) => f.field === field)?.normalizedValue ?? null;
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
    <section
      aria-label={`${dict.multi.draft} ${index + 1}`}
      className={cn(
        "flex flex-col rounded-xl border bg-surface px-4 py-4 transition-colors",
        include ? "border-border" : "border-dashed border-border/70 opacity-70",
      )}
      data-testid={`recognition-draft-card-${index}`}
      data-included={include}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={include}
            aria-label={`${dict.multi.include} - ${dict.multi.draft} ${index + 1}`}
            onClick={() => onToggle(!include)}
            className="flex items-center gap-2 text-sm"
            data-testid={`recognition-draft-include-${index}`}
          >
            {include ? (
              <SquareCheckBig className="size-4 text-accent" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Square className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            )}
            <span className="font-mono text-xs uppercase tracking-[0.06em]">
              {dict.multi.draft} {index + 1}/{total}
            </span>
          </button>
        </div>
        <span className={cn("font-mono text-[11px] uppercase tracking-[0.06em]", include ? "text-accent" : "text-muted-foreground")}>
          {include ? dict.multi.include : dict.multi.excluded}
        </span>
      </header>

      <div className="flex flex-col">
        {DRAFT_SECTIONS.map((section) => (
          <div key={section.titleKey} className="border-t border-border/60 pt-2 first:border-t-0 first:pt-0 mt-2 first:mt-0">
            <p className="ledger-label">{dict.draft.sections[section.titleKey]}</p>
            <dl className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] gap-x-6">
              {section.titleKey === "basic" ? (
                <div className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-border/40 py-1.5">
                  <dt className="text-sm text-muted-foreground">{dict.draft.platform}</dt>
                  <dd className="text-right font-mono text-sm tabular-nums">{platform}</dd>
                </div>
              ) : null}
              {section.fields.map((field) => {
                const tone = field === "profit" ? profitTone(value(field)) : null;
                return (
                  <div key={field} className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-border/40 py-1.5" data-testid={`draft-${index}-${field}`}>
                    <dt className="text-sm text-muted-foreground">{recognitionFieldLabel(dict, field)}</dt>
                    <dd
                      className={cn(
                        "text-right font-mono text-sm tabular-nums",
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
                <div className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-border/40 py-1.5">
                  <dt className="text-sm text-muted-foreground">{dict.draft.riskReward}</dt>
                  <dd className="text-right font-mono text-sm tabular-nums">
                    {rr === null ? <span className="italic text-muted-foreground/70">{dict.draft.notDetected}</span> : `1 : ${rr.toFixed(2)}`}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/** How one profile's field list renders in the review (raw vs formatted). */
const RAW_TEXT_KEYS = new Set(["symbol", "direction", "accountLogin", "accountServer", "accountCurrency", "accountLeverage", "chartTimeframe"]);

function reviewDisplay(field: FieldKey | string, raw: string | null, dict: RecognitionDict): string {
  if (raw === null || raw === "") return dict.draft.notDetected;
  if (field === "openTime" || field === "closeTime" || field === "chartTime") return formatExtractedTime(raw);
  if (RAW_TEXT_KEYS.has(field)) return raw;
  return formatFinancial(raw);
}

/** The review sections per profile (Account & Chart V1.1). */
function reviewSections(profile: ReturnType<typeof profileMetaKey>) {
  if (profile === "account") return ACCOUNT_FIELD_SECTIONS;
  if (profile === "chart") {
    return [
      { titleKey: "chartQuote" as const, fields: ["symbol", "chartTimeframe", "chartPrice", "chartChangePct", "chartTime", "chartOpen", "chartHigh", "chartLow", "chartClose"] },
      { titleKey: "chartIndicators" as const, fields: CHART_FIELD_SECTIONS[1]!.fields },
    ];
  }
  return DRAFT_SECTIONS;
}

export function TradeDraftReview({
  recognition,
  dict,
  effectiveValues,
  draftStates,
  onToggleInclude,
  onBack,
  onConfirm,
  pending = false,
}: {
  recognition: OcrRecognition;
  dict: RecognitionDict;
  effectiveValues: Record<string, string | null>;
  /** Grouped confirmation (engine quality §2.2) - one entry per candidate. */
  draftStates?: { effectiveValues: Record<string, string | null>; include: boolean }[];
  onToggleInclude?: (index: number, include: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  // V2 §60 - the confirmation dialog state; §59 - recognized-vs-corrected.
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const metaKey = profileMetaKey(recognition.extractionProfile);
  const sections = reviewSections(metaKey);
  const changedRows = Object.entries(effectiveValues).filter(([field, value]) => {
    const machine = recognition.fields.find((f) => f.field === field)?.normalizedValue ?? null;
    return value !== null && machine !== null && value !== machine;
  });

  const isMulti = Boolean(draftStates && draftStates.length > 0);
  const includedCount = draftStates?.filter((draft) => draft.include).length ?? 1;

  const title = isMulti ? dict.multi.reviewTitle : metaKey === "account" ? dict.draft.titleAccount : metaKey === "chart" ? dict.draft.titleChart : dict.draft.title;
  const subtitle = isMulti ? dict.multi.reviewSubtitle : metaKey === "account" ? dict.draft.subtitleAccount : metaKey === "chart" ? dict.draft.subtitleChart : dict.draft.subtitle;
  const confirmLabel = metaKey === "account" ? dict.draft.confirmAndSaveAccount : metaKey === "chart" ? dict.draft.confirmAndSaveChart : dict.draft.confirmAndImport;

  return (
    <div className="flex flex-col gap-5" data-testid="recognition-draft">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <RecognitionStatusBadge status={recognition.status} dict={dict} />
      </header>

      {isMulti ? (
        <div className="flex flex-col gap-4">
          {draftStates!.map((draft, index) => (
            <DraftCard
              key={index}
              index={index}
              total={draftStates!.length}
              fields={recognition.candidates?.[index]?.fields ?? recognition.fields}
              effectiveValues={draft.effectiveValues}
              include={draft.include}
              onToggle={(include) => onToggleInclude?.(index, include)}
              dict={dict}
              platform={platformLabel(dict, recognition.classification)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {sections.map((section) => (
            <section key={section.titleKey} aria-label={dict.draft.sections[section.titleKey]} className="border-t border-border pt-3 first:border-t-0">
              <p className="ledger-label">{dict.draft.sections[section.titleKey]}</p>
              <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] gap-x-6">
                {metaKey === "trade" && section.titleKey === "basic" ? (
                  <div className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-border/60 py-2" data-testid="draft-platform">
                    <dt className="text-sm text-muted-foreground">{dict.draft.platform}</dt>
                    <dd className="text-right font-mono text-[15px] tabular-nums">
                      {platformLabel(dict, recognition.classification)}
                    </dd>
                  </div>
                ) : null}
                {section.fields.map((field) => {
                  const value = (key: FieldKey | string): string | null => {
                    if (key in effectiveValues) return effectiveValues[key] ?? null;
                    return recognition.fields.find((f) => f.field === key)?.normalizedValue ?? null;
                  };
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
                        {reviewDisplay(field, value(field), dict)}
                      </dd>
                    </div>
                  );
                })}
                {metaKey === "trade" && section.titleKey === "risk" ? (
                  <div className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-border/60 py-2" data-testid="draft-risk-reward">
                    <dt className="text-sm text-muted-foreground">{dict.draft.riskReward}</dt>
                    <dd className="text-right font-mono text-[15px] tabular-nums" title={dict.draft.riskRewardCalc}>
                      {(() => {
                        const value = (key: FieldKey): string | null => {
                          if (key in effectiveValues) return effectiveValues[key];
                          return recognition.fields.find((f) => f.field === key)?.normalizedValue ?? null;
                        };
                        const rr = riskReward(value("entryPrice"), value("stopLoss"), value("takeProfit"), value("direction"));
                        return rr === null ? <span className="italic text-muted-foreground/70">{dict.draft.notDetected}</span> : `1 : ${rr.toFixed(2)}`;
                      })()}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="recognition-confirm-zone">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
          {isMulti
            ? `${dict.multi.confirmedCount} - ${includedCount}/${draftStates!.length}`
            : dict.draft.confirmHint}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending} data-testid="recognition-back-to-result">
            {dict.draft.backToResult}
          </Button>
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={pending || (isMulti && includedCount === 0)}
            data-testid="recognition-confirm"
          >
            {pending ? "…" : confirmLabel}
          </Button>
        </div>
      </div>

      {/* V2 §60 - the explicit confirmation dialog: everything looks correct?
          [Confirm Trade] / [Continue Editing] / [Cancel]. The dialog also
          shows the USER_CORRECTED fields (V2 §59 - recognized vs confirmed). */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dict.confirmDialog.title}</DialogTitle>
            <DialogDescription>{dict.confirmDialog.body}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col" data-testid="recognition-confirm-changes">
            {changedRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{dict.confirmDialog.noChanges}</p>
            ) : (
              changedRows.map(([field, value]) => (
                <div key={field} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <PenLine className="size-3 text-warning" strokeWidth={1.5} aria-hidden="true" />
                    {recognitionFieldLabel(dict, field as FieldKey)}
                  </span>
                  <span className="font-mono text-sm tabular-nums">{formatFinancial(value)}</span>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} data-testid="recognition-confirm-cancel">
              {dict.confirmDialog.cancel}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setConfirmOpen(false); onBack(); }} data-testid="recognition-confirm-continue">
              {dict.confirmDialog.continueEditing}
            </Button>
            <Button type="button" onClick={onConfirm} disabled={pending} data-testid="recognition-confirm-final">
              {pending ? "…" : dict.confirmDialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

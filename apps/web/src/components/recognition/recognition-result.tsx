"use client";

import { FileWarning, RotateCcw } from "lucide-react";

import type { OcrRecognition } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";
import { RecognizedField } from "@/components/recognition/recognized-field";
import { RecognitionWarnings } from "@/components/recognition/recognition-warnings";
import {
  FIELD_ORDER,
  platformLabel,
} from "@/components/recognition/recognition-model";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognitionResult — the review surface (PROMPT 3 §17/§20/§26).
 *
 * Desktop: screenshot | extracted fields. Mobile: stacked (§35). Every
 * field renders in the ruled list with its confidence; the whole result is
 * read-only when the recognition is already CONFIRMED.
 */
export function RecognitionResult({
  recognition,
  dict,
  imageUrl,
  effectiveValues,
  editingField,
  onEditStart,
  onEditCancel,
  onSaveField,
  onReviewDraft,
  onRetry,
  readOnly = false,
}: {
  recognition: OcrRecognition;
  dict: RecognitionDict;
  /** Resolved preview URL (object URL of the upload, or fetched job bytes). */
  imageUrl: string | null;
  /** Merged view (engine values + user corrections) keyed by field. */
  effectiveValues: Record<string, string | null>;
  editingField: string | null;
  onEditStart: (field: string) => void;
  onEditCancel: () => void;
  onSaveField: (field: string, value: string | null) => void;
  onReviewDraft: () => void;
  onRetry: () => void;
  readOnly?: boolean;
}) {
  if (recognition.status === "FAILED") {
    return (
      <div className="flex flex-col gap-4" data-testid="recognition-failed">
        <div className="flex items-center justify-between gap-3">
          <RecognitionStatusBadge status={recognition.status} dict={dict} />
          {recognition.durationMs !== null ? (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {(recognition.durationMs / 1000).toFixed(1)}
              {dict.result.seconds}
            </span>
          ) : null}
        </div>
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-loss/40 bg-loss/[0.04] px-6 py-10 text-center">
          <FileWarning className="size-7 text-loss" strokeWidth={1.5} aria-hidden="true" />
          <div className="flex max-w-md flex-col gap-1">
            <p className="font-heading text-base font-semibold">{dict.errors.recognitionFailed}</p>
            {recognition.failure ? (
              <p className="text-sm text-muted-foreground">{recognition.failure.message}</p>
            ) : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid="recognition-retry">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {dict.result.retry}
          </Button>
        </div>
        {imageUrl ? (
          <div className="overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated job bytes via object URL */}
            <img src={imageUrl} alt={dict.result.screenshot} className="max-h-56 w-full object-contain" />
          </div>
        ) : null}
      </div>
    );
  }

  const fieldsByOrder = FIELD_ORDER.map((key) =>
    recognition.fields.find((field) => field.field === key),
  ).filter((field): field is NonNullable<typeof field> => Boolean(field));

  return (
    <div className="flex flex-col gap-4" data-testid="recognition-result">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <RecognitionStatusBadge status={recognition.status} dict={dict} />
          <span className="text-sm text-muted-foreground">
            {platformLabel(dict, recognition.classification)}
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-muted-foreground">
          {recognition.durationMs !== null ? (
            <span>
              {dict.result.durationLine} {(recognition.durationMs / 1000).toFixed(1)}
              {dict.result.seconds}
            </span>
          ) : null}
          {recognition.engine ? <span>{recognition.engine.name}</span> : null}
        </div>
      </div>

      <RecognitionWarnings warnings={recognition.warnings} dict={dict} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Screenshot column — sticky on desktop (§17/§35). */}
        <div className="flex flex-col gap-2">
          <p className="ledger-label">{dict.result.screenshot}</p>
          <div className="overflow-hidden rounded-xl border border-border bg-surface lg:sticky lg:top-20">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated job bytes via object URL
              <img
                src={imageUrl}
                alt={dict.result.screenshot}
                className="max-h-[420px] w-full object-contain"
                data-testid="recognition-result-image"
              />
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                …
              </div>
            )}
            <p className="border-t border-border px-3 py-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              {recognition.asset.width} × {recognition.asset.height} ·{" "}
              {(recognition.asset.sizeBytes / 1024).toFixed(0)} KB
            </p>
          </div>
        </div>

        {/* Extracted fields — one ruled list, never cards-in-cards. */}
        <div className="flex flex-col">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
            <p className="ledger-label">{dict.result.detectedTitle}</p>
            {!readOnly ? (
              <p className="text-[11px] text-muted-foreground">{dict.result.editHint}</p>
            ) : null}
          </div>
          {fieldsByOrder.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{dict.result.detectedEmpty}</p>
          ) : (
            fieldsByOrder.map((field) => (
              <RecognizedField
                key={field.field}
                field={{ ...field, normalizedValue: field.field in effectiveValues ? effectiveValues[field.field] : field.normalizedValue }}
                dict={dict}
                editing={editingField === field.field && !readOnly}
                onEditStart={() => onEditStart(field.field)}
                onEditCancel={onEditCancel}
                onSave={(value) => onSaveField(field.field, value)}
                disabled={readOnly}
              />
            ))
          )}
        </div>
      </div>

      {!readOnly ? (
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            onClick={onReviewDraft}
            disabled={recognition.fields.length === 0}
            data-testid="recognition-review-draft"
          >
            {dict.result.nextReview}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

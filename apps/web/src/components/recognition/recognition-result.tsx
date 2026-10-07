"use client";

import * as React from "react";
import { Copy, Crop, FileWarning, Loader2, RotateCcw, ScanSearch, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrRecognition } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";
import { RecognizedField } from "@/components/recognition/recognized-field";
import { RecognitionWarnings } from "@/components/recognition/recognition-warnings";
import {
  FIELD_ORDER,
  formatFinancial,
  platformLabel,
  type FieldKey,
} from "@/components/recognition/recognition-model";
import { recognitionFieldLabel, type RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/** A region the user framed on the capture for a targeted re-scan. */
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * RecognitionResult — the review surface (PROMPT 3 §17/§20/§26 + engine
 * quality §2.1/§2.4).
 *
 * Adds of the engine-quality phase:
 *   - DUPLICATE banner — an advisory "already imported" flag when this
 *     screenshot perceptually matches an earlier recognition;
 *   - CROP TOOL — drag a rectangle over the capture to re-scan just that
 *     region; results are ephemeral readings the user can apply as
 *     corrections (never auto-applied, §21).
 *
 * Desktop: screenshot | extracted fields. Mobile: stacked (§35). The whole
 * result is read-only when the recognition is already CONFIRMED.
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
  recrop,
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
  /** Region re-scan state + handler (engine quality §2.4). */
  recrop?: {
    pending: boolean;
    results: { fields: OcrRecognition["fields"]; region: CropRegion } | null;
    onScan: (region: CropRegion) => void;
    onClear: () => void;
  };
}) {
  // ── crop overlay state (UI-local) ────────────────────────────────────────
  const [cropMode, setCropMode] = React.useState(false);
  const [drag, setDrag] = React.useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [imageBox, setImageBox] = React.useState<{ width: number; height: number } | null>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);

  const cropRect: CropRegion | null = (() => {
    if (!drag || !imageBox) return null;
    const x = Math.min(drag.startX, drag.endX);
    const y = Math.min(drag.startY, drag.endY);
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(Math.abs(drag.endX - drag.startX)),
      height: Math.round(Math.abs(drag.endY - drag.startY)),
    };
  })();

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

      {/* Duplicate banner (engine quality §2.1) — advisory, never blocking. */}
      {recognition.duplicateOf ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/[0.06] px-4 py-3"
          data-testid="recognition-duplicate-banner"
        >
          <p className="flex items-center gap-2 text-sm">
            <Copy className="size-4 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
            <span className="flex flex-col">
              <span className="font-medium">{dict.duplicate.title}</span>
              <span className="text-xs text-muted-foreground">{dict.duplicate.body}</span>
            </span>
          </p>
          <Button type="button" variant="outline" size="sm" asChild data-testid="recognition-duplicate-open">
            <a href={`/recognition?job=${recognition.duplicateOf.recognitionId}`}>{dict.duplicate.open}</a>
          </Button>
        </div>
      ) : null}

      <RecognitionWarnings warnings={recognition.warnings} dict={dict} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Screenshot column — sticky on desktop (§17/§35). */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="ledger-label">{dict.result.screenshot}</p>
            {!readOnly && !recognition.duplicateOf && imageUrl && recognition.asset.mime !== "application/pdf" ? (
              <Button
                type="button"
                variant={cropMode ? "default" : "outline"}
                size="sm"
                className="min-h-8"
                onClick={() => {
                  setCropMode((current) => !current);
                  recrop?.onClear();
                }}
                data-testid="recognition-crop-toggle"
              >
                <Crop className="size-3.5" aria-hidden="true" />
                {cropMode ? <X className="size-3.5" aria-hidden="true" /> : null}
                {dict.crop.tool}
              </Button>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-surface lg:sticky lg:top-20">
            {imageUrl && recognition.asset.mime !== "application/pdf" ? (
              <div
                className={cn("relative select-none", cropMode && "cursor-crosshair")}
                onMouseDown={(event) => {
                  if (!cropMode || !imageRef.current) return;
                  const rect = imageRef.current.getBoundingClientRect();
                  setImageBox({ width: rect.width, height: rect.height });
                  setDrag({
                    startX: event.clientX - rect.left,
                    startY: event.clientY - rect.top,
                    endX: event.clientX - rect.left,
                    endY: event.clientY - rect.top,
                  });
                }}
                onMouseMove={(event) => {
                  if (!drag || !imageRef.current) return;
                  const rect = imageRef.current.getBoundingClientRect();
                  setDrag({
                    ...drag,
                    endX: Math.max(0, Math.min(event.clientX - rect.left, rect.width)),
                    endY: Math.max(0, Math.min(event.clientY - rect.top, rect.height)),
                  });
                }}
                onMouseUp={() => setDrag((current) => (current ? { ...current } : null))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated job bytes via object URL */}
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt={dict.result.screenshot}
                  className="max-h-[420px] w-full object-contain"
                  data-testid="recognition-result-image"
                  draggable={false}
                />
                {cropRect && imageBox ? (
                  <div
                    className="pointer-events-none absolute border-2 border-accent bg-accent/10"
                    style={{
                      left: `${(cropRect.x / imageBox.width) * 100}%`,
                      top: `${(cropRect.y / imageBox.height) * 100}%`,
                      width: `${(cropRect.width / imageBox.width) * 100}%`,
                      height: `${(cropRect.height / imageBox.height) * 100}%`,
                    }}
                    data-testid="recognition-crop-overlay"
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                {recognition.asset.mime === "application/pdf" ? dict.uploader.pdfLabel : "…"}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>
                {recognition.asset.width} × {recognition.asset.height} ·{" "}
                {(recognition.asset.sizeBytes / 1024).toFixed(0)} KB
              </span>
              {cropMode && cropRect && cropRect.width > 8 && cropRect.height > 8 ? (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-7"
                  disabled={recrop?.pending}
                  onClick={() => {
                    if (cropRect && imageBox) {
                      // Map the display-box rectangle onto REAL pixel
                      // coordinates of the stored asset (the <img> letterboxes).
                      const scale = Math.min(
                        imageBox.width / recognition.asset.width,
                        imageBox.height / recognition.asset.height,
                      );
                      const renderedWidth = recognition.asset.width * scale;
                      const renderedHeight = recognition.asset.height * scale;
                      const offsetX = (imageBox.width - renderedWidth) / 2;
                      const offsetY = (imageBox.height - renderedHeight) / 2;
                      const region = {
                        x: Math.max(0, Math.round((cropRect.x - offsetX) / scale)),
                        y: Math.max(0, Math.round((cropRect.y - offsetY) / scale)),
                        width: Math.max(1, Math.round(cropRect.width / scale)),
                        height: Math.max(1, Math.round(cropRect.height / scale)),
                      };
                      recrop?.onScan(region);
                    }
                  }}
                  data-testid="recognition-crop-scan"
                >
                  {recrop?.pending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ScanSearch className="size-3.5" aria-hidden="true" />
                  )}
                  {recrop?.pending ? dict.crop.scanning : dict.crop.scan}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Region re-scan results (engine quality §2.4) — ephemeral. */}
          {recrop?.results ? (
            <div className="flex flex-col rounded-lg border border-border bg-surface px-3 py-2" data-testid="recognition-crop-results">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5">
                <p className="ledger-label">{dict.crop.results}</p>
                <Button type="button" variant="ghost" size="sm" className="min-h-6" onClick={recrop?.onClear}>
                  {dict.crop.clear}
                </Button>
              </div>
              {recrop.results.fields.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">{dict.crop.resultsEmpty}</p>
              ) : (
                recrop.results.fields.map((field) => (
                  <div key={field.field} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0">
                    <span className="text-xs text-muted-foreground">{recognitionFieldLabel(dict, field.field)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm tabular-nums">
                        {formatFinancial(field.normalizedValue ?? field.rawValue)}
                      </span>
                      {!readOnly ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-6 px-2 font-mono text-[11px]"
                          onClick={() => onSaveField(field.field as FieldKey, field.normalizedValue ?? field.rawValue)}
                          data-testid={`recognition-crop-apply-${field.field}`}
                        >
                          {dict.crop.applyField}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : null}
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
            disabled={recognition.fields.length === 0 && !recognition.candidates}
            data-testid="recognition-review-draft"
          >
            {recognition.candidates && recognition.candidates.length > 1
              ? dict.multi.reviewTitle
              : dict.result.nextReview}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

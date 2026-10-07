"use client";

import * as React from "react";
import { Copy, Crop, FileWarning, Loader2, RotateCcw, ScanSearch, Shapes, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrRecognition } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";
import { RecognizedField } from "@/components/recognition/recognized-field";
import { RecognitionWarnings } from "@/components/recognition/recognition-warnings";
import { QualityScore, RecognitionIssues, RecognitionTimeline } from "@/components/recognition/recognition-issues";
import { AccountSnapshotView, ChartReadingView } from "@/components/recognition/recognition-profile-views";
import {
  FIELD_ORDER,
  formatFinancial,
  platformLabel,
  profileMetaKey,
  type FieldKey,
} from "@/components/recognition/recognition-model";
import { recognitionFieldLabel, type RecognitionDict } from "@/i18n/dictionaries/en/recognition";
import { RecognitionCollectionsRow } from "@/components/recognition/recognition-collections";

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
  onReprocess,
  reprocessing,
  onAcknowledgeTradeDuplicate,
  onAcknowledgeScreenshotDuplicate,
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
  /** V2 §32/§39 — re-run the pipeline over the stored asset. */
  onReprocess?: () => void;
  reprocessing?: boolean;
  /** V2 §58 — acknowledge the trade-duplicate warning (Import Anyway). */
  onAcknowledgeTradeDuplicate?: () => void;
  /** V2 §58 — acknowledge the screenshot-duplicate warning (Import Anyway). */
  onAcknowledgeScreenshotDuplicate?: () => void;
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

  // V2 §10/§55 — bounding-box overlay: fields with source regions render as
  // rectangles on the capture; hovering/clicking a region highlights the
  // field row and vice versa.
  const [showBoxes, setShowBoxes] = React.useState(false);
  const [activeField, setActiveField] = React.useState<string | null>(null);
  const regionsWithFields = React.useMemo(
    () =>
      recognition.fields
        .filter((field) => field.sourceRegion !== null)
        .map((field) => ({ field, region: field.sourceRegion! })),
    [recognition.fields],
  );

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
          {onReprocess ? (
            <Button type="button" variant="ghost" size="sm" onClick={onReprocess} disabled={reprocessing} data-testid="recognition-reprocess">
              {reprocessing ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
              {reprocessing ? dict.reprocess.running : dict.reprocess.action}
            </Button>
          ) : null}
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

  // Account & Chart V1.1 — the profile decides WHAT the right column is.
  const metaKey = profileMetaKey(recognition.extractionProfile);

  /** Shared props for the profile-specific right columns. */
  const profileViewProps = {
    recognition,
    dict,
    effectiveValues,
    editingField,
    readOnly,
    activeField,
    onEditStart,
    onEditCancel,
    onSaveField,
    onFieldFocus: setActiveField,
    onFieldBlur: (field: string) => setActiveField((current) => (current === field ? null : current)),
  };

  const modeStamp =
    metaKey === "account" ? (
      <span className="stamp stamp-accent !text-[10px]" data-testid="recognition-mode-badge">{dict.result.mode.account}</span>
    ) : metaKey === "chart" ? (
      <span className="stamp stamp-accent !text-[10px]" data-testid="recognition-mode-badge">{dict.result.mode.chart}</span>
    ) : (
      <span className="stamp stamp-ink !text-[10px]" data-testid="recognition-mode-badge">{dict.result.mode.trade}</span>
    );

  return (
    <div className="flex flex-col gap-4" data-testid="recognition-result">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <RecognitionStatusBadge status={recognition.status} dict={dict} />
          {modeStamp}
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

      {/* V2 §28 — collections holding this screenshot (hidden when none). */}
      <RecognitionCollectionsRow dict={dict} recognitionId={recognition.id} />

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
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" asChild data-testid="recognition-duplicate-open">
              <a href={`/recognition?job=${recognition.duplicateOf.recognitionId}`}>{dict.duplicate.open}</a>
            </Button>
            {!readOnly && onAcknowledgeScreenshotDuplicate ? (
              <Button type="button" variant="ghost" size="sm" onClick={onAcknowledgeScreenshotDuplicate} data-testid="recognition-duplicate-anyway">
                {dict.duplicate.anyway}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* V2 §4 — content-based trade duplicate (different screenshot, same trade). */}
      {recognition.possibleTradeDuplicate ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/[0.06] px-4 py-3"
          data-testid="recognition-trade-duplicate-banner"
        >
          <p className="flex items-center gap-2 text-sm">
            <Copy className="size-4 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
            <span className="flex flex-col">
              <span className="font-medium">{dict.tradeDuplicate.title}</span>
              <span className="text-xs text-muted-foreground">{dict.tradeDuplicate.body}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {dict.tradeDuplicate.matchedOn}:
                </span>
                {recognition.possibleTradeDuplicate.matchedOn.map((evidence) => (
                  <span key={evidence} className="stamp stamp-ink !text-[9px]">
                    {evidence.replace(/_/g, " ")}
                  </span>
                ))}
              </span>
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" asChild data-testid="recognition-trade-duplicate-open">
              <a href={`/trades?tradeId=${recognition.possibleTradeDuplicate.tradeId}`}>{dict.tradeDuplicate.open}</a>
            </Button>
            {!readOnly && onAcknowledgeTradeDuplicate ? (
              <Button type="button" variant="ghost" size="sm" onClick={onAcknowledgeTradeDuplicate} data-testid="recognition-trade-duplicate-anyway">
                {dict.tradeDuplicate.anyway}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <RecognitionWarnings warnings={recognition.warnings} dict={dict} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Screenshot column — sticky on desktop (§17/§35). */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="ledger-label">{dict.result.screenshot}</p>
            <div className="flex items-center gap-1.5">
              {regionsWithFields.length > 0 && !cropMode ? (
                <Button
                  type="button"
                  variant={showBoxes ? "default" : "outline"}
                  size="sm"
                  className="min-h-8"
                  onClick={() => setShowBoxes((current) => !current)}
                  data-testid="recognition-boxes-toggle"
                >
                  <Shapes className="size-3.5" aria-hidden="true" />
                  {dict.boxes.toggle}
                </Button>
              ) : null}
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
                  onLoad={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setImageBox({ width: rect.width, height: rect.height });
                  }}
                />
                {/* V2 §10/§55 — source-region overlays (real-pixel → display mapping). */}
                {showBoxes && imageBox
                  ? regionsWithFields.map(({ field, region }) => {
                      const scale = Math.min(
                        imageBox.width / recognition.asset.width,
                        imageBox.height / recognition.asset.height,
                      );
                      const renderedWidth = recognition.asset.width * scale;
                      const renderedHeight = recognition.asset.height * scale;
                      const offsetX = (imageBox.width - renderedWidth) / 2;
                      const offsetY = (imageBox.height - renderedHeight) / 2;
                      const active = activeField === field.field;
                      return (
                        <button
                          key={field.field}
                          type="button"
                          className={cn(
                            "pointer-events-auto absolute rounded-sm border-2 transition-colors",
                            active
                              ? "border-accent bg-accent/20"
                              : "border-accent/50 bg-accent/[0.08] hover:bg-accent/20",
                          )}
                          style={{
                            left: offsetX + region.x * scale,
                            top: offsetY + region.y * scale,
                            width: Math.max(6, region.width * scale),
                            height: Math.max(6, region.height * scale),
                          }}
                          onMouseEnter={() => setActiveField(field.field)}
                          onFocus={() => setActiveField(field.field)}
                          onClick={() => {
                            setActiveField(field.field);
                            document
                              .querySelector(`[data-field-row="${field.field}"]`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          aria-label={`${recognitionFieldLabel(dict, field.field as FieldKey)} — ${dict.boxes.toggle}`}
                          data-testid={`recognition-box-${field.field}`}
                        />
                      );
                    })
                  : null}
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

        {/* Extracted fields — one ruled list, never cards-in-cards.
            Account & Chart profiles render their dedicated surfaces. */}
        <div className="flex flex-col gap-4">
          {metaKey === "account" ? (
            <AccountSnapshotView {...profileViewProps} />
          ) : metaKey === "chart" ? (
            <ChartReadingView {...profileViewProps} />
          ) : (
            <>
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
                    <div
                      key={field.field}
                      data-field-row={field.field}
                      className={cn(
                        activeField === field.field && "-mx-2 rounded-md bg-accent/[0.06] px-2",
                      )}
                      onMouseEnter={() => setActiveField(field.field)}
                      onMouseLeave={() => setActiveField((current) => (current === field.field ? null : current))}
                    >
                      <RecognizedField
                        field={{ ...field, normalizedValue: field.field in effectiveValues ? effectiveValues[field.field] : field.normalizedValue }}
                        dict={dict}
                        editing={editingField === field.field && !readOnly}
                        onEditStart={() => onEditStart(field.field)}
                        onEditCancel={onEditCancel}
                        onSave={(value) => onSaveField(field.field, value)}
                        disabled={readOnly}
                      />
                    </div>
                  ))
                )}
              </div>

              {/* V2 §15/§16/§23 — quality, issues and timeline under the fields. */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col rounded-xl border border-border bg-surface px-4 py-3">
                  <QualityScore qualityScore={recognition.qualityScore} dict={dict} />
                  <RecognitionTimeline timeline={recognition.timeline} dict={dict} />
                </div>
                <div className="flex flex-col rounded-xl border border-border bg-surface px-4 py-3">
                  <RecognitionIssues
                    issues={recognition.issues}
                    dict={dict}
                    onSelectField={(field) => {
                      setActiveField(field);
                      document
                        .querySelector(`[data-field-row="${field}"]`)
                        ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Quality + issues for the NON-trade profiles sit below their panels. */}
          {metaKey !== "trade" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col rounded-xl border border-border bg-surface px-4 py-3">
                <QualityScore qualityScore={recognition.qualityScore} dict={dict} />
              </div>
              <div className="flex flex-col rounded-xl border border-border bg-surface px-4 py-3">
                <RecognitionIssues
                  issues={recognition.issues}
                  dict={dict}
                  onSelectField={(field) => {
                    setActiveField(field);
                    document
                      .querySelector(`[data-field-row="${field}"]`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                />
              </div>
            </div>
          ) : null}
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
              : metaKey === "account"
                ? dict.result.nextReviewAccount
                : metaKey === "chart"
                  ? dict.result.nextReviewChart
                  : dict.result.nextReview}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

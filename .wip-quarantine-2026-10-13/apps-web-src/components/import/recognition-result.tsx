"use client";

/**
 * RecognitionResult — the completed recognition view (spec §17): original
 * screenshot beside the extracted fields, confidence per field, review
 * warnings, and the two review actions (Create Trade Draft / Discard).
 * Desktop splits screenshot | data; mobile stacks (spec §35).
 */

import * as React from "react";
import { ChevronDown, ChevronUp, ImageOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  jobNeedsReview,
  PRIMARY_FIELD_KEYS,
  SECONDARY_FIELD_KEYS,
} from "@/lib/recognition/constants";
import type {
  RecognitionFieldKey,
  RecognitionJob,
  RecognizedTrade,
} from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";
import { WarningsList } from "./import-shared";
import { RecognizedFieldRow } from "./recognized-field";

export function RecognitionResult({
  job,
  trade,
  edits,
  onEditField,
  onCreateDraft,
  onDiscard,
  discardOpen,
  onDiscardOpenChange,
}: {
  job: RecognitionJob;
  trade: RecognizedTrade;
  /** Corrected values keyed by field (spec §21) — owned by the review flow. */
  edits: Partial<Record<RecognitionFieldKey, string>>;
  onEditField: (key: RecognitionFieldKey, value: string) => void;
  onCreateDraft: () => void;
  onDiscard: () => void;
  discardOpen: boolean;
  onDiscardOpenChange: (open: boolean) => void;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.result;
  const [showAllFields, setShowAllFields] = React.useState(false);

  const fieldMap = new Map(trade.fields.map((field) => [field.key, field]));
  const primary = PRIMARY_FIELD_KEYS.map(
    (key) => fieldMap.get(key) ?? null,
  ).filter((field): field is NonNullable<typeof field> => field !== null);
  const secondary = SECONDARY_FIELD_KEYS.map(
    (key) => fieldMap.get(key) ?? null,
  ).filter((field): field is NonNullable<typeof field> => field !== null);

  const needsReview = jobNeedsReview(job);

  return (
    <div className="space-y-4" data-testid="import-result">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{V.title}</h2>
          <p className="text-sm text-muted-foreground">{V.subtitle}</p>
        </div>
        {needsReview && (
          <span
            className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning"
            data-testid="import-result-needs-review"
          >
            {dict.recognition.status.NEEDS_REVIEW}
          </span>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Original screenshot (spec §17) */}
        <Card data-testid="import-result-screenshot">
          <CardHeader>
            <CardTitle className="text-sm">{V.screenshotTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-hidden rounded-lg border bg-muted/30">
              {job.previewUrl ? (
                <div className="flex max-h-96 items-center justify-center overflow-y-auto bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                  <img
                    src={job.previewUrl}
                    alt={V.screenshotAria}
                    className="max-h-96 w-auto max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden />
                </div>
              )}
            </div>
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{V.detectedLabel}</dt>
                <dd
                  className="font-mono"
                  data-testid="import-result-platform"
                >
                  {job.result?.detectedPlatform
                    ? dict.recognition.settings.platformOptions[
                        job.result.detectedPlatform
                      ]
                    : V.detectedNone}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{dict.recognition.details.fileLabel}</dt>
                <dd className="max-w-48 truncate font-mono" title={job.file.fileName}>
                  {job.file.fileName}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Extracted data (spec §17/§20) */}
        <Card data-testid="import-result-fields">
          <CardHeader>
            <CardTitle className="text-sm">{V.fieldsTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <WarningsList warnings={job.result?.warnings ?? []} dict={dict.recognition} />

            <div className="space-y-2" aria-label={V.fieldsAria}>
              {primary.map((field) => (
                <RecognizedFieldRow
                  key={field.key}
                  field={
                    edits[field.key] !== undefined
                      ? { ...field, value: edits[field.key] ?? null, edited: true }
                      : field
                  }
                  onValueChange={onEditField}
                />
              ))}
            </div>

            {secondary.length > 0 && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowAllFields((current) => !current)}
                  aria-expanded={showAllFields}
                  data-testid="import-result-toggle-secondary"
                >
                  {showAllFields ? (
                    <ChevronUp aria-hidden />
                  ) : (
                    <ChevronDown aria-hidden />
                  )}
                  {showAllFields ? V.fewerFields : V.moreFields}
                </Button>
                {showAllFields && (
                  <div
                    className="space-y-2"
                    data-testid="import-result-secondary"
                    aria-label={V.allFieldsTitle}
                  >
                    {secondary.map((field) => (
                      <RecognizedFieldRow
                        key={field.key}
                        field={
                          edits[field.key] !== undefined
                            ? { ...field, value: edits[field.key] ?? null, edited: true }
                            : field
                        }
                        onValueChange={onEditField}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDiscardOpenChange(true)}
          data-testid="import-discard"
          aria-label={V.discardAria}
        >
          <Trash2 aria-hidden />
          {V.discard}
        </Button>
        <Button
          type="button"
          onClick={onCreateDraft}
          data-testid="import-draft-open"
          aria-label={V.createDraftAria}
        >
          {V.createDraft}
        </Button>
      </div>

      <Dialog open={discardOpen} onOpenChange={onDiscardOpenChange}>
        <DialogContent className="sm:max-w-md" data-testid="import-discard-dialog">
          <DialogHeader>
            <DialogTitle>{V.discardTitle}</DialogTitle>
            <DialogDescription>{V.discardBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onDiscardOpenChange(false)}
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onDiscard}
              data-testid="import-discard-confirm"
            >
              {V.discardConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

/**
 * RecognizedField — one recognized field with its recognition confidence
 * (spec §18/§20) and inline editing (spec §21). Editing validates through
 * the centralized schema layer and reports STABLE issue codes; the value is
 * committed to the parent only when valid. Confidence is always presented
 * as a score, never a guarantee (spec §18 wording rules).
 */

import * as React from "react";
import { Check, Loader2, Pencil, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RECOGNITION_FIELD_KINDS } from "@/lib/recognition/constants";
import { validateFieldValue } from "@/lib/recognition/schemas";
import { isoToLocalInput } from "@/lib/utils/datetime";
import type { RecognitionFieldKey, RecognizedField } from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";
import { ConfidenceBadge, FieldWarningIcon } from "./import-shared";

export function RecognizedFieldRow({
  field,
  onValueChange,
}: {
  field: RecognizedField;
  /** Commit a corrected value (already validated). */
  onValueChange: (key: RecognitionFieldKey, value: string) => void;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.result;
  const C = dict.recognition.confidence;
  const label = dict.recognition.fields[field.key];
  const kind = RECOGNITION_FIELD_KINDS[field.key];

  const [editing, setEditing] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const beginEdit = () => {
    // Datetime fields edit a datetime-local value; the stored value is ISO.
    setDraftValue(
      kind === "datetime" ? (field.value ? isoToLocalInput(field.value) ?? "" : "") : field.value ?? "",
    );
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const commit = () => {
    setSaving(true);
    const outcome = validateFieldValue(kind, draftValue);
    // Simulated latency keeps the disabled/save state honest (spec §34).
    window.setTimeout(() => {
      setSaving(false);
      if (outcome.ok) {
        onValueChange(field.key, outcome.value);
        setEditing(false);
        setError(null);
      } else {
        setError(dict.recognition.validation[outcome.code]);
      }
    }, 120);
  };

  const displayValue = (): string => {
    if (field.status === "NOT_FOUND") return V.notFound;
    if (field.status === "NOT_APPLICABLE") return V.notApplicable;
    if (field.status === "UNCERTAIN") return field.value ?? V.uncertain;
    return field.value ?? V.noValue;
  };

  const statusTone =
    field.status === "NOT_FOUND" || field.status === "NOT_APPLICABLE"
      ? "text-muted-foreground italic"
      : "text-foreground";

  return (
    <div
      className="rounded-xl border bg-surface p-3 transition-colors"
      data-testid={`import-field-${field.key}`}
      data-status={field.status.toLowerCase()}
      data-edited={field.edited ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {field.confidence !== null && (
          <ConfidenceBadge
            score={field.confidence}
            dict={dict.recognition}
            aria-label={`${label} — ${field.confidence} ${C.ariaSuffix}`}
          />
        )}
      </div>

      {!editing ? (
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {field.key === "direction" && field.value ? (
              <p
                className={cn(
                  "font-mono text-lg font-semibold leading-tight",
                  field.value === "BUY" ? "text-profit" : "text-loss",
                )}
                data-testid={`import-field-${field.key}-value`}
              >
                {field.value}
              </p>
            ) : field.key === "pnl" && field.value ? (
              <p
                className={cn(
                  "font-mono text-lg font-semibold leading-tight",
                  field.value.trim().startsWith("-") ? "text-loss" : "text-profit",
                )}
                data-testid={`import-field-${field.key}-value`}
              >
                {field.value}
              </p>
            ) : (
              <p
                className={cn("font-mono text-lg leading-tight", statusTone)}
                data-testid={`import-field-${field.key}-value`}
              >
                {displayValue()}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {field.edited && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                  data-testid={`import-field-${field.key}-edited`}
                >
                  <Undo2 className="size-3" aria-hidden />
                  {V.editedBadge}
                </span>
              )}
              {field.status === "UNCERTAIN" && <FieldWarningIcon dict={dict.recognition} />}
            </div>
          </div>
          {field.status !== "NOT_APPLICABLE" && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={beginEdit}
              data-testid={`import-field-${field.key}-edit`}
              aria-label={`${V.editAria} — ${label}`}
            >
              <Pencil aria-hidden />
              {V.edit}
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {kind === "direction" ? (
            <div
              role="radiogroup"
              aria-label={label}
              className="flex gap-2"
              data-testid={`import-field-${field.key}-options`}
            >
              {(["BUY", "SELL"] as const).map((direction) => (
                <label
                  key={direction}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 font-mono text-sm transition-colors",
                    "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                    draftValue === direction
                      ? direction === "BUY"
                        ? "border-profit bg-profit/10 text-profit"
                        : "border-loss bg-loss/10 text-loss"
                      : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name={`edit-${field.key}`}
                    value={direction}
                    checked={draftValue === direction}
                    onChange={() => setDraftValue(direction)}
                    className="sr-only"
                  />
                  {direction === "BUY" ? V.directionBuy : V.directionSell}
                </label>
              ))}
            </div>
          ) : (
            <Input
              type={kind === "datetime" ? "datetime-local" : "text"}
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") cancelEdit();
              }}
              aria-label={label}
              aria-invalid={error !== null}
              autoFocus
              className={cn("font-mono", error && "border-loss focus-visible:ring-loss")}
              data-testid={`import-field-${field.key}-input`}
            />
          )}
          {error && (
            <p role="alert" className="text-xs text-loss" data-testid={`import-field-${field.key}-error`}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="xs"
              onClick={commit}
              disabled={saving}
              data-testid={`import-field-${field.key}-save`}
              aria-label={`${V.saveAria} — ${label}`}
            >
              {saving ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              {V.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={cancelEdit}
              disabled={saving}
              data-testid={`import-field-${field.key}-cancel`}
              aria-label={V.cancelEditAria}
            >
              {V.cancelEdit}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

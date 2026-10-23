"use client";

import * as React from "react";
import { History, Pencil, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrExtractedField } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfidenceBadge } from "@/components/recognition/confidence-badge";
import {
  formatExtractedTime,
  formatFinancial,
  isMissing,
  needsReview,
  profitTone,
  validateFieldValue,
} from "@/components/recognition/recognition-model";
import { recognitionFieldLabel, type RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognizedField — one extracted value in the ruled review list
 * (PROMPT 3 §20/§21).
 *
 * States (§19/§64): FOUND (editable value + confidence), MISSING ("not
 * detected" - still editable, the user can enter the value manually),
 * UNCERTAIN (AMBIGUOUS/LOW_CONFIDENCE — ochre "please verify" ink + the
 * engine's per-field warnings). Display is exact: financial values keep
 * their decimals (§47), extracted timestamps render in the user's locale
 * (§48). The raw value as read by the engine stays one hover away.
 *
 * P&L gets the ONE semantic-colored numeral of its row (Le Registre #3).
 */
export function RecognizedField({
  field,
  dict,
  editing,
  onEditStart,
  onEditCancel,
  onSave,
  disabled = false,
}: {
  field: OcrExtractedField;
  dict: RecognitionDict;
  /** Whether THIS field is currently in inline edit mode. */
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onSave: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [suggestionApplied, setSuggestionApplied] = React.useState(false);
  const key: string = field.field;
  const label = recognitionFieldLabel(dict, field.field);
  const missing = isMissing(field);
  const review = needsReview(field) && !missing;
  const draftValue = field.normalizedValue ?? "";

  const displayValue = (() => {
    if (missing) return "";
    if (key === "openTime" || key === "closeTime" || key === "chartTime") return formatExtractedTime(field.normalizedValue);
    if (key === "chartTimeframe" || key === "accountCurrency" || key === "accountLeverage" || key === "accountLogin" || key === "accountServer") {
      return field.normalizedValue ?? "";
    }
    return formatFinancial(field.normalizedValue);
  })();
  const profit = key === "profit" ? profitTone(field.normalizedValue) : null;

  return (
    <div
      className="border-b border-border/60 py-3"
      data-testid={`recognition-field-${field.field}`}
      data-validation={field.validationStatus}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="ledger-label">{label}</p>
        {!editing ? (
          <ConfidenceBadge
            band={missing ? "UNKNOWN" : field.confidenceBand}
            confidence={missing ? 0 : field.confidence}
            dict={dict}
          />
        ) : null}
      </div>

      {editing ? (
        <EditRow
          fieldKey={key}
          initial={draftValue}
          dict={dict}
          disabled={disabled}
          onCancel={onEditCancel}
          onSave={onSave}
        />
      ) : (
        <>
          <div className="mt-1 flex items-center justify-between gap-3">
            {missing ? (
              <p className="font-mono text-sm text-muted-foreground/70 italic">
                {dict.result.states.notFound}
              </p>
            ) : (
              <p
                className={cn(
                  "font-mono text-[15px] tabular-nums",
                  profit === "profit" && "text-profit",
                  profit === "loss" && "text-loss",
                )}
              >
                {displayValue}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-8"
              onClick={onEditStart}
              disabled={disabled}
              data-testid={`recognition-edit-${field.field}`}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              {dict.result.states.edit}
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {review ? (
              <span className="inline-flex items-center gap-1 text-xs text-warning">
                <TriangleAlert className="size-3.5" aria-hidden="true" />
                {dict.result.states.uncertain}
              </span>
            ) : null}
            {missing ? (
              <span className="text-xs text-muted-foreground">{dict.result.states.missing}</span>
            ) : null}
            {field.rawValue && field.rawValue !== field.normalizedValue ? (
              <span
                className="font-mono text-[11px] text-muted-foreground/70"
                title={dict.result.states.raw}
              >
                {dict.result.states.raw}: {field.rawValue}
              </span>
            ) : null}
            {field.warnings.map((warning) => (
              <span key={warning} className="text-xs text-warning">
                {warning}
              </span>
            ))}
            {field.suggestion && !missing && field.suggestion.value !== field.normalizedValue ? (
              <button
                type="button"
                onClick={() => {
                  onSave(field.suggestion!.value);
                  setSuggestionApplied(true);
                }}
                disabled={disabled}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] tabular-nums transition-colors hover:border-accent hover:text-accent",
                  disabled && "pointer-events-none opacity-60",
                  suggestionApplied && "border-accent/50 text-accent",
                )}
                title={dict.suggestions.hint}
                data-testid={`recognition-suggestion-${field.field}`}
              >
                <History className="size-3" aria-hidden="true" />
                {dict.suggestions.apply} {formatFinancial(field.suggestion.value)}
                <span className="text-muted-foreground">×{field.suggestion.occurrences}</span>
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Inline edit row (§21) — the right control per type: enum (direction) gets
 * a select, everything else a validated input. Empty input = clear the
 * value (contract §21: null explicitly clears).
 */
function EditRow({
  fieldKey,
  initial,
  dict,
  disabled,
  onCancel,
  onSave,
}: {
  fieldKey: string;
  initial: string;
  dict: RecognitionDict;
  disabled: boolean;
  onCancel: () => void;
  onSave: (value: string | null) => void;
}) {
  const [value, setValue] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = `edit-${fieldKey}`;

  const save = () => {
    const result = validateFieldValue(fieldKey, value);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSave(result.value === "" ? null : result.value);
  };

  if (fieldKey === "direction") {
    return (
      <div className="mt-1 flex items-center gap-2">
        <Select
          value={value.toUpperCase() === "SELL" ? "SELL" : "BUY"}
          onValueChange={(next) => setValue(next)}
          disabled={disabled}
        >
          <SelectTrigger className="h-9 w-32 font-mono" aria-label={recognitionFieldLabel(dict, fieldKey)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BUY">{dict.result.directionBuy}</SelectItem>
            <SelectItem value="SELL">{dict.result.directionSell}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={save} disabled={disabled} data-testid="recognition-save-direction">
          {dict.result.states.save}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={disabled}>
          {dict.result.states.cancel}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Input
        id={inputId}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        inputMode={fieldKey === "symbol" || fieldKey.includes("Time") ? "text" : "decimal"}
        className={cn("h-9 max-w-56 font-mono tabular-nums", error && "border-loss focus-visible:ring-loss/40")}
        disabled={disabled}
        autoFocus
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        placeholder={fieldKey.includes("Time") ? "YYYY-MM-DD HH:MM" : undefined}
        data-testid={`recognition-input-${fieldKey}`}
      />
      <Button type="submit" size="sm" disabled={disabled} data-testid="recognition-save-field">
        {dict.result.states.save}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={disabled}>
        {dict.result.states.cancel}
      </Button>
      {error ? (
        <p className="w-full text-xs text-loss" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

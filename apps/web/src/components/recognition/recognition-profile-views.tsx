"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Landmark, ListOrdered, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrRecognition } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { RecognizedField } from "@/components/recognition/recognized-field";
import {
  formatFinancial,
  formatExtractedTime,
  profitTone,
} from "@/components/recognition/recognition-model";
import { recognitionFieldLabel, type RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * Profile-specific result surfaces (Account & Chart V1.1 redesign).
 *
 * AccountSnapshotView — the account KPI strip (equity + balance as hero
 * cells, the margin metrics as KPI cells), the identity fields as a ruled
 * list and the recognized OPEN POSITIONS as a ledger table (the same
 * grouped-evidence contract as multi-trade drafts — the grouped review
 * owns their confirmation).
 *
 * ChartReadingView — the quote headline (symbol, timeframe stamp, price,
 * signed change, chart time) followed by the quote and indicator readings
 * as ruled field lists.
 *
 * Both views stay inside the review contract: every value is an
 * RecognizedField the user can correct — nothing becomes authoritative
 * without the confirmation step (§21).
 */

type EffectiveValues = Record<string, string | null>;

interface ProfileViewProps {
  recognition: OcrRecognition;
  dict: RecognitionDict;
  effectiveValues: EffectiveValues;
  editingField: string | null;
  readOnly: boolean;
  activeField: string | null;
  onEditStart: (field: string) => void;
  onEditCancel: () => void;
  onSaveField: (field: string, value: string | null) => void;
  onFieldFocus: (field: string) => void;
  onFieldBlur: (field: string) => void;
}

function effectiveValue(values: EffectiveValues, field: { normalizedValue: string | null; field: string }): string | null {
  return field.field in values ? values[field.field] ?? null : field.normalizedValue;
}

/** One ruled field row reusing the shared RecognizedField editor. */
function ProfileFieldRow({
  field,
  dict,
  effectiveValues: values,
  editingField,
  readOnly,
  activeField,
  onEditStart,
  onEditCancel,
  onSaveField,
  onFieldFocus,
  onFieldBlur,
}: Omit<ProfileViewProps, "recognition"> & {
  field: OcrRecognition["fields"][number];
}) {
  return (
    <div
      data-field-row={field.field}
      className={cn(activeField === field.field && "-mx-2 rounded-md bg-accent/[0.06] px-2")}
      onMouseEnter={() => onFieldFocus(field.field)}
      onMouseLeave={() => onFieldBlur(field.field)}
    >
      <RecognizedField
        field={{ ...field, normalizedValue: effectiveValue(values, field) }}
        dict={dict}
        editing={editingField === field.field && !readOnly}
        onEditStart={() => onEditStart(field.field)}
        onEditCancel={onEditCancel}
        onSave={(value) => onSaveField(field.field, value)}
        disabled={readOnly}
      />
    </div>
  );
}

// ── ACCOUNT / POSITION ──────────────────────────────────────────────────────

const ACCOUNT_HEROES = ["accountEquity", "accountBalance"] as const;
const ACCOUNT_KPIS = ["accountMargin", "accountFreeMargin", "accountMarginLevel"] as const;
const ACCOUNT_IDENTITY = ["accountLogin", "accountServer", "accountCurrency", "accountLeverage"] as const;

export function AccountSnapshotView({
  recognition,
  dict,
  effectiveValues,
  editingField,
  readOnly,
  activeField,
  onEditStart,
  onEditCancel,
  onSaveField,
  onFieldFocus,
  onFieldBlur,
}: ProfileViewProps) {
  const byKey = new Map<string, OcrRecognition["fields"][number]>(
    recognition.fields.map((field) => [field.field, field]),
  );
  const moneyTone = (key: string): "profit" | "loss" | null =>
    key === "accountEquity" || key === "accountBalance" ? profitTone(effectiveValue(effectiveValues, byKey.get(key)!)) : null;

  const positions = recognition.candidates ?? [];

  const cell = (key: (typeof ACCOUNT_HEROES)[number] | (typeof ACCOUNT_KPIS)[number]) => {
    const field = byKey.get(key);
    if (!field) return null;
    const value = effectiveValue(effectiveValues, field);
    const tone = moneyTone(key);
    const editing = editingField === key && !readOnly;
    return (
      <div
        key={key}
        className={cn(
          "stat-cell flex flex-col justify-between gap-2",
          (ACCOUNT_HEROES as readonly string[]).includes(key) ? "stat-hero" : "stat-kpi",
        )}
        data-field-row={key}
        data-testid={`recognition-account-stat-${key}`}
        onMouseEnter={() => onFieldFocus(key)}
        onMouseLeave={() => onFieldBlur(key)}
      >
        {editing ? (
          <RecognizedField
            field={{ ...field, normalizedValue: value }}
            dict={dict}
            editing
            onEditStart={() => onEditStart(key)}
            onEditCancel={onEditCancel}
            onSave={(next) => onSaveField(key, next)}
            disabled={readOnly}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="ledger-label">{recognitionFieldLabel(dict, key)}</p>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-7"
                  onClick={() => onEditStart(key)}
                  data-testid={`recognition-edit-${key}`}
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  {dict.result.states.edit}
                </Button>
              ) : null}
            </div>
            <p className={cn(
              "font-mono font-medium tabular-nums",
              (ACCOUNT_HEROES as readonly string[]).includes(key) ? "text-xl sm:text-2xl" : "text-lg sm:text-xl",
              tone === "profit" && "text-profit",
              tone === "loss" && "text-loss",
              field.validationStatus === "MISSING" && "text-muted-foreground",
            )}>
              {formatFinancial(value) || dict.result.states.notFound}
            </p>
            {field.confidenceBand !== "HIGH" && field.validationStatus !== "MISSING" ? (
              <p className="text-[11px] text-warning">{dict.result.bands[field.confidenceBand]}</p>
            ) : null}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5" data-testid="recognition-account-view">
      <p className="ledger-label rule-double pb-2">{dict.result.accountTitle}</p>

      {/* KPI strip — equity + balance heroes, margin metrics as KPI cells. */}
      <section aria-label={dict.result.accountSnapshot} className="stat-strip">
        {ACCOUNT_HEROES.map((key) => (byKey.has(key) ? cell(key) : null))}
        {ACCOUNT_KPIS.map((key) => (byKey.has(key) ? cell(key) : null))}
      </section>

      {/* Identity — a ruled list of editable fields. */}
      {ACCOUNT_IDENTITY.some((key) => byKey.has(key)) ? (
        <div className="flex flex-col">
          <p className="ledger-label border-b border-border pb-2">{dict.result.accountIdentity}</p>
          {ACCOUNT_IDENTITY.map((key) => {
            const field = byKey.get(key);
            return field ? (
              <ProfileFieldRow
                key={key}
                field={field}
                dict={dict}
                effectiveValues={effectiveValues}
                editingField={editingField}
                readOnly={readOnly}
                activeField={activeField}
                onEditStart={onEditStart}
                onEditCancel={onEditCancel}
                onSaveField={onSaveField}
                onFieldFocus={onFieldFocus}
                onFieldBlur={onFieldBlur}
              />
            ) : null;
          })}
        </div>
      ) : null}

      {/* Open positions — ledger table over the grouped candidates. */}
      <div className="flex flex-col" data-testid="recognition-account-positions">
        <p className="ledger-label flex items-center gap-1.5 border-b border-border pb-2">
          <ListOrdered className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          {dict.result.accountPositionsTitle}
          <span className="font-mono text-[10px] text-muted-foreground">({positions.length})</span>
        </p>
        {positions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{dict.result.accountPositionsEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {(["symbol", "direction", "volume", "entryPrice", "stopLoss", "takeProfit"] as const).map((column) => (
                    <th key={column} className="ledger-label whitespace-nowrap px-2 py-2 first:pl-0 last:pr-0">
                      {recognitionFieldLabel(dict, column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((candidate, index) => {
                  const byField = new Map(candidate.fields.map((field) => [field.field, field]));
                  return (
                    <tr key={index} className="border-b border-border/50 last:border-b-0">
                      {(["symbol", "direction", "volume", "entryPrice", "stopLoss", "takeProfit"] as const).map((column) => {
                        const field = byField.get(column);
                        const value = field?.normalizedValue ?? null;
                        return (
                          <td key={column} className="whitespace-nowrap px-2 py-2.5 first:pl-0 last:pr-0">
                            <span className={cn(
                              "font-mono tabular-nums",
                              column === "symbol" && "font-medium",
                              column === "direction" && "text-xs",
                            )}>
                              {value === null ? "-" : formatFinancial(value)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{dict.draft.subtitleAccount}</p>
      </div>
    </div>
  );
}

// ── CHART ANALYSIS ──────────────────────────────────────────────────────────

export function ChartReadingView({
  recognition,
  dict,
  effectiveValues,
  editingField,
  readOnly,
  activeField,
  onEditStart,
  onEditCancel,
  onSaveField,
  onFieldFocus,
  onFieldBlur,
}: ProfileViewProps) {
  const byKey = new Map<string, OcrRecognition["fields"][number]>(
    recognition.fields.map((field) => [field.field, field]),
  );
  const textOf = (key: string): string | null => {
    const field = byKey.get(key);
    if (!field) return null;
    const value = effectiveValue(effectiveValues, field);
    return value;
  };

  const symbol = textOf("symbol");
  const timeframe = textOf("chartTimeframe");
  const price = textOf("chartPrice");
  const change = textOf("chartChangePct");
  const chartTime = textOf("chartTime");
  const changeNumeric = change === null ? null : Number(change.replace(/\s/g, "").replace(",", "."));
  const changeTone = changeNumeric === null || Number.isNaN(changeNumeric)
    ? null
    : changeNumeric > 0
      ? "text-profit"
      : changeNumeric < 0
        ? "text-loss"
        : null;

  const quoteKeys = ["chartOpen", "chartHigh", "chartLow", "chartClose"] as const;
  const indicatorKeys = ["chartRsi", "chartMacd", "chartAtr", "chartStoch", "chartAdx", "chartMa"] as const;

  return (
    <div className="flex flex-col gap-5" data-testid="recognition-chart-view">
      <p className="ledger-label rule-double pb-2">{dict.result.chartTitle}</p>

      {/* Quote headline — symbol, timeframe stamp, price, signed change. */}
      <div className="chart-paper flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4" data-testid="recognition-chart-quote">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3">
            <span className="font-heading text-xl font-semibold tracking-tight">{symbol ?? "-"}</span>
            {timeframe ? <span className="stamp stamp-accent !text-[10px]">{timeframe}</span> : null}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-medium tabular-nums">
              {formatFinancial(price) || "-"}
            </span>
            {change !== null && change !== "" ? (
              <span className={cn("flex items-center gap-0.5 font-mono text-sm tabular-nums", changeTone ?? "text-muted-foreground")}>
                {changeNumeric !== null && changeNumeric > 0 ? (
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                ) : changeNumeric !== null && changeNumeric < 0 ? (
                  <ArrowDownRight className="size-3.5" aria-hidden="true" />
                ) : null}
                {change}%
              </span>
            ) : null}
          </div>
        </div>
        {chartTime ? (
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatExtractedTime(chartTime)}
          </p>
        ) : null}
      </div>

      {/* Quote rows (OHLC) — editable, ruled. */}
      {quoteKeys.some((key) => byKey.has(key)) ? (
        <div className="flex flex-col">
          <p className="ledger-label border-b border-border pb-2">{dict.result.chartQuote}</p>
          {quoteKeys.map((key) => {
            const field = byKey.get(key);
            return field ? (
              <ProfileFieldRow
                key={key}
                field={field}
                dict={dict}
                effectiveValues={effectiveValues}
                editingField={editingField}
                readOnly={readOnly}
                activeField={activeField}
                onEditStart={onEditStart}
                onEditCancel={onEditCancel}
                onSaveField={onSaveField}
                onFieldFocus={onFieldFocus}
                onFieldBlur={onFieldBlur}
              />
            ) : null;
          })}
        </div>
      ) : null}

      {/* Indicator readings — a two-column ruled grid on desktop. */}
      {indicatorKeys.some((key) => byKey.has(key)) ? (
        <div className="flex flex-col">
          <p className="ledger-label flex items-center gap-1.5 border-b border-border pb-2">
            <Landmark className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            {dict.result.chartIndicators}
          </p>
          <div className="grid sm:grid-cols-2 sm:gap-x-8">
            {indicatorKeys.map((key) => {
              const field = byKey.get(key);
              return field ? (
                <ProfileFieldRow
                  key={key}
                  field={field}
                  dict={dict}
                  effectiveValues={effectiveValues}
                  editingField={editingField}
                  readOnly={readOnly}
                  activeField={activeField}
                  onEditStart={onEditStart}
                  onEditCancel={onEditCancel}
                  onSaveField={onSaveField}
                  onFieldFocus={onFieldFocus}
                  onFieldBlur={onFieldBlur}
                />
              ) : null;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

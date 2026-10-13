"use client";

import * as React from "react";

import { Check, Crop, Pencil, ScanText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isoToLocalInput, localInputToISO } from "@/lib/utils/datetime";
import type {
  CropRegion,
  RecognitionResult,
  RecognizedField as RecognizedFieldType,
  RecognitionFieldKey,
  TradeDirection,
} from "@/lib/recognition/contract";
import {
  FIELD_LABELS,
  FIELD_TYPES,
  PRIMARY_FIELD_ORDER,
  PLATFORM_LABELS,
  SECONDARY_FIELD_ORDER,
} from "@/lib/recognition/contract";
import { ConfidenceBadge, CorrectedBadge, FieldStateNote } from "./ocr-badges";
import { WarningsPanel } from "./ocr-result-warnings";
import { formatDateTime, formatPrice, formatProfitLoss, formatVolume } from "./ocr-format";

/**
 * Recognition result workspace (Prompt 3 §17–§21, §25, §26). Desktop shows
 * the original screenshot and the detected fields side by side; mobile
 * stacks them (§35). Hovering/focusing a field highlights its source region
 * on the screenshot when the recognizer provided one (§25 — the data model
 * already carries normalized bounding boxes).
 */

export interface FieldCorrections {
  /** key → corrected value (null when the user cleared a value). */
  values: Partial<Record<RecognitionFieldKey, string | null>>;
}

function displayValue(field: RecognizedFieldType, corrections: FieldCorrections): string | null {
  if (field.key in corrections.values) {
    const corrected = corrections.values[field.key];
    return corrected === null || corrected === undefined || corrected === "" ? null : corrected;
  }
  if (field.state === "NOT_FOUND" || field.state === "NOT_APPLICABLE") return null;
  return field.value;
}

function formatFieldValue(
  field: RecognizedFieldType,
  value: string | null,
  currency: string | null,
): string {
  if (value === null) return "";
  switch (FIELD_TYPES[field.key]) {
    case "price":
      return formatPrice(value);
    case "volume":
      return formatVolume(value);
    case "pnl":
      return formatProfitLoss(value, currency);
    case "datetime":
      return formatDateTime(value);
    default:
      return value;
  }
}

// ── Inline editing (§21) ────────────────────────────────────────────────────

function validateFieldValue(
  field: RecognizedFieldType,
  raw: string,
): { value: string | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, error: null };
  switch (FIELD_TYPES[field.key]) {
    case "price":
    case "volume": {
      if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
        return { value: null, error: "Enter a positive decimal (up to 6 decimals)." };
      }
      return { value: trimmed, error: null };
    }
    case "pnl": {
      if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed.replace(/^\+/, ""))) {
        return { value: null, error: "Enter a decimal amount, e.g. 146.80 or -52.10." };
      }
      return { value: trimmed.replace(/^\+/, ""), error: null };
    }
    case "currency": {
      if (!/^[A-Za-z]{3}$/.test(trimmed)) {
        return { value: null, error: "Enter a 3-letter currency code (e.g. USD)." };
      }
      return { value: trimmed.toUpperCase(), error: null };
    }
    case "symbol": {
      if (!/^[A-Za-z0-9]{3,12}$/.test(trimmed)) {
        return { value: null, error: "Symbol must be 3–12 letters or digits." };
      }
      return { value: trimmed.toUpperCase(), error: null };
    }
    case "datetime": {
      const iso = localInputToISO(trimmed);
      if (iso === null) return { value: null, error: "Enter a valid date and time." };
      return { value: iso, error: null };
    }
    case "identifier": {
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(trimmed)) {
        return { value: null, error: "Up to 32 letters, digits, dashes or underscores." };
      }
      return { value: trimmed, error: null };
    }
    default:
      return { value: trimmed, error: null };
  }
}

function FieldEditor({
  field,
  rawValue,
  onSave,
  onCancel,
}: {
  field: RecognizedFieldType;
  rawValue: string;
  onSave: (value: string | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState(() => rawValue ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const save = () => {
    const result = validateFieldValue(field, draft);
    if (result.error !== null) {
      setError(result.error);
      return;
    }
    onSave(result.value);
  };

  const type = FIELD_TYPES[field.key];

  return (
    <div className="space-y-2" data-testid={`ocr-edit-${field.key}`}>
      {type === "direction" ? (
        <Select
          value={draft === "SELL" ? "SELL" : "BUY"}
          onValueChange={(value) => setDraft(value)}
        >
          <SelectTrigger aria-label="Direction" className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BUY">BUY</SelectItem>
            <SelectItem value="SELL">SELL</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          autoFocus
          type={type === "datetime" ? "datetime-local" : "text"}
          inputMode={type === "price" || type === "volume" || type === "pnl" ? "decimal" : undefined}
          value={type === "datetime" ? isoToLocalInput(draft || rawValue) : draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") onCancel();
          }}
          aria-invalid={error !== null}
          aria-label={`Edit ${FIELD_LABELS[field.key]}`}
          className="h-8 font-mono text-sm"
        />
      )}
      {error !== null ? (
        <p role="alert" className="text-[11px] text-loss">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 px-3 text-xs" onClick={save}>
          <Check className="size-3.5" aria-hidden />
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={onCancel}>
          <X className="size-3.5" aria-hidden />
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Field card (§20) ────────────────────────────────────────────────────────

function RecognizedFieldCard({
  field,
  corrected,
  display,
  highlighted,
  onHover,
  onEdit,
}: {
  field: RecognizedFieldType;
  corrected: boolean;
  display: string | null;
  highlighted: boolean;
  onHover: (key: RecognitionFieldKey | null) => void;
  onEdit: () => void;
}) {
  const empty = display === null || display === "";
  return (
    <div
      tabIndex={0}
      onMouseEnter={() => onHover(field.sourceRegion ? field.key : null)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(field.sourceRegion ? field.key : null)}
      onBlur={() => onHover(null)}
      className={cn(
        "rounded-lg border border-transparent px-3 py-2.5 outline-none transition-colors",
        "hover:border-border hover:bg-surface-raised/60 focus-visible:border-border focus-visible:bg-surface-raised/60",
        highlighted && "border-accent/50 bg-accent/5",
      )}
      data-testid={`ocr-field-${field.key}`}
      data-state={field.state}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="ledger-label">{FIELD_LABELS[field.key]}</p>
        {corrected ? (
          <CorrectedBadge />
        ) : (
          <ConfidenceBadge
            level={
              field.state === "NOT_FOUND" || field.state === "NOT_APPLICABLE"
                ? null
                : field.confidence !== null
                  ? field.confidence >= 85
                    ? "HIGH"
                    : field.confidence >= 65
                      ? "MEDIUM"
                      : "LOW"
                  : null
            }
            value={field.confidence}
          />
        )}
      </div>
      {empty ? (
        <p className="mt-1 font-mono text-sm text-muted-foreground/60">Not detected</p>
      ) : (
        <p
          className={cn(
            "mt-0.5 truncate font-mono text-sm tabular-nums",
            field.key === "profitLoss" &&
              (display.trim().startsWith("−") || display.trim().startsWith("-")
                ? "text-loss"
                : "text-profit"),
            field.key === "direction" && "font-semibold tracking-wide",
          )}
        >
          {field.key === "direction" && display !== null ? (
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold",
                display === "BUY"
                  ? "border-profit/40 bg-profit/10 text-profit"
                  : "border-loss/40 bg-loss/10 text-loss",
              )}
            >
              {display}
            </span>
          ) : (
            display
          )}
        </p>
      )}
      <div className="mt-1.5">
        {field.state !== "NOT_APPLICABLE" ? (
          <button
            type="button"
            onClick={onEdit}
            data-testid={`ocr-edit-trigger-${field.key}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent outline-none transition-colors hover:text-accent-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="size-3" aria-hidden />
            {empty ? "Add value" : "Edit"}
          </button>
        ) : null}
      </div>
      {!corrected ? <div className="mt-1"><FieldStateNote state={field.state} fieldKey={field.key} /></div> : null}
    </div>
  );
}

// ── Screenshot with region highlight (§25) ──────────────────────────────────

function SourceScreenshot({
  imageUrl,
  imageName,
  result,
  highlightedField,
  selectedTradeIndex,
  cropMode,
  onCropModeChange,
  cropRect,
  onCropRectChange,
  onRecrop,
  recropping,
}: {
  imageUrl: string | null;
  imageName: string;
  result: RecognitionResult;
  highlightedField: RecognitionFieldKey | null;
  selectedTradeIndex: number;
  cropMode: boolean;
  onCropModeChange: (active: boolean) => void;
  cropRect: CropRegion | null;
  onCropRectChange: (rect: CropRegion | null) => void;
  onRecrop: (region: CropRegion) => void;
  recropping: boolean;
}) {
  const trade = result.trades.find((t) => t.index === selectedTradeIndex) ?? result.trades[0];
  const activeField =
    highlightedField !== null ? trade.fields[highlightedField] : undefined;
  const region = activeField?.sourceRegion;
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const dragStart = React.useRef<{ x: number; y: number } | null>(null);

  const normalizedPoint = (event: React.PointerEvent) => {
    const frame = frameRef.current;
    if (frame === null) return { x: 0, y: 0 };
    const bounds = frame.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!cropMode || imageUrl === null) return;
    event.preventDefault();
    const point = normalizedPoint(event);
    dragStart.current = point;
    onCropRectChange({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!cropMode || dragStart.current === null) return;
    const start = dragStart.current;
    const point = normalizedPoint(event);
    onCropRectChange({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  };

  const onPointerUp = () => {
    dragStart.current = null;
  };

  const cropIsValid =
    cropRect !== null && cropRect.width >= 0.02 && cropRect.height >= 0.02;

  return (
    <Card data-testid="ocr-result-screenshot">
      <CardContent className="px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="ledger-label">Original screenshot</p>
          {imageUrl !== null ? (
            <button
              type="button"
              onClick={() => {
                onCropModeChange(!cropMode);
                onCropRectChange(null);
              }}
              disabled={recropping}
              className={cn(
                "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                cropMode
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:border-accent/50 hover:text-accent",
              )}
              data-testid="ocr-crop-toggle"
            >
              <Crop className="size-3" aria-hidden />
              {cropMode ? "Cancel zone" : "Re-read a zone"}
            </button>
          ) : null}
        </div>
        <div
          ref={frameRef}
          className={cn(
            "relative mt-2 overflow-hidden rounded-lg border border-border bg-background",
            cropMode && "cursor-crosshair select-none",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {imageUrl !== null ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset
            <img
              src={imageUrl}
              alt={`Analyzed screenshot: ${imageName}`}
              className="max-h-[420px] w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground">
              <ScanText className="size-8" aria-hidden />
              <p className="max-w-[240px] text-center text-xs">
                {imageName} — live preview is only kept during this browser session.
              </p>
            </div>
          )}
          {cropMode && cropRect !== null ? (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-sm border-2 border-dashed border-accent bg-accent/20"
              style={{
                left: `${cropRect.x * 100}%`,
                top: `${cropRect.y * 100}%`,
                width: `${cropRect.width * 100}%`,
                height: `${cropRect.height * 100}%`,
              }}
              data-testid="ocr-crop-rect"
            />
          ) : null}
          {!cropMode && region !== undefined && imageUrl !== null ? (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-sm border-2 border-accent bg-accent/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
              }}
              data-testid="ocr-region-highlight"
            />
          ) : null}
        </div>
        {cropMode ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Drag a rectangle over the zone to re-read.
            </p>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={!cropIsValid || recropping}
              onClick={() => {
                if (!cropIsValid || cropRect === null) return;
                onRecrop(cropRect);
              }}
              data-testid="ocr-crop-run"
            >
              {recropping ? "Re-reading…" : "Re-run recognition here"}
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {region !== undefined
              ? "Highlighted area — where the recognizer read this value."
              : "Hover a recognized field to locate it on the screenshot."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Result workspace ────────────────────────────────────────────────────────

export function RecognitionResultWorkspace({
  result,
  imageUrl,
  imageName,
  corrections,
  onCorrectionsChange,
  onFieldCorrected,
  onContinue,
  onDiscard,
  continuing = false,
  onRecrop,
  recropping = false,
  isPdf = false,
  onSelectedTradeChange,
}: {
  result: RecognitionResult;
  imageUrl: string | null;
  imageName: string;
  corrections: FieldCorrections;
  onCorrectionsChange: (next: FieldCorrections) => void;
  onFieldCorrected?: (key: RecognitionFieldKey) => void;
  /** Continues to the draft of the SELECTED trade (V2 multi-trade). */
  onContinue: (tradeIndex: number) => void;
  onDiscard: () => void;
  continuing?: boolean;
  onRecrop?: (region: CropRegion, tradeIndex: number) => void;
  recropping?: boolean;
  isPdf?: boolean;
  /** Notifies the orchestrator when the reviewed trade changes (corrections scope). */
  onSelectedTradeChange?: (tradeIndex: number) => void;
}) {
  const [highlightedField, setHighlightedField] = React.useState<RecognitionFieldKey | null>(null);
  const [editingKey, setEditingKey] = React.useState<RecognitionFieldKey | null>(null);
  const [selectedTradeIndex, setSelectedTradeIndex] = React.useState(1);
  const [cropMode, setCropMode] = React.useState(false);
  const [cropRect, setCropRect] = React.useState<CropRegion | null>(null);

  const trade =
    result.trades.find((t) => t.index === selectedTradeIndex) ?? result.trades[0];
  const currencyField = trade.fields.currency;
  const currency = displayValue(currencyField, corrections);

  const setCorrection = (key: RecognitionFieldKey, value: string | null) => {
    onCorrectionsChange({
      values: { ...corrections.values, [key]: value },
    });
    setEditingKey(null);
    onFieldCorrected?.(key);
  };

  const renderField = (key: RecognitionFieldKey) => {
    const field = trade.fields[key];
    if (field === undefined) return null;
    const corrected = field.key in corrections.values;
    const rawValue = corrected ? (corrections.values[key] ?? "") : (field.value ?? "");
    const display = formatFieldValue(field, displayValue(field, corrections), currency);
    if (editingKey === key) {
      return (
        <div key={key} className="rounded-lg border border-accent/50 bg-accent/5 px-3 py-2.5">
          <p className="ledger-label mb-2">{FIELD_LABELS[key]}</p>
          <FieldEditor
            key={`editor-${key}`}
            field={field}
            rawValue={rawValue}
            onSave={(value) => setCorrection(key, value)}
            onCancel={() => setEditingKey(null)}
          />
        </div>
      );
    }
    return (
      <RecognizedFieldCard
        key={key}
        field={field}
        corrected={corrected}
        display={display === "" ? null : display}
        highlighted={highlightedField === key}
        onHover={setHighlightedField}
        onEdit={() => setEditingKey(key)}
      />
    );
  };

  return (
    <div className="space-y-5" data-testid="ocr-result">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Detected platform:{" "}
          <span className="font-medium text-foreground">
            {PLATFORM_LABELS[result.detectedPlatform]}
          </span>
          {result.platformConfidence !== null
            ? ` · ${Math.round(result.platformConfidence)}% confidence`
            : ""}
          {result.overallConfidence !== null
            ? ` · overall ${Math.round(result.overallConfidence)}%`
            : ""}
        </p>
        {result.trades.length > 1 ? (
          <Select
            value={String(selectedTradeIndex)}
            onValueChange={(value) => {
              setSelectedTradeIndex(Number(value));
              onSelectedTradeChange?.(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-40" aria-label="Detected trade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {result.trades.map((t) => (
                <SelectItem key={t.index} value={String(t.index)}>
                  Trade #{t.index}
                  {isPdf && t.pageIndex !== undefined ? ` · Page ${t.pageIndex + 1}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="font-mono text-[11px] text-muted-foreground">
            Detected {result.trades.length} trade
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <SourceScreenshot
            imageUrl={imageUrl}
            imageName={imageName}
            result={result}
            highlightedField={highlightedField}
            selectedTradeIndex={selectedTradeIndex}
            cropMode={cropMode}
            onCropModeChange={setCropMode}
            cropRect={cropRect}
            onCropRectChange={setCropRect}
            onRecrop={(region) => onRecrop?.(region, selectedTradeIndex)}
            recropping={recropping}
          />
        </div>
        <div className="min-w-0 space-y-3">
          <Card data-testid="ocr-detected-trade">
            <CardContent className="space-y-1 px-2 py-3">
              <p className="ledger-label px-2 pb-1">
                Detected trade
                {isPdf && trade.pageIndex !== undefined ? (
                  <span className="ml-2 font-mono text-[10px] normal-case tracking-normal text-muted-foreground">
                    Page {trade.pageIndex + 1}
                  </span>
                ) : null}
              </p>
              {PRIMARY_FIELD_ORDER.map(renderField)}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 px-2 py-3">
              <p className="ledger-label px-2 pb-1">Context & timing</p>
              {SECONDARY_FIELD_ORDER.map(renderField)}
            </CardContent>
          </Card>
          <WarningsPanel warnings={result.warnings} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={onDiscard} data-testid="ocr-result-discard">
          Discard
        </Button>
        <Button
          onClick={() => onContinue(selectedTradeIndex)}
          disabled={continuing || cropMode}
          data-testid="ocr-continue-draft"
        >
          {continuing ? "Preparing draft…" : "Continue to Draft"}
        </Button>
      </div>
    </div>
  );
}

/** Direction type re-export guard — keeps the draft module importing from contract only. */
export type { TradeDirection };

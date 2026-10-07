"use client";

import * as React from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Shared presentational primitives for the TOOLS calculators — ledger-grade
 * surfaces (design system: ledger-label annotations, mono tabular numbers,
 * hairline separations, the accounting double rule under totals). Dict copy
 * travels in as props — these primitives never reach into i18n themselves.
 */

// ── Numeric field with inline error ──────────────────────────────────────────

export interface CalculatorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Dict-rendered error copy — null/undefined means valid. */
  error?: string | null;
  placeholder?: string;
  hint?: string;
  /** Static suffix rendered inside the field (unit). */
  suffix?: string;
  testId?: string;
  className?: string;
}

export function CalculatorField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  hint,
  suffix,
  testId,
  className,
}: CalculatorFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="text-[11px] text-muted-foreground/80">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            "h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            suffix && "pr-12",
            error && "border-destructive focus-visible:ring-destructive/40",
            className,
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {suffix}
        </span>
        ) : null}
      </div>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-snug text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

// ── Preset chips ─────────────────────────────────────────────────────────────

export interface PresetChipsProps {
  label: string;
  presets: readonly { label: string; value: string }[];
  activeValue: string;
  onSelect: (value: string) => void;
  ariaLabel: string;
}

/** Convenience preset chips — a click fills the owning field. Not advice. */
export function PresetChips({ label, presets, activeValue, onSelect, ariaLabel }: PresetChipsProps) {
  return (
    <div className="space-y-1.5">
      <span className="ledger-label">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
        {presets.map((preset) => {
          const active = preset.value === activeValue;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onSelect(preset.value)}
              aria-pressed={active}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Ledger breakdown ─────────────────────────────────────────────────────────

export interface BreakdownRowData {
  label: string;
  value: string;
  /** Emphasize the final row (the accounting signature: double rule under). */
  final?: boolean;
}

/**
 * Label/value ledger with hairline separators; the last row sits on the
 * double rule — the accounting signature of the design system.
 */
export function BreakdownLedger({ rows, ariaLabel }: { rows: BreakdownRowData[]; ariaLabel: string }) {
  return (
    <dl aria-label={ariaLabel} className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            "flex items-baseline justify-between gap-6 py-1.5",
            row.final ? "rule-double" : "border-b border-border/60",
          )}
        >
          <dt className={cn("ledger-label", row.final && "!text-foreground")}>{row.label}</dt>
          <dd
            className={cn(
              "font-mono text-sm tabular-nums",
              row.final ? "text-base font-semibold text-foreground" : "text-foreground",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Copy button ──────────────────────────────────────────────────────────────

export function CopyButton({
  payload,
  labels,
  testId,
}: {
  payload: string;
  labels: { copy: string; copied: string };
  testId?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      data-testid={testId}
      aria-live="polite"
      className="gap-1.5"
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      {copied ? labels.copied : labels.copy}
    </Button>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────

/** A ruled section card: ledger-label header + content, hairline frame. */
export function ToolCard({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-surface",
        className,
      )}
    >
      {title || action ? (
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          {title ? <h2 className="ledger-label">{title}</h2> : <span aria-hidden="true" />}
          {action}
        </header>
      ) : null}
      <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </section>
  );
}

"use client";

import * as React from "react";
import { Loader2, RotateCcw, Save, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Shared building blocks for the Settings module — one visual language for
 * every category card: labelled rows, toggles, selects, numeric fields and
 * a per-card save bar (unrelated settings are NEVER saved together).
 * All controls are keyboard accessible and labelled (a11y golden rule).
 * All user-facing copy resolves through dict.settings.primitives (with
 * common.* reuses) INSIDE the render — no module-level dict lookups.
 */

// ── Timezones (curated list — same set the profile screen offers) ──────────

export const TIMEZONE_OPTIONS = [
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Zurich",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
] as const;

// ── Per-domain draft state (hydrate-from-server + dirty tracking) ──────────

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Draft state for one preference domain, following the documented
 * "adjust state during render" hydration pattern (no setState in effects).
 * Re-hydrates whenever the server value identity changes (save / reset /
 * background refetch), and reports whether the draft diverged.
 * Generic over the VALUE (not the domain key) so each card gets an exact
 * domain type — no union leakage.
 */
export function useDomainDraft<Value>(
  server: Value | undefined,
): {
  draft: Value | null;
  setDraft: React.Dispatch<React.SetStateAction<Value | null>>;
  dirty: boolean;
} {
  const [hydratedFrom, setHydratedFrom] = React.useState<Value | null>(null);
  const [draft, setDraft] = React.useState<Value | null>(null);

  if (server !== undefined && server !== hydratedFrom) {
    setHydratedFrom(server);
    setDraft(server);
  }

  const dirty =
    draft !== null && server !== undefined && stableStringify(draft) !== stableStringify(server);

  return { draft, setDraft, dirty };
}

// ── Category card shell ─────────────────────────────────────────────────────

export interface SettingsCategoryCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  testid: string;
  children: React.ReactNode;
  /** Save-bar state — omit to render an informational card (no footer). */
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  /** Reset-to-defaults — opens the shared confirm dialog when provided. */
  onReset?: () => void;
  footerNote?: React.ReactNode;
}

export function SettingsCategoryCard({
  icon: Icon,
  title,
  description,
  testid,
  children,
  dirty,
  saving,
  onSave,
  onReset,
  footerNote,
}: SettingsCategoryCardProps) {
  const { dict } = useI18n();
  const P = dict.settings.primitives;
  const common = dict.common;
  const hasFooter = onSave !== undefined;
  return (
    <Card className="bg-surface" data-testid={testid}>
      <CardHeader className="gap-1.5">
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5">
        {children}
        {hasFooter || footerNote ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            {footerNote ? (
              <p className="text-xs leading-relaxed text-muted-foreground">{footerNote}</p>
            ) : (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {dirty ? P.unsavedChanges : saving ? common.saving : P.allChangesSaved}
              </span>
            )}
            {hasFooter ? (
              <div className="flex items-center justify-end gap-2">
                {onReset ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onReset}
                    disabled={saving}
                    data-testid={`${testid}-reset`}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    {common.reset}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  disabled={!dirty || saving}
                  data-testid={`${testid}-save`}
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="size-3.5" aria-hidden="true" />
                  )}
                  {common.save}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────

export function SettingsCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="bg-surface" aria-busy="true">
      <CardHeader className="gap-1.5">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-72" />
      </CardHeader>
      <CardContent className="grid gap-4">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface SettingsRowProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  /** Vertical layout for wide controls (textareas, chip groups…). */
  stacked?: boolean;
  testid?: string;
}

export function SettingsRow({ label, hint, htmlFor, children, stacked, testid }: SettingsRowProps) {
  return (
    <div
      className={cn(
        "gap-2",
        stacked ? "grid" : "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
      )}
      data-testid={testid}
    >
      <div className="min-w-0 sm:max-w-[26rem]">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <div className={cn(stacked ? "mt-1" : "shrink-0")}>{children}</div>
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

const selectClasses =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent sm:w-56";

/** Native select styled like the profile screen — accessible by default. */
export function SettingsSelect({
  value,
  onChange,
  options,
  testid,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  testid: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={selectClasses}
      data-testid={testid}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Toggle row — the switch IS the control, no save bar needed for it alone. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  testid,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testid: string;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      data-testid={testid}
    >
      <div className="min-w-0 sm:max-w-[26rem]">
        <span className="text-sm font-medium" id={`${testid}-label`}>
          {label}
        </span>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-labelledby={`${testid}-label`}
        data-testid={`${testid}-switch`}
        className="shrink-0"
      />
    </div>
  );
}

/**
 * Numeric field — keeps the raw text locally so partial input ("1.") never
 * commits; only valid in-range numbers propagate. Remounts (via `key` at
 * the call site) when the committed value changes externally.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  testid,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  testid: string;
}) {
  const [text, setText] = React.useState(() => String(value));

  const handleChange = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    if (parsed < min || parsed > max) return;
    onChange(parsed);
  };

  const invalid = text.trim() !== "" && (Number(text) < min || Number(text) > max || !Number.isFinite(Number(text)));

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(event) => handleChange(event.target.value)}
          aria-invalid={invalid}
          className={cn("h-9 w-28 font-mono tabular-nums", suffix && "pr-10")}
          data-testid={`${testid}-input`}
        />
        {suffix ? (
          <span
            className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center font-mono text-xs text-muted-foreground"
            aria-hidden="true"
          >
            {suffix}
          </span>
        ) : null}
      </div>
      {invalid ? (
        <span className="flex items-center gap-1 text-xs text-loss" role="status">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          {min}–{max}
        </span>
      ) : null}
    </div>
  );
}

/** Segmented radio pills — for 2–4 mutually exclusive choices. */
export function SegmentedControl({
  value,
  onChange,
  options,
  testid,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; hint?: string }[];
  testid: string;
  ariaLabel: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={ariaLabel} data-testid={testid}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`${testid}-${option.value}`}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-background text-foreground hover:border-accent/50",
            )}
          >
            <span className="flex-1">
              <span className="block font-medium">{option.label}</span>
              {option.hint ? (
                <span className="block text-[11px] text-muted-foreground">{option.hint}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Checkbox chip list — for multi-select sets (journal required fields). */
export function CheckboxChips({
  selected,
  onToggle,
  options,
  testid,
  ariaLabel,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  options: { value: string; label: string }[];
  testid: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel} data-testid={testid}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            data-testid={`${testid}-${option.value}`}
            onClick={() => onToggle(option.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Confirmation dialog (destructive / typed-confirm actions) ───────────────

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
  destructive,
  requireTyped,
  testid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  destructive?: boolean;
  /** When set, the user must type this exact phrase to unlock the button. */
  requireTyped?: string;
  testid: string;
}) {
  const { dict } = useI18n();
  const P = dict.settings.primitives;
  const common = dict.common;
  const [typed, setTyped] = React.useState("");

  // Clear the typed phrase when the dialog closes — handled in the change
  // callback (event, not effect) per the react-hooks rules.
  const handleOpenChange = (next: boolean) => {
    if (!next) setTyped("");
    onOpenChange(next);
  };

  const typedOk = requireTyped === undefined || typed === requireTyped;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-surface" data-testid={`${testid}-dialog`}>
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{description}</DialogDescription>
        </DialogHeader>
        {requireTyped ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`${testid}-typed`}>
              {P.typedConfirmPrefix} <span className="font-mono font-semibold">{requireTyped}</span>{" "}
              {P.typedConfirmSuffix}
            </Label>
            <Input
              id={`${testid}-typed`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              data-testid={`${testid}-typed`}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {common.cancel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={!typedOk || pending}
            data-testid={`${testid}-confirm`}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

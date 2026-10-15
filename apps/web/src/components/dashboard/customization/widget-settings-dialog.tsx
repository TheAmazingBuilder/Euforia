"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  RotateCcw,
  X,
} from "lucide-react";
import type { DashboardWidgetConfig, DashboardWidgetKey, LongShortWidgetConfig } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStrategies } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import {
  defaultWidgetConfig,
  METRICS_CARD_CATALOG,
  validateWidgetConfigPayload,
} from "@/lib/dashboard-customization/widget-configs";
import { LONG_SHORT_METRIC_OPTIONS, settingsGroupsFor, type SettingsGroup } from "@/lib/dashboard-customization/widget-settings";

/**
 * Per-widget settings dialog (Phase 02 §6) — transactional configuration
 * editing. The user edits a DRAFT seeded from the widget's current config;
 * Save validates it against the shared config schema (the exact contract
 * the persistence layer enforces) and only then applies it via onConfirm;
 * Cancel discards the draft untouched. An invalid save keeps the dialog
 * open with the first issue surfaced — user input is never lost.
 */

interface WidgetSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetType: DashboardWidgetKey;
  widgetName: string;
  /** Current resolved config (undefined = widget defaults). */
  config: DashboardWidgetConfig | undefined;
  /** Called with a VALIDATED config — the caller owns persistence routing. */
  onConfirm: (config: DashboardWidgetConfig) => void;
}

export function WidgetSettingsDialog(props: WidgetSettingsDialogProps) {
  const { open, onOpenChange, widgetType } = props;
  const configurable = settingsGroupsFor(widgetType) !== null;
  return (
    <Dialog
      open={open && configurable}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" data-testid="widget-settings-dialog">
        {open && configurable && <WidgetSettingsForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The form is MOUNTED per open (Radix unmounts closed content) — the draft
 * seeds lazily from the widget's current config on every open, and Cancel
 * simply unmounts. No hydration effect, no stale draft between opens.
 */
function WidgetSettingsForm({
  widgetType,
  widgetName,
  config,
  onConfirm,
  onOpenChange,
}: Omit<WidgetSettingsDialogProps, "open">) {
  const groups = settingsGroupsFor(widgetType)!;
  const [draft, setDraft] = React.useState<DashboardWidgetConfig | null>(
    () => structuredClone(config ?? defaultWidgetConfig(widgetType) ?? null),
  );
  const [error, setError] = React.useState<string | null>(null);

  const handleSave = React.useCallback(() => {
    if (!draft) return;
    // ONE validation contract shared with the persistence layer: what the
    // dialog accepts is exactly what setWidgetConfig will keep.
    const issue = validateWidgetConfigPayload(widgetType, draft);
    if (issue) {
      setError(issue);
      return;
    }
    onConfirm(draft as DashboardWidgetConfig);
    onOpenChange(false);
  }, [draft, widgetType, onConfirm, onOpenChange]);

  const handleRestoreDefaults = React.useCallback(() => {
    const base = defaultWidgetConfig(widgetType);
    if (!base) return;
    setDraft(structuredClone(base));
    setError(null);
  }, [widgetType]);

  if (!draft) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{widgetName} settings</DialogTitle>
          <DialogDescription>This widget has no configurable options.</DialogDescription>
        </DialogHeader>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{widgetName} settings</DialogTitle>
        <DialogDescription>
          Changes apply when you save. Cancel keeps the widget as it is.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-1">
        {groups.map((group) => (
          <section key={group.title} className="space-y-3" data-testid={`widget-settings-group-${group.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h3>
            <div className="space-y-3.5">
              {group.fields.map((field) => (
                <SettingsField
                  key={field.kind === "select" || field.kind === "checkbox" ? field.key : field.kind}
                  field={field}
                  draft={draft}
                  onChange={(updater) => setDraft((current) => (current ? updater(current) : current))}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-loss" data-testid="widget-settings-error">
          {error}
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="ghost" size="sm" onClick={handleRestoreDefaults} data-testid="widget-settings-restore">
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Restore defaults
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} data-testid="widget-settings-save">
            Save
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

// ── Field dispatcher ─────────────────────────────────────────────────────────

type DraftUpdater = (updater: (current: DashboardWidgetConfig) => DashboardWidgetConfig) => void;

function SettingsField({
  field,
  draft,
  onChange,
}: {
  field: SettingsGroup["fields"][number];
  draft: DashboardWidgetConfig;
  onChange: DraftUpdater;
}) {
  switch (field.kind) {
    case "select":
      return (
        <SelectField
          label={field.label}
          description={field.description}
          options={field.options}
          value={String(selectValueOf(draft, field.key) ?? "")}
          onValueChange={(value) =>
            onChange((current) => ({ ...current, [field.key]: coerceScalar(field.key, value) }) as DashboardWidgetConfig)
          }
        />
      );
    case "checkbox":
      return (
        <CheckboxField
          label={field.label}
          description={field.description}
          checked={checkboxValueOf(draft, field.key)}
          onCheckedChange={(checked) =>
            onChange((current) => ({ ...current, [field.key]: checked }) as DashboardWidgetConfig)
          }
        />
      );
    case "metric-list":
      if (draft.kind !== "METRICS_CARD") return null;
      return <MetricsListField draft={draft} onChange={onChange} label={field.label} description={field.description} />;
    case "strategy-list":
      if (draft.kind !== "STRATEGY_COMPARE") return null;
      return <StrategyListField draft={draft} onChange={onChange} label={field.label} description={field.description} />;
    case "longshort-list":
      if (draft.kind !== "LONG_SHORT") return null;
      return <LongShortListField draft={draft} onChange={onChange} label={field.label} description={field.description} />;
    case "date-range":
      if (draft.kind !== "METRICS_CARD") return null;
      return (
        <DateRangeField
          label={field.label}
          description={field.description}
          from={draft.customFrom ?? ""}
          to={draft.customTo ?? ""}
          onChange={(from, to) =>
            onChange((current) =>
              current.kind === "METRICS_CARD" ? { ...current, customFrom: from || undefined, customTo: to || undefined } : current,
            )
          }
        />
      );
    default:
      return null;
  }
}

/** Read a select-backed key off any config variant (typed switch inside). */
function selectValueOf(config: DashboardWidgetConfig, key: string): string | number | null {
  switch (config.kind) {
    case "PNL_BAND":
      if (key === "range") return config.range;
      if (key === "cumulativeType") return config.cumulativeType;
      return null;
    case "METRICS_CARD":
      if (key === "period") return config.period;
      if (key === "comparison") return config.comparison;
      if (key === "notation") return config.notation;
      if (key === "decimals") return config.decimals;
      return null;
    case "ACTIVITY_HEATMAP":
      if (key === "metric") return config.metric;
      return null;
    default:
      return null;
  }
}

function checkboxValueOf(config: DashboardWidgetConfig, key: string): boolean {
  switch (config.kind) {
    case "PNL_BAND":
      if (key === "showAvgLine") return config.showAvgLine;
      if (key === "showEndMarker") return config.showEndMarker;
      if (key === "showZeroLine") return config.showZeroLine;
      return false;
    case "HEATMAP":
      if (key === "showCellValues") return config.showCellValues;
      return false;
    default:
      return false;
  }
}

/** Coerce a select's string value back into the config's literal type. */
function coerceScalar(key: string, value: string): string | number {
  if (key === "range") return Number(value);
  if (key === "decimals") return Number(value);
  return value;
}

// ── Control primitives ───────────────────────────────────────────────────────

function SelectField({
  label,
  description,
  options,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full" data-testid={`widget-settings-select-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CheckboxField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  // Slug id: letters/digits only — labels with "&" or punctuation stay
  // valid, stable DOM ids (the P&L toggles).
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={`widget-setting-${slug}`}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <div className="grid gap-0.5">
        <Label htmlFor={`widget-setting-${slug}`} className="text-sm font-medium">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function DateRangeField({
  label,
  description,
  from,
  to,
  onChange,
}: {
  label: string;
  description?: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => onChange(event.target.value, to)}
          aria-label={`${label} — from`}
          data-testid="widget-settings-date-from"
          className="w-full"
        />
        <span className="text-xs text-muted-foreground" aria-hidden="true">→</span>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => onChange(from, event.target.value)}
          aria-label={`${label} — to`}
          data-testid="widget-settings-date-to"
          className="w-full"
        />
      </div>
    </div>
  );
}

// ── Metric picker (METRICS_CARD) ─────────────────────────────────────────────

function MetricsListField({
  draft,
  onChange,
  label,
  description,
}: {
  draft: Extract<DashboardWidgetConfig, { kind: "METRICS_CARD" }>;
  onChange: DraftUpdater;
  label: string;
  description?: string;
}) {
  const available = METRICS_CARD_CATALOG.filter((metric) => !draft.metrics.includes(metric.id));
  const atCap = draft.metrics.length >= 12;

  const move = (index: number, direction: -1 | 1) => {
    onChange((current) => {
      if (current.kind !== "METRICS_CARD") return current;
      const metrics = [...current.metrics];
      const to = index + direction;
      if (to < 0 || to >= metrics.length) return current;
      [metrics[index], metrics[to]] = [metrics[to]!, metrics[index]!];
      return { ...current, metrics };
    });
  };

  return (
    <div className="grid gap-2" data-testid="widget-settings-metric-list">
      <div className="grid gap-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      {draft.metrics.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No metric selected yet — add at least one below.
        </p>
      )}

      <ul className="space-y-1.5">
        {draft.metrics.map((metricId, index) => {
          const metric = METRICS_CARD_CATALOG.find((candidate) => candidate.id === metricId);
          return (
            <li
              key={metricId}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-2 py-1.5"
              data-testid="widget-settings-metric-row"
            >
              <span className="flex-1 truncate text-xs font-medium">
                {metric?.label ?? metricId}
                {metric && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{metric.unit.toLowerCase()}</span>}
              </span>
              <button
                type="button"
                aria-label={`Move ${metric?.label ?? metricId} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Move ${metric?.label ?? metricId} down`}
                disabled={index === draft.metrics.length - 1}
                onClick={() => move(index, 1)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${metric?.label ?? metricId}`}
                onClick={() =>
                  onChange((current) =>
                    current.kind === "METRICS_CARD"
                      ? { ...current, metrics: current.metrics.filter((id) => id !== metricId) }
                      : current,
                  )
                }
                className="rounded p-0.5 text-muted-foreground hover:text-loss"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2">
        <Select
          value=""
          onValueChange={(value) =>
            onChange((current) =>
              current.kind === "METRICS_CARD" && !current.metrics.includes(value)
                ? { ...current, metrics: [...current.metrics, value] }
                : current,
            )
          }
        >
          <SelectTrigger className="w-full" disabled={atCap} data-testid="widget-settings-metric-add">
            <SelectValue placeholder={atCap ? "Maximum of 12 reached" : "Add a metric…"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((metric) => (
              <SelectItem key={metric.id} value={metric.id}>
                {metric.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── Strategy picker (STRATEGY_COMPARE) ───────────────────────────────────────

function StrategyListField({
  draft,
  onChange,
  label,
  description,
}: {
  draft: Extract<DashboardWidgetConfig, { kind: "STRATEGY_COMPARE" }>;
  onChange: DraftUpdater;
  label: string;
  description?: string;
}) {
  const { data } = useStrategies();
  const strategies = data?.strategies ?? [];
  const options = [
    ...strategies.map((strategy) => ({ id: strategy.id, name: strategy.name })),
    { id: "none" as const, name: "Out of playbook" },
  ];
  const selected = options.filter((option) => draft.strategyIds.includes(option.id));
  const available = options.filter((option) => !draft.strategyIds.includes(option.id));
  const atCap = draft.strategyIds.length >= 6;

  return (
    <div className="grid gap-2" data-testid="widget-settings-strategy-list">
      <div className="grid gap-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      {selected.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No strategy selected — the widget will wait for a selection.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((option, index) => (
            <li
              key={option.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised py-0.5 pl-2.5 pr-1 text-xs"
            >
              <span className="font-mono text-[10px] text-muted-foreground">{index + 1}</span>
              {option.name}
              <button
                type="button"
                aria-label={`Remove ${option.name}`}
                onClick={() =>
                  onChange((current) =>
                    current.kind === "STRATEGY_COMPARE"
                      ? { ...current, strategyIds: current.strategyIds.filter((id) => id !== option.id) }
                      : current,
                  )
                }
                className="rounded-full p-0.5 text-muted-foreground hover:text-loss"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Select
        value=""
        onValueChange={(value) =>
          onChange((current) =>
            current.kind === "STRATEGY_COMPARE" && !current.strategyIds.includes(value) && current.strategyIds.length < 6
              ? { ...current, strategyIds: [...current.strategyIds, value] }
              : current,
          )
        }
      >
        <SelectTrigger className="w-full" disabled={atCap} data-testid="widget-settings-strategy-add">
          <SelectValue placeholder={atCap ? "Maximum of 6 reached" : "Add a strategy…"} />
        </SelectTrigger>
        <SelectContent>
          {available.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Long/short metric checkboxes (LONG_SHORT) ────────────────────────────────

function LongShortListField({
  draft,
  onChange,
  label,
  description,
}: {
  draft: Extract<DashboardWidgetConfig, { kind: "LONG_SHORT" }>;
  onChange: DraftUpdater;
  label: string;
  description?: string;
}) {
  return (
    <div className="grid gap-2" data-testid="widget-settings-longshort-list">
      <div className="grid gap-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {LONG_SHORT_METRIC_OPTIONS.map((option) => {
          const checked = draft.metrics.includes(option.value as LongShortWidgetConfig["metrics"][number]);
          return (
            <div key={option.value} className="flex items-center gap-2">
              <Checkbox
                id={`longshort-${option.value}`}
                checked={checked}
                onCheckedChange={(value) =>
                  onChange((current) => {
                    if (current.kind !== "LONG_SHORT") return current;
                    if (value === true) {
                      return { ...current, metrics: [...current.metrics, option.value as LongShortWidgetConfig["metrics"][number]] };
                    }
                    const next = current.metrics.filter((id) => id !== option.value);
                    if (next.length === 0) return current; // at least one metric stays visible
                    return { ...current, metrics: next };
                  })
                }
              />
              <Label htmlFor={`longshort-${option.value}`} className="text-sm font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
      <p className={cn("text-[11px] text-muted-foreground", draft.metrics.length === 1 && "font-medium text-warning")}>
        At least one metric stays visible.
      </p>
    </div>
  );
}

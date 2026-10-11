"use client";

import * as React from "react";

import { Eye, EyeOff, Pencil, Plus, Search, Trash2 } from "lucide-react";

import type { OryonIndicatorInstance, OryonIndicatorType } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { IndicatorRuleError } from "@/lib/oryon/indicators/validation";
import type { OryonIndicatorStore } from "@/lib/oryon/indicators/store";
import {
  INDICATOR_COLOR_TOKENS,
  INDICATOR_ORDER,
  INDICATOR_REGISTRY,
  indicatorLabel,
} from "@/lib/oryon/indicators/registry";
import { cn } from "@/lib/utils";

import { useIndicatorSnapshot, useOryonIndicators } from "./oryon-indicators-context";
import {
  useOryonWorkspaceConfig,
  useWorkspaceConfigSnapshot,
} from "./oryon-workspace-context";

/**
 * Oryon indicator dialog — search / add / configure / manage (Phase 3 §4F
 * + Phase 7 §11/§12 ownership).
 *
 * Phase 7: the dialog operates on the ACTIVE chart panel's indicator store
 * (the toolbar opens it for the chart the user is looking at; the dialog
 * is modal, so the target cannot change while it is open). Applying a
 * template-level stack to one panel never rewrites another panel.
 *
 * Two modes driven by the context state:
 *  - browse: search box + the IMPLEMENTED registry (no fake entries) + the
 *    active stack with per-instance visibility / settings / removal;
 *  - settings: draft-based parameter + style editor. Apply validates through
 *    the store (schema + business rules); on failure the message shows and
 *    the LAST VALID configuration is retained (spec §9). Cancel discards.
 *
 * Keyboard: Radix dialog focus trap, autofocus on the search field, visible
 * focus rings from the UI primitives. No emoji — lucide icons only.
 */

/** The ACTIVE panel's indicator store — the dialog's single target. */
function useActiveIndicatorStore(): OryonIndicatorStore {
  const { registry } = useOryonIndicators();
  const { session } = useWorkspaceConfigSnapshot();
  return registry.storeFor(session.activePanelId);
}

export function OryonIndicatorDialog() {
  const { dialog, closeDialog } = useOryonIndicators();
  const dict = useDict();
  const S = dict.oryon.indicators;
  const activeStore = useActiveIndicatorStore();
  const snapshot = useIndicatorSnapshot(activeStore);

  const settingsInstance =
    dialog.kind === "settings"
      ? snapshot.indicators.find((i) => i.id === dialog.id) ?? null
      : null;

  return (
    <Dialog open={dialog.kind !== "closed"} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
      <DialogContent
        data-testid="oryon-indicator-dialog"
        className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle data-testid="oryon-indicator-dialog-title">
            {settingsInstance !== null ? indicatorLabel(settingsInstance) : S.title}
          </DialogTitle>
          <DialogDescription>
            {settingsInstance !== null ? S.settingsTitle : S.onlyImplemented}
          </DialogDescription>
        </DialogHeader>

        {dialog.kind === "browse" ? <BrowseMode /> : null}
        {dialog.kind === "settings" ? <SettingsMode key={dialog.id} id={dialog.id} /> : null}
      </DialogContent>
    </Dialog>
  );
}

// ── browse ────────────────────────────────────────────────────────────────────

function BrowseMode() {
  const dict = useDict();
  const S = dict.oryon.indicators;
  const { addIndicator, removeIndicator, openSettings, closeDialog } = useOryonIndicators();
  const store = useActiveIndicatorStore();
  const snapshot = useIndicatorSnapshot(store);
  const [query, setQuery] = React.useState("");

  const q = query.trim().toLowerCase();
  const matches = INDICATOR_ORDER.filter((type) => {
    if (q === "") return true;
    const meta = INDICATOR_REGISTRY[type];
    const name = nameFor(type, S);
    return name.toLowerCase().includes(q) || meta.short.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={S.searchPlaceholder}
          aria-label={S.searchPlaceholder}
          data-testid="oryon-indicator-search"
          className="pl-8"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1" role="list" aria-label={S.title}>
        {matches.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">{S.noMatch}</p>
        ) : (
          matches.map((type) => (
            <button
              key={type}
              type="button"
              role="listitem"
              data-testid={`oryon-indicator-add-${type}`}
              onClick={() => {
                const added = addIndicator(store, type);
                if (added !== null) closeDialog();
              }}
              className="flex items-center justify-between rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{nameFor(type, S)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {INDICATOR_REGISTRY[type].category === "overlay" ? S.categoryOverlay : S.categoryPane}
                </span>
              </span>
              <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ))
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{S.active}</p>
        {snapshot.indicators.length === 0 ? (
          <p className="px-1 py-1 text-sm text-muted-foreground">{S.activeEmpty}</p>
        ) : (
          snapshot.indicators.map((instance) => (
            <ActiveRow
              key={instance.id}
              instance={instance}
              onOpenSettings={() => openSettings(instance.id)}
              onRemove={() => removeIndicator(store, instance.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ActiveRow({
  instance,
  onOpenSettings,
  onRemove,
}: {
  instance: OryonIndicatorInstance;
  onOpenSettings: () => void;
  onRemove: () => void;
}) {
  const dict = useDict();
  const S = dict.oryon.indicators;
  const store = useActiveIndicatorStore();
  return (
    <div
      data-testid="oryon-indicator-active-row"
      data-indicator-type={instance.type}
      className="flex items-center justify-between gap-1 rounded-md border border-border bg-background px-2 py-1"
    >
      <span className="min-w-0 truncate font-mono text-xs text-foreground">
        {indicatorLabel(instance)}
      </span>
      <span className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={instance.visible ? S.hide : S.show}
          data-testid="oryon-indicator-row-visibility"
          onClick={() => store.toggleVisible(instance.id)}
        >
          {instance.visible ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={S.settingsTitle}
          data-testid="oryon-indicator-row-settings"
          onClick={onOpenSettings}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={S.remove}
          data-testid="oryon-indicator-row-remove"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </span>
    </div>
  );
}

// ── settings ──────────────────────────────────────────────────────────────────

type DraftParams = Record<string, string>;

function SettingsMode({ id }: { id: string }) {
  const dict = useDict();
  const S = dict.oryon.indicators;
  const { closeDialog } = useOryonIndicators();
  const store = useActiveIndicatorStore();
  const snapshot = useIndicatorSnapshot(store);
  const instance = snapshot.indicators.find((i) => i.id === id) ?? null;

  const meta = instance !== null ? INDICATOR_REGISTRY[instance.type] : null;

  // Draft state is seeded ONCE from the instance at mount. The dialog remounts
  // this editor per instance (key={id}) and Radix unmounts it on close — a
  // re-seed effect would fight the "cancel discards everything" contract.
  const [params, setParams] = React.useState<DraftParams>(() => {
    const next: DraftParams = {};
    if (instance !== null) {
      for (const spec of INDICATOR_REGISTRY[instance.type].params) {
        next[spec.key] = String(instance[spec.key as keyof typeof instance]);
      }
    }
    return next;
  });
  const [style, setStyle] = React.useState(() =>
    instance !== null && "style" in instance ? instance.style : null,
  );
  const [signalStyle, setSignalStyle] = React.useState(() =>
    instance?.type === "macd" ? instance.signalStyle : null,
  );
  const [visible, setVisible] = React.useState(() => instance?.visible ?? true);
  const [error, setError] = React.useState<string | null>(null);

  if (instance === null || meta === null) {
    return <p className="text-sm text-muted-foreground">{S.activeEmpty}</p>
  }

  const apply = () => {
    setError(null);
    // Strict numeric parse — integers enforced by spec step.
    const parsed: Record<string, number> = {};
    for (const spec of meta.params) {
      const raw = params[spec.key];
      const value = typeof raw === "string" ? Number(raw) : NaN;
      if (!Number.isFinite(value) || (spec.step === 1 && !Number.isInteger(value))) {
        setError(S.errorSchema);
        return;
      }
      if (value < spec.min || value > spec.max) {
        setError(S.errorSchema);
        return;
      }
      parsed[spec.key] = value;
    }
    const next = {
      ...instance,
      ...parsed,
      ...(style !== null ? { style } : {}),
      ...(signalStyle !== null ? { signalStyle } : {}),
      visible,
      updatedAt: Date.now(),
    } as OryonIndicatorInstance;
    const result = store.replace(next);
    if (!result.ok) {
      setError(errorCopy(result.error as IndicatorRuleError | "schema" | "capacity", S));
      return;
    }
    closeDialog();
  };

  return (
    <div className="flex flex-col gap-4" data-testid="oryon-indicator-settings">
      {meta.params.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {meta.params.map((spec) => (
            <div key={spec.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`oryon-indicator-param-${spec.key}`} className="text-xs">
                {paramLabel(spec.key, S)}
              </Label>
              <Input
                id={`oryon-indicator-param-${spec.key}`}
                type="number"
                inputMode="decimal"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={params[spec.key] ?? ""}
                onChange={(event) => setParams((current) => ({ ...current, [spec.key]: event.target.value }))}
                data-testid={`oryon-indicator-param-${spec.key}`}
                className="h-8 font-mono text-xs"
              />
            </div>
          ))}
        </div>
      ) : null}

      {style !== null ? (
        <StyleEditor
          title={instance.type === "macd" ? S.macdLine : S.style}
          style={style}
          onChange={setStyle}
        />
      ) : null}
      {signalStyle !== null ? (
        <StyleEditor title={S.signalLine} style={signalStyle} onChange={setSignalStyle} />
      ) : null}

      <div className="flex items-center justify-between">
        <Label htmlFor="oryon-indicator-visible" className="text-xs">
          {S.visibleLabel}
        </Label>
        <Switch
          id="oryon-indicator-visible"
          checked={visible}
          onCheckedChange={setVisible}
          data-testid="oryon-indicator-visible"
        />
      </div>

      {error !== null ? (
        <p role="alert" data-testid="oryon-indicator-error" className="text-xs font-medium text-warning">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={closeDialog} data-testid="oryon-indicator-cancel">
          {S.cancel}
        </Button>
        <Button type="button" size="sm" onClick={apply} data-testid="oryon-indicator-apply">
          {S.apply}
        </Button>
      </div>
    </div>
  );
}

function StyleEditor({
  title,
  style,
  onChange,
}: {
  title: string;
  style: { color: string; width: number; dash: "solid" | "dashed" | "dotted" };
  onChange: (next: { color: string; width: number; dash: "solid" | "dashed" | "dotted" }) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.indicators;
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-border p-2.5">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {INDICATOR_COLOR_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            aria-label={`${S.colorLabel} ${token}`}
            aria-pressed={style.color === token}
            data-testid={`oryon-indicator-color-${token}`}
            onClick={() => onChange({ ...style, color: token })}
            className={cn(
              "size-5 rounded-full border border-border transition-transform",
              style.color === token && "ring-2 ring-ring ring-offset-1 ring-offset-background",
            )}
            style={{ backgroundColor: `var(--${token})` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="group" aria-label={S.widthLabel}>
          {[1, 2, 3, 4].map((width) => (
            <button
              key={width}
              type="button"
              aria-label={`${S.widthLabel} ${width}`}
              aria-pressed={style.width === width}
              data-testid={`oryon-indicator-width-${width}`}
              onClick={() => onChange({ ...style, width })}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-sm border border-border text-[10px] text-foreground",
                style.width === width && "bg-primary text-primary-foreground",
              )}
            >
              {width}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={S.dashLabel}>
          {(["solid", "dashed", "dotted"] as const).map((dash) => (
            <button
              key={dash}
              type="button"
              aria-label={dashLabel(dash, S)}
              aria-pressed={style.dash === dash}
              data-testid={`oryon-indicator-dash-${dash}`}
              onClick={() => onChange({ ...style, dash })}
              className={cn(
                "rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-foreground",
                style.dash === dash && "bg-primary text-primary-foreground",
              )}
            >
              {dashLabel(dash, S)}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function nameFor(type: OryonIndicatorType, S: {
  nameSma: string;
  nameEma: string;
  nameRsi: string;
  nameMacd: string;
  nameBbands: string;
  nameAtr: string;
  nameVolume: string;
}): string {
  switch (type) {
    case "sma":
      return S.nameSma;
    case "ema":
      return S.nameEma;
    case "rsi":
      return S.nameRsi;
    case "macd":
      return S.nameMacd;
    case "bbands":
      return S.nameBbands;
    case "atr":
      return S.nameAtr;
    case "volume":
      return S.nameVolume;
  }
}

function paramLabel(
  key: string,
  S: {
    paramPeriod: string;
    paramFast: string;
    paramSlow: string;
    paramSignal: string;
    paramStddev: string;
    paramUpper: string;
    paramLower: string;
  },
): string {
  switch (key) {
    case "period":
      return S.paramPeriod;
    case "fast":
      return S.paramFast;
    case "slow":
      return S.paramSlow;
    case "signal":
      return S.paramSignal;
    case "stddev":
      return S.paramStddev;
    case "upper":
      return S.paramUpper;
    case "lower":
      return S.paramLower;
    default:
      return key;
  }
}

function dashLabel(dash: "solid" | "dashed" | "dotted", S: {
  dashSolid: string;
  dashDashed: string;
  dashDotted: string;
}): string {
  if (dash === "solid") return S.dashSolid;
  if (dash === "dashed") return S.dashDashed;
  return S.dashDotted;
}

function errorCopy(
  error: IndicatorRuleError | "schema" | "capacity",
  S: {
    errorMacdFastBelowSlow: string;
    errorRsiLowerBelowUpper: string;
    errorSchema: string;
    errorCapacity: string;
  },
): string {
  switch (error) {
    case "macdFastBelowSlow":
      return S.errorMacdFastBelowSlow;
    case "rsiLowerBelowUpper":
      return S.errorRsiLowerBelowUpper;
    case "capacity":
      return S.errorCapacity;
    default:
      return S.errorSchema;
  }
}

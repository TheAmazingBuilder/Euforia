"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import type { OryonChartAppearance, OryonStatusLinePrefs } from "@/lib/oryon/workspace/chart-prefs";
import { ORYON_PANEL_CHART_PREFS_DEFAULT, type OryonPanelChartPrefs } from "@/lib/oryon/workspace/chart-prefs";

import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Oryon chart settings dialog (chart context-menu → Settings…) — four
 * TradingView-inspired sections, each mapped onto REAL engine options or
 * legend display flags (nothing decorative, nothing mock):
 *
 *  - Symbol        → candle body/border/wick colors (theme-token overrides)
 *  - Status line   → the legend's time / OHLC / volume spans
 *  - Scales & lines→ price-scale + time-scale visibility, last-price line
 *  - Canvas        → grid lines, crosshair magnet mode
 *
 * Edits apply LIVE (the chart updates while the dialog is open — the parent
 * persists + engine-applies each snapshot). Cancel restores the snapshot
 * taken at open; Ok closes. "Reset" restores the documented defaults.
 */

/** Curated preset swatches — flat hexes (canvas colors, not theme tokens). */
const PRESET_COLORS: readonly string[] = [
  "#22c55e",
  "#16a34a",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#f97316",
  "#ef4444",
  "#dc2626",
  "#e11d48",
  "#a855f7",
  "#eab308",
  "#f4f4f5",
];

interface SettingsDraft {
  appearance: OryonChartAppearance;
  statusLine: OryonStatusLinePrefs;
}

export function OryonChartSettingsDialog({
  open,
  onOpenChange,
  prefs,
  onApply,
  symbol,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: OryonPanelChartPrefs;
  /** Live-applies an edited prefs snapshot (parent persists + engine-applies). */
  onApply: (next: OryonPanelChartPrefs) => void;
  symbol: string;
}) {
  const dict = useDict();
  const S = dict.oryon.chartSettings;

  /** Snapshot + draft — BOTH captured at mount: the parent mounts this
   *  dialog per open, so the initializers always see the CURRENT prefs
   *  (no open-transition effect, no ref reads, no stale state). */
  const [snapshot] = React.useState<SettingsDraft>(() => ({
    appearance: { ...prefs.appearance },
    statusLine: { ...prefs.statusLine },
  }));
  const [draft, setDraft] = React.useState<SettingsDraft>(() => ({
    appearance: { ...prefs.appearance },
    statusLine: { ...prefs.statusLine },
  }));

  const patchAppearance = (patch: Partial<OryonChartAppearance>): void => {
    setDraft((current) => {
      const next: SettingsDraft = {
        appearance: { ...current.appearance, ...patch },
        statusLine: current.statusLine,
      };
      onApply(next);
      return next;
    });
  };

  const patchStatusLine = (patch: Partial<OryonStatusLinePrefs>): void => {
    setDraft((current) => {
      const next: SettingsDraft = {
        appearance: current.appearance,
        statusLine: { ...current.statusLine, ...patch },
      };
      onApply(next);
      return next;
    });
  };

  const cancel = (): void => {
    // Live edits are undone — the chart returns to the state at open.
    onApply(snapshot);
    onOpenChange(false);
  };

  const reset = (): void => {
    const next: SettingsDraft = {
      appearance: { ...ORYON_PANEL_CHART_PREFS_DEFAULT.appearance },
      statusLine: { ...ORYON_PANEL_CHART_PREFS_DEFAULT.statusLine },
    };
    setDraft(next);
    onApply(next);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : cancel())}>
      <DialogContent
        data-testid="oryon-chart-settings-dialog"
        className="max-w-xl gap-4"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          // Escape = Cancel: revert the live edits, then close (Radix's own
          // close is prevented — cancel() drives the close itself).
          event.preventDefault();
          cancel();
        }}
      >
        <DialogHeader>
          <DialogTitle>{S.title}</DialogTitle>
          <DialogDescription>
            {S.hint} <span className="font-mono text-foreground">{symbol}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="symbol">
          <TabsList className="w-full">
            <TabsTrigger value="symbol" data-testid="oryon-settings-tab-symbol" className="flex-1">{S.tabSymbol}</TabsTrigger>
            <TabsTrigger value="statusLine" data-testid="oryon-settings-tab-status-line" className="flex-1">{S.tabStatusLine}</TabsTrigger>
            <TabsTrigger value="scales" data-testid="oryon-settings-tab-scales" className="flex-1">{S.tabScales}</TabsTrigger>
            <TabsTrigger value="canvas" data-testid="oryon-settings-tab-canvas" className="flex-1">{S.tabCanvas}</TabsTrigger>
          </TabsList>

          {/* ── Symbol ─────────────────────────────────────────────────────── */}
          <TabsContent value="symbol" className="mt-3 flex flex-col gap-4">
            <section className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {S.candlesSection}
              </p>
              <ColorRow
                label={S.bullishColor}
                value={draft.appearance.upColor}
                onPick={(color) => patchAppearance({ upColor: color })}
                onClear={() => patchAppearance({ upColor: null })}
                testid="oryon-settings-up-color"
              />
              <ColorRow
                label={S.bearishColor}
                value={draft.appearance.downColor}
                onPick={(color) => patchAppearance({ downColor: color })}
                onClear={() => patchAppearance({ downColor: null })}
                testid="oryon-settings-down-color"
              />
            </section>
            <section className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {S.structureSection}
              </p>
              <SwitchRow
                label={S.wicks}
                checked={draft.appearance.wicksVisible}
                onCheckedChange={(checked) => patchAppearance({ wicksVisible: checked })}
                testid="oryon-settings-wicks"
              />
              <SwitchRow
                label={S.borders}
                checked={draft.appearance.bordersVisible}
                onCheckedChange={(checked) => patchAppearance({ bordersVisible: checked })}
                testid="oryon-settings-borders"
              />
            </section>
          </TabsContent>

          {/* ── Status line ────────────────────────────────────────────────── */}
          <TabsContent value="statusLine" className="mt-3 flex flex-col gap-3">
            <SwitchRow
              label={S.showTime}
              checked={draft.statusLine.time}
              onCheckedChange={(checked) => patchStatusLine({ time: checked })}
              testid="oryon-settings-status-time"
            />
            <SwitchRow
              label={S.showOhlc}
              checked={draft.statusLine.ohlc}
              onCheckedChange={(checked) => patchStatusLine({ ohlc: checked })}
              testid="oryon-settings-status-ohlc"
            />
            <SwitchRow
              label={S.showVolume}
              checked={draft.statusLine.volume}
              onCheckedChange={(checked) => patchStatusLine({ volume: checked })}
              testid="oryon-settings-status-volume"
            />
            <p className="text-[11px] text-muted-foreground">{S.statusLineHint}</p>
          </TabsContent>

          {/* ── Scales and lines ───────────────────────────────────────────── */}
          <TabsContent value="scales" className="mt-3 flex flex-col gap-3">
            <SwitchRow
              label={S.priceScale}
              checked={draft.appearance.priceScaleVisible}
              onCheckedChange={(checked) => patchAppearance({ priceScaleVisible: checked })}
              testid="oryon-settings-price-scale"
            />
            <SwitchRow
              label={S.timeScale}
              checked={draft.appearance.timeScaleVisible}
              onCheckedChange={(checked) => patchAppearance({ timeScaleVisible: checked })}
              testid="oryon-settings-time-scale"
            />
            <SwitchRow
              label={S.lastPriceLine}
              checked={draft.appearance.lastPriceVisible}
              onCheckedChange={(checked) => patchAppearance({ lastPriceVisible: checked })}
              testid="oryon-settings-last-price"
            />
          </TabsContent>

          {/* ── Canvas ─────────────────────────────────────────────────────── */}
          <TabsContent value="canvas" className="mt-3 flex flex-col gap-3">
            <SwitchRow
              label={S.gridLines}
              checked={draft.appearance.gridVisible}
              onCheckedChange={(checked) => patchAppearance({ gridVisible: checked })}
              testid="oryon-settings-grid"
            />
            <SwitchRow
              label={S.crosshairMagnet}
              checked={draft.appearance.crosshairMagnet}
              onCheckedChange={(checked) => patchAppearance({ crosshairMagnet: checked })}
              testid="oryon-settings-magnet"
            />
            <p className="text-[11px] text-muted-foreground">{S.canvasHint}</p>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            data-testid="oryon-settings-reset"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {S.reset}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancel}>
              {S.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
              data-testid="oryon-settings-ok"
            >
              {S.ok}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Label + switch row — the dialog's atomic control. */
function SwitchRow({
  label,
  checked,
  onCheckedChange,
  testid,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  testid: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-raised/50 px-3 py-2">
      <Label className="text-sm font-normal text-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} data-testid={testid} />
    </div>
  );
}

/**
 * Label + color override control: preset swatches + a free-form picker +
 * "theme default" when an override is active. `null` renders the
 * theme-following state (the swatch row collapses — honest, not hidden).
 */
function ColorRow({
  label,
  value,
  onPick,
  onClear,
  testid,
}: {
  label: string;
  value: string | null;
  onPick: (color: string) => void;
  onClear: () => void;
  testid: string;
}) {
  const dict = useDict();
  const S = dict.oryon.chartSettings;
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-raised/50 px-3 py-2">
      <Label className="shrink-0 text-sm font-normal text-foreground">{label}</Label>
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          {value !== null ? (
            <button
              type="button"
              onClick={onClear}
              title={S.themeDefault}
              data-testid={`${testid}-clear`}
              className="rounded-md border border-dashed border-border px-1.5 py-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {S.themeDefaultShort}
            </button>
          ) : null}
          <label
            className={cn(
              "relative inline-flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-md border",
              value === null ? "border-dashed border-border" : "border-border",
            )}
            title={value === null ? S.themeDefault : undefined}
          >
            <input
              type="color"
              data-testid={testid}
              aria-label={label}
              value={value ?? "#22c55e"}
              onChange={(event) => onPick(event.target.value)}
              className="absolute inset-0 size-full cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`${label} ${color}`}
              onClick={() => onPick(color)}
              className={cn(
                "size-4 rounded-sm border transition-transform hover:scale-110",
                value !== null && value.toLowerCase() === color.toLowerCase()
                  ? "border-foreground"
                  : "border-transparent",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

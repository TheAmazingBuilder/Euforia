"use client";

import * as React from "react";

import { Eye, EyeOff, X } from "lucide-react";

import type { OryonIndicatorInstance } from "@cosmoz/shared";

import type { OryonChartEngine } from "@/lib/charting/oryon-chart-engine";
import type { ManagedIndicatorValue } from "@/lib/charting/oryon-indicator-series";
import type { IndicatorOutputId } from "@/lib/oryon/indicators/calculate";
import { formatIndicatorValue } from "@/lib/oryon/indicators/format";
import { indicatorLabel } from "@/lib/oryon/indicators/registry";
import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { useIndicatorSnapshot, useOryonIndicators } from "./oryon-indicators-context";

/**
 * Oryon indicator legend — one compact chip per active instance, rendered
 * inside the chart legend block (Phase 3 spec §4F, §8).
 *
 * Values arrive through the engine's imperative callback (rebuild + tick
 * path) — this leaf is the ONLY component that re-renders on the tick path
 * (≤ feed rate), the workspace tree stays still. Quick actions: chip body
 * opens settings, eye toggles visibility, X removes. Hidden instances stay
 * listed (muted, eye-off) so the state is discoverable — never silently
 * vanished.
 */
export function OryonIndicatorLegend({ engine }: { engine: OryonChartEngine | null }) {
  const dict = useDict();
  const S = dict.oryon.indicators;
  const { store, removeIndicator, openSettings } = useOryonIndicators();
  const snapshot = useIndicatorSnapshot();
  const [valuesById, setValuesById] = React.useState<Map<string, ManagedIndicatorValue["values"]>>(
    () => new Map(),
  );

  // Subscribe to the engine's value stream (fires immediately with current).
  React.useEffect(() => {
    if (engine === null) return;
    let alive = true;
    engine.onIndicatorValues((values) => {
      if (!alive) return;
      setValuesById(new Map(values.map((entry) => [entry.id, entry.values])));
    });
    return () => {
      alive = false;
    };
  }, [engine]);

  if (snapshot.indicators.length === 0) return null;

  return (
    // pointer-events-auto: the parent legend block is pointer-events-none
    // (it overlays the chart) — the chips are INTERACTIVE controls and must
    // receive clicks; the row re-enables events for itself only.
    <div className="pointer-events-auto flex w-full flex-wrap items-center gap-1">
      {snapshot.indicators.map((instance) => (
        <IndicatorChip
          key={instance.id}
          instance={instance}
          values={valuesById.get(instance.id)}
          onOpen={() => openSettings(instance.id)}
          onToggleVisible={() => store.toggleVisible(instance.id)}
          onRemove={() => removeIndicator(instance.id)}
          labels={S}
        />
      ))}
    </div>
  );
}

function IndicatorChip({
  instance,
  values,
  onOpen,
  onToggleVisible,
  onRemove,
  labels,
}: {
  instance: OryonIndicatorInstance;
  values: Partial<Record<IndicatorOutputId, number>> | undefined;
  onOpen: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
  labels: {
    remove: string;
    show: string;
    hide: string;
    values: { macd: string; signal: string; histogram: string };
  };
}) {
  const colorVar = `var(--${"style" in instance ? instance.style.color : "accent"}, var(--accent))`;
  const readout = chipReadout(instance, values, labels.values);

  return (
    <span
      data-testid="oryon-indicator-chip"
      data-indicator-type={instance.type}
      data-indicator-id={instance.id}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-background/85 px-1.5 py-0.5 font-mono text-[11px] backdrop-blur",
        !instance.visible && "opacity-55",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        title={`${indicatorLabel(instance)} — settings`}
        data-testid="oryon-indicator-chip-open"
        className="inline-flex items-center gap-1 rounded-sm text-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: colorVar }} />
        <span className="font-semibold">{indicatorLabel(instance)}</span>
        {readout !== null ? (
          <span className="tabular-nums text-muted-foreground">{readout}</span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={instance.visible ? labels.hide : labels.show}
        aria-pressed={!instance.visible}
        data-testid="oryon-indicator-chip-visibility"
        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {instance.visible ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={labels.remove}
        data-testid="oryon-indicator-chip-remove"
        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

/** Compact readout per instance — MACD shows line + histogram, others one value. */
function chipReadout(
  instance: OryonIndicatorInstance,
  values: Partial<Record<IndicatorOutputId, number>> | undefined,
  valueLabels: { macd: string; signal: string; histogram: string },
): string | null {
  if (values === undefined) return null;
  switch (instance.type) {
    case "macd": {
      const macd = values.macd;
      const histogram = values.histogram;
      if (macd === undefined || histogram === undefined) return null;
      return `${valueLabels.macd} ${formatIndicatorValue(macd, instance)} · ${valueLabels.histogram} ${formatIndicatorValue(histogram, instance)}`;
    }
    case "bbands": {
      const basis = values.basis;
      return basis === undefined ? null : formatIndicatorValue(basis, instance);
    }
    default: {
      const line = values.line ?? values.volume;
      return line === undefined ? null : formatIndicatorValue(line, instance);
    }
  }
}

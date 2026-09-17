"use client";

import { computeRiskAmount, suggestPositionSize, toDecimalString } from "@cosmoz/shared";

import type { TradeSizeModeValue } from "@/lib/utils/trade-draft";
import { formatPercent } from "@cosmoz/shared";
import { cn } from "@/lib/utils";

/**
 * Position sizer (spec §4, the signature detail): Risk % ↔ Size respond to
 * each other. Entry + stop + Risk % → size computed automatically via the
 * @cosmoz/shared risk utils and the instrument specs; inverse mode derives
 * risk from the entered size. The planned size becomes the discipline
 * reference — the sizer IS a discipline sensor.
 */

export interface SizerSpecs {
  pipSize: string;
  contractSize: string;
}

export interface PositionSizerProps {
  mode: TradeSizeModeValue;
  onModeChange: (mode: TradeSizeModeValue) => void;
  riskPercent: string;
  onRiskPercentChange: (value: string) => void;
  quantity: string;
  onQuantityChange: (value: string) => void;
  entry: string;
  stop: string;
  direction: "BUY" | "SELL";
  balance: string | null;
  specs: SizerSpecs | null;
  /** Unit word for size ("lots" / "stake" / "units" / "oz"). */
  unitLabel: string;
  id?: string;
}

const MODES: readonly { value: TradeSizeModeValue; label: string }[] = [
  { value: "risk_percent", label: "Risk % (auto-size)" },
  { value: "quantity", label: "Fixed size" },
];

export interface SizerDerived {
  /** Quantity for risk_percent mode (auto-suggested), null when not computable. */
  suggestedQuantity: string | null;
  /** Money risked, decimal string, null when not computable. */
  riskAmount: string | null;
  /** Risk as % of balance, number, null when not computable. */
  riskPct: number | null;
  /** Stop distance in pips. */
  stopPips: string | null;
}

/** Derive the sizer outputs for the current inputs (pure, display-only). */
export function deriveSizer(
  props: Pick<
    PositionSizerProps,
    "mode" | "riskPercent" | "quantity" | "entry" | "stop" | "direction" | "balance" | "specs"
  >,
): SizerDerived {
  const { mode, riskPercent, quantity, entry, stop, balance, specs } = props;
  if (specs === null || balance === null) {
    return { suggestedQuantity: null, riskAmount: null, riskPct: null, stopPips: null };
  }

  if (mode === "risk_percent") {
    const suggestion = suggestPositionSize(entry, stop, riskPercent, balance, specs);
    if (suggestion === null) {
      return { suggestedQuantity: null, riskAmount: null, riskPct: null, stopPips: null };
    }
    const pct = Number(riskPercent);
    return {
      suggestedQuantity: suggestion.quantity,
      riskAmount: suggestion.riskAmount,
      riskPct: Number.isFinite(pct) && pct > 0 ? pct : null,
      stopPips: suggestion.stopPips,
    };
  }

  const riskAmount = computeRiskAmount(entry, stop, quantity, specs.contractSize);
  if (riskAmount === null) {
    return { suggestedQuantity: null, riskAmount: null, riskPct: null, stopPips: null };
  }
  const riskPct = (Number(riskAmount) / Number(balance)) * 100;
  const pip = Number(specs.pipSize);
  const distance = Math.abs(Number(entry) - Number(stop));
  return {
    suggestedQuantity: null,
    riskAmount,
    riskPct: Number.isFinite(riskPct) ? riskPct : null,
    stopPips: Number.isFinite(distance) && pip > 0 ? toDecimalString(distance / pip) : null,
  };
}

export function PositionSizer(props: PositionSizerProps) {
  const { mode, onModeChange, riskPercent, onRiskPercentChange, quantity, onQuantityChange, unitLabel, id } =
    props;
  const derived = deriveSizer(props);
  const needsStop = props.stop.trim() === "" || Number(props.entry) === Number(props.stop);

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground" id={id}>
          Position sizer
        </span>
        <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Sizing mode">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={mode === option.value}
              onClick={() => onModeChange(option.value)}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                mode === option.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {mode === "risk_percent" ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-risk`} className="text-xs font-medium text-muted-foreground">
                Risk %
              </label>
              <input
                id={`${id}-risk`}
                type="text"
                inputMode="decimal"
                value={riskPercent}
                onChange={(event) => onRiskPercentChange(event.target.value)}
                placeholder="1.0"
                autoComplete="off"
                className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-size-auto`} className="text-xs font-medium text-muted-foreground">
                Size ({unitLabel}) — auto
              </label>
              <output
                id={`${id}-size-auto`}
                htmlFor={`${id}-risk`}
                className={cn(
                  "flex h-10 items-center rounded-md border border-dashed border-border bg-surface px-3 font-mono text-sm tabular-nums",
                  derived.suggestedQuantity !== null ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {needsStop ? "add a stop" : (derived.suggestedQuantity ?? "—")}
              </output>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-quantity`} className="text-xs font-medium text-muted-foreground">
                Size ({unitLabel})
              </label>
              <input
                id={`${id}-quantity`}
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => onQuantityChange(event.target.value)}
                placeholder="0.50"
                autoComplete="off"
                className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Risk (derived)</span>
              <div className="flex h-10 items-center rounded-md border border-dashed border-border bg-surface px-3 font-mono text-sm tabular-nums text-foreground">
                {derived.riskPct !== null ? formatPercent(derived.riskPct / 100, 2) : "—"}
              </div>
            </div>
          </>
        )}
      </div>

      {derived.stopPips !== null ? (
        <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          Stop distance: {derived.stopPips} pips
        </p>
      ) : null}
    </div>
  );
}

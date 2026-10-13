"use client";

import * as React from "react";
import { Check, Wand2 } from "lucide-react";
import { playbookColorName, PLAYBOOK_COLOR_OPTIONS } from "@cosmoz/shared";

import { Sparkline } from "@/components/dashboard/sparkline";
import { getThemeToken } from "@/lib/utils/theme";
import { cn } from "@/lib/utils";

/**
 * Strategy color picker (Playbook form): the preset swatches are DATA
 * (hex strings stored on Strategy.color), so the swatch fill is an inline
 * style — every piece of chrome (rings, borders, surfaces) stays on theme
 * tokens. The group is a WAI-ARIA radiogroup with roving tabindex and
 * arrow-key selection; swatches are addressed by NAME, never by hex.
 *
 * An "Auto" option clears the stored color so the strategy card falls back
 * to the theme accent, exactly like `strategy.color ?? getThemeToken("--accent")`
 * resolves at render time. A live preview mirrors the strategy card
 * (status dot + cumulative-R sparkline) so the choice is tangible.
 */

/** Deterministic demo equity curve for the preview sparkline (in R). */
const PREVIEW_POINTS = ["0.4", "1.1", "0.8", "1.6", "1.3", "2.0", "1.8", "2.4"];

const SWATCH_BASE =
  "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

interface StrategyColorPickerProps {
  /** Stored color, or null for "Auto — theme accent". */
  value: string | null;
  onChange: (color: string | null) => void;
  /** Strategy name typed so far — shown live in the preview card. */
  previewName?: string;
}

export function StrategyColorPicker({ value, onChange, previewName }: StrategyColorPickerProps) {
  // Option 0 = Auto, options 1..n = palette. Roving tabindex keeps the
  // group a single tab stop; arrows move focus AND selection together.
  const groupRef = React.useRef<HTMLDivElement>(null);
  const optionCount = PLAYBOOK_COLOR_OPTIONS.length + 1;

  const move = (from: number, delta: number) => {
    const next = (from + delta + optionCount) % optionCount;
    onChange(next === 0 ? null : PLAYBOOK_COLOR_OPTIONS[next - 1]!.value);
    const radios = groupRef.current?.querySelectorAll<HTMLButtonElement>("button[role='radio']");
    radios?.[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = Number(event.currentTarget.dataset.index ?? "0");
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(index, -1);
    }
  };

  const effectiveColor = value ?? getThemeToken("--accent");
  const readout = value === null ? "Auto · theme accent" : `${playbookColorName(value) ?? "Custom"} · ${value}`;

  return (
    <div className="space-y-3" data-testid="strategy-color-picker">
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="Strategy color"
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          role="radio"
          data-index={0}
          aria-checked={value === null}
          aria-label="Auto — theme accent"
          title="Auto — theme accent"
          tabIndex={value === null ? 0 : -1}
          onKeyDown={onKeyDown}
          onClick={() => onChange(null)}
          data-testid="color-auto"
          className={cn(
            SWATCH_BASE,
            "border-2 border-dashed border-border bg-surface-raised text-muted-foreground hover:scale-105 hover:text-foreground",
            value === null && "scale-110 border-solid border-ring text-accent shadow-md",
          )}
        >
          <Wand2 className="size-4" aria-hidden="true" />
        </button>

        {PLAYBOOK_COLOR_OPTIONS.map((option, index) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              data-index={index + 1}
              aria-checked={selected}
              aria-label={option.name}
              title={option.name}
              tabIndex={selected ? 0 : -1}
              onKeyDown={onKeyDown}
              onClick={() => onChange(option.value)}
              data-testid={`color-${option.name.toLowerCase()}`}
              className={cn(
                SWATCH_BASE,
                "hover:scale-105",
                selected ? "scale-110 shadow-md ring-2 ring-ring ring-offset-2 ring-offset-card" : "ring-1 ring-inset ring-white/10",
              )}
              style={{ backgroundColor: option.value }}
            >
              {selected ? (
                <Check
                  className="size-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
                  strokeWidth={3}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Live preview — mirrors how the strategy card renders the color:
          status dot (trade-form picker) + data sparkline (card), nothing else. */}
      <div className="rounded-xl border border-border bg-surface p-3" data-testid="color-preview" aria-hidden="true">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
            style={{ backgroundColor: effectiveColor }}
          />
          <span className="min-w-0 truncate font-heading text-sm font-semibold text-foreground">
            {previewName !== undefined && previewName.trim() !== "" ? previewName : "Strategy preview"}
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Cumulative R
          </span>
        </div>
        <Sparkline points={PREVIEW_POINTS} color={effectiveColor} className="mt-2 h-7 w-full" />
      </div>

      <p className="font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="color-readout">
        {readout}
      </p>
    </div>
  );
}

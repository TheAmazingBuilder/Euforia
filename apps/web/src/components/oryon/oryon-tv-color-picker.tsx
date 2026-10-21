"use client";

import * as React from "react";

import { Plus } from "lucide-react";

import {
  addCustomColor,
  composeHexAlpha,
  hexAlpha,
  hexBase,
  loadCustomColors,
  oryonTvPalette,
} from "@/lib/oryon/workspace/color-palette";

import { useDict } from "@/i18n/i18n-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * TradingView-style color picker — the reference screenshot reproduced:
 * a 10×7 swatch grid (grayscale row + vivid base row + four ramp rows),
 * a custom (recent) swatches strip with a "+" free-color entry, and an
 * opacity slider that composes #RRGGBBAA. The chart engine consumes any
 * CSS color string, so alpha survives the whole pipeline; persistence
 * validates the extended hex form (see chart-prefs).
 *
 * `null` = "follow the theme" — the parent renders its own clear affordance;
 * the slider stays disabled until a concrete color is picked (an opacity
 * over "no color" would be a lie).
 */

const GRID = oryonTvPalette();

export function OryonTvColorPicker({
  value,
  onChange,
  testid,
  label,
}: {
  /** Current override (#RRGGBB[AA]) — null follows the theme. */
  value: string | null;
  onChange: (color: string) => void;
  testid: string;
  label: string;
}) {
  const dict = useDict();
  const S = dict.oryon.chartSettings;

  const [open, setOpen] = React.useState(false);
  const [customs, setCustoms] = React.useState<string[]>([]);

  // The custom strip reads localStorage when the popover opens (client-only
  // by construction — the settings dialog mounts on user interaction).
  const onOpenChange = (next: boolean): void => {
    if (next) setCustoms(loadCustomColors());
    setOpen(next);
  };

  const base = value !== null ? hexBase(value) : null;
  const alpha = value !== null ? hexAlpha(value) : 1;

  const pick = (color: string): void => {
    // Picking a grid swatch resets to fully opaque (TV behavior: the slider
    // then re-applies on the new base).
    onChange(color.toLowerCase());
  };

  const onOpacity = (percent: number): void => {
    if (base === null) return;
    const composed = composeHexAlpha(base, percent / 100);
    if (composed !== null) onChange(composed);
  };

  const onCustomInput = (hex: string): void => {
    const normalized = hex.toLowerCase();
    pick(normalized);
    setCustoms(addCustomColor(normalized));
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          aria-label={label}
          title={value ?? undefined}
          className={cn(
            "relative size-7 shrink-0 rounded-md border border-border transition-shadow hover:ring-2 hover:ring-ring/50",
            value === null && "border-dashed bg-transparent",
          )}
          style={value !== null ? { backgroundColor: value } : undefined}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[248px] p-2.5"
        data-testid={`${testid}-popover`}
      >
        <div className="grid grid-cols-10 gap-[3px]">
          {GRID.flat().map((color) => {
            const selected =
              value !== null && hexBase(value) === color && alpha >= 0.999;
            return (
              <button
                key={color}
                type="button"
                aria-label={`${label} ${color}`}
                data-testid={`${testid}-swatch-${color.slice(1)}`}
                onClick={() => pick(color)}
                className={cn(
                  "size-[19px] rounded-[4px] border border-black/10 transition-transform hover:scale-110",
                  selected && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                )}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center gap-[3px] border-t border-border pt-2.5">
          <label
            title={S.addCustomColor}
            data-testid={`${testid}-add`}
            className="relative flex size-[19px] cursor-pointer items-center justify-center rounded-[4px] border border-border text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" aria-hidden />
            <input
              type="color"
              aria-label={S.addCustomColor}
              value={base ?? "#22c55e"}
              onChange={(event) => onCustomInput(event.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          {customs.map((color) => {
            const selected = value !== null && hexBase(value) === color && alpha >= 0.999;
            return (
              <button
                key={color}
                type="button"
                aria-label={`${label} ${color}`}
                data-testid={`${testid}-custom-${color.slice(1)}`}
                onClick={() => pick(color)}
                className={cn(
                  "size-[19px] rounded-[4px] border border-black/10 transition-transform hover:scale-110",
                  selected && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                )}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center gap-2.5 border-t border-border pt-2.5">
          <span className="text-[11px] text-muted-foreground">{S.opacity}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(alpha * 100)}
            disabled={base === null}
            onChange={(event) => onOpacity(Number(event.target.value))}
            data-testid={`${testid}-opacity`}
            aria-label={S.opacity}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-raised accent-primary disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="w-9 text-right font-mono text-[11px] tabular-nums text-foreground">
            {Math.round(alpha * 100)}%
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

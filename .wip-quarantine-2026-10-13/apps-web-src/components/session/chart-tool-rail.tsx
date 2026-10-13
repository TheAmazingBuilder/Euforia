"use client";

import * as React from "react";
import { Eraser, Minus, MoveUpRight, PencilLine, Ruler, Square, TrendingUp, Type, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { DrawingKind, DrawingObject, IndicatorConfig, IndicatorKind } from "@cosmoz/shared";
import { DRAWING_TOOLS, newId } from "@/lib/utils/drawings";
import { INDICATOR_DEFAULTS, INDICATOR_META } from "@/lib/utils/indicators";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Chart tool rail (§14/§16): indicator management (add / remove / edit
 * params / hide / show / reset) and the drawing toolbar with the placement
 * workflow. Placement itself happens ON the chart — this rail arms tools
 * and manages the drawing list.
 */

const INDICATOR_ORDER: readonly IndicatorKind[] = ["EMA", "SMA", "VWAP", "BB", "RSI", "MACD", "ATR", "VOLUME"];

const DRAWING_ICONS: Record<DrawingKind, React.ComponentType<{ className?: string }>> = {
  HLINE: Minus,
  TREND: TrendingUp,
  RAY: MoveUpRight,
  RECT: Square,
  TEXT: Type,
  MEASURE: Ruler,
  FIB: PencilLine,
};

interface IndicatorsPopoverProps {
  indicators: IndicatorConfig[];
  onChange: (next: IndicatorConfig[]) => void;
}

export function IndicatorsPopover({ indicators, onChange }: IndicatorsPopoverProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const add = (kind: IndicatorKind) => {
    onChange([
      ...indicators,
      {
        id: newId(),
        kind,
        visible: true,
        params: { ...INDICATOR_DEFAULTS[kind] },
      },
    ]);
  };
  const patch = (id: string, patchBody: Partial<IndicatorConfig>) =>
    onChange(indicators.map((item) => (item.id === id ? { ...item, ...patchBody } : item)));
  const remove = (id: string) => onChange(indicators.filter((item) => item.id !== id));

  const paramFields: Array<{ key: "length" | "fast" | "slow" | "signal" | "stdDev"; label: string }> = [
    { key: "length", label: S.toolRail.paramLength },
    { key: "fast", label: S.toolRail.paramFast },
    { key: "slow", label: S.toolRail.paramSlow },
    { key: "signal", label: S.toolRail.paramSignal },
    { key: "stdDev", label: S.toolRail.paramStdDev },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={S.toolRail.indicatorsAria} data-testid="indicators-button" className="justify-start">
          {S.toolRail.indicators}
          {indicators.length > 0 ? (
            <span className="ml-auto rounded-full border border-accent/40 bg-accent/10 px-1.5 text-[10px] font-semibold text-accent">
              {indicators.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-[300px] p-3" data-testid="indicators-popover">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{S.toolRail.addIndicator}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {INDICATOR_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => add(kind)}
              data-testid={`indicator-add-${kind}`}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/50 hover:bg-accent/10"
            >
              + {INDICATOR_META[kind].label}
            </button>
          ))}
        </div>

        <Separator className="my-3" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {`${S.toolRail.onChart}${indicators.length > 0 ? ` (${indicators.length})` : ""}`}
        </p>
        {indicators.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {S.toolRail.indicatorsEmpty}
          </p>
        ) : (
          <ul className="mt-1.5 space-y-2" data-testid="indicator-list">
            {indicators.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-surface-raised px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-semibold text-foreground">{INDICATOR_META[item.kind].label}</span>
                  <span className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => patch(item.id, { visible: !item.visible })}
                      aria-label={`${item.visible ? S.toolRail.hide : S.toolRail.show} ${INDICATOR_META[item.kind].label}`}
                      className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", item.visible ? "text-accent" : "text-muted-foreground")}
                    >
                      {item.visible ? S.toolRail.hide : S.toolRail.show}
                    </button>
                    <button
                      type="button"
                      onClick={() => patch(item.id, { params: { ...INDICATOR_DEFAULTS[item.kind] } })}
                      aria-label={`${dict.common.reset} ${INDICATOR_META[item.kind].label}${S.toolRail.paramsTail !== "" ? ` ${S.toolRail.paramsTail}` : ""}`}
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground hover:text-foreground"
                    >
                      {dict.common.reset}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      aria-label={`${S.toolRail.remove} ${INDICATOR_META[item.kind].label}`}
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-loss"
                    >
                      {S.toolRail.remove}
                    </button>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {paramFields.map((field) => (
                    <label key={field.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {field.label}
                      <input
                        type="number"
                        min={field.key === "stdDev" ? 0.5 : 2}
                        max={field.key === "stdDev" ? 6 : 500}
                        step={field.key === "stdDev" ? 0.5 : 1}
                        value={item.params?.[field.key] ?? ""}
                        onChange={(event) => {
                          const raw = event.target.value;
                          const value = raw === "" ? undefined : Number(raw);
                          patch(item.id, { params: { ...item.params, [field.key]: value } });
                        }}
                        aria-label={`${field.label} ${S.toolRail.paramFor} ${INDICATOR_META[item.kind].label}`}
                        className="w-12 rounded border border-border bg-surface px-1 py-0.5 text-right font-mono text-[11px] text-foreground outline-none focus:border-accent/60"
                      />
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface DrawingToolbarProps {
  tool: DrawingKind | null;
  onToolChange: (tool: DrawingKind | null) => void;
  drawings: DrawingObject[];
  onDrawingDelete: (id: string) => void;
  onDrawingsClear: () => void;
  onUndo: () => void;
}

export function DrawingToolbar({ tool, onToolChange, drawings, onDrawingDelete, onDrawingsClear, onUndo }: DrawingToolbarProps) {
  const { dict } = useI18n();
  const S = dict.session;
  // Controlled open state — arming a tool closes the popover so the chart is
  // fully visible for placement (the click that would otherwise dismiss an
  // uncontrolled popover can also swallow the placement click).
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={S.toolRail.drawingsAria} data-testid="drawings-button" className="justify-start">
          {S.toolRail.drawings}
          {drawings.length > 0 ? (
            <span className="ml-auto rounded-full border border-warning/40 bg-warning/10 px-1.5 text-[10px] font-semibold text-warning">
              {drawings.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-[280px] p-3" data-testid="drawings-popover">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{S.toolRail.placeOnChart}</p>
        <div className="mt-1.5 grid grid-cols-4 gap-1" role="toolbar" aria-label={S.toolRail.drawingsAria}>
          {DRAWING_TOOLS.map((meta) => {
            const Icon = DRAWING_ICONS[meta.kind];
            const active = tool === meta.kind;
            return (
              <button
                key={meta.kind}
                type="button"
                title={meta.label}
                aria-label={`${meta.label}${active ? S.toolRail.armedSuffix : ""}`}
                aria-pressed={active}
                data-testid={`drawing-tool-${meta.kind}`}
                onClick={() => {
                  onToolChange(active ? null : meta.kind);
                  if (!active) setOpen(false);
                }}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md border transition-colors",
                  active
                    ? "border-warning/60 bg-warning/15 text-warning"
                    : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
        {tool !== null ? (
          <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] leading-snug text-warning">
            {DRAWING_TOOLS.find((meta) => meta.kind === tool)?.hint}
          </p>
        ) : null}

        <Separator className="my-3" />
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {`${S.toolRail.placed}${drawings.length > 0 ? ` (${drawings.length})` : ""}`}
          </p>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={drawings.length === 0}
              aria-label={S.toolRail.undoAria}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onDrawingsClear}
              disabled={drawings.length === 0}
              aria-label={S.toolRail.clearAria}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-loss disabled:opacity-40"
            >
              <Eraser className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        </div>
        {drawings.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {S.toolRail.drawingsEmpty}
          </p>
        ) : (
          <ul className="mt-1.5 max-h-[180px] space-y-1 overflow-y-auto" data-testid="drawing-list">
            {[...drawings].reverse().map((drawing) => {
              const meta = DRAWING_TOOLS.find((item) => item.kind === drawing.kind);
              const Icon = DRAWING_ICONS[drawing.kind];
              return (
                <li key={drawing.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-raised px-2 py-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                    <Icon className="size-3 shrink-0 text-warning" aria-hidden="true" />
                    <span className="truncate">
                      {drawing.text ?? meta?.label ?? drawing.kind}
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                        {drawing.points.map((point) => point.y.toFixed(2)).join(" → ")}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onDrawingDelete(drawing.id)}
                    aria-label={`${S.toolRail.deleteAria} ${meta?.label ?? drawing.kind}`}
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-loss"
                  >
                    <Eraser className="size-3" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

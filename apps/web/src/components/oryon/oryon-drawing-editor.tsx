"use client";

import * as React from "react";
import { Copy, Lock, LockOpen, Trash2, X } from "lucide-react";

import {
  oryonPositionRr,
  ORYON_POSITION_RR_MAX,
  ORYON_POSITION_RR_MIN,
  ORYON_POSITION_RR_PRESETS,
  type OryonDrawing,
  type OryonDrawingStyle,
} from "@cosmoz/shared";

import {
  clamp,
} from "@/lib/oryon/drawings/geometry";
import {
  ORYON_COLOR_CHOICES,
  ORYON_DASH_CHOICES,
  ORYON_FONT_SIZE_CHOICES,
  ORYON_WIDTH_CHOICES,
  drawingSupportsFill,
} from "@/lib/oryon/tools/style-presets";
import type { OryonDrawingStore } from "@/lib/oryon/drawings/store";
import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Oryon drawing property editor — the RIGHT-CLICK menu (TradingView parity).
 *
 * Opens on the interaction controller's context-menu callback (a hit was
 * found — the object is already selected) and edits the object's PROPERTIES
 * in place: color, width, dash, fill opacity, font size (text), per-object
 * risk:reward (position tools), direction (arrow marks) — plus the TV
 * actions clone / lock / hide / delete. Clones and ratio changes go through
 * the SAME store mutations as every other edit (undoable, locked objects
 * refused) — this component owns NO business rule.
 *
 * Color discipline: swatches are theme-token KEYS; the persisted style never
 * carries hex (AGENTS.md golden rule). Honesty: the R:R control changes the
 * DERIVED target ratio only — it can never move the stop or invent a
 * stored target price.
 */

const EMPTY_SNAPSHOT = { drawings: [] as readonly OryonDrawing[], selectedId: null as string | null, version: 0 };

export function OryonDrawingPropertyEditor({
  store,
  drawingId,
  x,
  y,
  onClone,
  onClose,
}: {
  store: OryonDrawingStore;
  drawingId: string;
  /** Right-click point, chart-wrapper CSS px (the layer's coordinate space). */
  x: number;
  y: number;
  onClone(drawing: OryonDrawing): void;
  onClose(): void;
}) {
  const dict = useDict();
  const S = dict.oryon.drawings;
  const snapshot = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  const drawing = snapshot.drawings.find((d) => d.id === drawingId) ?? null;

  // A deleted / swapped-out object closes the editor (no zombie panel).
  React.useEffect(() => {
    if (drawing === null) onClose();
  }, [drawing, onClose]);

  // Outside click closes (document CAPTURE — runs before the chart's own
  // capture handlers, so even a consumed chart click closes the menu).
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const onDocPointerDown = (event: PointerEvent): void => {
      const el = rootRef.current;
      if (el !== null && event.target instanceof Node && !el.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [onClose]);

  // Escape closes (own listener — the layer's Escape deselects as well).
  React.useEffect(() => {
    const onDocKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onDocKeyDown, true);
    return () => document.removeEventListener("keydown", onDocKeyDown, true);
  }, [onClose]);

  // Position: clamp INSIDE the chart wrapper (measured after first paint —
  // the menu never overflows the pane it belongs to).
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  React.useEffect(() => {
    const el = rootRef.current;
    const parent = el?.parentElement ?? null;
    if (el === null || parent === null) return;
    setPos({
      left: clamp(x + 12, 4, Math.max(4, parent.clientWidth - el.offsetWidth - 4)),
      top: clamp(y + 10, 4, Math.max(4, parent.clientHeight - el.offsetHeight - 4)),
    });
  }, [x, y]);

  const patchStyle = (patch: Partial<OryonDrawingStyle>): void => {
    if (drawing === null || drawing.locked) return;
    store.update(drawing.id, { style: { ...drawing.style, ...patch } });
  };

  if (drawing === null) return null;
  const locked = drawing.locked;
  const typeLabel = S[TYPE_LABEL_KEYS[drawing.type]];
  const supportsFill = drawingSupportsFill(drawing.type);

  return (
    <div
      ref={rootRef}
      data-oryon-ui=""
      data-testid="oryon-drawing-ctx-editor"
      data-drawing-type={drawing.type}
      className="pointer-events-auto absolute z-40 w-56 rounded-lg border border-border bg-background/95 p-2 shadow-xl backdrop-blur"
      style={{
        left: pos?.left ?? x + 12,
        top: pos?.top ?? y + 10,
        visibility: pos === null ? "hidden" : "visible",
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <header className="mb-1.5 flex items-center justify-between">
        <span className="font-heading text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {typeLabel}
          {locked ? <span className="ml-1 text-warning">· {S.lockedBadge}</span> : null}
        </span>
        <button
          type="button"
          aria-label={S.textCancel}
          onClick={onClose}
          className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>

      {/* Color (all types) — token swatches, never hex. */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1" role="group" aria-label={S.colorLabel}>
        {ORYON_COLOR_CHOICES.map(({ key, cssVar }) => (
          <button
            key={key}
            type="button"
            aria-label={`${S.colorLabel}: ${key}`}
            data-testid={`oryon-ctx-color-${key}`}
            data-active={drawing.style.color === key || undefined}
            disabled={locked}
            onClick={() => patchStyle({ color: key, fill: supportsFill ? key : drawing.style.fill })}
            className={cn(
              "size-4 rounded-full border border-border",
              drawing.style.color === key && "ring-2 ring-ring ring-offset-1 ring-offset-background",
              locked && "cursor-not-allowed opacity-40",
            )}
            style={{ backgroundColor: `var(${cssVar})` }}
          />
        ))}
      </div>

      {/* Width + dash (dash does not apply to the filled arrow glyph). */}
      {drawing.type !== "arrowmark" ? (
        <div className="mb-1.5 flex items-center gap-2">
          <div role="group" aria-label={S.widthLabel} className="flex items-center gap-0.5">
            {ORYON_WIDTH_CHOICES.map((width) => (
              <button
                key={width}
                type="button"
                aria-label={`${S.widthLabel}: ${width}`}
                data-testid={`oryon-ctx-width-${width}`}
                data-active={drawing.style.width === width || undefined}
                disabled={locked}
                onClick={() => patchStyle({ width })}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-sm",
                  drawing.style.width === width
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                  locked && "cursor-not-allowed opacity-40",
                )}
              >
                <span className="rounded-full bg-current" style={{ width: width + 3, height: width + 1 }} />
              </button>
            ))}
          </div>
          <div role="group" aria-label={S.dashLabel} className="flex items-center gap-0.5">
            {ORYON_DASH_CHOICES.map((dash) => (
              <button
                key={dash}
                type="button"
                aria-label={`${S.dashLabel}: ${S[`dash${dash[0]!.toUpperCase()}${dash.slice(1)}` as keyof typeof S]}`}
                data-testid={`oryon-ctx-dash-${dash}`}
                data-active={drawing.style.dash === dash || undefined}
                disabled={locked}
                onClick={() => patchStyle({ dash })}
                className={cn(
                  "flex h-6 items-center rounded-sm px-1.5 text-[10px]",
                  drawing.style.dash === dash
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                  locked && "cursor-not-allowed opacity-40",
                )}
              >
                {S[`dash${dash[0]!.toUpperCase()}${dash.slice(1)}` as keyof typeof S]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mb-1.5 text-[10px] text-muted-foreground">{S.ctxArrowSizeNote}</p>
      )}

      {/* Fill opacity (area types). */}
      {supportsFill ? (
        <label className="mb-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          {S.fillLabel}
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.02}
            value={drawing.style.fillOpacity}
            disabled={locked}
            onChange={(event) => patchStyle({ fillOpacity: Number(event.target.value) })}
            className="h-1 flex-1 accent-[var(--accent)]"
            aria-label={S.fillLabel}
          />
          <span className="w-8 text-right font-mono tabular-nums">
            {Math.round(drawing.style.fillOpacity * 100)}%
          </span>
        </label>
      ) : null}

      {/* Font size (text annotations). */}
      {drawing.type === "text" ? (
        <div className="mb-1.5 flex items-center gap-1" role="group" aria-label={S.fontSizeLabel}>
          <span className="text-[10px] text-muted-foreground">{S.fontSizeLabel}</span>
          {ORYON_FONT_SIZE_CHOICES.map((size) => (
            <button
              key={size}
              type="button"
              aria-label={`${S.fontSizeLabel}: ${size}`}
              data-active={drawing.style.fontSize === size || undefined}
              disabled={locked}
              onClick={() => patchStyle({ fontSize: size })}
              className={cn(
                "flex h-6 items-center rounded-sm px-1.5 font-mono text-[10px]",
                drawing.style.fontSize === size
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                locked && "cursor-not-allowed opacity-40",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      ) : null}

      {/* Risk:Reward (position tools) — chips + bounded free input. */}
      {(drawing.type === "longpos" || drawing.type === "shortpos") ? (
        <div className="mb-1.5" data-testid="oryon-ctx-rr">
          <div className="mb-1 flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{S.rrLabel}</span>
            <input
              type="number"
              min={ORYON_POSITION_RR_MIN}
              max={ORYON_POSITION_RR_MAX}
              step={0.5}
              value={oryonPositionRr(drawing)}
              disabled={locked}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                const bounded = clamp(next, ORYON_POSITION_RR_MIN, ORYON_POSITION_RR_MAX);
                store.replace({ ...drawing, rr: bounded });
              }}
              className="w-14 rounded-md border border-border bg-background px-1.5 py-0.5 text-right font-mono text-[11px] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={S.rrLabel}
            />
            <span className="text-[10px] text-muted-foreground">: 1</span>
          </div>
          <div className="flex flex-wrap items-center gap-0.5">
            {ORYON_POSITION_RR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={`${S.rrLabel}: ${preset}`}
                data-testid={`oryon-ctx-rr-${preset}`}
                data-active={oryonPositionRr(drawing) === preset || undefined}
                disabled={locked}
                onClick={() => store.replace({ ...drawing, rr: preset })}
                className={cn(
                  "flex h-5 items-center rounded-sm px-1.5 font-mono text-[10px]",
                  oryonPositionRr(drawing) === preset
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                  locked && "cursor-not-allowed opacity-40",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{S.rrHint}</p>
        </div>
      ) : null}

      {/* Direction (arrow marks) — re-aims the glyph, tip stays anchored. */}
      {drawing.type === "arrowmark" ? (
        <div className="mb-1.5 flex items-center gap-1" role="group" aria-label={S.directionLabel}>
          <span className="text-[10px] text-muted-foreground">{S.directionLabel}</span>
          {(["up", "down", "left", "right"] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={`${S.directionLabel}: ${S[`dir${dir[0]!.toUpperCase()}${dir.slice(1)}` as keyof typeof S]}`}
              data-testid={`oryon-ctx-dir-${dir}`}
              data-active={drawing.dir === dir || undefined}
              disabled={locked}
              onClick={() => store.replace({ ...drawing, dir })}
              className={cn(
                "flex h-6 items-center rounded-sm px-1.5 text-[10px]",
                drawing.dir === dir
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                locked && "cursor-not-allowed opacity-40",
              )}
            >
              {S[`dir${dir[0]!.toUpperCase()}${dir.slice(1)}` as keyof typeof S]}
            </button>
          ))}
        </div>
      ) : null}

      {/* Actions — clone / lock / delete (delete is undoable via history). */}
      <div className="flex items-center gap-1 border-t border-border pt-1.5">
        <button
          type="button"
          data-testid="oryon-ctx-clone"
          disabled={locked}
          onClick={() => onClone(drawing)}
          className={cn(
            "flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-surface-raised hover:text-foreground",
            locked && "cursor-not-allowed opacity-40",
          )}
        >
          <Copy className="size-3" aria-hidden />
          {S.ctxClone}
        </button>
        <button
          type="button"
          data-testid="oryon-ctx-lock"
          onClick={() => store.toggleLocked(drawing.id)}
          className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-surface-raised hover:text-foreground"
        >
          {locked ? <LockOpen className="size-3" aria-hidden /> : <Lock className="size-3" aria-hidden />}
          {locked ? S.unlockHint : S.lockHint.split(" — ")[0]}
        </button>
        <button
          type="button"
          data-testid="oryon-ctx-delete"
          disabled={locked}
          onClick={() => {
            store.remove(drawing.id);
            onClose();
          }}
          className={cn(
            "ml-auto flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10px] text-loss hover:bg-loss/15",
            locked && "cursor-not-allowed opacity-40",
          )}
        >
          <Trash2 className="size-3" aria-hidden />
          {S.deleteHint}
        </button>
      </div>
    </div>
  );
}

/** Type → label key (mirrors the object-list map; kept local to avoid a
 *  component→component import — both read the same dictionary keys). */
const TYPE_LABEL_KEYS: Record<OryonDrawing["type"], keyof typeof import("@/i18n/dictionaries/en/oryon").oryonDict.drawings> = {
  trend: "typeTrend",
  hline: "typeHline",
  vline: "typeVline",
  ray: "typeRay",
  extended: "typeExtended",
  crossline: "typeCrossline",
  rect: "typeRect",
  ellipse: "typeEllipse",
  text: "typeText",
  measure: "typeMeasure",
  pricerange: "typePriceRange",
  daterange: "typeDateRange",
  fib: "typeFib",
  fibext: "typeFibExt",
  longpos: "typeLongPos",
  shortpos: "typeShortPos",
  brush: "typeBrush",
  arrowmark: "typeArrowMark",
};

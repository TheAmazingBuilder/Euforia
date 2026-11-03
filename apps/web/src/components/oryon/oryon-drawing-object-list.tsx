"use client";

import * as React from "react";

import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Trash2,
  TrendingUp,
  Minus,
  MoveVertical,
  ArrowUp,
  ArrowUpRight,
  Brush,
  MoveUpRight,
  Plus,
  Square,
  Circle,
  Type,
  AlignJustify,
  AlignEndHorizontal,
  ArrowDownUp,
  ArrowRightLeft,
  ArrowUpFromLine,
  ArrowDownToLine,
  Ruler,
  type LucideIcon,
} from "lucide-react";

import type { OryonDrawing, OryonDrawingStyle } from "@cosmoz/shared";

import type { OryonDrawingStore } from "@/lib/oryon/drawings/store";
import {
  ORYON_COLOR_CHOICES,
  ORYON_DASH_CHOICES,
  ORYON_WIDTH_CHOICES,
  drawingSupportsFill,
} from "@/lib/oryon/tools/style-presets";
import { useDict } from "@/i18n/i18n-provider";
import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { OryonIconButton } from "@/components/oryon/oryon-icon-button";
import { cn } from "@/lib/utils";

/**
 * Oryon drawing object list - management UI (spec §10) + compact style
 * editor (spec §11) for the selected object.
 *
 * Toolbar v4: the list is DOCKED on the right utility rail's "Objects"
 * panel (moved from the in-chart floating card - same component, same
 * store contract, no duplicate surface). It fills the rail panel and
 * follows the ACTIVE chart's store through the drawings context.
 *
 * Synchronization: the list subscribes to the drawing store directly
 * (useSyncExternalStore) - commits are rare (drag end, toggle, style),
 * pointer drags never re-render this panel.
 *
 * Destructive discipline: per-object delete is instant but undoable
 * (history covers deletion); delete-ALL requires an explicit two-step
 * inline confirmation - no destructive action fires silently.
 */

const TYPE_ICONS: Record<OryonDrawing["type"], LucideIcon> = {
  trend: TrendingUp,
  hline: Minus,
  vline: MoveVertical,
  ray: ArrowUpRight,
  extended: MoveUpRight,
  crossline: Plus,
  rect: Square,
  ellipse: Circle,
  text: Type,
  measure: Ruler,
  pricerange: ArrowDownUp,
  daterange: ArrowRightLeft,
  fib: AlignJustify,
  fibext: AlignEndHorizontal,
  longpos: ArrowUpFromLine,
  shortpos: ArrowDownToLine,
  brush: Brush,
  arrowmark: ArrowUp,
};

/** Theme-token swatches live in the SHARED style presets (the right-click
 *  property editor reads the same list - the two surfaces can't drift). */
const COLOR_CHOICES = ORYON_COLOR_CHOICES;

const WIDTH_CHOICES = ORYON_WIDTH_CHOICES;
const DASH_CHOICES = ORYON_DASH_CHOICES;

const EMPTY_SNAPSHOT = { drawings: [] as readonly OryonDrawing[], selectedId: null, version: 0 };
const noopSubscribe = () => () => {};

export function OryonDrawingObjectList({ store: storeOverride }: { store?: OryonDrawingStore }) {
  const dict = useDict();
  const S = dict.oryon.drawings;
  const { activeStore: contextStore } = useOryonDrawings();
  const store = storeOverride ?? contextStore;
  const snapshot = React.useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
  );
  const [confirmClear, setConfirmClear] = React.useState(false);

  // No bound store yet (no active chart layer) - nothing to manage.
  if (store === null) return null;

  const selected = snapshot.selectedId !== null
    ? snapshot.drawings.find((d) => d.id === snapshot.selectedId) ?? null
    : null;

  return (
    <div
      data-testid="oryon-drawing-list"
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="font-heading text-xs font-semibold text-foreground">
          {S.title}
          {snapshot.drawings.length > 0 ? (
            <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
              {snapshot.drawings.length} {S.count}
            </span>
          ) : null}
        </span>
        {snapshot.drawings.length > 0 ? (
          confirmClear ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="oryon-drawing-clear-confirm"
                onClick={() => {
                  store.clearAll();
                  setConfirmClear(false);
                }}
                className="rounded-sm bg-loss/15 px-1.5 py-0.5 text-[10px] font-semibold text-loss hover:bg-loss/25"
              >
                {S.deleteAllConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {S.deleteAllKeep}
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="oryon-drawing-clear"
              onClick={() => setConfirmClear(true)}
              className="text-[10px] text-muted-foreground hover:text-loss"
            >
              {S.deleteAll}
            </button>
          )
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {snapshot.drawings.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">{S.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {[...snapshot.drawings].reverse().map((drawing) => (
              <OryonDrawingRow
                key={drawing.id}
                drawing={drawing}
                selected={drawing.id === snapshot.selectedId}
                onSelect={() => store.select(drawing.id)}
                onToggleVisible={() => store.toggleVisible(drawing.id)}
                onToggleLock={() => store.toggleLocked(drawing.id)}
                onDelete={() => store.remove(drawing.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {selected !== null ? <OryonDrawingStyleEditor key={selected.id} drawing={selected} store={store} /> : null}
    </div>
  );
}

function OryonDrawingRow({
  drawing,
  selected,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDelete,
}: {
  drawing: OryonDrawing;
  selected: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const dict = useDict();
  const S = dict.oryon.drawings;
  const Icon = TYPE_ICONS[drawing.type];
  const typeLabel = S[TYPE_LABEL_KEYS[drawing.type]];

  return (
    <li>
      <div
        data-testid={`oryon-drawing-row-${drawing.type}`}
        data-selected={selected || undefined}
        className={cn(
          "flex items-center gap-1.5 border-b border-border/60 px-2 py-1.5",
          selected ? "bg-accent/10" : "hover:bg-surface-raised",
          !drawing.visible && "opacity-50",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-label={`${typeLabel}${drawing.label !== null ? ` - ${drawing.label}` : ""}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-xs text-foreground">
            {drawing.type === "text" && drawing.text !== "" ? drawing.text.slice(0, 24) : typeLabel}
          </span>
          {drawing.locked ? <Lock className="size-3 shrink-0 text-warning" aria-hidden /> : null}
        </button>
        <div className="flex shrink-0 items-center">
          <OryonIconButton
            icon={drawing.visible ? Eye : EyeOff}
            label={drawing.visible ? S.hideHint : S.showHint}
            onClick={onToggleVisible}
            testid={`oryon-drawing-hide-${drawing.id.slice(0, 8)}`}
            className="size-6"
          />
          <OryonIconButton
            icon={drawing.locked ? Lock : LockOpen}
            label={drawing.locked ? S.unlockHint : S.lockHint}
            active={drawing.locked}
            onClick={onToggleLock}
            testid={`oryon-drawing-lock-${drawing.id.slice(0, 8)}`}
            className="size-6"
          />
          <OryonIconButton
            icon={Trash2}
            label={S.deleteHint}
            onClick={onDelete}
            testid={`oryon-drawing-delete-${drawing.id.slice(0, 8)}`}
            className="size-6"
          />
        </div>
      </div>
    </li>
  );
}

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

/** Compact style editor for the selected object (spec §11). */
function OryonDrawingStyleEditor({ drawing, store }: { drawing: OryonDrawing; store: OryonDrawingStore }) {
  const dict = useDict();
  const S = dict.oryon.drawings;
  const [textDraft, setTextDraft] = React.useState<string | null>(null);

  const patchStyle = (patch: Partial<OryonDrawingStyle>): void => {
    if (drawing.locked) return;
    store.update(drawing.id, { style: { ...drawing.style, ...patch } });
  };

  // Local text state prevents a store commit per keystroke (spec §11).
  const commitText = (): void => {
    if (textDraft === null || drawing.type !== "text" || drawing.locked) return;
    const next = textDraft.slice(0, 200);
    if (next !== drawing.text) store.replace({ ...drawing, text: next });
    setTextDraft(null);
  };

  const supportsFill = drawingSupportsFill(drawing.type);

  return (
    <div
      data-testid="oryon-drawing-style-editor"
      className="shrink-0 border-t border-border bg-surface/60 px-3 py-2"
    >
      <p className="mb-1.5 font-heading text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {S.styleTitle}
      </p>

      <div className="mb-1.5 flex flex-wrap items-center gap-1" role="group" aria-label={S.colorLabel}>
        {COLOR_CHOICES.map(({ key, cssVar }) => (
          <button
            key={key}
            type="button"
            aria-label={`${S.colorLabel}: ${key}`}
            data-active={drawing.style.color === key || undefined}
            disabled={drawing.locked}
            onClick={() => patchStyle({ color: key, fill: supportsFill ? key : drawing.style.fill })}
            className={cn(
              "size-4 rounded-full border border-border",
              drawing.style.color === key && "ring-2 ring-ring ring-offset-1 ring-offset-background",
              drawing.locked && "cursor-not-allowed opacity-40",
            )}
            style={{ backgroundColor: `var(${cssVar})` }}
          />
        ))}
      </div>

      <div className="mb-1.5 flex items-center gap-2">
        <div role="group" aria-label={S.widthLabel} className="flex items-center gap-0.5">
          {WIDTH_CHOICES.map((width) => (
            <button
              key={width}
              type="button"
              aria-label={`${S.widthLabel}: ${width}`}
              data-active={drawing.style.width === width || undefined}
              disabled={drawing.locked}
              onClick={() => patchStyle({ width })}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-sm",
                drawing.style.width === width
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                drawing.locked && "cursor-not-allowed opacity-40",
              )}
            >
              <span className="rounded-full bg-current" style={{ width: width + 3, height: width + 1 }} />
            </button>
          ))}
        </div>

        <div role="group" aria-label={S.dashLabel} className="flex items-center gap-0.5">
          {DASH_CHOICES.map((dash) => (
            <button
              key={dash}
              type="button"
              aria-label={`${S.dashLabel}: ${S[`dash${dash[0]!.toUpperCase()}${dash.slice(1)}` as keyof typeof S]}`}
              data-active={drawing.style.dash === dash || undefined}
              disabled={drawing.locked}
              onClick={() => patchStyle({ dash })}
              className={cn(
                "flex h-6 items-center rounded-sm px-1.5 text-[10px]",
                drawing.style.dash === dash
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                drawing.locked && "cursor-not-allowed opacity-40",
              )}
            >
              {S[`dash${dash[0]!.toUpperCase()}${dash.slice(1)}` as keyof typeof S]}
            </button>
          ))}
        </div>
      </div>

      {supportsFill ? (
        <label className="mb-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          {S.fillLabel}
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.02}
            value={drawing.style.fillOpacity}
            disabled={drawing.locked}
            onChange={(event) => patchStyle({ fillOpacity: Number(event.target.value) })}
            className="h-1 flex-1 accent-[var(--accent)]"
            aria-label={S.fillLabel}
          />
          <span className="w-8 text-right font-mono tabular-nums">
            {Math.round(drawing.style.fillOpacity * 100)}%
          </span>
        </label>
      ) : null}

      {drawing.type === "text" ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            data-testid="oryon-drawing-text-input"
            value={textDraft ?? drawing.text}
            disabled={drawing.locked}
            placeholder={S.textPlaceholder}
            maxLength={200}
            onChange={(event) => setTextDraft(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitText();
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={S.textLabel}
          />
        </div>
      ) : null}
    </div>
  );
}


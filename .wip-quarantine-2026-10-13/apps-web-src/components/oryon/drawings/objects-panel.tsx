"use client";

import * as React from "react";
import {
  Eye,
  EyeOff,
  Lock,
  MoveUpRight,
  Square,
  Trash2,
  TrendingUp,
  Type,
  Unlock,
  Minus,
  MoveVertical,
  Sigma,
} from "lucide-react";

import type { DrawingObject, DrawingKind } from "@/components/oryon/drawings/types";
import {
  DRAWING_COLOR_TOKENS,
  hasFill,
  resolveDrawingColor,
} from "@/components/oryon/drawings/types";
import {
  clearDrawings,
  removeDrawing,
  selectDrawing,
  setDrawingLabel,
  setDrawingStyle,
  setDrawingText,
  toggleDrawingHidden,
  toggleDrawingLocked,
  useOryonDrawingSelection,
  useOryonDrawings,
} from "@/components/oryon/drawings/drawing-store";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { useTheme } from "next-themes";
import { useDict } from "@/i18n/i18n-provider";

/**
 * Drawing-objects management panel (Phase 2 §10) — hosted in the right
 * utility rail so the chart keeps its area. List + per-object actions +
 * a compact style editor for the selection + the honest persistence note.
 * Domain logic stays in the store; this is a thin synchronized view.
 */

const KIND_ICONS: Record<DrawingKind, React.ComponentType<{ className?: string; "aria-hidden"?: boolean; style?: React.CSSProperties }>> = {
  trendLine: TrendingUp,
  horizontalLine: Minus,
  verticalLine: MoveVertical,
  ray: MoveUpRight,
  rectangle: Square,
  text: Type,
  fibonacci: Sigma,
};

/** Compact palette — the semantic tokens a style may take (§11). */
const PALETTE = DRAWING_COLOR_TOKENS;
export function OryonObjectsPanel({ symbol }: { symbol: string }) {
  const dict = useDict().oryon;
  const { resolvedTheme } = useTheme();
  const objects = useOryonDrawings(symbol);
  const selectedId = useOryonDrawingSelection();
  const [confirmingClear, setConfirmingClear] = React.useState(false);
  const selected = objects.find((object) => object.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!confirmingClear) return;
    const timer = setTimeout(() => setConfirmingClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingClear]);

  // Canvas can't read CSS variables — resolve tokens per theme change
  // (same pattern as the chart engine's theme effect).
  const resolved = React.useMemo(() => {
    void resolvedTheme;
    return getChartTheme();
  }, [resolvedTheme]);

  if (objects.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
        <p className="text-sm font-semibold">{dict.drawing.objectsEmptyTitle}</p>
        <p className="text-xs text-muted-foreground">
          {dict.drawing.objectsEmptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
          {objects.length}/{300} {dict.drawing.objectsCountSuffix}
        </span>
        <button
          type="button"
          onClick={() => {
            if (confirmingClear) {
              clearDrawings(symbol);
              setConfirmingClear(false);
            } else {
              setConfirmingClear(true);
            }
          }}
          data-testid="oryon-objects-clear"
          className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors ${
            confirmingClear
              ? "bg-loss/15 text-loss"
              : "text-muted-foreground hover:bg-muted hover:text-loss"
          }`}
        >
          <Trash2 className="size-3" aria-hidden />
          {confirmingClear ? dict.drawing.deleteAllConfirm : dict.drawing.deleteAll}
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1" data-testid="oryon-objects-list">
        {objects.map((object) => (
          <ObjectsRow
            key={object.id}
            symbol={symbol}
            object={object}
            selected={object.id === selectedId}
            resolved={resolved}
            onSelect={() => selectDrawing(object.id)}
          />
        ))}
      </ul>

      {selected ? (
        <StyleEditor symbol={symbol} object={selected} resolved={resolved} />
      ) : null}

      <p className="border-t border-border px-3 py-2 text-[10px] leading-snug text-muted-foreground">
        {dict.drawing.persistenceNote}
      </p>
    </div>
  );
}

function ObjectsRow({
  symbol,
  object,
  selected,
  resolved,
  onSelect,
}: {
  symbol: string;
  object: DrawingObject;
  selected: boolean;
  resolved: ReturnType<typeof getChartTheme>;
  onSelect: () => void;
}) {
  const dict = useDict().oryon;
  const Icon = KIND_ICONS[object.kind];
  const color = resolveDrawingColor(object.style.color, resolved);

  return (
    <li>
      <div
        className={`group flex h-8 items-center gap-1.5 rounded px-1.5 ${
          selected ? "bg-accent/15" : "hover:bg-muted"
        } ${object.hidden ? "opacity-50" : ""}`}
        data-testid={`oryon-object-row-${object.id}`}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon className="size-3.5 shrink-0" aria-hidden style={{ color }} />
          <span className="truncate text-xs">
            {object.label ?? (object.kind === "text" && object.text ? object.text : dict.drawing[object.kind])}
          </span>
          {object.locked ? (
            <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => toggleDrawingHidden(symbol, object.id)}
          aria-label={object.hidden ? dict.drawing.show : dict.drawing.hide}
          aria-pressed={object.hidden}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {object.hidden ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => toggleDrawingLocked(symbol, object.id)}
          aria-label={object.locked ? dict.drawing.unlock : dict.drawing.lock}
          aria-pressed={object.locked}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {object.locked ? (
            <Lock className="size-3.5 text-warning" aria-hidden />
          ) : (
            <Unlock className="size-3.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => removeDrawing(symbol, object.id)}
          disabled={object.locked}
          aria-label={dict.drawing.delete}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-loss disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

function StyleEditor({
  symbol,
  object,
  resolved,
}: {
  symbol: string;
  object: DrawingObject;
  resolved: ReturnType<typeof getChartTheme>;
}) {
  const dict = useDict().oryon;
  // Text draft keyed by object id — React's documented "adjust state when a
  // prop changes" render pattern (no refs, no cascading effect).
  const [textState, setTextState] = React.useState<{ id: string; draft: string }>(
    { id: object.id, draft: object.kind === "text" ? object.text : "" },
  );
  if (textState.id !== object.id) {
    setTextState({ id: object.id, draft: object.kind === "text" ? object.text : "" });
  }
  const textDraft = textState.draft;

  const setColor = (token: (typeof PALETTE)[number]) => {
    setDrawingStyle(symbol, object.id, {
      ...object.style,
      color: token,
      // Shape fills follow the stroke token — one compact control (§11).
      ...(hasFill(object) ? { fill: token } : {}),
    });
  };

  return (
    <div className="border-t border-border px-3 py-2" data-testid="oryon-style-editor">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {dict.drawing.styleTitle}
        </span>
        <input
          type="text"
          value={object.label ?? ""}
          maxLength={200}
          placeholder={dict.drawing.labelPlaceholder}
          onChange={(event) => setDrawingLabel(symbol, object.id, event.target.value)}
          className="h-6 w-28 rounded border border-border bg-background px-1.5 text-[11px] text-foreground outline-none focus:border-accent"
        />
      </div>

      <div className="mb-1.5 flex flex-wrap gap-1">
        {PALETTE.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => setColor(token)}
            aria-label={`${dict.drawing.colorLabel}: ${token}`}
            aria-pressed={object.style.color === token}
            className={`size-4 rounded-full border transition-transform ${
              object.style.color === token
                ? "scale-110 border-foreground"
                : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: resolveDrawingColor(token, resolved) }}
          />
        ))}
      </div>

      <div className="mb-1.5 flex items-center gap-1">
        {[1, 2, 3].map((width) => (
          <button
            key={width}
            type="button"
            onClick={() => setDrawingStyle(symbol, object.id, { ...object.style, width: width as 1 | 2 | 3 })}
            aria-label={`${dict.drawing.widthLabel}: ${width}`}
            aria-pressed={object.style.width === width}
            className={`flex h-6 w-6 items-center justify-center rounded ${
              object.style.width === width ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <span
              className="block rounded bg-current"
              style={{ height: width, width: 12 }}
            />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {(["solid", "dashed", "dotted"] as const).map((dash) => (
          <button
            key={dash}
            type="button"
            onClick={() => setDrawingStyle(symbol, object.id, { ...object.style, dash })}
            aria-label={`${dict.drawing.dashLabel}: ${dict.drawing[`dash_${dash}` as const]}`}
            aria-pressed={object.style.dash === dash}
            className={`flex h-6 w-6 items-center justify-center rounded ${
              object.style.dash === dash ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <svg width="12" height="6" aria-hidden>
              <line
                x1="0"
                y1="3"
                x2="12"
                y2="3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray={dash === "dashed" ? "3 2" : dash === "dotted" ? "1 2" : undefined}
              />
            </svg>
          </button>
        ))}
      </div>

      {hasFill(object) ? (
        <label className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {dict.drawing.opacityLabel}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(object.style.fillOpacity * 100)}
            onChange={(event) =>
              setDrawingStyle(symbol, object.id, {
                ...object.style,
                fillOpacity: Number(event.target.value) / 100,
              })
            }
            className="h-1 flex-1 accent-[var(--accent)]"
          />
          <span className="w-8 text-right font-mono tabular-nums">
            {Math.round(object.style.fillOpacity * 100)}%
          </span>
        </label>
      ) : null}

      {object.kind === "text" ? (
        <div>
          <textarea
            value={textDraft}
            maxLength={500}
            rows={2}
            aria-label={dict.drawing.text}
            onChange={(event) => setTextState({ id: object.id, draft: event.target.value })}
            onBlur={() => {
              const draft = textDraft.trim();
              if (draft.length > 0 && draft !== object.text) {
                setDrawingText(symbol, object.id, draft);
              } else {
                setTextState({ id: object.id, draft: object.text }); // discard empty edit
              }
            }}
            className="w-full resize-none rounded border border-border bg-background px-1.5 py-1 font-mono text-[11px] text-foreground outline-none focus:border-accent"
          />
          <p className="mt-0.5 text-[10px] text-muted-foreground">{dict.drawing.textCommitHint}</p>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";

import { useTheme } from "next-themes";

import type { OryonDrawing, OryonLineDash } from "@cosmoz/shared";

import { getChartTheme } from "@/lib/utils/chart-theme";
import {
  OryonDrawingsPrimitive,
  type DrawingsPrimitiveDeps,
} from "@/lib/charting/oryon-drawing-primitive";
import type { OryonChartEngine } from "@/lib/charting/oryon-chart-engine";
import {
  DrawingInteractionController,
  type OryonDrawingTool,
} from "@/lib/oryon/drawings/interaction";
import {
  flushDrawingsForSymbol,
  loadDrawingsForSymbol,
  saveDrawingsForSymbol,
} from "@/lib/oryon/drawings/persistence";
import { newDrawingId } from "@/lib/oryon/drawings/store";
import type { ScreenPoint } from "@/lib/oryon/drawings/geometry";
import { useDict } from "@/i18n/i18n-provider";
import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { OryonDrawingObjectList } from "@/components/oryon/oryon-drawing-object-list";

/**
 * Oryon drawing layer — the ONLY component wiring the engine, the primitive,
 * the interaction controller and persistence together (spec §4).
 *
 * Mount contract: rendered by OryonPriceChart AFTER the engine mounted, with
 * `interactionHost` = the price-chart wrapper (an ancestor of the LWC canvas,
 * so capture-phase listeners run BEFORE the library's own and can preempt
 * panning when a drawing interaction is in play).
 *
 * Lifecycle: engine.attachDrawings(primitive) re-attaches across chart-type
 * switches; the store subscription repaints + debounced-persists on commits
 * only; instrument switch flushes + reloads (loadAll clears history — undo
 * never crosses instruments).
 */
export function OryonDrawingLayer({
  engine,
  interactionHost,
  symbol,
  digits,
  pipSize,
}: {
  engine: OryonChartEngine;
  /** Wrapper element that hosts the chart canvas — event capture point. */
  interactionHost: HTMLElement;
  /** Symbol of the data ACTUALLY displayed — persistence scope key. */
  symbol: string;
  digits: number;
  pipSize: string;
}) {
  const dict = useDict();
  const S = dict.oryon.drawings;
  const { store, activeTool, setActiveTool, listOpen } = useOryonDrawings();
  const { resolvedTheme } = useTheme();

  const primitiveRef = React.useRef<OryonDrawingsPrimitive | null>(null);
  const controllerRef = React.useRef<DrawingInteractionController | null>(null);
  const symbolRef = React.useRef(symbol);
  const digitsRef = React.useRef(digits);
  const pipSizeRef = React.useRef(pipSize);

  /** Editor state carries the symbol it opened under — a stale entry
   *  (instrument switched) is simply ignored, no reset render needed. */
  const [textEdit, setTextEdit] = React.useState<{ symbol: string; id: string; x: number; y: number } | null>(null);
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // ── default drawing factory (theme token keys — never hex) ─────────────────
  const makeDrawing = React.useCallback(
    (tool: OryonDrawingTool, a: { t: number; p: number }, b: { t: number; p: number } | null): OryonDrawing => {
      const now = Date.now();
      const id = newDrawingId();
      const style = {
        color: "accent",
        width: 2,
        dash: "solid" as OryonLineDash,
        fill: "accent",
        fillOpacity: 0.12,
        fontSize: 13,
      };
      switch (tool) {
        case "trend":
        case "ray":
        case "rect":
        case "measure":
        case "fib":
          return {
            id,
            type: tool,
            visible: true,
            locked: false,
            label: null,
            createdAt: now,
            updatedAt: now,
            style,
            a,
            b: b ?? a,
          };
        case "hline":
          return { id, type: "hline", visible: true, locked: false, label: null, createdAt: now, updatedAt: now, style, price: a.p };
        case "vline":
          return { id, type: "vline", visible: true, locked: false, label: null, createdAt: now, updatedAt: now, style, time: a.t };
        case "text":
          return { id, type: "text", visible: true, locked: false, label: null, createdAt: now, updatedAt: now, style, at: a, text: "" };
        case "cursor":
          throw new Error("makeDrawing: cursor is not a drawing tool");
      }
    },
    [],
  );

  // ── primitive + controller wiring (mount once) ─────────────────────────────
  React.useEffect(() => {
    const primitive = new OryonDrawingsPrimitive({
      getDrawings: () => store.getSnapshot().drawings,
      getSelectedId: () => store.getSnapshot().selectedId,
      getHoverId: () => controllerRef.current?.hoverId ?? null,
      getDraft: () => controllerRef.current?.draft ?? null,
      getPalette: () => {
        const theme = getChartTheme();
        return {
          accent: theme.accent,
          profit: theme.profit,
          loss: theme.loss,
          warning: theme.warning,
          "text-primary": theme.textPrimary,
          "cat-0": theme.indicatorPalette[0] ?? theme.accent,
          "cat-1": theme.indicatorPalette[1] ?? theme.accent,
          "cat-2": theme.indicatorPalette[2] ?? theme.accent,
          "cat-3": theme.indicatorPalette[3] ?? theme.accent,
          "cat-4": theme.indicatorPalette[4] ?? theme.accent,
          "cat-5": theme.indicatorPalette[5] ?? theme.accent,
          "cat-6": theme.indicatorPalette[6] ?? theme.accent,
        };
      },
      getMonoFont: () => getChartTheme().monoFont,
      getTextPrimary: () => getChartTheme().textPrimary,
      getAccent: () => getChartTheme().accent,
      getDigits: () => digitsRef.current,
      getPipSize: () => Number(pipSizeRef.current) || 0,
      conversions: engine.conversions,
    } satisfies DrawingsPrimitiveDeps);
    primitiveRef.current = primitive;
    engine.attachDrawings(primitive);

    const controller = new DrawingInteractionController({
      container: interactionHost,
      conversions: engine.conversions,
      store,
      getPlotRect: () => primitive.plotRect(),
      makeDrawing,
      callbacks: {
        onToolComplete: () => setActiveTool("cursor"),
        onTextEditRequest: (id, screen: ScreenPoint) => {
          setTextEdit({ symbol: symbolRef.current, id, x: screen.x, y: screen.y });
        },
        requestRedraw: () => primitive.requestRedraw(),
      },
    });
    controllerRef.current = controller;
    controller.attach();

    // Store commits → repaint + debounced persistence. ONE subscription.
    const unsubscribe = store.subscribe(() => {
      primitive.requestRedraw();
      saveDrawingsForSymbol(symbolRef.current, store.getSnapshot().drawings);
      forceRender(); // Text editor + root-level state stay in sync.
    });

    return () => {
      unsubscribe();
      controller.detach();
      controllerRef.current = null;
      engine.detachDrawings(primitive);
      primitiveRef.current = null;
      flushDrawingsForSymbol(symbolRef.current, store.getSnapshot().drawings);
    };
  }, [engine, interactionHost, store, makeDrawing, setActiveTool]);

  // ── per-symbol load / flush ────────────────────────────────────────────────
  React.useEffect(() => {
    const previous = symbolRef.current;
    if (previous !== symbol) {
      flushDrawingsForSymbol(previous, store.getSnapshot().drawings);
      symbolRef.current = symbol;
    }
    controllerRef.current?.cancelActive();
    store.loadAll(loadDrawingsForSymbol(symbol));
    primitiveRef.current?.requestRedraw();
  }, [symbol, store]);

  // digits/pipSize feed the primitive through refs (measure readout) —
  // synced here, outside render, with a repaint so labels re-render.
  React.useEffect(() => {
    digitsRef.current = digits;
    pipSizeRef.current = pipSize;
    primitiveRef.current?.requestRedraw();
  }, [digits, pipSize]);

  // ── tool sync ──────────────────────────────────────────────────────────────
  React.useEffect(() => {
    controllerRef.current?.setTool(activeTool);
  }, [activeTool]);

  // ── theme sync (tokens re-resolve at paint; just force a repaint) ──────────
  React.useEffect(() => {
    primitiveRef.current?.requestRedraw();
  }, [resolvedTheme]);

  // ── keyboard shortcuts (guarded against text editing) ──────────────────────
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const inTextField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inTextField) return; // Text editing owns the keyboard (spec §8).

      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        store.redo();
        return;
      }
      if (event.key === "Escape") {
        controllerRef.current?.cancelActive();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const selected = store.getSelected();
        if (selected !== null && !selected.locked) {
          event.preventDefault();
          store.remove(selected.id);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [store]);

  // ── text editor ────────────────────────────────────────────────────────────
  const activeTextEdit = textEdit !== null && textEdit.symbol === symbol ? textEdit : null;
  const editingDrawing =
    activeTextEdit !== null ? store.drawings.find((d) => d.id === activeTextEdit.id) ?? null : null;

  const closeTextEditor = React.useCallback(
    (commit: boolean) => {
      if (activeTextEdit === null) return;
      const textarea = textareaRef.current;
      const drawing = store.drawings.find((d) => d.id === activeTextEdit.id);
      if (commit && textarea !== null && drawing !== undefined && drawing.type === "text") {
        const nextText = textarea.value.slice(0, 200);
        if (nextText !== drawing.text) {
          store.replace({ ...drawing, text: nextText });
        }
      }
      if (!commit && drawing !== undefined && drawing.type === "text" && drawing.text === "") {
        // Cancelled before any content — do not leave an empty artifact.
        store.remove(drawing.id);
      }
      setTextEdit(null);
    },
    [activeTextEdit, store],
  );

  return (
    <div data-oryon-ui="" data-testid="oryon-drawing-layer" className="pointer-events-none absolute inset-0 z-10">
      {activeTextEdit !== null && editingDrawing !== null && editingDrawing.type === "text" ? (
        <div
          className="pointer-events-auto absolute z-30"
          style={{ left: Math.max(8, activeTextEdit.x - 90), top: Math.max(8, activeTextEdit.y - 16) }}
        >
          <textarea
            ref={textareaRef}
            data-testid="oryon-text-editor"
            defaultValue={editingDrawing.text}
            placeholder={S.textPlaceholder}
            rows={2}
            maxLength={200}
            autoFocus
            className="w-45 resize rounded-md border border-border bg-background/95 px-2 py-1 font-mono text-xs text-foreground shadow-lg outline-none focus-visible:outline-2 focus-visible:outline-ring"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                closeTextEditor(false);
              } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                closeTextEditor(true);
              }
            }}
            onBlur={() => closeTextEditor(true)}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            {S.textSave}: Ctrl+↵ · {S.textCancel}: Esc
          </p>
        </div>
      ) : null}

      {listOpen ? (
        <div className="pointer-events-auto absolute right-2 top-2 z-20">
          <OryonDrawingObjectList />
        </div>
      ) : null}
    </div>
  );
}

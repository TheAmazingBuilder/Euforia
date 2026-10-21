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
  ARROW_TOOL_DIR,
  type OryonDrawingTool,
} from "@/lib/oryon/drawings/interaction";
import { newDrawingId, type OryonDrawingStore } from "@/lib/oryon/drawings/store";
import type { ScreenPoint } from "@/lib/oryon/drawings/geometry";
import { useDict } from "@/i18n/i18n-provider";
import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { OryonDrawingPropertyEditor } from "@/components/oryon/oryon-drawing-editor";

/**
 * Oryon drawing layer — the ONLY component wiring the engine, the primitive
 * and the interaction controller together (Phase 2 spec §4 + Phase 7 §7).
 *
 * Phase 7 ownership: the store arrives as a PROP — the per-symbol store the
 * registry handed to the price chart for the symbol ACTUALLY displayed
 * (two panels on one instrument share one store; different instruments
 * never see each other's drawings). Persistence is the registry's job; this
 * layer renders and interacts.
 *
 * Active-panel gating: `interactive` marks this panel as the workspace's
 * active chart. The controller refuses to START interactions on inactive
 * panels (the first click activates — it never draws); keyboard shortcuts
 * run only here, so two panels can never both consume
 * the same Ctrl+Z. In-progress gestures always complete.
 *
 * Lifecycle: engine.attachDrawings(primitive) re-attaches across chart-type
 * switches; store swaps (instrument change) rebuild the wiring through the
 * same effect; commits repaint via the store subscription.
 */
export function OryonDrawingLayer({
  engine,
  interactionHost,
  store,
  symbol,
  digits,
  pipSize,
  interactive,
}: {
  engine: OryonChartEngine;
  /** Wrapper element that hosts the chart canvas — event capture point. */
  interactionHost: HTMLElement;
  /** The panel's drawing store (per displayed symbol — see the registry). */
  store: OryonDrawingStore;
  /** Symbol of the data ACTUALLY displayed — scopes the text editor. */
  symbol: string;
  digits: number;
  pipSize: string;
  /** True while this panel is the workspace's active chart. */
  interactive: boolean;
}) {
  const dict = useDict();
  const S = dict.oryon.drawings;
  const { activeTool, setActiveTool, bindActiveStore } = useOryonDrawings();
  const { resolvedTheme } = useTheme();

  const primitiveRef = React.useRef<OryonDrawingsPrimitive | null>(null);
  const controllerRef = React.useRef<DrawingInteractionController | null>(null);
  const symbolRef = React.useRef(symbol);
  const digitsRef = React.useRef(digits);
  const pipSizeRef = React.useRef(pipSize);
  const interactiveRef = React.useRef(interactive);

  /** Editor state carries the symbol it opened under — a stale entry
   *  (instrument switched) is simply ignored, no reset render needed. */
  const [textEdit, setTextEdit] = React.useState<{ symbol: string; id: string; x: number; y: number } | null>(null);
  /** Right-click property editor state (same symbol-scoping as textEdit). */
  const [ctxEdit, setCtxEdit] = React.useState<{ symbol: string; id: string; x: number; y: number } | null>(null);
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // ── default drawing factory (theme token keys — never hex) ─────────────────
  const makeDrawing = React.useCallback(
    (
      tool: OryonDrawingTool,
      a: { t: number; p: number },
      b: { t: number; p: number } | null,
      c?: { t: number; p: number } | null,
      points?: { t: number; p: number }[],
    ): OryonDrawing => {
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
      const two = (type: OryonDrawingTool): OryonDrawing =>
        ({ id, type, visible: true, locked: false, label: null, createdAt: now, updatedAt: now, style, a, b: b ?? a }) as OryonDrawing;
      switch (tool) {
        case "trend":
        case "ray":
        case "extended":
        case "rect":
        case "ellipse":
        case "measure":
        case "pricerange":
        case "daterange":
        case "fib":
        case "longpos":
        case "shortpos":
          return two(tool);
        case "fibext":
          return {
            id,
            type: "fibext",
            visible: true,
            locked: false,
            label: null,
            createdAt: now,
            updatedAt: now,
            style,
            a,
            b: b ?? a,
            c: c ?? b ?? a,
          };
        case "brush":
          return {
            id,
            type: "brush",
            visible: true,
            locked: false,
            label: null,
            createdAt: now,
            updatedAt: now,
            style,
            points: points !== undefined && points.length >= 2 ? points : [a, b ?? a],
          };
        case "arrow-up":
        case "arrow-down":
        case "arrow-left":
        case "arrow-right":
          return {
            id,
            type: "arrowmark",
            visible: true,
            locked: false,
            label: null,
            createdAt: now,
            updatedAt: now,
            style,
            at: a,
            dir: ARROW_TOOL_DIR[tool],
          };
        case "hline":
          return { id, type: "hline", visible: true, locked: false, label: null, createdAt: now, updatedAt: now, style, price: a.p };
        case "vline":
          return { id, type: "vline", visible: true, locked: false, label: null, createdAt: now, updatedAt: now, style, time: a.t };
        case "crossline":
          return { id, type: "crossline", visible: true, locked: false, label: null, createdAt: now, updatedAt: now, style, at: a };
        case "text":
          return { id, type: "text", visible: true, locked: false, label: null, createdAt: now, updatedAt: now, style, at: a, text: "" };
        case "cursor":
        case "cursor-cross":
        case "cursor-dot":
        case "eraser":
          throw new Error(`makeDrawing: ${tool} is not a drawing tool`);
      }
    },
    [],
  );

  // ── clone: same object shifted +4 bars (times UNSNAPPED — a translation,
  //    not an anchor placement); fallback = identical anchors when the
  //    original sits outside the loaded window. Locked clones arrive unlocked
  //  (a clone is an edit surface by definition). ─────────────────
  const cloneDrawing = React.useCallback(
    (drawing: OryonDrawing): OryonDrawing | null => {
      const now = Date.now();
      const shift = (t: number): number => {
        const logical = engine.conversions.timeSecToLogical(t);
        if (logical === null) return t;
        const shifted = engine.conversions.logicalToTimeSec(logical + 4);
        return shifted ?? t;
      };
      const base = {
        ...drawing,
        id: newDrawingId(),
        createdAt: now,
        updatedAt: now,
        locked: false,
      };
      switch (drawing.type) {
        case "trend":
        case "ray":
        case "rect":
        case "ellipse":
        case "measure":
        case "pricerange":
        case "daterange":
        case "fib":
        case "extended":
        case "longpos":
        case "shortpos":
          return { ...base, a: { ...drawing.a, t: shift(drawing.a.t) }, b: { ...drawing.b, t: shift(drawing.b.t) } } as OryonDrawing;
        case "fibext":
          return {
            ...base,
            a: { ...drawing.a, t: shift(drawing.a.t) },
            b: { ...drawing.b, t: shift(drawing.b.t) },
            c: { ...drawing.c, t: shift(drawing.c.t) },
          } as OryonDrawing;
        case "brush":
          return { ...base, points: drawing.points.map((pt) => ({ ...pt, t: shift(pt.t) })) } as OryonDrawing;
        case "vline":
          return { ...base, time: shift(drawing.time) } as OryonDrawing;
        case "crossline":
        case "text":
        case "arrowmark":
          return { ...base, at: { ...drawing.at, t: shift(drawing.at.t) } } as OryonDrawing;
        case "hline":
          return base; // Price line — a time shift is meaningless.
      }
    },
    [engine],
  );

  // ── primitive + controller wiring (per store — the store swaps when the
  //    displayed symbol changes; the registry hands a preloaded store) ────────
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
      canInteract: () => interactiveRef.current,
      callbacks: {
        onToolComplete: () => setActiveTool("cursor"),
        onTextEditRequest: (id, screen: ScreenPoint) => {
          setTextEdit({ symbol: symbolRef.current, id, x: screen.x, y: screen.y });
        },
        onDrawingContextMenu: (id, screen: ScreenPoint) => {
          setTextEdit(null); // One editor at a time.
          setCtxEdit({ symbol: symbolRef.current, id, x: screen.x, y: screen.y });
        },
        requestRedraw: () => primitive.requestRedraw(),
      },
    });
    controllerRef.current = controller;
    controller.attach();

    // Store commits → repaint (persistence lives in the registry).
    const unsubscribe = store.subscribe(() => {
      primitive.requestRedraw();
      forceRender(); // Text editor + root-level state stay in sync.
    });

    return () => {
      unsubscribe();
      controller.detach();
      controllerRef.current = null;
      engine.detachDrawings(primitive);
      primitiveRef.current = null;
    };
  }, [engine, interactionHost, store, makeDrawing, setActiveTool]);

  // ── refs synced outside render ─────────────────────────────────────────────
  React.useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  React.useEffect(() => {
    interactiveRef.current = interactive;
    // The ACTIVE panel publishes its store — the rail (undo/redo, object
    // list) operates on the drawings the user is actually looking at.
    if (interactive) bindActiveStore(store);
  }, [interactive, store, bindActiveStore]);

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

  // ── keyboard shortcuts (ACTIVE panel only — two panels must never both
  //    consume the same Ctrl+Z; guarded against text editing) ─────────────────
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!interactiveRef.current) return;
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

      {ctxEdit !== null && ctxEdit.symbol === symbol ? (
        <OryonDrawingPropertyEditor
          store={store}
          drawingId={ctxEdit.id}
          x={ctxEdit.x}
          y={ctxEdit.y}
          onClone={(drawing) => {
            const clone = cloneDrawing(drawing);
            if (clone !== null) store.add(clone);
          }}
          onClose={() => setCtxEdit(null)}
        />
      ) : null}
    </div>
  );
}

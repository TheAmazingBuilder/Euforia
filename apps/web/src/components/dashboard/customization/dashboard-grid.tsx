"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  GripVertical,
  Settings2,
  Trash2,
} from "lucide-react";
import type { DashboardLayoutDocument, DashboardWidgetItem } from "@cosmoz/shared";

import { WIDGET_REGISTRY } from "@/lib/dashboard-customization/registry";
import { isConfigurable } from "@/lib/dashboard-customization/widget-configs";
import type { DashboardFilters } from "@cosmoz/shared";
import { cn } from "@/lib/utils";

import { widgetIcon } from "./widget-icons";
import { WidgetContent, type DashboardWidgetData } from "./widgets-renderer";

/**
 * The responsive dashboard grid (Phase 01 §6/§7/§14).
 *
 * Desktop (lg+): a real 12-column grid — each widget instance renders at
 * its configured width span and minimum height level (content always
 * grows past a level — nothing is clipped). Below lg the policy is a
 * single-column stack in the same order (mobile, tablet), so a desktop
 * layout is never destroyed on a narrow screen.
 *
 * Edit mode: HTML5 drag-and-drop reordering (drag by the grip — same
 * proven mechanics as the previous inline editor), pointer resize
 * handles on the widget's right/bottom edges, and a full keyboard path
 * (move up/down + width/height step buttons).
 */

/** Literal class map — Tailwind JIT needs every entry present in source. */
const SPAN_CLASSES: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  11: "lg:col-span-11",
  12: "lg:col-span-12",
};

/** Height levels — min-height semantics (content may exceed, never clip). */
const HEIGHT_CLASSES: Record<number, string> = {
  1: "",
  2: "lg:min-h-80",
  3: "lg:min-h-[28rem]",
  4: "lg:min-h-[40rem]",
};

/** Pixel window per height level for pointer resize snapping. */
const HEIGHT_LEVEL_PX = 160;

interface DashboardGridProps {
  layout: DashboardLayoutDocument;
  data: DashboardWidgetData;
  editing: boolean;
  /** The authoritative global filter context (Phase 03 §7) — forwarded to
   * the suite-fed widget renderers. */
  globalFilters?: DashboardFilters;
  /** True when at least one global filter is active — unaffected widgets
   * get an honest "not filtered" badge (Phase 03 §8, never a fake result). */
  showUnfilteredBadges?: boolean;
  onMoveTo: (instanceId: string, toIndex: number) => void;
  onMoveBy: (instanceId: string, direction: -1 | 1) => void;
  onResize: (instanceId: string, patch: { w?: number; h?: number }) => void;
  onHide: (instanceId: string) => void;
  onRemove: (instanceId: string) => void;
  /** Open the per-widget settings dialog (Phase 02 §6). */
  onOpenSettings: (instanceId: string) => void;
  /** Config-aware range changes (PNL_BAND chips write the widget config). */
  onConfigRange?: (instanceId: string, range: 7 | 30 | 90) => void;
}

export function DashboardGrid({
  layout,
  data,
  editing,
  globalFilters,
  showUnfilteredBadges = false,
  onMoveTo,
  onMoveBy,
  onResize,
  onHide,
  onRemove,
  onOpenSettings,
  onConfigRange,
}: DashboardGridProps) {
  const widgets = layout.widgets;
  const visible = widgets.filter((widget) => widget.visible);

  // ── Drag reorder (HTML5 DnD, previewed locally, committed on drop) ────────
  // The preview order spans the FULL widget array (hidden instances
  // included) so hidden slots flow with their visible neighbours instead
  // of being orphaned by a reorder.
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = React.useState<string[] | null>(null);
  const dragIdRef = React.useRef<string | null>(null);

  const fullOrder = previewOrder ?? widgets.map((widget) => widget.instanceId);
  const displayedVisible = fullOrder
    .map((id) => visible.find((widget) => widget.instanceId === id))
    .filter((widget): widget is DashboardWidgetItem => Boolean(widget));

  const handleDragStart = React.useCallback(
    (instanceId: string) => {
      dragIdRef.current = instanceId;
      setDraggingId(instanceId);
      setPreviewOrder(widgets.map((widget) => widget.instanceId));
    },
    [widgets],
  );

  const handleDragOver = React.useCallback(
    (overId: string) => {
      const dragId = dragIdRef.current;
      if (!dragId || dragId === overId) return;
      setPreviewOrder((current) => {
        const source = current ?? widgets.map((widget) => widget.instanceId);
        const from = source.indexOf(dragId);
        const to = source.indexOf(overId);
        if (from < 0 || to < 0) return current;
        const next = [...source];
        next.splice(to, 0, ...next.splice(from, 1));
        return next.join() === source.join() ? current : next;
      });
    },
    [widgets],
  );

  const commitDrag = React.useCallback(() => {
    const dragId = dragIdRef.current;
    const order = previewOrder;
    dragIdRef.current = null;
    setDraggingId(null);
    setPreviewOrder(null);
    if (!dragId || !order) return;
    const toIndex = order.indexOf(dragId);
    const fromIndex = widgets.findIndex((widget) => widget.instanceId === dragId);
    if (toIndex >= 0 && toIndex !== fromIndex) {
      onMoveTo(dragId, toIndex);
    }
  }, [previewOrder, widgets, onMoveTo]);

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12"
      data-testid="dashboard-grid"
    >
      {displayedVisible.map((widget) => {
        const def = WIDGET_REGISTRY[widget.type];
        const Icon = widgetIcon(def.iconId);
        const index = displayedVisible.findIndex(
          (candidate) => candidate.instanceId === widget.instanceId,
        );
        const widthLocked = def.minW === def.maxW;
        const heightLocked = def.minH === def.maxH || !def.resizable;
        const configurable = isConfigurable(widget.type);
        return (
          <section
            key={widget.instanceId}
            data-widget={widget.type}
            data-testid={`dashboard-widget-${widget.type.toLowerCase()}`}
            aria-label={def.name}
            draggable={editing}
            onDragStart={() => handleDragStart(widget.instanceId)}
            onDragOver={(event) => {
              event.preventDefault();
              handleDragOver(widget.instanceId);
            }}
            onDrop={(event) => event.preventDefault()}
            onDragEnd={commitDrag}
            className={cn(
              // min-w-0: grid items default to min-width:auto — without it,
              // widgets with decorative negative-inset bleeds (risk gauge
              // tick, heatmap rail) would widen the section past its column
              // and inflate the page scroll width on mobile.
              "group/section relative min-w-0 rounded-xl",
              SPAN_CLASSES[widget.w] ?? "lg:col-span-12",
              HEIGHT_CLASSES[widget.h] ?? "",
              draggingId === widget.instanceId && "opacity-45",
              editing && "ring-offset-2",
            )}
          >
            {editing && (
              <WidgetEditTools
                widget={widget}
                label={def.name}
                index={index}
                count={displayedVisible.length}
                widthLocked={widthLocked}
                heightLocked={heightLocked}
                configurable={configurable}
                onMoveBy={onMoveBy}
                onResize={onResize}
                onHide={onHide}
                onRemove={onRemove}
                onOpenSettings={onOpenSettings}
              />
            )}
            {!editing && configurable && (
              <button
                type="button"
                aria-label={`Configure ${def.name}`}
                title={`Configure ${def.name}`}
                data-testid={`dashboard-widget-settings-${widget.type.toLowerCase()}`}
                onClick={() => onOpenSettings(widget.instanceId)}
                className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background/95 p-1.5 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring group-hover/section:opacity-100 sm:opacity-60 sm:hover:opacity-100"
              >
                <Settings2 className="size-3.5" aria-hidden="true" />
              </button>
            )}
            {editing && !widthLocked && (
              <ResizeHandle
                axis="x"
                label={`Resize ${def.name} width`}
                testId={`dashboard-resize-x-${widget.type.toLowerCase()}`}
                sectionSelector={`[data-widget="${widget.type}"]`}
                onDelta={(deltaPx, section) => {
                  const perCol = section.getBoundingClientRect().width / widget.w;
                  onResize(widget.instanceId, { w: widget.w + Math.round(deltaPx / perCol) });
                }}
              />
            )}
            {editing && !heightLocked && (
              <ResizeHandle
                axis="y"
                label={`Resize ${def.name} height`}
                testId={`dashboard-resize-y-${widget.type.toLowerCase()}`}
                sectionSelector={`[data-widget="${widget.type}"]`}
                onDelta={(deltaPx) => {
                  const levels = Math.round(deltaPx / HEIGHT_LEVEL_PX);
                  if (levels !== 0) onResize(widget.instanceId, { h: widget.h + levels });
                }}
              />
            )}
            {showUnfilteredBadges && !editing && def.filterSupport.support === "UNAFFECTED" && (
              <span
                className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-border bg-background/95 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur"
                data-testid={`dashboard-widget-unfiltered-${widget.type.toLowerCase()}`}
                title={def.filterSupport.reason}
              >
                <EyeOff className="size-3" aria-hidden="true" />
                Not filtered
              </span>
            )}
            <WidgetContent
              type={widget.type}
              data={data}
              config={widget.config}
              globalFilters={globalFilters}
              onRangeChange={
                onConfigRange && widget.type === "PNL_BAND"
                  ? (range) => onConfigRange(widget.instanceId, range)
                  : undefined
              }
            />
            {editing && (
              <span className="pointer-events-none absolute -top-3 left-4 z-10 inline-flex items-center gap-1 rounded-md border border-border bg-background/95 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur">
                <Icon className="size-3" aria-hidden="true" />
                {def.name}
              </span>
            )}
          </section>
        );
      })}
      {editing && visible.length === 0 && (
        <div
          className="rounded-xl border border-dashed border-border py-16 text-center lg:col-span-12"
          data-testid="dashboard-grid-empty"
        >
          <p className="text-sm font-medium">This layout is empty.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add widgets from the library, or apply a template from the layouts manager.
          </p>
        </div>
      )}
    </div>
  );
}

/** Edit-mode tool chip floating over a widget: grip, move, size, hide, remove. */
function WidgetEditTools({
  widget,
  label,
  index,
  count,
  widthLocked,
  heightLocked,
  configurable,
  onMoveBy,
  onResize,
  onHide,
  onRemove,
  onOpenSettings,
}: {
  widget: DashboardWidgetItem;
  label: string;
  index: number;
  count: number;
  widthLocked: boolean;
  heightLocked: boolean;
  configurable: boolean;
  onMoveBy: (instanceId: string, direction: -1 | 1) => void;
  onResize: (instanceId: string, patch: { w?: number; h?: number }) => void;
  onHide: (instanceId: string) => void;
  onRemove: (instanceId: string) => void;
  onOpenSettings: (instanceId: string) => void;
}) {
  const def = WIDGET_REGISTRY[widget.type];
  const key = widget.type.toLowerCase();
  const toolButton =
    "rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:pointer-events-none disabled:opacity-30";
  return (
    <div
      className="absolute -top-3 right-4 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-background/95 px-1 py-0.5 shadow-sm backdrop-blur"
      data-testid={`dashboard-widget-tools-${key}`}
    >
      <span
        className="flex cursor-grab items-center px-0.5 text-muted-foreground active:cursor-grabbing"
        title={`Drag to reorder ${label}`}
        data-testid={`dashboard-widget-grip-${key}`}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </span>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        aria-label={`Move ${label} up`}
        data-testid={`dashboard-widget-up-${key}`}
        disabled={index === 0}
        onClick={() => onMoveBy(widget.instanceId, -1)}
        className={toolButton}
      >
        <ChevronUp className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        data-testid={`dashboard-widget-down-${key}`}
        disabled={index === count - 1}
        onClick={() => onMoveBy(widget.instanceId, 1)}
        className={toolButton}
      >
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
      {def.resizable && (
        <>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          {!widthLocked && (
            <>
              <button
                type="button"
                aria-label={`Make ${label} narrower`}
                data-testid={`dashboard-widget-narrower-${key}`}
                disabled={widget.w <= def.minW}
                onClick={() => onResize(widget.instanceId, { w: widget.w - 1 })}
                className={toolButton}
              >
                <span aria-hidden="true" className="px-0.5 text-[10px] font-semibold">W−</span>
              </button>
              <button
                type="button"
                aria-label={`Make ${label} wider`}
                data-testid={`dashboard-widget-wider-${key}`}
                disabled={widget.w >= def.maxW}
                onClick={() => onResize(widget.instanceId, { w: widget.w + 1 })}
                className={toolButton}
              >
                <span aria-hidden="true" className="px-0.5 text-[10px] font-semibold">W+</span>
              </button>
            </>
          )}
          {!heightLocked && (
            <>
              <button
                type="button"
                aria-label={`Make ${label} shorter`}
                data-testid={`dashboard-widget-shorter-${key}`}
                disabled={widget.h <= def.minH}
                onClick={() => onResize(widget.instanceId, { h: widget.h - 1 })}
                className={toolButton}
              >
                <span aria-hidden="true" className="px-0.5 text-[10px] font-semibold">H−</span>
              </button>
              <button
                type="button"
                aria-label={`Make ${label} taller`}
                data-testid={`dashboard-widget-taller-${key}`}
                disabled={widget.h >= def.maxH}
                onClick={() => onResize(widget.instanceId, { h: widget.h + 1 })}
                className={toolButton}
              >
                <span aria-hidden="true" className="px-0.5 text-[10px] font-semibold">H+</span>
              </button>
            </>
          )}
        </>
      )}
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      {configurable && (
        <button
          type="button"
          aria-label={`Configure ${label}`}
          title="Configure this widget"
          data-testid={`dashboard-widget-settings-${key}`}
          onClick={() => onOpenSettings(widget.instanceId)}
          className={toolButton}
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        aria-label={`Hide ${label}`}
        title="Hide - keeps its place and settings"
        data-testid={`dashboard-widget-hide-${key}`}
        onClick={() => onHide(widget.instanceId)}
        className={toolButton}
      >
        <EyeOff className="size-3.5" aria-hidden="true" />
      </button>
      {def.removable && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          title="Remove from this layout"
          data-testid={`dashboard-widget-remove-${key}`}
          onClick={() => onRemove(widget.instanceId)}
          className={cn(toolButton, "hover:text-loss")}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * Pointer resize handle. Width: drags snap to column spans computed from
 * the section's own pixel-per-column. Height: drags snap to levels of
 * HEIGHT_LEVEL_PX. Keyboard users have the W/H step buttons above.
 */
function ResizeHandle({
  axis,
  label,
  testId,
  sectionSelector,
  onDelta,
}: {
  axis: "x" | "y";
  label: string;
  testId: string;
  sectionSelector: string;
  onDelta: (deltaPx: number, section: HTMLElement) => void;
}) {
  const originRef = React.useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    originRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = originRef.current;
      if (!origin) return;
      const section = event.currentTarget.closest(sectionSelector) as HTMLElement | null;
      if (!section) return;
      if (axis === "x") {
        onDelta(event.clientX - origin.x, section);
      } else {
        onDelta(event.clientY - origin.y, section);
      }
    },
    [axis, sectionSelector, onDelta],
  );

  const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    originRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // pointer already released — nothing to clean up
    }
  }, []);

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      data-testid={testId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        "absolute z-20 touch-none rounded-full bg-accent/70 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100",
        axis === "x"
          ? "-right-1.5 top-1/2 h-10 w-2 -translate-y-1/2 cursor-col-resize"
          : "-bottom-1.5 left-1/2 h-2 w-10 -translate-x-1/2 cursor-row-resize",
      )}
    />
  );
}

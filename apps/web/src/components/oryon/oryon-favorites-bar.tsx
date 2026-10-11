"use client";

import * as React from "react";

import { GripHorizontal, Star } from "lucide-react";

import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { ORYON_TOOL_ICONS } from "@/components/oryon/oryon-tool-icons";
import type { OryonDrawingTool } from "@/lib/oryon/drawings/interaction";
import {
  ORYON_TOOL_GROUPS,
  type OryonCatalogToolId,
} from "@/lib/oryon/tools/catalog";
import type { oryonDict } from "@/i18n/dictionaries/en/oryon";

type RailLabelKey = keyof typeof oryonDict.rail;

/** Tool → rail-dictionary label key (single static lookup). */
const TOOL_LABEL_KEYS: ReadonlyMap<OryonCatalogToolId, RailLabelKey> = new Map(
  ORYON_TOOL_GROUPS.flatMap((group) =>
    group.tools.map((t) => [t.tool, t.labelKey] as const),
  ),
);

/**
 * Oryon floating favorites bar — the TradingView-style draggable toolbar
 * OVER the chart grid (workspace-level: one instance, always above the
 * ACTIVE chart's interactions).
 *
 * Placement contract (the user's explicit request): the bar renders at the
 * PERSISTED position and can be dragged anywhere by its grip — the grab
 * offset is kept so the grab point never jumps — and the position is
 * re-clamped INSIDE the chart area at every render + on drag end, so a
 * stored position from a larger viewport can never strand it off-screen.
 *
 * Interaction isolation: the root carries `data-oryon-ui` — the drawing
 * interaction controller's capture-phase listeners ignore every event
 * inside (no accidental drawings), and the grip stops pointerdown
 * propagation so charts beneath never activate mid-drag.
 *
 * Persistence: position + visibility + the favorites list ride the
 * validated ui-prefs envelope (debounced 300 ms, flushed on unmount).
 * Empty favorites → an honest hint, never an empty husk.
 */
export function OryonFavoritesBar({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  const dict = useDict();
  const S = dict.oryon.rail;
  const {
    favorites,
    activeTool,
    setActiveTool,
    favoritesBarVisible,
    favoritesBarPos,
    setFavoritesBarPos,
  } = useOryonDrawings();

  const barRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  // Clamp the PERSISTED position against the current container (viewport
  // changes, grid changes) — render-time reconciliation, no state churn.
  const [clamped, setClamped] = React.useState(favoritesBarPos);
  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const rect = container.getBoundingClientRect();
    const width = barRef.current?.offsetWidth ?? 0;
    const x = Math.min(Math.max(favoritesBarPos.x, 4), Math.max(rect.width - width - 4, 4));
    const y = Math.min(Math.max(favoritesBarPos.y, 4), Math.max(rect.height - 40, 4));
    setClamped({ x, y });
  }, [favoritesBarPos, containerRef]);

  const onGripPointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      const bar = barRef.current;
      if (bar === null) return;
      event.preventDefault();
      event.stopPropagation();
      const barRect = bar.getBoundingClientRect();
      // Exact grab offset — the bar follows the pointer 1:1, no jump.
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - barRect.left,
        offsetY: event.clientY - barRect.top,
      };
      bar.setPointerCapture(event.pointerId);
    },
    [],
  );

  const onGripPointerMove = React.useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      const bar = barRef.current;
      const container = containerRef.current;
      if (drag === null || drag.pointerId !== event.pointerId || bar === null || container === null) return;
      const containerRect = container.getBoundingClientRect();
      const width = bar.offsetWidth;
      const height = bar.offsetHeight;
      const x = event.clientX - containerRect.left - drag.offsetX;
      const y = event.clientY - containerRect.top - drag.offsetY;
      setClamped({
        x: Math.min(Math.max(x, 4), Math.max(containerRect.width - width - 4, 4)),
        y: Math.min(Math.max(y, 4), Math.max(containerRect.height - height - 4, 4)),
      });
    },
    [containerRef],
  );

  const onGripPointerUp = React.useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      const bar = barRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      try {
        bar?.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer already released — the commit below is unaffected.
      }
      // Commit the FINAL position (the clamped state is the truth).
      setFavoritesBarPos(clamped);
    },
    [clamped, setFavoritesBarPos],
  );

  if (!favoritesBarVisible) return null;

  return (
    <div
      ref={barRef}
      data-oryon-ui=""
      data-testid="oryon-favorites-bar"
      role="toolbar"
      aria-label={S.favoritesBarLabel}
      onPointerMove={onGripPointerMove}
      onPointerUp={onGripPointerUp}
      onPointerCancel={onGripPointerUp}
      className="pointer-events-auto absolute z-20 flex max-w-[calc(100%-8px)] items-center gap-0.5 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
      style={{ left: clamped.x, top: clamped.y }}
    >
      <button
        type="button"
        aria-label={S.favoritesBarLabel}
        data-testid="oryon-favorites-grip"
        onPointerDown={onGripPointerDown}
        className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-ring"
      >
        <GripHorizontal className="size-4" aria-hidden />
      </button>
      <div className="h-5 w-px shrink-0 bg-border" aria-hidden />

      {favorites.length === 0 ? (
        <span className="flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground">
          <Star className="size-3" aria-hidden />
          {S.favoritesEmpty}
        </span>
      ) : (
        favorites.map((tool) => (
          <FavoriteButton key={tool} tool={tool} armed={activeTool === tool} onSelect={setActiveTool} />
        ))
      )}
    </div>
  );
}

function FavoriteButton({
  tool,
  armed,
  onSelect,
}: {
  tool: OryonCatalogToolId;
  armed: boolean;
  onSelect: (tool: OryonDrawingTool) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.rail;
  const Icon = ORYON_TOOL_ICONS[tool];
  const label = S[TOOL_LABEL_KEYS.get(tool) ?? "toolsGroup"];
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={armed}
      data-testid={`oryon-favorite-${tool}`}
      title={label}
      onClick={() => onSelect(tool)}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        armed
          ? "bg-accent/15 text-accent"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

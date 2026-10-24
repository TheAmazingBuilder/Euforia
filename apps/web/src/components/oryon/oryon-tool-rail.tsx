"use client";

import * as React from "react";

import { ChevronDown, ChevronUp, List, Redo2, Star, Trash2, Undo2 } from "lucide-react";

import { toast } from "sonner";

import { useDict } from "@/i18n/i18n-provider";
import type { OryonDrawing } from "@cosmoz/shared";
import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { OryonIconButton } from "@/components/oryon/oryon-icon-button";
import { OryonToolFlyout } from "@/components/oryon/oryon-tool-flyout";
import { ORYON_TOOL_ICONS } from "@/components/oryon/oryon-tool-icons";
import type { OryonDrawingTool } from "@/lib/oryon/drawings/interaction";
import {
  ORYON_TOOL_GROUPS,
  ORYON_TOOL_SHORTCUTS,
  shortcutMatches,
  toolGroupOf,
  type OryonToolGroup,
} from "@/lib/oryon/tools/catalog";
import { cn } from "@/lib/utils";

/**
 * Oryon left tool rail - Drawing toolbar v2/v4 (TradingView parity).
 *
 * Structure (catalog-driven - lib/oryon/tools/catalog.ts): grouped flyouts
 * (Cursors · Trend line tools · Fibonacci · Forecasting & measurement ·
 * Shapes · Text & notes), each rendered as a SPLIT control - the icon arms
 * the group's last-used tool (TV behavior), the caret opens the flyout
 * menu. The flyout rows arm tools and carry a favorite star; favorites
 * surface in the floating bar over the chart (oryon-favorites-bar.tsx).
 * The rail bottom hosts history (undo/redo), the OBJECTS dock toggle (the
 * manager lives on the RIGHT utility rail - v4), the Show-favorites toggle
 * and Remove-objects (clear-all, undoable).
 *
 * Scroll navigation (v4): NO visible scrollbar - when the pointer hovers
 * the rail and more tools exist above/below the viewport, a small
 * directional arrow fades in at that edge (TradingView behavior); clicking
 * scrolls smoothly. Arrows appear only in the direction that can actually
 * move, and never block tools while hidden (pointer-events pass through).
 *
 * Keyboard: catalog shortcuts (Alt+T/H/V/F/R/E) arm tools globally - the
 * ACTIVE panel's interaction layer consumes them; text fields own the
 * keyboard (the same guard as the drawing layer).
 *
 * State discipline: tool + favorites live in the drawings context;
 * undo/redo counts subscribe to the bound store - commits are rare,
 * pointer drags never re-render this rail.
 */
export function OryonToolRail({
  objectsOpen,
  onOpenObjects,
}: {
  /** Whether the objects dock (right utility rail) currently shows. */
  objectsOpen: boolean;
  /** Opens the objects dock - the manager itself lives on the right rail. */
  onOpenObjects: () => void;
}) {
  const dict = useDict();
  const S = dict.oryon.rail;
  const {
    activeStore,
    activeTool,
    setActiveTool,
    favoritesBarVisible,
    setFavoritesBarVisible,
  } = useOryonDrawings();

  const snapshot = React.useSyncExternalStore(
    activeStore?.subscribe ?? noopSubscribe,
    activeStore?.getSnapshot ?? (() => EMPTY_DRAWING_SNAPSHOT),
  );
  const hasObjects = snapshot.drawings.length > 0;

  const [openGroup, setOpenGroup] = React.useState<string | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);

  // ── scroll navigation state (arrows, no scrollbar) ────────────────────────
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [navState, setNavState] = React.useState({ up: false, down: false });

  const updateNavState = React.useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const up = el.scrollTop > 2;
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setNavState((prev) => (prev.up === up && prev.down === down ? prev : { up, down }));
  }, []);

  React.useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (scroller === null) return;
    updateNavState();
    // Both resizes matter: the viewport (rail height) and the content
    // (flyout count / favorites) each can create or remove overflow.
    const observer = new ResizeObserver(updateNavState);
    observer.observe(scroller);
    if (content !== null) observer.observe(content);
    return () => observer.disconnect();
  }, [updateNavState]);

  const onNavClick = React.useCallback((direction: -1 | 1) => {
    const el = scrollRef.current;
    if (el === null) return;
    const step = Math.max(el.clientHeight * 0.7, 120);
    el.scrollBy({ top: direction * step, behavior: "smooth" });
  }, []);

  /** Last-used tool per group - the icon arms it (TV behavior). Derived
   *  during render (the sanctioned adjust-state-while-rendering pattern -
   *  NOT an effect): a tool change is a state-to-state derivation. */
  const [lastUsed, setLastUsed] = React.useState<Partial<Record<OryonToolGroup["id"], OryonDrawingTool>>>({});
  const [prevTool, setPrevTool] = React.useState<OryonDrawingTool>(activeTool);
  if (prevTool !== activeTool) {
    setPrevTool(activeTool);
    const group = toolGroupOf(activeTool);
    if (group !== null) {
      setLastUsed((current) =>
        current[group.id] === activeTool ? current : { ...current, [group.id]: activeTool },
      );
    }
  }

  const selectTool = React.useCallback(
    (tool: OryonDrawingTool) => setActiveTool(tool),
    [setActiveTool],
  );

  // ── catalog keyboard shortcuts (Alt+T/H/V/F/R/E) ──────────────────────────
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey) return;
      const target = event.target;
      const inTextField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inTextField) return;
      for (const { shortcut, tool } of ORYON_TOOL_SHORTCUTS) {
        if (shortcutMatches(event, shortcut)) {
          event.preventDefault();
          setActiveTool(tool);
          return;
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setActiveTool]);

  const onClearAll = React.useCallback(() => {
    if (activeStore === null) return;
    const count = activeStore.getSnapshot().drawings.length;
    if (count === 0) return;
    // Locked drawings survive the clear (the store refuses to drop their
    // protection silently) - reported honestly in the toast.
    const locked = activeStore.getSnapshot().drawings.filter((d) => d.locked).length;
    activeStore.clearAll();
    setConfirmClear(false);
    toast.success(`${S.clearAllHint} - ${count}`, {
      testId: "oryon-drawings-clear-toast",
    });
    if (locked > 0) {
      toast.warning(`${locked} locked`, { testId: "oryon-drawings-clear-locked-toast" });
    }
  }, [activeStore, S.clearAllHint]);

  return (
    <nav
      aria-label={S.toolsGroup}
      data-testid="oryon-tool-rail"
      className="group/rail relative hidden w-11 shrink-0 flex-col border-r border-border bg-surface md:flex"
    >
      {/* Scroll body - scrollbar deliberately hidden; the hover arrows
          below are the ONLY navigation chrome (TradingView parity). */}
      <div
        ref={scrollRef}
        onScroll={updateNavState}
        className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={contentRef} className="flex w-full flex-col items-center gap-1">
          {ORYON_TOOL_GROUPS.map((group) => (
            <OryonGroupControl
              key={group.id}
              group={group}
              lastUsed={lastUsed[group.id] ?? group.representative}
              activeTool={activeTool}
              onSelect={selectTool}
              open={openGroup === group.id}
              onOpenChange={(next) => setOpenGroup(next ? group.id : null)}
            />
          ))}

          <RailDivider />

          <OryonIconButton
            icon={Undo2}
            label={S.undoHint}
            disabled={activeStore === null || !activeStore.canUndo}
            onClick={() => activeStore?.undo()}
            testid="oryon-drawing-undo"
          />
          <OryonIconButton
            icon={Redo2}
            label={S.redoHint}
            disabled={activeStore === null || !activeStore.canRedo}
            onClick={() => activeStore?.redo()}
            testid="oryon-drawing-redo"
          />
          <OryonIconButton
            icon={List}
            label={S.listHint}
            active={objectsOpen}
            disabled={activeStore === null || (!hasObjects && !objectsOpen)}
            onClick={onOpenObjects}
            testid="oryon-drawing-list-toggle"
          />

          <RailDivider />

          <OryonIconButton
            icon={Star}
            label={S.favoritesHint}
            active={favoritesBarVisible}
            onClick={() => setFavoritesBarVisible(!favoritesBarVisible)}
            testid="oryon-favorites-toggle"
          />

          {confirmClear ? (
            <div className="flex flex-col items-center gap-0.5" data-oryon-ui="">
              <button
                type="button"
                data-testid="oryon-drawings-clear-confirm"
                onClick={onClearAll}
                className="rounded-sm bg-loss/15 px-1 py-0.5 text-[9px] font-semibold leading-none text-loss hover:bg-loss/25"
              >
                {dict.oryon.drawings.deleteAllConfirm.split("-")[0]?.trim() ?? "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-sm px-1 py-0.5 text-[9px] leading-none text-muted-foreground hover:text-foreground"
              >
                {dict.oryon.drawings.deleteAllKeep}
              </button>
            </div>
          ) : (
            <OryonIconButton
              icon={Trash2}
              label={S.clearAllHint}
              disabled={activeStore === null || !hasObjects}
              onClick={() => setConfirmClear(true)}
              testid="oryon-drawings-clear"
            />
          )}
        </div>
      </div>

      {/* Hover navigation arrows - only the direction that can actually
          scroll, only while the pointer is over the rail. */}
      <RailNavArrow
        direction="up"
        visible={navState.up}
        label={S.navUpHint}
        onClick={() => onNavClick(-1)}
      />
      <RailNavArrow
        direction="down"
        visible={navState.down}
        label={S.navDownHint}
        onClick={() => onNavClick(1)}
      />
    </nav>
  );
}

/**
 * One directional navigation arrow - pinned to the rail's top/bottom edge,
 * revealed on rail hover (plus keyboard focus), pointer-transparent while
 * hidden so tools beneath stay clickable.
 */
function RailNavArrow({
  direction,
  visible,
  label,
  onClick,
}: {
  direction: "up" | "down";
  visible: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={`oryon-rail-nav-${direction}`}
      onClick={onClick}
      className={cn(
        "absolute left-1/2 z-20 flex size-6 -translate-x-1/2 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground opacity-0 shadow-md transition-opacity duration-150 hover:bg-surface-raised hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover/rail:pointer-events-auto pointer-events-none",
        visible ? "group-hover/rail:opacity-100" : "",
        direction === "up" ? "top-1" : "bottom-1",
      )}
    >
      {direction === "up" ? (
        <ChevronUp className="size-3.5" aria-hidden />
      ) : (
        <ChevronDown className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

/** Split group control: icon arms the last-used tool, caret opens the menu. */
function OryonGroupControl({
  group,
  lastUsed,
  activeTool,
  onSelect,
  open,
  onOpenChange,
}: {
  group: OryonToolGroup;
  lastUsed: OryonDrawingTool;
  activeTool: OryonDrawingTool;
  onSelect: (tool: OryonDrawingTool) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.rail;
  const Icon = ORYON_TOOL_ICONS[lastUsed] ?? ORYON_TOOL_ICONS[group.representative];
  const groupActive = group.tools.some((t) => t.tool === activeTool);
  const label =
    group.tools.find((t) => t.tool === lastUsed)?.labelKey ?? group.tools[0]!.labelKey;
  return (
    <div className="flex shrink-0 flex-col items-center">
      <OryonIconButton
        icon={Icon}
        label={S[label]}
        active={groupActive}
        onClick={() => onSelect(lastUsed)}
        testid={`oryon-tool-${group.id}`}
      />
      <OryonToolFlyout group={group} open={open} onOpenChange={onOpenChange} />
    </div>
  );
}

const EMPTY_DRAWING_SNAPSHOT = { drawings: [] as readonly OryonDrawing[], selectedId: null, version: 0 };
const noopSubscribe = () => () => {};

function RailDivider() {
  return <div className="my-1 h-px w-6 shrink-0 bg-border" aria-hidden />;
}

"use client";

import * as React from "react";

import { List, Redo2, Star, Trash2, Undo2 } from "lucide-react";

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

/**
 * Oryon left tool rail — Drawing toolbar v2 (TradingView parity).
 *
 * Structure (catalog-driven — lib/oryon/tools/catalog.ts): grouped flyouts
 * (Cursors · Trend line tools · Fibonacci · Forecasting & measurement ·
 * Shapes · Text & notes), each rendered as a SPLIT control — the icon arms
 * the group's last-used tool (TV behavior), the caret opens the flyout
 * menu. The flyout rows arm tools and carry a favorite star; favorites
 * surface in the floating bar over the chart (oryon-favorites-bar.tsx).
 * The rail bottom hosts history (undo/redo), the object list toggle, the
 * Show-favorites toggle and Remove-objects (clear-all, undoable).
 *
 * Keyboard: catalog shortcuts (Alt+T/H/V/F/R/E) arm tools globally — the
 * ACTIVE panel's interaction layer consumes them; text fields own the
 * keyboard (the same guard as the drawing layer).
 *
 * State discipline: tool + list + favorites live in the drawings context;
 * undo/redo counts subscribe to the bound store — commits are rare,
 * pointer drags never re-render this rail.
 */
export function OryonToolRail() {
  const dict = useDict();
  const S = dict.oryon.rail;
  const {
    activeStore,
    activeTool,
    setActiveTool,
    listOpen,
    setListOpen,
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

  /** Last-used tool per group — the icon arms it (TV behavior). Derived
   *  during render (the sanctioned adjust-state-while-rendering pattern —
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
    // protection silently) — reported honestly in the toast.
    const locked = activeStore.getSnapshot().drawings.filter((d) => d.locked).length;
    activeStore.clearAll();
    setConfirmClear(false);
    toast.success(`${S.clearAllHint} — ${count}`, {
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
      className="hidden w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-surface py-2 md:flex"
    >
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
        active={listOpen}
        disabled={activeStore === null || (!hasObjects && !listOpen)}
        onClick={() => setListOpen(!listOpen)}
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
            {dict.oryon.drawings.deleteAllConfirm.split("—")[0]?.trim() ?? "Confirm"}
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
    </nav>
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
    <div className="flex flex-col items-center">
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

"use client";

import * as React from "react";

import { Star } from "lucide-react";

import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { ORYON_TOOL_ICONS } from "@/components/oryon/oryon-tool-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OryonToolGroup } from "@/lib/oryon/tools/catalog";

/**
 * Oryon tool flyout - the TradingView-style grouped menu attached to a
 * rail group's caret: a section header, one row per tool (icon, label,
 * keyboard shortcut, favorite star) and select-armed semantics (row click
 * arms the tool AND closes; the star toggles WITHOUT closing - both are
 * explicit, nothing fires twice).
 *
 * A11y: role="menu" + menuitemradio rows (aria-checked = armed tool); the
 * star is a real button with its own label so keyboard users can favorite
 * without arming.
 */
export function OryonToolFlyout({
  group,
  open,
  onOpenChange,
}: {
  group: OryonToolGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.rail;
  const { activeTool, setActiveTool, toggleFavorite, isFavorite } = useOryonDrawings();

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        aria-label={`${S[group.labelKey]} - ${dict.oryon.panels.menuHint}`}
        data-testid={`oryon-tool-caret-${group.id}`}
        className="flex h-3.5 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <svg viewBox="0 0 8 6" className="size-2 fill-current" aria-hidden>
          <path d="M0 0h8L4 6z" />
        </svg>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={6}
        data-oryon-ui=""
        data-testid={`oryon-tool-menu-${group.id}`}
        className="w-64 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div role="menu" aria-label={S[group.labelKey]} className="max-h-[70vh] overflow-y-auto">
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {S[group.labelKey]}
          </div>
          {group.tools.map((def) => {
            const Icon = ORYON_TOOL_ICONS[def.tool];
            const armed = activeTool === def.tool;
            const favorite = isFavorite(def.tool);
            return (
              <div
                key={def.tool}
                role="menuitemradio"
                aria-checked={armed}
                tabIndex={-1}
                data-testid={`oryon-tool-item-${def.tool}`}
                onClick={() => {
                  setActiveTool(def.tool);
                  onOpenChange(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveTool(def.tool);
                    onOpenChange(false);
                  }
                }}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2 py-1.5 text-xs outline-none transition-colors",
                  armed ? "bg-primary/10 text-foreground" : "text-foreground/90 hover:bg-surface-raised",
                )}
              >
                <Icon className={cn("size-4 shrink-0", armed ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className="min-w-0 flex-1 truncate" title={S[def.labelKey] ?? undefined}>
                  {S[def.labelKey]}
                </span>
                {def.shortcutKey !== undefined && S[def.shortcutKey] ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{S[def.shortcutKey]}</span>
                ) : null}
                <button
                  type="button"
                  aria-label={favorite ? S.favoriteRemove : S.favoriteAdd}
                  aria-pressed={favorite}
                  data-testid={`oryon-tool-star-${def.tool}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavorite(def.tool);
                  }}
                  className={cn(
                    "shrink-0 rounded-sm p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    favorite ? "text-warning" : "text-muted-foreground/50 hover:text-foreground",
                  )}
                >
                  <Star className={cn("size-3.5", favorite && "fill-current")} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

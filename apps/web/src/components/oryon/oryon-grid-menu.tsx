"use client";

import * as React from "react";

import { Columns2, Grid2x2, Link2, Rows2, Square } from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { OryonGrid, OryonSyncSettings } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOryonWorkspaceConfig, useWorkspaceConfigSnapshot } from "@/components/oryon/oryon-workspace-context";
import { cn } from "@/lib/utils";

/**
 * Oryon grid menu (Phase 7 spec §5) — the chart-arrangement selector.
 * Four arrangements, the implemented set: single, side by side, stacked,
 * 2×2. Panel identities survive transitions (charts are not recreated);
 * missing panels are added with deterministic defaults and `single` keeps
 * the active chart. The trigger carries the current arrangement's icon.
 */

const GRID_ITEMS: readonly {
  value: OryonGrid;
  icon: LucideIcon;
  labelKey: "single" | "twoHorizontal" | "twoVertical" | "quad";
  hintKey: "singleHint" | "twoHorizontalHint" | "twoVerticalHint" | "quadHint";
  testid: string;
}[] = [
  { value: "single", icon: Square, labelKey: "single", hintKey: "singleHint", testid: "oryon-grid-item-single" },
  { value: "twoHorizontal", icon: Columns2, labelKey: "twoHorizontal", hintKey: "twoHorizontalHint", testid: "oryon-grid-item-twoHorizontal" },
  { value: "twoVertical", icon: Rows2, labelKey: "twoVertical", hintKey: "twoVerticalHint", testid: "oryon-grid-item-twoVertical" },
  { value: "quad", icon: Grid2x2, labelKey: "quad", hintKey: "quadHint", testid: "oryon-grid-item-quad" },
];

const GRID_TRIGGER_ICONS: Record<OryonGrid, LucideIcon> = {
  single: Square,
  twoHorizontal: Columns2,
  twoVertical: Rows2,
  quad: Grid2x2,
};

export function OryonGridMenu() {
  const dict = useDict();
  const S = dict.oryon.grids;
  const T = dict.oryon.toolbar;
  const { store } = useOryonWorkspaceConfig();
  const { session } = useWorkspaceConfigSnapshot();

  const TriggerIcon = GRID_TRIGGER_ICONS[session.grid];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={T.gridHint}
          data-testid="oryon-grid-trigger"
          data-active={session.grid !== "single" || undefined}
          className="size-8 rounded-md text-muted-foreground hover:text-foreground"
        >
          <TriggerIcon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{S.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={session.grid}
          onValueChange={(value) => store.setGrid(value as OryonGrid)}
        >
          {GRID_ITEMS.map((item) => (
            <DropdownMenuRadioItem
              key={item.value}
              value={item.value}
              data-testid={item.testid}
              className="gap-2 py-2"
            >
              <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-medium text-foreground">{S[item.labelKey]}</span>
                <span className="text-[11px] text-muted-foreground">{S[item.hintKey]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Oryon sync menu (Phase 7 spec §8) — four INDEPENDENT synchronization
 * features (time scale, crosshair, instrument, timeframe), each explained
 * in plain copy. Nothing is linked by default; enabling one never enables
 * another. The trigger carries an active state when ANY feature is on, and
 * the menu items expose their checked state programmatically (§15).
 */

const SYNC_ITEMS: readonly {
  key: keyof OryonSyncSettings;
  labelKey: "timeScale" | "crosshair" | "instrument" | "timeframe";
  hintKey: "timeScaleHint" | "crosshairHint" | "instrumentHint" | "timeframeHint";
  testid: string;
}[] = [
  { key: "timeScale", labelKey: "timeScale", hintKey: "timeScaleHint", testid: "oryon-sync-item-timeScale" },
  { key: "crosshair", labelKey: "crosshair", hintKey: "crosshairHint", testid: "oryon-sync-item-crosshair" },
  { key: "instrument", labelKey: "instrument", hintKey: "instrumentHint", testid: "oryon-sync-item-instrument" },
  { key: "timeframe", labelKey: "timeframe", hintKey: "timeframeHint", testid: "oryon-sync-item-timeframe" },
];

export function OryonSyncMenu() {
  const dict = useDict();
  const S = dict.oryon.sync;
  const T = dict.oryon.toolbar;
  const { store } = useOryonWorkspaceConfig();
  const { session } = useWorkspaceConfigSnapshot();

  const anyOn =
    session.sync.timeScale ||
    session.sync.crosshair ||
    session.sync.instrument ||
    session.sync.timeframe;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${T.syncHint} — ${anyOn ? S.on : S.off}`}
          data-testid="oryon-sync-trigger"
          data-active={anyOn || undefined}
          className={cn(
            "size-8 rounded-md",
            anyOn
              ? "bg-accent/12 text-accent hover:bg-accent/20 hover:text-accent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Link2 className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-72">
        <DropdownMenuLabel>
          <span className="block text-xs font-semibold text-foreground">{S.heading}</span>
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            {S.headingHint}
          </span>
        </DropdownMenuLabel>
        {SYNC_ITEMS.map((item) => {
          const enabled = session.sync[item.key];
          return (
            <DropdownMenuItem
              key={item.key}
              data-testid={item.testid}
              aria-checked={enabled}
              onSelect={() => store.setSync({ [item.key]: !enabled })}
              className="gap-2 py-2"
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border",
                  enabled ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {enabled ? (
                  <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
                    <path
                      d="M2.5 6.5L5 9L9.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-medium text-foreground">
                  {S[item.labelKey]}
                  <span
                    className={cn(
                      "ml-1.5 font-mono text-[10px]",
                      enabled ? "text-accent" : "text-muted-foreground",
                    )}
                  >
                    {enabled ? S.on : S.off}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">{S[item.hintKey]}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

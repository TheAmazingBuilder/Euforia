"use client";

import {
  Minus,
  MousePointer2,
  Ruler,
  Square,
  Type,
  TrendingUp,
} from "lucide-react";

import { useDict } from "@/i18n/i18n-provider";

import { OryonIconButton } from "@/components/oryon/oryon-icon-button";

/**
 * Oryon left tool rail — the visual foundation for the drawing tools of the
 * NEXT phases (Phase 1 spec §6B). Every slot is rendered with the real icon
 * system and honest tooltips, and every tool that does not exist yet is
 * DISABLED: no decorative button may suggest a working drawing interaction.
 * The two live crosshair controls (free / magnet) live in the toolbar where
 * the engine options actually are.
 */
export function OryonToolRail() {
  const dict = useDict();
  const S = dict.oryon.rail;

  return (
    <nav
      aria-label={S.toolsGroup}
      data-testid="oryon-tool-rail"
      className="hidden w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2 md:flex"
    >
      <OryonIconButton icon={MousePointer2} label={S.pointerHint} disabled testid="oryon-tool-pointer" />
      <OryonIconButton icon={TrendingUp} label={S.trendline} disabled testid="oryon-tool-trendline" />
      <OryonIconButton icon={Minus} label={S.hline} disabled testid="oryon-tool-hline" />

      <div className="my-1 h-px w-6 bg-border" aria-hidden />

      <OryonIconButton icon={Square} label={S.rect} disabled testid="oryon-tool-rect" />
      <OryonIconButton icon={Ruler} label={S.fib} disabled testid="oryon-tool-fib" />
      <OryonIconButton icon={Type} label={S.text} disabled testid="oryon-tool-text" />
      <OryonIconButton icon={Ruler} label={S.measure} disabled testid="oryon-tool-measure" />
    </nav>
  );
}

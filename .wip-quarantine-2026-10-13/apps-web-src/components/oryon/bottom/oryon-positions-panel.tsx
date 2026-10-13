"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, PanelBottom, ShieldOff } from "lucide-react";

import { useDict } from "@/i18n/i18n-provider";

interface OryonPositionsPanelProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * Oryon lower panel — the collapsed-by-default shell for the Phase-3
 * open-position visualization (docs/specs/oryon-prd.md §12). In Phase 1 it
 * integrates NOTHING: when opened it says so explicitly. It never renders a
 * fabricated position and carries no trading control (cahier de charge
 * Phase 1 §4 — "no mock MT5 position is represented as a real position").
 */
export function OryonPositionsPanel({ open, onToggle }: OryonPositionsPanelProps) {
  const dict = useDict().oryon;

  return (
    <section
      className="shrink-0 border-t border-border bg-surface"
      data-testid="oryon-positions-panel"
      data-open={open}
      aria-label={dict.bottom.title}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="oryon-positions-toggle"
      >
        <PanelBottom className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-semibold">{dict.bottom.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {dict.bottom.collapsedHint}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
          <span className="text-[10px]">{open ? dict.bottom.close : dict.bottom.open}</span>
          {open ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronUp className="size-3.5" aria-hidden />
          )}
        </span>
      </button>

      {open ? (
        <div className="flex h-36 items-center justify-center gap-3 border-t border-border bg-background px-4">
          <ShieldOff className="size-5 text-muted-foreground" aria-hidden />
          <div className="max-w-xl">
            <p className="text-sm font-semibold">{dict.bottom.deferredTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {dict.bottom.deferredMessage}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

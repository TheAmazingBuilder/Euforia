"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TradeForm } from "@/components/trades/trade-form";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import type { TradeContextSeed } from "@/lib/hooks/use-trade-modal";
import { closeTradeModal } from "@/lib/hooks/use-trade-modal";

/**
 * The capture surface: a wide modal on desktop (spec §10), a full-height
 * bottom sheet on mobile. Same TradeForm inside — one mental model (§2).
 * The form unmounts whenever the modal closes, so every open re-hydrates
 * from the fast-loop seed or the saved draft.
 */

export interface TradeModalProps {
  open: boolean;
  seed: TradeContextSeed | null;
}

export function TradeModal({ open, seed }: TradeModalProps) {
  const isDesktop = useIsDesktop();
  if (!open || isDesktop === null) return null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) closeTradeModal(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-2xl lg:max-w-3xl">
          <DialogHeader className="gap-1 border-b border-border p-4 pb-3">
            <DialogTitle className="font-heading text-lg font-semibold text-foreground">
              Log execution
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Capture first, judge second, reflect third — numbers first, words after.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <TradeForm seed={seed} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) closeTradeModal(); }}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] gap-0 rounded-t-xl p-0 sm:max-h-[100dvh]"
        aria-describedby={undefined}
      >
        <SheetHeader className="gap-1 border-b border-border p-4 pb-3">
          <SheetTitle className="font-heading text-lg font-semibold text-foreground">
            Log execution
          </SheetTitle>
          <SheetDescription className="sr-only">
            Capture a trade — the judgment gate comes after saving.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <TradeForm seed={seed} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import * as React from "react";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { Direction, SkipReason } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InstrumentCombobox } from "@/components/trades/instrument-combobox";
import { useCreateSkippedTrade } from "@/lib/api/queries";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { closeGhostModal } from "@/lib/hooks/use-ghost-modal";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Ghost trade - the 10-second capture (spec §8): instrument combobox,
 * direction (▲ ▼ -), single-select reason chips, [Log it]. No prices, no
 * sizing, no strategy fields - an intention, not a trade. Settlement comes
 * tomorrow ("We'll ask you tomorrow how it played out.").
 */

// Machine values stay module-scope; the user-facing labels/hints resolve
// through dict.trades.ghost at render time (i18n pattern - same as the
// emotion chips' EMOTION_OPTIONS).
const REASONS: readonly SkipReason[] = [
  "FEAR",
  "DISCIPLINE",
  "OUT_OF_PLAYBOOK",
  "NO_SETUP",
  "MISSED_EXECUTION",
];

const DIRECTIONS: readonly {
  value: Direction | null;
  labelKey: "long" | "short" | "undecided";
  glyph: string;
}[] = [
  { value: "BUY", labelKey: "long", glyph: "▲" },
  { value: "SELL", labelKey: "short", glyph: "▼" },
  { value: null, labelKey: "undecided", glyph: "-" },
];

function GhostForm() {
  const { dict } = useI18n();
  const T = dict.trades.ghost;
  const [instrumentId, setInstrumentId] = React.useState<string | null>(null);
  const [direction, setDirection] = React.useState<Direction | null>(null);
  const [reason, setReason] = React.useState<SkipReason | null>(null);
  const createGhost = useCreateSkippedTrade();

  const ready = instrumentId !== null && reason !== null && !createGhost.isPending;

  const submit = React.useCallback(async () => {
    if (instrumentId === null || reason === null) return;
    try {
      await createGhost.mutateAsync({ instrumentId, direction, reason });
      toast.success(T.logged, {
        description: T.tomorrow,
      });
      closeGhostModal();
    } catch {
      toast.error(dict.trades.errors.ghostLog, {
        description: T.failedDescription,
      });
    }
  }, [createGhost, direction, instrumentId, reason, dict, T]);

  const fieldLabel = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className={fieldLabel} id="ghost-instrument-label">
            {T.marketInstrument}
          </span>
          <div aria-labelledby="ghost-instrument-label">
            <InstrumentCombobox value={instrumentId} onChange={(instrument) => setInstrumentId(instrument.id)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className={fieldLabel} id="ghost-direction-label">
            {T.potentialBias}
          </span>
          <div
            role="radiogroup"
            aria-labelledby="ghost-direction-label"
            className="grid grid-cols-3 gap-1.5"
          >
            {DIRECTIONS.map((option) => {
              const selected = option.value === direction;
              return (
                <button
                  key={option.labelKey}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDirection(option.value)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface text-muted-foreground hover:border-accent/50 hover:text-foreground",
                  )}
                >
                  <span aria-hidden="true" className="text-sm leading-none">
                    {option.glyph}
                  </span>
                  {T.directions[option.labelKey]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className={fieldLabel}>
          {T.whyNot} <span className="text-destructive">*</span>
        </span>
        <div role="radiogroup" aria-label={T.skipReasonAria} className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {REASONS.map((value) => {
            const option = T.reasons[value];
            const selected = value === reason;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setReason(value)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md border px-2 py-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-accent/50 hover:text-foreground",
                )}
              >
                <span className="leading-tight">{option.label}</span>
                <span
                  className={cn(
                    "text-[10px] font-normal leading-tight",
                    selected ? "text-accent-foreground/75" : "text-muted-foreground/75",
                  )}
                >
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
          {T.tomorrow}
        </p>
        <Button type="submit" disabled={!ready}>
          {T.logIt}
        </Button>
      </div>
    </form>
  );
}

export function GhostModal({ open }: { open: boolean }) {
  const { dict } = useI18n();
  const T = dict.trades.ghost;
  const isDesktop = useIsDesktop();
  if (!open || isDesktop === null) return null;

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeGhostModal();
        }}
      >
        <DialogContent className="p-0 sm:max-w-xl">
          <DialogHeader className="gap-1 border-b border-border p-4 pb-3">
            <DialogTitle className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
              {T.title}
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {T.badge}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {T.description}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <GhostForm />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeGhostModal();
      }}
    >
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-xl p-0 sm:max-h-[100dvh]"
        aria-describedby={undefined}
      >
        <SheetHeader className="gap-1 border-b border-border p-4 pb-3">
          <SheetTitle className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
            {T.title}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {T.sheetDescription}
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[70dvh] overflow-y-auto p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <GhostForm />
        </div>
      </SheetContent>
    </Sheet>
  );
}

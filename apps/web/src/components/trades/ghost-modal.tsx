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

/**
 * Ghost trade — the 10-second capture (spec §8): instrument combobox,
 * direction (▲ ▼ —), single-select reason chips, [Log it]. No prices, no
 * sizing, no strategy fields — an intention, not a trade. Settlement comes
 * tomorrow ("We'll ask you tomorrow how it played out.").
 */

const REASONS: readonly { value: SkipReason; label: string; hint: string }[] = [
  { value: "FEAR", label: "Fear", hint: "Hesitation" },
  { value: "DISCIPLINE", label: "Discipline", hint: "Rules obeyed" },
  { value: "OUT_OF_PLAYBOOK", label: "Out of playbook", hint: "No edge" },
  { value: "NO_SETUP", label: "No valid setup", hint: "Bad criteria" },
  { value: "MISSED_EXECUTION", label: "Missed execution", hint: "Late entry" },
];

const DIRECTIONS: readonly { value: Direction | null; label: string; glyph: string }[] = [
  { value: "BUY", label: "Long", glyph: "▲" },
  { value: "SELL", label: "Short", glyph: "▼" },
  { value: null, label: "Undecided", glyph: "—" },
];

function GhostForm() {
  const [instrumentId, setInstrumentId] = React.useState<string | null>(null);
  const [direction, setDirection] = React.useState<Direction | null>(null);
  const [reason, setReason] = React.useState<SkipReason | null>(null);
  const createGhost = useCreateSkippedTrade();

  const ready = instrumentId !== null && reason !== null && !createGhost.isPending;

  const submit = React.useCallback(async () => {
    if (instrumentId === null || reason === null) return;
    try {
      await createGhost.mutateAsync({ instrumentId, direction, reason });
      toast.success("Setup logged, not taken", {
        description: "We'll ask you tomorrow how it played out.",
      });
      closeGhostModal();
    } catch {
      toast.error("Could not log the skipped setup", {
        description: "Check your connection and try again.",
      });
    }
  }, [createGhost, direction, instrumentId, reason]);

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
            Market / instrument
          </span>
          <div aria-labelledby="ghost-instrument-label">
            <InstrumentCombobox value={instrumentId} onChange={(instrument) => setInstrumentId(instrument.id)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className={fieldLabel} id="ghost-direction-label">
            Potential bias
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
                  key={option.label}
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
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className={fieldLabel}>
          Why didn&apos;t you execute? <span className="text-destructive">*</span>
        </span>
        <div role="radiogroup" aria-label="Skip reason" className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {REASONS.map((option) => {
            const selected = option.value === reason;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setReason(option.value)}
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
          We&apos;ll ask you tomorrow how it played out.
        </p>
        <Button type="submit" disabled={!ready}>
          Log it
        </Button>
      </div>
    </form>
  );
}

export function GhostModal({ open }: { open: boolean }) {
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
              Setup seen, not taken
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                10-sec capture
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Log an unexecuted opportunity — the Regret Registry turns it into discipline data.
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
            Setup seen, not taken
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            10-second capture — we&apos;ll ask you tomorrow how it played out.
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[70dvh] overflow-y-auto p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <GhostForm />
        </div>
      </SheetContent>
    </Sheet>
  );
}

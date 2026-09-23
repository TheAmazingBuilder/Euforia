"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "?" shortcuts overlay (trade-entry-ux.md §4 keyboard table).
 */

const SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: "⌘K", action: "Command palette — search everything" },
  { keys: "N", action: "New trade — from anywhere" },
  { keys: "B / S", action: "Direction Buy / Sell (while capturing, outside inputs)" },
  { keys: "← / →", action: "Direction on the segmented control" },
  { keys: "Tab", action: "Logical order: entry → exit → size" },
  { keys: "Enter", action: "Submit the capture" },
  { keys: "Esc", action: "Close — draft saved, always" },
  { keys: "?", action: "This overlay" },
];

export function ShortcutsOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0" aria-describedby={undefined}>
        <DialogHeader className="border-b border-border p-4 pb-3">
          <DialogTitle className="font-heading text-base font-semibold text-foreground">
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="sr-only">
            Keyboard shortcuts available across the capture flow.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="flex items-center gap-3 px-4 py-2.5">
              <kbd className="min-w-14 rounded-md border border-border bg-surface px-2 py-1 text-center font-mono text-xs font-semibold text-foreground">
                {shortcut.keys}
              </kbd>
              <span className="text-sm text-muted-foreground">{shortcut.action}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";

import { TradeModal } from "@/components/trades/trade-modal";
import { ShortcutsOverlay } from "@/components/trades/shortcuts-overlay";
import { openTradeModal, useTradeModalState } from "@/lib/hooks/use-trade-modal";

/**
 * Mounts the capture modal + the "?" shortcuts overlay and owns the global
 * hotkeys (custom listener — no library, per phase brief):
 * - N opens the trade modal from anywhere (except while typing). While the
 *   modal is already open, N is left to the form (fast loop after a save);
 *   mid-capture it must NOT wipe the form.
 * - ? toggles the shortcuts overlay.
 * - Esc is handled by the Dialog/Sheet primitives (draft is always saved).
 */
export function TradeModalHost() {
  const { open, seed } = useTradeModalState();
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "?" && !typing) {
        event.preventDefault();
        setShortcutsOpen((previous) => !previous);
        return;
      }
      if ((event.key === "n" || event.key === "N") && !typing && !open) {
        event.preventDefault();
        openTradeModal();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <TradeModal open={open} seed={seed} />
      <ShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

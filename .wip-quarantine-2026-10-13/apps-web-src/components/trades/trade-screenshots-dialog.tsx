"use client";

import * as React from "react";
import { formatSignedMoney, formatR, type Currency, type Trade, type TradeScreenshot } from "@cosmoz/shared";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Trade screenshot gallery — the visual context of the entry/exit, opened
 * from the Trades table media indicator. Click a thumbnail to enlarge it.
 */

export interface TradeScreenshotsDialogProps {
  trade: Trade | null;
  /** Instrument symbol for the header (looked up by the caller). */
  symbol: string;
  screenshots: TradeScreenshot[];
  currency: Currency;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradeScreenshotsDialog({
  trade,
  symbol,
  screenshots,
  currency,
  open,
  onOpenChange,
}: TradeScreenshotsDialogProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Derived selection: explicit pick, else the first shot of the open trade.
  // (No effect-state sync — ids are unique per trade, a stale pick falls
  // through to the first screenshot via the ?? chain.)
  const selected =
    screenshots.find((shot) => shot.id === selectedId) ?? (open ? (screenshots[0] ?? null) : null);
  const win = (Number(trade?.rMultiple) ?? 0) >= 0 && trade?.rMultiple !== null;

  if (trade === null) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {symbol}
            <span className="font-mono text-sm font-normal tabular-nums text-muted-foreground">
              {trade.direction} ·{" "}
              <span className={win ? "text-profit" : "text-loss"}>
                {trade.rMultiple !== null ? formatR(trade.rMultiple) : "—"}
              </span>{" "}
              · {trade.pnlNet !== null ? formatSignedMoney(trade.pnlNet, currency, { digits: 2 }) : "—"}
            </span>
          </DialogTitle>
          <DialogDescription>
            Entry {trade.entryPrice} → exit {trade.exitPrice ?? "—"} · {screenshots.length} image
            {screenshots.length === 1 ? "" : "s"} attached.
            {trade.mfeR !== null || trade.maeR !== null ? (
              <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                MFE {trade.mfeR !== null ? formatR(trade.mfeR) : "—"} · MAE{" "}
                {trade.maeR !== null ? formatR(trade.maeR) : "—"}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {selected !== null ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL screenshot, not a remote asset */}
            <img
              src={selected.storageKey}
              alt={selected.caption ?? `Screenshot ${selected.kind.toLowerCase()} for the trade`}
              className="max-h-[50dvh] w-full rounded-lg border border-border bg-background object-contain"
            />
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase text-muted-foreground">
              <span className="rounded-sm border border-border px-1.5 py-0.5">{selected.kind}</span>
              {selected.caption ?? "No caption"}
            </p>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No screenshots attached.</p>
        )}

        {screenshots.length > 1 ? (
          <ul className="flex flex-wrap gap-2 border-t border-border pt-3" aria-label="All screenshots">
            {screenshots.map((shot) => (
              <li key={shot.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(shot.id)}
                  aria-pressed={shot.id === selected?.id}
                  className={cn(
                    "overflow-hidden rounded-md border outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
                    shot.id === selected?.id ? "border-accent" : "border-border opacity-70 hover:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- data-URL screenshot, not a remote asset */}
                  <img
                    src={shot.storageKey}
                    alt={`Thumbnail: ${shot.caption ?? shot.kind.toLowerCase()}`}
                    className="h-14 w-24 object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

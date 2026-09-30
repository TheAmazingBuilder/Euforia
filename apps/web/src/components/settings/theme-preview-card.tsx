"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { formatMoney, formatR } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Theme preview (module upgrade) — a miniature TRADE CARD rendered purely
 * with semantic tokens. Because every color comes from CSS variables, the
 * preview follows the theme switch INSTANTLY: flip the theme in the card
 * above and this miniature re-tints live, exactly like the real ledger.
 */

export function ThemePreviewMiniTradeCard() {
  return (
    <div
      className="rounded-xl border border-border bg-surface p-3 shadow-sm"
      data-testid="theme-preview-card"
      aria-label="Live theme preview — a miniature trade card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-accent/10 font-heading text-[10px] font-bold text-accent">
            EU
          </span>
          <div className="leading-tight">
            <p className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <ArrowUpRight className="size-3 text-profit" aria-hidden="true" />
              EURUSD · Buy
            </p>
            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
              London · 1.08420 → 1.08610
            </p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          Closed
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-surface-raised px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Net P&L</p>
          <p className="font-mono text-xs font-semibold tabular-nums text-profit">
            +{formatMoney("152.40", "USD")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">R</p>
          <p className="font-mono text-xs font-semibold tabular-nums text-profit">
            {formatR("1.8")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Plan</p>
          <p className="text-xs font-semibold text-foreground">Followed</p>
        </div>
      </div>

      {/* Loss row — both P&L polarities visible at once */}
      <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-surface-raised px-2 py-1.5">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ArrowDownRight className="size-3 text-loss" aria-hidden="true" />
          XAUUSD · Sell
        </p>
        <p className="font-mono text-[11px] font-semibold tabular-nums text-loss">
          −{formatMoney("68.10", "USD")}
        </p>
      </div>

      <p className={cn("mt-2 text-center text-[9px] text-muted-foreground")}>
        Live preview — re-tints instantly with the theme
      </p>
    </div>
  );
}

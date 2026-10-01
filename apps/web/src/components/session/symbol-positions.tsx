"use client";

import * as React from "react";

import { formatPrice } from "@cosmoz/shared";
import type { Instrument, Trade } from "@cosmoz/shared";

import { useI18n } from "@/i18n/i18n-provider";
import { unrealizedPnl, type LiveQuote } from "@/lib/realtime/market";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Journal positions on the SELECTED symbol, marked to the live feed
 * (mission §10 for the journal's own positions — broker positions live in
 * the BrokerPanel; the two are never conflated, §26). The P&L is the only
 * colored numeral per row (design system rule 3); "Current" only appears
 * when a fresh quote exists — a stale feed shows "—", not a frozen price
 * pretending to be live.
 */

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="font-mono text-xs tabular-nums text-foreground">{children}</div>
    </div>
  );
}

export function SymbolPositions({
  trades,
  instrument,
  quote,
}: {
  trades: Trade[];
  instrument: Instrument | null;
  quote: LiveQuote | null;
}) {
  const { dict } = useI18n();
  const S = dict.session;
  const digits = instrument?.digits ?? 5;
  const contractSize = instrument?.contractSize ?? "1";
  // A frozen quote must not keep valuing positions as if the market moved
  // (mission §17) — time gating via useNowMs, never Date.now in render.
  const nowMs = useNowMs();
  const price = quote !== null && nowMs !== null && nowMs - quote.ts <= 10_000 ? quote.price : null;
  const feedLabel = quote?.source === "real" ? S.positions.feedLive : S.positions.feedSim;

  return (
    <section className="rounded-xl border border-border bg-surface" data-testid="symbol-positions">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground">
              {`${S.positions.title} ${instrument?.symbol ?? "…"}`}
            </h2>
            <p className="text-xs text-muted-foreground">
              {S.positions.subtitle}
            </p>
          </div>
          {price !== null ? (
            <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {`${S.positions.markedTo} ${feedLabel}`}
            </span>
          ) : null}
        </div>
      </header>

      <div className="p-4">
        {trades.length === 0 ? (
          <p className="text-sm text-muted-foreground">{S.positions.empty}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {trades.map((trade) => {
              const pnl = unrealizedPnl({
                entryPrice: trade.entryPrice,
                quantity: trade.quantity,
                contractSize,
                direction: trade.direction,
                lastPrice: price,
              });
              const stop = trade.finalStop ?? trade.initialStop;
              return (
                <li key={trade.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        trade.direction === "SELL" ? "bg-destructive/15 text-destructive" : "bg-profit/15 text-profit",
                      )}
                    >
                      {trade.direction === "SELL" ? S.labels.short : S.labels.long} {trade.quantity}
                    </span>
                    <span
                      data-testid="symbol-position-pnl"
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        pnl === null ? "text-muted-foreground" : pnl >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {pnl === null
                        ? S.positions.pnlNone
                        : `${pnl >= 0 ? "+" : "-"}${formatPrice(Math.abs(pnl), 2)}`}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-5">
                    <Cell label={S.labels.entry}>{formatPrice(trade.entryPrice, digits)}</Cell>
                    <Cell label={S.labels.current}>{price !== null ? formatPrice(price, digits) : "—"}</Cell>
                    <Cell label={S.labels.sl}>{stop !== null ? formatPrice(stop, digits) : "—"}</Cell>
                    <Cell label={S.labels.tp}>{trade.initialTP !== null ? formatPrice(trade.initialTP, digits) : "—"}</Cell>
                    <Cell label={S.positions.opened}>
                      {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(
                        new Date(trade.entryAt),
                      )}
                    </Cell>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

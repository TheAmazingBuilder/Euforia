"use client";

import * as React from "react";
import { RadioTower } from "lucide-react";

import { formatMoney, formatPrice } from "@cosmoz/shared";
import type { BrokerPosition, Currency } from "@cosmoz/shared";

import { useI18n } from "@/i18n/i18n-provider";
import { usePrivatePositions } from "@/lib/realtime/market";
import { cn } from "@/lib/utils";

/**
 * Private positions stream — the LIVE positions pushed by the market service
 * into the authenticated owner's `user:<id>` room.
 *
 * Honesty: the wire source is labeled on the card (SIM until a real broker
 * bridge exists) — the stream never claims to be a real broker account. The
 * "Trading account" card (broker session poll) keeps reporting the REAL
 * integration state; these are two different, clearly separated surfaces.
 *
 * READ-ONLY (mission red line): this card renders numbers and nothing else —
 * there is intentionally NO close/modify/execute affordance of any kind.
 */

function StreamRow({ position, currency }: { position: BrokerPosition; currency: Currency }) {
  const { dict } = useI18n();
  const S = dict.session;
  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2" data-testid="private-positions-item">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-foreground">{position.symbol}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            position.direction === "SELL" ? "bg-destructive/15 text-destructive" : "bg-profit/15 text-profit",
          )}
        >
          {position.direction === "SELL" ? S.labels.short : S.labels.long} {position.volume}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-xs text-muted-foreground">{S.labels.entry}</span>
          <span className="font-mono text-sm tabular-nums text-foreground">{formatPrice(position.entryPrice, 5)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-xs text-muted-foreground">{S.labels.current}</span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {position.currentPrice !== null ? formatPrice(position.currentPrice, 5) : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-xs text-muted-foreground">{S.labels.sl}</span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {position.stopLoss !== null ? formatPrice(position.stopLoss, 5) : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-xs text-muted-foreground">{S.labels.tp}</span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {position.takeProfit !== null ? formatPrice(position.takeProfit, 5) : "—"}
          </span>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">{position.id}</span>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            position.unrealizedPnl === null
              ? "text-muted-foreground"
              : Number(position.unrealizedPnl) >= 0
                ? "text-profit"
                : "text-loss",
          )}
          data-testid="private-positions-pnl"
          data-pnl={position.unrealizedPnl ?? "null"}
          data-symbol={position.symbol}
        >
          {position.unrealizedPnl !== null ? formatMoney(position.unrealizedPnl, currency) : S.positions.pnlNone}
        </span>
      </div>
    </div>
  );
}

export function PrivatePositionsStream() {
  const { dict } = useI18n();
  const S = dict.session;
  const stream = usePrivatePositions();
  const positions = React.useMemo(() => [...stream.positions.values()], [stream.positions]);
  const live = stream.connected;

  return (
    <section
      className="rounded-xl border border-border bg-surface"
      data-testid="private-positions-stream"
      data-stream-state={live ? "live" : stream.lastEventAt > 0 ? "stale" : "idle"}
      aria-label={S.privateStream.aria}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <RadioTower className="size-4 text-accent" aria-hidden="true" />
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground">{S.privateStream.title}</h2>
            <p className="text-xs text-muted-foreground">
              {S.privateStream.subtitle}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            live ? "border-profit/40 bg-profit/10 text-profit" : "border-border bg-surface-raised text-muted-foreground",
          )}
          data-testid="private-positions-state"
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-profit" : "bg-muted-foreground")}
          />
          {live ? S.privateStream.badgeLive : stream.lastEventAt > 0 ? S.privateStream.badgeStale : S.privateStream.badgeIdle}
        </span>
      </header>

      <div className="space-y-2 p-4">
        {positions.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground" data-testid="private-positions-empty">
            {live
              ? S.privateStream.emptyLive
              : S.privateStream.emptyIdle}
          </p>
        ) : (
          positions.map((position) => (
            <StreamRow key={position.id} position={position} currency="USD" />
          ))
        )}
      </div>
    </section>
  );
}

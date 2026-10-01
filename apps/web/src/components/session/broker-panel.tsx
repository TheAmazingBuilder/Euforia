"use client";

import * as React from "react";
import { Landmark, ScrollText } from "lucide-react";

import { formatMoney, formatPrice } from "@cosmoz/shared";
import type { BrokerSessionResponse } from "@cosmoz/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n-provider";
import { useBrokerSession } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Real trading account monitoring — READ-ONLY (mission §11, §12, §21).
 *
 * Every value comes from the broker provider response; a missing metric
 * renders "—" (N/A), never a guess. There are NO action buttons anywhere in
 * this panel: V1 has no execution path, and the panel keeps it that way
 * even once a provider is connected (Phase 2 will gate execution elsewhere).
 */

function AccountRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function StateBanner({ state, reason }: { state: BrokerSessionResponse["state"]; reason: string | null }) {
  const { dict } = useI18n();
  const S = dict.session;
  const isError = state === "ERROR";
  return (
    <p
      role="status"
      className={cn(
        "rounded-md border px-3 py-2 text-xs leading-relaxed",
        isError ? "border-warning/50 bg-warning/10 text-warning" : "border-border bg-surface-raised text-muted-foreground",
      )}
    >
      {reason ?? S.broker.stateUnknown}
    </p>
  );
}

function PositionsMiniList({ session }: { session: BrokerSessionResponse }) {
  const { dict } = useI18n();
  const S = dict.session;
  return (
    <div className="space-y-2">
      {session.positions.map((position) => (
        <div key={position.id} className="rounded-md border border-border bg-surface-raised px-3 py-2">
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
            <AccountRow label={S.labels.entry} value={formatPrice(position.entryPrice, 5)} />
            <AccountRow label={S.labels.current} value={position.currentPrice !== null ? formatPrice(position.currentPrice, 5) : "—"} />
            <AccountRow label={S.labels.sl} value={position.stopLoss !== null ? formatPrice(position.stopLoss, 5) : "—"} />
            <AccountRow label={S.labels.tp} value={position.takeProfit !== null ? formatPrice(position.takeProfit, 5) : "—"} />
          </div>
          <div className="mt-1 flex justify-end">
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                position.unrealizedPnl === null ? "text-muted-foreground" : Number(position.unrealizedPnl) >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {position.unrealizedPnl !== null ? formatMoney(position.unrealizedPnl, session.account?.currency ?? "USD") : S.positions.pnlNone}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrokerPanel() {
  const { dict } = useI18n();
  const S = dict.session;
  const { data: session, isLoading } = useBrokerSession();

  if (isLoading || session === undefined) {
    return (
      <section className="rounded-xl border border-border bg-surface" aria-busy="true" aria-label={S.broker.loadingAria}>
        <header className="border-b border-border px-4 py-3">
          <h2 className="font-heading text-base font-semibold text-foreground">{S.broker.title}</h2>
        </header>
        <div className="space-y-2 p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </section>
    );
  }

  const account = session.account;
  const currency = account?.currency ?? "USD";
  const connected = session.connected && account !== null;

  return (
    <section className="rounded-xl border border-border bg-surface" data-testid="broker-panel">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">{S.broker.title}</h2>
          <p className="text-xs text-muted-foreground">{S.broker.subtitle}</p>
        </div>
        <span className="stamp stamp-ink shrink-0 -rotate-2" aria-label={S.broker.readOnlyAria}>
          {S.broker.readOnly}
        </span>
      </header>

      <div className="space-y-3 p-4">
        <StateBanner state={session.state} reason={session.reason} />

        <div className="divide-y divide-border/60">
          <AccountRow label={S.broker.brokerRow} value={connected ? account.broker : "—"} />
          <AccountRow label={S.broker.balance} value={connected && account.balance !== null ? formatMoney(account.balance, currency) : "—"} />
          <AccountRow label={S.broker.equity} value={connected && account.equity !== null ? formatMoney(account.equity, currency) : "—"} />
          <AccountRow
            label={S.broker.unrealizedPnl}
            value={
              connected && account.unrealizedPnl !== null ? (
                <span className={Number(account.unrealizedPnl) >= 0 ? "text-profit" : "text-loss"}>
                  {formatMoney(account.unrealizedPnl, currency)}
                </span>
              ) : (
                "—"
              )
            }
          />
          <AccountRow label={S.broker.usedMargin} value={connected && account.usedMargin !== null ? formatMoney(account.usedMargin, currency) : "—"} />
          <AccountRow label={S.broker.freeMargin} value={connected && account.freeMargin !== null ? formatMoney(account.freeMargin, currency) : "—"} />
          <AccountRow label={S.broker.marginLevel} value={connected && account.marginLevel !== null ? `${formatPrice(account.marginLevel, 2)}%` : "—"} />
        </div>

        <div className="border-t border-border pt-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Landmark className="size-3.5" aria-hidden="true" />
            {S.broker.positions}
          </h3>
          {session.positions.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {connected ? S.broker.positionsEmpty : S.broker.positionsStreamEmpty}
            </p>
          ) : (
            <div className="mt-2">
              <PositionsMiniList session={session} />
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ScrollText className="size-3.5" aria-hidden="true" />
            {S.broker.orders}
          </h3>
          {session.orders.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {connected ? S.broker.ordersEmpty : S.broker.ordersStreamEmpty}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {session.orders.map((order) => (
                <div key={order.id} className="rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-xs text-foreground">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{order.symbol}</span>
                    <span className="uppercase tracking-wide">{order.type}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-4">
                    <AccountRow label={S.labels.price} value={formatPrice(order.price, 5)} />
                    <AccountRow label={S.labels.volume} value={order.volume} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

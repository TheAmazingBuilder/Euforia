"use client";

import * as React from "react";

import type { BrokerOrder, BrokerPosition, TradingDeal, TradingAccountDetails } from "@cosmoz/shared";
import { formatMoney, formatSignedMoney } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { useDict } from "@/i18n/i18n-provider";

/**
 * Read-only provider-activity tables (Phase 02 Step Five). Positions, orders
 * and deals are THREE DIFFERENT record kinds - never merged into one table
 * (spec §7.4): an order is not a fill, a deal is not a journal trade, and no
 * execution control exists anywhere (there is no close/modify/cancel action
 * in this file, by construction).
 *
 * Nullable provider fields render "-" (unavailable ≠ zero). Side/direction
 * keeps its sign on the value itself, color never travels alone.
 */

function TableShell({
  headers,
  children,
  testId,
}: {
  headers: string[];
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm" data-testid={testId}>
        <thead>
          <tr className="border-b border-border text-left">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="ledger-label px-3 py-2 font-normal first:pl-0 last:pr-0"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyLine({ message }: { message: string }) {
  return (
    <p className="px-1 py-6 text-center text-sm text-muted-foreground" role="status">
      {message}
    </p>
  );
}

const DIRECTION_CLASSES = (value: string): string =>
  value === "BUY" ? "text-profit" : value === "SELL" ? "text-loss" : "";

export function ExternalPositionsTable({
  positions,
  currency,
  hasSynced,
}: {
  positions: BrokerPosition[];
  currency: TradingAccountDetails["currency"];
  hasSynced: boolean;
}) {
  const dict = useDict();
  const D = dict.accounts.detail;
  if (positions.length === 0) {
    return <EmptyLine message={hasSynced ? D.positionsEmpty : D.positionsNeverSynced} />;
  }
  return (
    <TableShell
      testId="external-positions-table"
      headers={["Symbol", "Side", "Volume", "Entry", "Current", "SL", "TP", "Unrealized", "Opened"]}
    >
      {positions.map((position) => (
        <tr key={position.id} className="border-b border-border/60 last:border-0" data-testid="external-position-row">
          <td className="px-3 py-2 font-medium first:pl-0">{position.symbol}</td>
          <td className={cn("px-3 py-2 font-mono text-xs", DIRECTION_CLASSES(position.direction))}>
            {position.direction}
          </td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{position.volume}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{position.entryPrice}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">
            {position.currentPrice ?? "-"}
          </td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{position.stopLoss ?? "-"}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{position.takeProfit ?? "-"}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">
            {position.unrealizedPnl === null ? (
              "-"
            ) : (
              <span
                className={cn(
                  position.unrealizedPnl.trim().startsWith("-") ? "text-loss" : "text-profit",
                )}
              >
                {formatSignedMoney(position.unrealizedPnl, currency)}
              </span>
            )}
          </td>
          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground last:pr-0">
            {position.openedAt.slice(0, 16).replace("T", " ")}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

export function ExternalOrdersTable({ orders }: { orders: BrokerOrder[] }) {
  const dict = useDict();
  const D = dict.accounts.detail;
  if (orders.length === 0) {
    return <EmptyLine message={D.ordersEmpty} />;
  }
  return (
    <TableShell testId="external-orders-table" headers={["Symbol", "Type", "Volume", "Price", "SL", "TP", "Created"]}>
      {orders.map((order) => (
        <tr key={order.id} className="border-b border-border/60 last:border-0" data-testid="external-order-row">
          <td className="px-3 py-2 font-medium first:pl-0">{order.symbol}</td>
          <td className="px-3 py-2 font-mono text-xs">{order.type}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{order.volume}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{order.price}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{order.stopLoss ?? "-"}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{order.takeProfit ?? "-"}</td>
          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground last:pr-0">
            {order.createdAt.slice(0, 16).replace("T", " ")}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

export function ExternalDealsTable({
  deals,
  currency,
}: {
  deals: TradingDeal[];
  currency: TradingAccountDetails["currency"];
}) {
  const dict = useDict();
  const D = dict.accounts.detail;
  if (deals.length === 0) {
    return <EmptyLine message={D.dealsEmpty} />;
  }
  return (
    <TableShell
      testId="external-deals-table"
      headers={["Ref", "Symbol", "Side", "Volume", "Price", "Profit", "Commission", "Swap", "Executed"]}
    >
      {deals.map((deal) => (
        <tr key={deal.id} className="border-b border-border/60 last:border-0" data-testid="external-deal-row">
          <td className="px-3 py-2 font-mono text-xs text-muted-foreground first:pl-0">{deal.externalDealId}</td>
          <td className="px-3 py-2 font-medium">
            {deal.symbol ?? <span className="text-xs text-muted-foreground">balance op.</span>}
          </td>
          <td className={cn("px-3 py-2 font-mono text-xs", DIRECTION_CLASSES(deal.side))}>{deal.side}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{deal.volume}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">{deal.price ?? "-"}</td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">
            {deal.profit === null ? (
              "-"
            ) : (
              <span className={cn(deal.profit.trim().startsWith("-") ? "text-loss" : "text-profit")}>
                {formatSignedMoney(deal.profit, currency)}
              </span>
            )}
          </td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">
            {deal.commission === null ? "-" : formatMoney(deal.commission, currency)}
          </td>
          <td className="px-3 py-2 text-right font-mono tabular-nums">
            {deal.swap === null ? "-" : formatMoney(deal.swap, currency)}
          </td>
          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground last:pr-0">
            {deal.executedAt.slice(0, 16).replace("T", " ")}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Landmark,
  RefreshCw,
  RotateCw,
  Stethoscope,
  Unplug,
} from "lucide-react";
import type {
  BrokerOrder,
  BrokerPosition,
  Currency,
  TradingAccountDetails,
  TradingDeal,
} from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useSyncTradingAccount,
  useTradingAccount,
  useTradingAccountDeals,
  useTradingAccountOrders,
  useTradingAccountPositions,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import {
  ConnectionStatus,
  EnvironmentBadge,
  SyncStatus,
  money,
  relativeTime,
} from "./accounts-shared";
import { DisconnectDialog, ReconnectDialog, TestConnectionDialog } from "./connection-dialogs";

/**
 * Account detail (Accounts prompt §21–§28): header with both status axes,
 * the financial snapshot as ONE ruled band (heroes = balance & equity),
 * read-only Positions / Orders / History ledger tables, and the connection
 * panel where connection and synchronization stay two separate facts (§27).
 *
 * Red line (§69): there is deliberately NO Buy/Sell/Close/Modify/Cancel
 * affordance anywhere in this view — accounts are read-only.
 */
export function AccountDetailView({ accountId }: { accountId: string }) {
  const detail = useTradingAccount(accountId);
  const positions = useTradingAccountPositions(accountId);
  const orders = useTradingAccountOrders(accountId);
  const deals = useTradingAccountDeals(accountId);
  const sync = useSyncTradingAccount();

  const [disconnectOpen, setDisconnectOpen] = React.useState(false);
  const [reconnectOpen, setReconnectOpen] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);

  const account = detail.data?.account ?? null;

  if (detail.isLoading) {
    return (
      <div className="grid gap-4" data-testid="account-detail-loading">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (detail.isError || account === null) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-14 text-center"
        data-testid="account-detail-error"
      >
        <Landmark className="size-8 text-muted-foreground/50" aria-hidden="true" />
        <p className="font-heading text-base font-semibold">Account unavailable</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          We couldn&apos;t load this trading account. It may have been
          disconnected or the identifier is wrong.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/accounts">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Accounts
          </Link>
        </Button>
      </div>
    );
  }

  const disconnected = account.connection?.status !== "CONNECTED";
  const syncing = sync.isPending || account.synchronization.status === "SYNCING";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/accounts"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Accounts
      </Link>

      {/* Header — identity + statuses + sparse actions. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
              {account.name}
            </h2>
            <EnvironmentBadge environment={account.type} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{account.provider.providerName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{account.provider.platform}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono" data-testid="detail-masked-id">
              {account.externalAccountId}
            </span>
            <span aria-hidden="true">·</span>
            <span>{account.currency}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <ConnectionStatus status={account.connection?.status ?? "DISCONNECTED"} />
            <SyncStatus
              status={account.synchronization.status}
              lastSyncAt={account.synchronization.lastSyncAt}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sync.mutate(account.id)}
            disabled={disconnected || syncing}
            data-testid="detail-refresh"
          >
            <RefreshCw
              className={syncing ? "size-4 animate-spin" : "size-4"}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTestOpen(true)}
            data-testid="detail-test"
          >
            <Stethoscope className="size-4" aria-hidden="true" />
            Connection
          </Button>
          {disconnected ? (
            <Button variant="outline" size="sm" onClick={() => setReconnectOpen(true)} data-testid="detail-reconnect">
              <RotateCw className="size-4" aria-hidden="true" />
              Reconnect
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDisconnectOpen(true)}
              data-testid="detail-disconnect"
            >
              <Unplug className="size-4" aria-hidden="true" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {account.connection?.lastError ? (
        <p
          className="flex items-start gap-2 rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-xs leading-relaxed text-loss"
          data-testid="detail-last-error"
        >
          {account.connection.lastError}
        </p>
      ) : null}

      <SnapshotStrip account={account} />

      <Tabs defaultValue="positions" className="gap-3">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="positions" data-testid="tab-positions">
            Positions
            <CountBadge value={positions.data?.positions.length} />
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">
            Orders
            <CountBadge value={orders.data?.orders.length} />
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            History
            <CountBadge value={deals.data?.deals.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <PositionsTable
            positions={positions.data?.positions ?? []}
            loading={positions.isLoading}
            currency={account.currency}
          />
        </TabsContent>
        <TabsContent value="orders">
          <OrdersTable orders={orders.data?.orders ?? []} loading={orders.isLoading} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTable
            deals={deals.data?.deals ?? []}
            loading={deals.isLoading}
            currency={account.currency}
          />
        </TabsContent>
      </Tabs>

      <ConnectionPanel account={account} />

      <DisconnectDialog account={account} open={disconnectOpen} onOpenChange={setDisconnectOpen} />
      <ReconnectDialog account={account} open={reconnectOpen} onOpenChange={setReconnectOpen} />
      <TestConnectionDialog account={account} open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}

// ── Snapshot band (§22 — unavailable is rendered "—", never invented) ────────

function SnapshotStrip({ account }: { account: TradingAccountDetails }) {
  const snapshot = account.snapshot;
  const cells: { label: string; value: string; wide?: boolean }[] = [
    { label: "Balance", value: money(snapshot?.balance, account.currency), wide: true },
    { label: "Equity", value: money(snapshot?.equity, account.currency), wide: true },
    { label: "Free margin", value: money(snapshot?.freeMargin, account.currency) },
    { label: "Margin", value: money(snapshot?.margin, account.currency) },
    {
      label: "Margin level",
      value:
        snapshot?.marginLevel === null || snapshot?.marginLevel === undefined
          ? "—"
          : `${snapshot.marginLevel}%`,
    },
    {
      label: "Floating P&L",
      value: money(snapshot?.unrealizedPnl, account.currency),
    },
  ];
  return (
    <div>
      <dl className="stat-strip" data-testid="detail-snapshot" aria-label="Account snapshot">
        {cells.map((cell) => (
          <div key={cell.label} className={cn("stat-cell stat-kpi", cell.wide && "stat-hero")}>
            <dt className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {cell.label}
            </dt>
            <dd className="mt-1 truncate font-mono text-lg font-semibold tabular-nums sm:text-xl">
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-right font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Updated {relativeTime(snapshot?.syncedAt ?? null)}
      </p>
    </div>
  );
}

// ── Ledger tables (read-only — §23–§25) ──────────────────────────────────────

const TABLE_BASE =
  "w-full min-w-[640px] border-collapse text-sm [&_tbody_tr:hover]:bg-muted/40 [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:font-mono [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-widest [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border/60 [&_td]:px-3 [&_td]:py-2 [&_td]:tabular-nums";

const TH_LEFT = "text-left";
const TH_RIGHT = "text-right";

function TableShell({
  children,
  minWidth,
}: {
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div style={minWidth ? { minWidth } : undefined}>{children}</div>
    </div>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  );
}

function CountBadge({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  return (
    <span className="ml-1.5 rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
      {value}
    </span>
  );
}

function PositionsTable({
  positions,
  loading,
  currency,
}: {
  positions: BrokerPosition[];
  loading: boolean;
  currency: Currency;
}) {
  return (
    <TableShell>
      <table className={TABLE_BASE} data-testid="positions-table">
        <thead>
          <tr>
            <th className={TH_LEFT}>Symbol</th>
            <th className={TH_LEFT}>Direction</th>
            <th className={TH_RIGHT}>Volume</th>
            <th className={TH_RIGHT}>Entry</th>
            <th className={TH_RIGHT}>Current</th>
            <th className={TH_RIGHT}>SL</th>
            <th className={TH_RIGHT}>TP</th>
            <th className={TH_RIGHT}>Floating P&amp;L</th>
            <th className={TH_LEFT}>Opened</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <EmptyRow colSpan={9} message="Loading positions…" />
          ) : positions.length === 0 ? (
            <EmptyRow colSpan={9} message="No open positions" />
          ) : (
            positions.map((position) => {
              const pnl = position.unrealizedPnl === null ? null : Number(position.unrealizedPnl);
              return (
                <tr key={position.id}>
                  <td className="font-mono font-medium">{position.symbol}</td>
                  <td>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {position.direction}
                    </Badge>
                  </td>
                  <td className="text-right font-mono">{position.volume}</td>
                  <td className="text-right font-mono">{position.entryPrice}</td>
                  <td className="text-right font-mono">{position.currentPrice ?? "—"}</td>
                  <td className="text-right font-mono">{position.stopLoss ?? "—"}</td>
                  <td className="text-right font-mono">{position.takeProfit ?? "—"}</td>
                  <td
                    className={cn(
                      "text-right font-mono font-medium",
                      pnl === null ? "text-muted-foreground" : pnl >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${money(position.unrealizedPnl, currency)}`}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {relativeTime(position.openedAt)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </TableShell>
  );
}

function OrdersTable({ orders, loading }: { orders: BrokerOrder[]; loading: boolean }) {
  return (
    <TableShell>
      <table className={TABLE_BASE} data-testid="orders-table">
        <thead>
          <tr>
            <th className={TH_LEFT}>Order</th>
            <th className={TH_LEFT}>Symbol</th>
            <th className={TH_LEFT}>Type</th>
            <th className={TH_RIGHT}>Volume</th>
            <th className={TH_RIGHT}>Price</th>
            <th className={TH_RIGHT}>SL</th>
            <th className={TH_RIGHT}>TP</th>
            <th className={TH_LEFT}>Created</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <EmptyRow colSpan={8} message="Loading orders…" />
          ) : orders.length === 0 ? (
            <EmptyRow colSpan={8} message="No active orders" />
          ) : (
            orders.map((order) => (
              <tr key={order.id}>
                <td className="font-mono text-muted-foreground">{order.id}</td>
                <td className="font-mono font-medium">{order.symbol}</td>
                <td className="font-mono text-xs">{order.type}</td>
                <td className="text-right font-mono">{order.volume}</td>
                <td className="text-right font-mono">{order.price}</td>
                <td className="text-right font-mono">{order.stopLoss ?? "—"}</td>
                <td className="text-right font-mono">{order.takeProfit ?? "—"}</td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {relativeTime(order.createdAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableShell>
  );
}

function HistoryTable({
  deals,
  loading,
  currency,
}: {
  deals: TradingDeal[];
  loading: boolean;
  currency: Currency;
}) {
  return (
    <TableShell>
      <table className={TABLE_BASE} data-testid="history-table">
        <thead>
          <tr>
            <th className={TH_LEFT}>Symbol</th>
            <th className={TH_LEFT}>Side</th>
            <th className={TH_RIGHT}>Volume</th>
            <th className={TH_RIGHT}>Price</th>
            <th className={TH_RIGHT}>Profit</th>
            <th className={TH_RIGHT}>Commission</th>
            <th className={TH_RIGHT}>Swap</th>
            <th className={TH_LEFT}>Executed</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <EmptyRow colSpan={8} message="Loading history…" />
          ) : deals.length === 0 ? (
            <EmptyRow colSpan={8} message="No trading history available yet" />
          ) : (
            deals.map((deal) => {
              const profit = deal.profit === null ? null : Number(deal.profit);
              return (
                <tr key={deal.id}>
                  <td className="font-mono font-medium">{deal.symbol ?? "—"}</td>
                  <td>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {deal.side}
                    </Badge>
                  </td>
                  <td className="text-right font-mono">{deal.volume}</td>
                  <td className="text-right font-mono">{deal.price ?? "—"}</td>
                  <td
                    className={cn(
                      "text-right font-mono font-medium",
                      profit === null
                        ? "text-muted-foreground"
                        : profit >= 0
                          ? "text-profit"
                          : "text-loss",
                    )}
                  >
                    {profit === null
                      ? "—"
                      : `${profit >= 0 ? "+" : ""}${money(deal.profit, currency)}`}
                  </td>
                  <td className="text-right font-mono text-muted-foreground">{deal.commission ?? "—"}</td>
                  <td className="text-right font-mono text-muted-foreground">{deal.swap ?? "—"}</td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {relativeTime(deal.executedAt)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </TableShell>
  );
}

// ── Connection panel (§27 — connection ≠ synchronization) ────────────────────

function ConnectionPanel({ account }: { account: TradingAccountDetails }) {
  const connection = account.connection;
  const run = account.synchronization.lastRun;
  return (
    <section
      aria-label="Connection details"
      className="rounded-xl border border-border bg-surface"
      data-testid="connection-panel"
    >
      <div className="grid gap-x-8 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Connection
          </h3>
          <div className="mt-2 grid gap-1.5 text-sm">
            <FactLine label="Status">
              <ConnectionStatus status={connection?.status ?? "DISCONNECTED"} />
            </FactLine>
            <FactLine label="Method">
              <span className="font-mono text-xs">{connection?.method ?? "—"}</span>
            </FactLine>
            <FactLine label="Credentials">
              <span className="font-mono text-xs" data-testid="detail-credentials-hint">
                {connection?.credentialsHint ?? "— none stored —"}
              </span>
            </FactLine>
            <FactLine label="Last connected">
              <span className="text-xs text-muted-foreground">
                {relativeTime(connection?.lastConnectedAt ?? null)}
              </span>
            </FactLine>
          </div>
        </div>
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Synchronization
          </h3>
          <div className="mt-2 grid gap-1.5 text-sm">
            <FactLine label="Status">
              <SyncStatus
                status={account.synchronization.status}
                lastSyncAt={account.synchronization.lastSyncAt}
              />
            </FactLine>
            <FactLine label="Last run">
              <span className="text-xs text-muted-foreground">
                {run === null
                  ? "—"
                  : `${run.trigger.toLowerCase()} · ${run.status.toLowerCase()}${
                      run.durationMs !== null ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ""
                    }`}
              </span>
            </FactLine>
            {run !== null && run.errorCode !== null ? (
              <FactLine label="Error">
                <span className="font-mono text-xs text-loss">{run.errorCode}</span>
              </FactLine>
            ) : null}
          </div>
        </div>
      </div>
      <div className="border-t border-border px-4 py-3 sm:px-5">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Permissions
        </h3>
        <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="detail-permissions">
          {(connection?.permissions ?? []).map((permission) => (
            <li
              key={permission}
              className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              {permission}
            </li>
          ))}
          <li className="rounded-sm border border-dashed border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Execution — never granted
          </li>
        </ul>
      </div>
    </section>
  );
}

function FactLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClock,
  Link2,
  MoreHorizontal,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import type {
  AssetClass,
  PortfolioOverviewResponse,
} from "@cosmoz/shared";

import { formatMoney, formatSignedMoney, formatPercent } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AllocationDonut } from "@/components/portfolios/allocation-donut";
import { AccountFormDialog } from "@/components/portfolios/account-form-dialog";
import { ConnectBrokerDialog } from "@/components/portfolios/connect-broker-dialog";
import {
  useBrokerConnections,
  useDeleteAccount,
  useDeleteBrokerConnection,
  useImportBatches,
  usePortfolioOverview,
  useSyncBroker,
  useUpdateAccount,
  useUpdateBrokerConnection,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * THE DESK — multi-portfolio view: accounts, brokers, assets and the
 * capital split, all server-computed by GET /portfolios/overview.
 * Layout reuses the .ledger-band hairline grid (Bande 2 / Risk idiom).
 */

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  FOREX: "Forex",
  CRYPTO: "Crypto",
  SYNTHETIC: "Synthetics",
  INDEX: "Indices",
  METAL: "Metals",
  ENERGY: "Energy",
};

const nTime = (iso: string, now: number): string => {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const typeLabel = (type: PortfolioOverviewResponse["accounts"][number]["type"]): string =>
  type === "PROP_FIRM" ? "PROP" : type;

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="ledger-label">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "CONNECTED") {
    return <span className="size-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />;
  }
  if (status === "SYNCING") {
    return (
      <span className="desk-dot--pulse size-1.5 rounded-full bg-[var(--warning)]" aria-hidden="true" />
    );
  }
  if (status === "ERROR") {
    return <span className="size-1.5 rounded-full bg-[var(--loss)]" aria-hidden="true" />;
  }
  return <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" />;
}

export function PortfolioView() {
  const overview = usePortfolioOverview();
  const connections = useBrokerConnections();
  const batches = useImportBatches();
  const syncBroker = useSyncBroker();
  const updateConnection = useUpdateBrokerConnection();
  const deleteConnection = useDeleteBrokerConnection();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  const [accountDialogOpen, setAccountDialogOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<PortfolioOverviewResponse["accounts"][number] | null>(null);
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [connectAccountId, setConnectAccountId] = React.useState<string | null>(null);
  // Render-time-safe clock (risk-view idiom): captured once, refreshed every minute.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const accounts = overview.data?.accounts ?? [];

  const handleSync = async (connectionId: string, label: string) => {
    try {
      const result = await syncBroker.mutateAsync(connectionId);
      toast.success(`${label} synced`, {
        description: `${result.imported} trade(s) imported · ${result.skipped} skipped`,
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Sync failed"));
    }
  };

  const handleToggleAuto = async (connectionId: string, autoImport: boolean) => {
    try {
      await updateConnection.mutateAsync({ connectionId, input: { autoImport } });
      toast.success(autoImport ? "Auto-import enabled" : "Auto-import paused");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not update the feed"));
    }
  };

  const handleDeleteConnection = async (connectionId: string, label: string) => {
    try {
      await deleteConnection.mutateAsync(connectionId);
      toast.success(`${label} disconnected`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not disconnect the feed"));
    }
  };

  const handleSetDefault = async (accountId: string, name: string) => {
    try {
      await updateAccount.mutateAsync({ accountId, input: { isDefault: true } });
      toast.success("Default account updated", { description: name });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not set the default account"));
    }
  };

  const handleDeleteAccount = async (accountId: string, name: string) => {
    try {
      await deleteAccount.mutateAsync(accountId);
      toast.success("Account deleted", { description: name });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not delete the account"));
    }
  };

  if (overview.isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading portfolios">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (overview.isError || overview.data === undefined) {
    return (
      <div className="space-y-4" data-testid="portfolios-error">
        <Caption>The desk — portfolios &amp; capital</Caption>
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted-foreground">
            The desk could not be loaded.{" "}
            <button
              type="button"
              className="text-accent underline-offset-2 hover:underline"
              onClick={() => overview.refetch()}
            >
              Retry
            </button>
          </p>
        </div>
      </div>
    );
  }

  const data = overview.data;
  const totals = data.totals;
  const totalPnlPositive = Number(totals.netPnl) >= 0;
  const connectionRows = connections.data?.connections ?? [];
  const batchRows = batches.data?.batches ?? [];

  return (
    <div className="space-y-5" data-testid="portfolios-view">
      {/* Desk identity */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Portfolios
          </h1>
          <p className="text-sm text-muted-foreground">
            Every account, broker and asset on one desk — balances, capital split and live broker feeds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditingAccount(null);
              setAccountDialogOpen(true);
            }}
            data-testid="portfolios-new-account"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New account
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent-hover"
            onClick={() => {
              setConnectAccountId(null);
              setConnectOpen(true);
            }}
            data-testid="portfolios-connect"
          >
            <PlugZap className="size-4" aria-hidden="true" />
            Connect broker
          </Button>
        </div>
      </header>

      <Caption>
        The desk — {totals.accountsCount} account{totals.accountsCount === 1 ? "" : "s"} ·{" "}
        {totals.connectionsConnected}/{totals.connectionsTotal} feeds live
      </Caption>

      {/* Desk strip — totals across the whole desk */}
      <section className="ledger-band" data-testid="desk-strip">
        <div className="col-span-2 sm:col-span-3">
          <p className="ledger-label">Total balance</p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground sm:text-2xl" data-testid="desk-total-balance">
            {formatMoney(totals.balance, data.currency)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            from {formatMoney(totals.startingBalance, data.currency)} invested
          </p>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="ledger-label">Net P&amp;L — all accounts</p>
          <p
            className={cn(
              "mt-2 font-mono text-xl font-semibold tabular-nums sm:text-2xl",
              totalPnlPositive ? "text-[var(--profit)]" : "text-[var(--loss)]",
            )}
          >
            {formatSignedMoney(totals.netPnl, data.currency)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {totals.tradesTotal} trades · {totals.openPositions} open
          </p>
        </div>
        <div>
          <p className="ledger-label">Accounts</p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
            {totals.accountsCount}
          </p>
          <p className="mt-1 flex flex-wrap gap-1">
            {accounts.map((account) => (
              <span
                key={account.id}
                className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground"
              >
                {typeLabel(account.type)}
              </span>
            ))}
          </p>
        </div>
        <div>
          <p className="ledger-label">Broker feeds</p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
            {totals.connectionsConnected}
            <span className="text-sm text-muted-foreground">/{totals.connectionsTotal}</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {data.byBroker.length} broker{data.byBroker.length === 1 ? "" : "s"} on the desk
          </p>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <p className="ledger-label">Open positions</p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
            {totals.openPositions}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            across {accounts.filter((a) => a.tradesOpen > 0).length} account
            {accounts.filter((a) => a.tradesOpen > 0).length === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      {/* Capital split — donut + allocation table */}
      <Caption>Capital allocation — how the desk is split</Caption>
      <section className="ledger-band" data-testid="desk-allocation">
        <div className="col-span-2 sm:col-span-5">
          <div className="flex items-center justify-between">
            <p className="ledger-label">By account</p>
            <p className="font-mono text-[11px] text-muted-foreground">{data.currency}</p>
          </div>
          <AllocationDonut
            accounts={data.accounts}
            totalBalance={totals.balance}
            currency={data.currency}
          />
          <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {[...data.accounts]
              .sort((a, b) => Number(b.balance) - Number(a.balance))
              .map((account, index) => (
                <span key={account.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      index === 0 && "bg-[var(--accent)]",
                      index === 1 && "bg-[var(--profit)]",
                      index === 2 && "bg-[var(--warning)]",
                      index === 3 && "bg-[var(--loss)]",
                      index > 3 && "bg-muted-foreground/50",
                    )}
                    aria-hidden="true"
                  />
                  {account.name} · {Number(account.allocationPct).toFixed(1)}%
                </span>
              ))}
          </p>
        </div>

        <div className="col-span-2 sm:col-span-7">
          <div className="flex items-center justify-between">
            <p className="ledger-label">Accounts &amp; balances</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              balance = starting + realized P&amp;L
            </p>
          </div>
          <div className="mt-3 space-y-3" data-testid="desk-accounts">
            {accounts.map((account) => {
              const positive = Number(account.netPnl) >= 0;
              return (
                <div key={account.id} className="space-y-1.5" data-testid={`account-row-${account.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {account.isDefault ? (
                      <Star className="size-3 fill-[var(--accent)] text-[var(--accent)]" aria-label="Default account" />
                    ) : null}
                    <span className="text-sm font-medium text-foreground">{account.name}</span>
                    <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                      {typeLabel(account.type)}
                    </span>
                    <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                      {account.broker}
                    </span>
                    {account.propConfig?.firm ? (
                      <span className="font-mono text-[10px] text-muted-foreground">{account.propConfig.firm}</span>
                    ) : null}
                    <span className="flex w-full items-center justify-between gap-2 font-mono text-sm tabular-nums sm:ml-auto sm:w-auto sm:justify-end">
                      <span className="text-foreground">{formatMoney(account.balance, account.currency)}</span>
                      <span className={positive ? "text-[var(--profit)]" : "text-[var(--loss)]"}>
                        {formatSignedMoney(account.netPnl, account.currency)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="goal-track flex-1">
                      <div
                        className="goal-fill"
                        style={{
                          width: `${Math.min(100, Math.max(0, Number(account.allocationPct)))}%`,
                          background: "var(--accent)",
                        }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {Number(account.allocationPct).toFixed(1)}%
                    </span>
                    <span className="hidden w-40 shrink-0 items-center justify-end gap-2 font-mono text-[11px] text-muted-foreground sm:flex">
                      <span>{account.tradesTotal} trades</span>
                      <span>·</span>
                      <span>{account.winRate === null ? "—" : formatPercent(Number(account.winRate) / 100)}</span>
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Actions for ${account.name}`}
                          data-testid={`account-actions-${account.name.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setConnectAccountId(account.id);
                            setConnectOpen(true);
                          }}
                        >
                          <Link2 className="size-4" aria-hidden="true" />
                          Connect broker
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleSetDefault(account.id, account.name)}
                          disabled={account.isDefault}
                        >
                          <Star className="size-4" aria-hidden="true" />
                          Set as default
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingAccount(account);
                            setAccountDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-[var(--loss)]"
                          onClick={() => handleDeleteAccount(account.id, account.name)}
                          disabled={account.isDefault}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Brokers & feeds + import batches */}
      <Caption>Broker feeds &amp; imports — multi-broker desk</Caption>
      <section className="ledger-band" data-testid="desk-feeds">
        <div className="col-span-2 sm:col-span-7">
          <div className="flex items-center justify-between">
            <p className="ledger-label">Connections</p>
            <p className="hidden font-mono text-[11px] text-muted-foreground sm:block">
              auto-import pulls feeds stale &gt; 24 h
            </p>
          </div>
          <div className="mt-3 space-y-2" data-testid="desk-connections">
            {connectionRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No broker connected yet — pull trades automatically from MT4/MT5, Deriv or Binance.
              </p>
            ) : null}
            {connectionRows.map((connection) => (
              <div
                key={connection.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border px-3 py-2.5"
                data-testid={`connection-row-${connection.provider.toLowerCase()}`}
              >
                <StatusDot status={connection.status} />
                <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                  {connection.provider}
                </span>
                <span className="text-sm font-medium text-foreground">{connection.label}</span>
                <span className="text-xs text-muted-foreground">→ {connection.accountName}</span>
                <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <CalendarClock className="size-3" aria-hidden="true" />
                  {connection.lastSyncAt === null ? "never synced" : nTime(connection.lastSyncAt, now)}
                </span>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Switch
                    checked={connection.autoImport}
                    onCheckedChange={(checked) => handleToggleAuto(connection.id, checked)}
                    disabled={updateConnection.isPending}
                    data-testid={`connection-auto-${connection.provider.toLowerCase()}`}
                  />
                  auto
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 font-mono text-[11px]"
                  onClick={() => handleSync(connection.id, connection.label)}
                  disabled={syncBroker.isPending || connection.status === "SYNCING"}
                  data-testid={`connection-sync-${connection.provider.toLowerCase()}`}
                >
                  <RefreshCw
                    className={cn("size-3", connection.status === "SYNCING" && "animate-spin")}
                    aria-hidden="true"
                  />
                  {connection.status === "SYNCING" ? "Syncing" : "Sync"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-[var(--loss)]"
                  aria-label={`Disconnect ${connection.label}`}
                  onClick={() => handleDeleteConnection(connection.id, connection.label)}
                  data-testid={`connection-delete-${connection.provider.toLowerCase()}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-5">
          <div className="flex items-center justify-between">
            <p className="ledger-label">Import batches</p>
            <p className="hidden font-mono text-[11px] text-muted-foreground sm:block">recent pulls</p>
          </div>
          <ul className="mt-3 space-y-2" data-testid="desk-batches">
            {batchRows.slice(0, 8).map((batch) => (
              <li key={batch.id} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    batch.status === "COMPLETED" && "bg-[var(--profit)]",
                    batch.status === "FAILED" && "bg-[var(--loss)]",
                    (batch.status === "PROCESSING" || batch.status === "PENDING") && "bg-[var(--warning)]",
                  )}
                  aria-hidden="true"
                />
                <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                  {batch.source}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {batch.filename.startsWith("auto-import") ? (
                    <span className="text-accent">{batch.filename}</span>
                  ) : (
                    batch.filename
                  )}
                  {" · "}
                  {batch.accountName}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {batch.rowsImported}/{batch.rowsTotal}
                </span>
                <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                  {nTime(batch.startedAt, now)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
            Batches are idempotent per account: a re-imported feed adds zero duplicates
            (unique externalRef). CSV history lives in the{" "}
            <Link href="/trades" className="text-accent underline-offset-2 hover:underline">
              trades module
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Multi-asset split */}
      <Caption>Asset mix — where the desk actually trades</Caption>
      <section className="ledger-band" data-testid="desk-assets">
        <div className="col-span-2 sm:col-span-12">
          <div className="flex items-center justify-between">
            <p className="ledger-label">By asset class</p>
            <p className="hidden font-mono text-[11px] text-muted-foreground sm:block">share of trades · net P&amp;L</p>
          </div>
          <div className="mt-3 space-y-2.5" data-testid="asset-class-bars">
            {data.byAssetClass.map((row) => {
              const positive = Number(row.pnlNet) >= 0;
              return (
                <div key={row.assetClass} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm text-foreground">
                    {ASSET_CLASS_LABELS[row.assetClass] ?? row.assetClass}
                  </span>
                  <div className="goal-track flex-1">
                    <div
                      className="goal-fill"
                      style={{
                        width: `${Math.min(100, Math.max(0, Number(row.tradesPct)))}%`,
                        background: positive ? "var(--profit)" : "var(--loss)",
                      }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {Number(row.tradesPct).toFixed(0)}%
                  </span>
                  <span
                    className={cn(
                      "w-24 shrink-0 text-right font-mono text-xs tabular-nums",
                      positive ? "text-[var(--profit)]" : "text-[var(--loss)]",
                    )}
                  >
                    {formatSignedMoney(row.pnlNet, data.currency)}
                  </span>
                  <span className="hidden w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground sm:block">
                    {row.winRate === null ? "—" : formatPercent(Number(row.winRate) / 100)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Bases: balances are computed server-side per account (starting balance + realized net P&amp;L);
        allocation shares read against the desk total; the asset mix covers every closed, non-deleted trade
        across accounts. Totals are expressed in the desk base currency ({data.currency}).
      </p>

      <AccountFormDialog
        open={accountDialogOpen}
        onOpenChange={setAccountDialogOpen}
        account={
          editingAccount === null
            ? null
            : {
                id: editingAccount.id,
                userId: "",
                name: editingAccount.name,
                type: editingAccount.type,
                broker: editingAccount.broker,
                currency: editingAccount.currency,
                startingBalance: editingAccount.startingBalance,
                isDefault: editingAccount.isDefault,
                propConfig: editingAccount.propConfig,
                createdAt: "",
              }
        }
      />
      <ConnectBrokerDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        accounts={accounts.map((account) => ({
          id: account.id,
          userId: "",
          name: account.name,
          type: account.type,
          broker: account.broker,
          currency: account.currency,
          startingBalance: account.startingBalance,
          isDefault: account.isDefault,
          propConfig: account.propConfig,
          createdAt: "",
        }))}
        defaultAccountId={connectAccountId}
      />
    </div>
  );
}

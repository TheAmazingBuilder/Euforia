"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { TradingAccountDetails } from "@cosmoz/shared";

import { apiErrorCode } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import {
  useSyncTradingAccount,
  useTestTradingConnection,
  useTradingAccount,
  useTradingAccountDeals,
  useTradingAccountOrders,
  useTradingAccountPositions,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  formatAbsoluteTime,
  formatDurationMs,
  formatMarginLevel,
  formatMoney,
  formatPrice,
  formatRelativeTime,
  formatShortTime,
  formatVolume,
  maskAccountNumber,
} from "@/lib/utils/trading-format";
import type { AccountsDict } from "@/i18n/dictionaries/en/accounts";
import {
  ConnectionStatusBadge,
  EnvironmentBadge,
  SyncStatusBadge,
} from "./account-status";
import { DisconnectAccountDialog, ReconnectAccountDialog } from "./account-connection-dialogs";

/**
 * Account detail (§21–§28) — identity header, the two status axes, the
 * snapshot band, connection + synchronization panels and the read-only
 * external state tables (positions, orders, history). Tabs are
 * URL-addressable (?tab=, §67); every table is a desktop ruled ledger that
 * collapses to stacked ruled cards on mobile (§48). No execution action
 * exists anywhere in this view — the module's red line (§69).
 */

const TABS = ["overview", "positions", "orders", "history"] as const;
type DetailTab = (typeof TABS)[number];

export function AccountDetail({ accountId, dict }: { accountId: string; dict: AccountsDict }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tabParam = searchParams.get("tab");
  const tab: DetailTab = TABS.includes(tabParam as DetailTab) ? (tabParam as DetailTab) : "overview";

  const detailsQuery = useTradingAccount(accountId);
  const testConnection = useTestTradingConnection();
  const syncMutation = useSyncTradingAccount(accountId);
  const [disconnectOpen, setDisconnectOpen] = React.useState(false);
  const [reconnectOpen, setReconnectOpen] = React.useState(false);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const setTab = (next: DetailTab) => {
    router.replace(`/accounts/${accountId}${next === "overview" ? "" : `?tab=${next}`}`, {
      scroll: false,
    });
  };

  if (detailsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4" data-testid="accounts-detail-loading">
        <Skeleton className="h-8 w-64 animate-pulse rounded bg-muted" />
        <Skeleton className="h-24 w-full animate-pulse rounded-xl bg-muted" />
        <Skeleton className="h-40 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (detailsQuery.isError || !detailsQuery.data?.account) {
    const code = apiErrorCode(detailsQuery.error);
    if (code === "ACCOUNT_NOT_FOUND" || code === "NOT_FOUND") {
      return (
        <div
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-12 text-center"
          data-testid="accounts-detail-notfound"
        >
          <p className="font-heading text-lg font-semibold">{dict.detail.notFoundTitle}</p>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{dict.detail.notFoundBody}</p>
          <Button variant="outline" asChild className="mt-2" data-testid="accounts-detail-notfound-back">
            <Link href="/accounts">{dict.detail.notFoundCta}</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-loss/40 bg-loss/5 px-4 py-3" data-testid="accounts-detail-error">
        <p className="font-heading text-sm font-semibold text-loss">{dict.wizard.errorTitle}</p>
        <p className="mt-1 text-sm text-foreground">{translateDetailError(dict, detailsQuery.error)}</p>
      </div>
    );
  }

  const details = detailsQuery.data.account;
  const connected = details.connection?.status === "CONNECTED";
  const canReconnect = !connected && details.connection !== null;

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tradingAccount(accountId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tradingAccountPositions(accountId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tradingAccountOrders(accountId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tradingAccountDeals(accountId) }),
    ]);
    toast.success(`${details.name} ${dict.toasts.refreshDoneSuffix}`);
  };

  const handleTest = () => {
    testConnection.mutate(accountId, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(dict.test.successTitle, { description: dict.test.successBody });
        } else {
          toast.error(dict.test.failureTitle, { description: dict.test.failureBody });
        }
      },
      onError: (error) => {
        toast.error(dict.test.failureTitle, { description: translateDetailError(dict, error) });
      },
    });
  };

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (result) => {
        const run = result.run;
        if (run.status === "COMPLETED") {
          toast.success(dict.sync.completedTitle, {
            description: `${run.positionsUpserted} pos ${dict.sync.resultSeparator} ${run.ordersUpserted} ord ${dict.sync.resultSeparator} ${run.dealsUpserted} deals ${dict.sync.resultBodySuffix}`,
          });
        } else if (run.status === "PARTIAL") {
          toast.warning(dict.sync.partialTitle, {
            description: `${run.positionsUpserted} pos ${dict.sync.resultSeparator} ${run.ordersUpserted} ord ${dict.sync.resultSeparator} ${run.dealsUpserted} deals ${dict.sync.resultBodySuffix}`,
          });
        } else {
          toast.error(dict.sync.failedTitle, {
            description: run.errorCode ? (run.errorCode in dict.errors ? dict.errors[run.errorCode as keyof typeof dict.errors] : dict.errors.fallback) : undefined,
          });
        }
      },
      onError: (error) => {
        const code = apiErrorCode(error);
        if (code === "SYNC_ALREADY_RUNNING") {
          toast.info(dict.sync.alreadyRunningTitle, { description: dict.sync.alreadyRunningBody });
          return;
        }
        toast.error(dict.sync.failedTitle, { description: translateDetailError(dict, error) });
      },
    });
  };

  return (
    <div className="flex flex-col gap-5" data-testid="accounts-detail" data-account-id={details.id}>
      {/* ── Account header (§21) ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            data-testid="accounts-detail-back"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {dict.detail.backToAccounts}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-xl font-semibold tracking-tight">{details.name}</h2>
            <EnvironmentBadge environment={details.type} dict={dict} testid="accounts-detail-env" />
            {details.provider.isMock && (
              <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {dict.card.mockBadge}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {details.provider.providerName} · {details.provider.platform} · {maskAccountNumber(details.externalAccountId)} · {details.currency}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4">
            <span className="flex flex-col items-end gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">{dict.card.connectionLabel}</span>
              <ConnectionStatusBadge
                status={details.connection?.status ?? "DISCONNECTED"}
                dict={dict}
                testid="accounts-detail-connection"
              />
            </span>
            <span aria-hidden="true" className="h-8 w-px bg-border" />
            <span className="flex flex-col items-end gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">{dict.card.syncLabel}</span>
              <SyncStatusBadge
                status={details.synchronization.status}
                dict={dict}
                testid="accounts-detail-sync"
              />
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <HeaderAction label={dict.detail.actions.refresh} onClick={() => void handleRefresh()} testid="accounts-detail-refresh">
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </HeaderAction>
            <HeaderAction
              label={connected ? dict.detail.actions.sync : dict.detail.actions.testConnection}
              onClick={connected ? handleSync : handleTest}
              pending={connected ? syncMutation.isPending : testConnection.isPending}
              testid={connected ? "accounts-detail-sync-now" : "accounts-detail-test"}
            />
            {canReconnect && (
              <HeaderAction label={dict.detail.actions.reconnect} onClick={() => setReconnectOpen(true)} testid="accounts-detail-reconnect" />
            )}
            <HeaderAction
              label={dict.detail.actions.disconnect}
              destructive
              disabled={details.connection === null}
              onClick={() => setDisconnectOpen(true)}
              testid="accounts-detail-disconnect"
            />
          </div>
        </div>
      </div>

      {/* Read-only trust strip (§16 — critical trust feature) */}
      <div
        className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3.5 py-2.5"
        data-testid="accounts-readonly-notice"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">{dict.detail.readOnlyNotice}</p>
      </div>

      {/* Test-connection honest report (§19) */}
      {testConnection.data && (
        <div className="rounded-lg border border-border bg-surface px-3.5 py-3" data-testid="accounts-test-result">
          <p className="text-xs font-medium text-muted-foreground">{dict.wizard.connectStep.reportChecksLabel}</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {testConnection.data.checks.map((check) => (
              <li key={check.name} className="flex items-center justify-between gap-3 border-b border-border/60 py-1 last:border-b-0">
                <span className="flex items-center gap-2 text-xs">
                  <Check className={cn("size-3.5", check.ok ? "text-profit" : "text-loss")} aria-hidden="true" />
                  {dict.status.testCheck[check.name]}
                </span>
                <span className="text-xs text-muted-foreground">{check.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Tabs (URL-addressable, §67) ───────────────────────────────────── */}
      <div role="tablist" aria-label={dict.detail.tabsAria} className="flex items-center gap-1 border-b border-border pb-px" data-testid="accounts-detail-tabs">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            aria-selected={tab === name}
            data-testid={`accounts-tab-${name}`}
            onClick={() => setTab(name)}
            className={cn(
              "-mb-px border-b-2 px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              tab === name
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {dict.detail.tabs[name]}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab details={details} dict={dict} nowMs={nowMs} />}
      {tab === "positions" && <PositionsTab accountId={accountId} currency={details.currency} dict={dict} />}
      {tab === "orders" && <OrdersTab accountId={accountId} dict={dict} />}
      {tab === "history" && <HistoryTab accountId={accountId} currency={details.currency} dict={dict} />}

      <DisconnectAccountDialog
        account={disconnectOpen ? details : null}
        onOpenChange={setDisconnectOpen}
        dict={dict}
        onDisconnected={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAccountRoot });
        }}
      />
      <ReconnectAccountDialog
        account={reconnectOpen ? details : null}
        onOpenChange={setReconnectOpen}
        dict={dict}
      />
    </div>
  );
}

// ── Overview tab — snapshot + connection + synchronization (§22, §26–§28) ───

function OverviewTab({
  details,
  dict,
  nowMs,
}: {
  details: TradingAccountDetails;
  dict: AccountsDict;
  nowMs: number;
}) {
  const snapshot = details.snapshot;
  const cells = [
    { label: dict.card.balanceLabel, value: formatMoney(snapshot?.balance ?? null, details.currency) },
    { label: dict.card.equityLabel, value: formatMoney(snapshot?.equity ?? null, details.currency) },
    { label: dict.card.freeMarginLabel, value: formatMoney(snapshot?.freeMargin ?? null, details.currency) },
    { label: dict.card.marginLabel, value: formatMoney(snapshot?.margin ?? null, details.currency) },
    { label: dict.card.marginLevelLabel, value: formatMarginLevel(snapshot?.marginLevel ?? null) },
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="accounts-detail-overview">
      {/* Snapshot band */}
      <section aria-label={dict.detail.snapshotTitle} className="rounded-xl border border-border bg-surface">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-4 py-2.5">
          <h3 className="font-heading text-sm font-semibold">{dict.detail.snapshotTitle}</h3>
          {snapshot && (
            <span className="text-xs text-muted-foreground">
              {dict.detail.snapshotSyncedLabel} {formatRelativeTime(snapshot.syncedAt, dict.freshness, nowMs)}
            </span>
          )}
        </header>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-5" data-testid="accounts-detail-snapshot">
          {cells.map((cell) => (
            <div key={cell.label} className="min-w-0">
              <dt className="text-[11px] font-medium text-muted-foreground">{cell.label}</dt>
              <dd className="mt-1 truncate font-mono text-lg tabular-nums text-foreground">
                {cell.value ?? dict.card.unavailable}
              </dd>
            </div>
          ))}
        </dl>
        {!snapshot && (
          <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
            {dict.detail.syncIdleBody}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Connection panel (§27 — a DIFFERENT axis from sync) */}
        <section aria-label={dict.detail.connectionTitle} className="rounded-xl border border-border bg-surface">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h3 className="font-heading text-sm font-semibold">{dict.detail.connectionTitle}</h3>
          </header>
          <dl className="flex flex-col px-4 py-2">
            <DetailRow label={dict.detail.connectionMethodLabel} value={dict.detail.connectionMethodValue} />
            <DetailRow label={dict.detail.connectionCredentialsLabel} value={details.connection?.credentialsHint ?? dict.card.unavailable} mono />
            <DetailRow
              label={dict.detail.connectionLastConnectedLabel}
              value={details.connection?.lastConnectedAt ? formatAbsoluteTime(details.connection.lastConnectedAt) : dict.card.unavailable}
              mono
            />
            <div className="flex items-baseline justify-between gap-6 border-b border-border/60 py-2 last:border-b-0">
              <dt className="text-[11px] font-medium text-muted-foreground">{dict.detail.connectionLastErrorLabel}</dt>
              <dd className={cn("text-right text-xs", details.connection?.lastError ? "text-loss" : "text-muted-foreground")}>
                {details.connection?.lastError ?? dict.detail.connectionNoneError}
              </dd>
            </div>
          </dl>
        </section>

        {/* Synchronization panel (§26 + last run observability) */}
        <section aria-label={dict.detail.syncTitle} className="rounded-xl border border-border bg-surface">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h3 className="font-heading text-sm font-semibold">{dict.detail.syncTitle}</h3>
          </header>
          <dl className="flex flex-col px-4 py-2">
            <div className="flex items-center justify-between gap-6 border-b border-border/60 py-2">
              <dt className="text-[11px] font-medium text-muted-foreground">{dict.detail.syncStatusLabel}</dt>
              <dd>
                <SyncStatusBadge status={details.synchronization.status} dict={dict} testid="accounts-overview-sync" />
              </dd>
            </div>
            <DetailRow
              label={dict.card.lastSyncLabel}
              value={
                details.synchronization.lastSyncAt
                  ? `${formatRelativeTime(details.synchronization.lastSyncAt, dict.freshness, nowMs)} (${formatShortTime(details.synchronization.lastSyncAt)})`
                  : dict.freshness.never
              }
              mono
            />
          </dl>
          {details.synchronization.lastRun ? (
            <div className="border-t border-border/60 px-4 py-2.5" data-testid="accounts-detail-lastrun">
              <p className="text-[11px] font-medium text-muted-foreground">{dict.detail.syncLastRunLabel}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    details.synchronization.lastRun.status === "COMPLETED"
                      ? "border-profit/60 bg-profit/10 text-profit"
                      : details.synchronization.lastRun.status === "RUNNING"
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-loss/60 bg-loss/10 text-loss",
                  )}
                >
                  {dict.status.syncRun[details.synchronization.lastRun.status]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {details.synchronization.lastRun.trigger === "INITIAL" ? dict.detail.syncRunFields.triggerInitial : dict.detail.syncRunFields.triggerManual}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatDurationMs(details.synchronization.lastRun.durationMs) ?? "—"}
                </span>
              </div>
              <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="accounts-detail-run-counts">
                {details.synchronization.lastRun.positionsUpserted} pos {dict.sync.resultSeparator} {details.synchronization.lastRun.ordersUpserted} ord {dict.sync.resultSeparator} {details.synchronization.lastRun.dealsUpserted} deals {dict.sync.resultBodySuffix}
              </p>
            </div>
          ) : (
            <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">{dict.detail.syncNoRun}</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Positions (§23 — strictly informational) ─────────────────────────────────

function PositionsTab({ accountId, currency, dict }: { accountId: string; currency: string; dict: AccountsDict }) {
  const positionsQuery = useTradingAccountPositions(accountId);
  const positions = positionsQuery.data?.positions ?? [];

  if (positionsQuery.isPending) {
    return <Skeleton className="h-48 w-full animate-pulse rounded-xl bg-muted" />;
  }

  if (positions.length === 0) {
    return (
      <EmptyPanel testid="accounts-positions-empty">
        <p className="font-heading text-sm font-semibold">{dict.positions.emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{dict.positions.emptyBody}</p>
      </EmptyPanel>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="accounts-positions">
      {/* Desktop ruled ledger */}
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-raised/40">
              {[
                dict.positions.columns.symbol,
                dict.positions.columns.direction,
                dict.positions.columns.volume,
                dict.positions.columns.entry,
                dict.positions.columns.current,
                dict.positions.columns.stopLoss,
                dict.positions.columns.takeProfit,
                dict.positions.columns.pnl,
                dict.positions.columns.openedAt,
              ].map((label) => (
                <th key={label} className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const pnl = formatMoney(position.unrealizedPnl, currency, { signed: true }) ?? dict.card.unavailable;
              const pnlNumeric = position.unrealizedPnl === null ? 0 : Number(position.unrealizedPnl);
              return (
                <tr key={position.id} className="border-t border-border/60 hover:bg-surface-raised/40" data-testid="accounts-position-row">
                  <Td mono>{position.symbol}</Td>
                  <Td mono>{position.direction}</Td>
                  <Td mono tabular>
                    {formatVolume(position.volume)}
                  </Td>
                  <Td mono tabular>
                    {formatPrice(position.entryPrice) ?? dict.card.unavailable}
                  </Td>
                  <Td mono tabular>
                    {formatPrice(position.currentPrice) ?? dict.card.unavailable}
                  </Td>
                  <Td mono tabular muted>
                    {formatPrice(position.stopLoss) ?? dict.card.unavailable}
                  </Td>
                  <Td mono tabular muted>
                    {formatPrice(position.takeProfit) ?? dict.card.unavailable}
                  </Td>
                  <Td mono tabular className={pnlNumeric > 0 ? "text-profit" : pnlNumeric < 0 ? "text-loss" : undefined} data-testid="accounts-position-pnl">
                    {pnl}
                  </Td>
                  <Td mono muted>
                    {formatShortTime(position.openedAt)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile stacked ruled cards */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {positions.map((position) => {
          const pnl = formatMoney(position.unrealizedPnl, currency, { signed: true }) ?? dict.card.unavailable;
          const pnlNumeric = position.unrealizedPnl === null ? 0 : Number(position.unrealizedPnl);
          return (
            <div key={position.id} className="rounded-lg border border-border bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-foreground">{position.symbol}</span>
                <span className={cn("font-mono text-sm tabular-nums", pnlNumeric > 0 ? "text-profit" : pnlNumeric < 0 ? "text-loss" : "text-foreground")}>
                  {pnl}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                <MobileCell label={dict.positions.columns.direction} value={position.direction} mono />
                <MobileCell label={dict.positions.columns.volume} value={formatVolume(position.volume)} mono />
                <MobileCell label={dict.positions.columns.entry} value={formatPrice(position.entryPrice) ?? dict.card.unavailable} mono />
                <MobileCell label={dict.positions.columns.current} value={formatPrice(position.currentPrice) ?? dict.card.unavailable} mono />
                <MobileCell label={dict.positions.columns.stopLoss} value={formatPrice(position.stopLoss) ?? dict.card.unavailable} mono />
                <MobileCell label={dict.positions.columns.takeProfit} value={formatPrice(position.takeProfit) ?? dict.card.unavailable} mono />
                <MobileCell label={dict.positions.columns.openedAt} value={formatShortTime(position.openedAt)} mono />
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Orders (§24 — READ ONLY) ─────────────────────────────────────────────────

function OrdersTab({ accountId, dict }: { accountId: string; dict: AccountsDict }) {
  const ordersQuery = useTradingAccountOrders(accountId);
  const orders = ordersQuery.data?.orders ?? [];

  if (ordersQuery.isPending) {
    return <Skeleton className="h-48 w-full animate-pulse rounded-xl bg-muted" />;
  }

  if (orders.length === 0) {
    return (
      <EmptyPanel testid="accounts-orders-empty">
        <p className="font-heading text-sm font-semibold">{dict.orders.emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{dict.orders.emptyBody}</p>
      </EmptyPanel>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="accounts-orders">
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-raised/40">
              {[
                dict.orders.columns.id,
                dict.orders.columns.symbol,
                dict.orders.columns.type,
                dict.orders.columns.volume,
                dict.orders.columns.price,
                dict.orders.columns.stopLoss,
                dict.orders.columns.takeProfit,
                dict.orders.columns.createdAt,
              ].map((label) => (
                <th key={label} className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-border/60 hover:bg-surface-raised/40" data-testid="accounts-order-row">
                <Td mono muted>
                  {order.id}
                </Td>
                <Td mono>{order.symbol}</Td>
                <Td mono>{order.type}</Td>
                <Td mono tabular>
                  {formatVolume(order.volume)}
                </Td>
                <Td mono tabular>
                  {formatPrice(order.price) ?? dict.card.unavailable}
                </Td>
                <Td mono tabular muted>
                  {formatPrice(order.stopLoss) ?? dict.card.unavailable}
                </Td>
                <Td mono tabular muted>
                  {formatPrice(order.takeProfit) ?? dict.card.unavailable}
                </Td>
                <Td mono muted>
                  {formatShortTime(order.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2.5 md:hidden">
        {orders.map((order) => (
          <div key={order.id} className="rounded-lg border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-foreground">{order.symbol}</span>
              <span className="text-[11px] font-medium text-muted-foreground">{order.type}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
              <MobileCell label={dict.orders.columns.volume} value={formatVolume(order.volume)} mono />
              <MobileCell label={dict.orders.columns.price} value={formatPrice(order.price) ?? dict.card.unavailable} mono />
              <MobileCell label={dict.orders.columns.stopLoss} value={formatPrice(order.stopLoss) ?? dict.card.unavailable} mono />
              <MobileCell label={dict.orders.columns.takeProfit} value={formatPrice(order.takeProfit) ?? dict.card.unavailable} mono />
              <MobileCell label={dict.orders.columns.createdAt} value={formatShortTime(order.createdAt)} mono />
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History — deals (§25 — order/deal/trade stay distinct concepts) ─────────

function HistoryTab({ accountId, currency, dict }: { accountId: string; currency: string; dict: AccountsDict }) {
  const dealsQuery = useTradingAccountDeals(accountId);
  const deals = dealsQuery.data?.deals ?? [];

  if (dealsQuery.isPending) {
    return <Skeleton className="h-48 w-full animate-pulse rounded-xl bg-muted" />;
  }

  if (deals.length === 0) {
    return (
      <EmptyPanel testid="accounts-history-empty">
        <p className="font-heading text-sm font-semibold">{dict.history.emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{dict.history.emptyBody}</p>
      </EmptyPanel>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="accounts-history">
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-raised/40">
              {[
                dict.history.columns.deal,
                dict.history.columns.symbol,
                dict.history.columns.side,
                dict.history.columns.volume,
                dict.history.columns.price,
                dict.history.columns.profit,
                dict.history.columns.commission,
                dict.history.columns.swap,
                dict.history.columns.executedAt,
              ].map((label) => (
                <th key={label} className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const isBalanceOp = deal.symbol === null;
              const profit = formatMoney(deal.profit, currency, { signed: true }) ?? dict.card.unavailable;
              const profitNumeric = deal.profit === null ? 0 : Number(deal.profit);
              return (
                <tr key={deal.id} className="border-t border-border/60 hover:bg-surface-raised/40" data-testid="accounts-deal-row">
                  <Td mono muted>
                    {deal.externalDealId}
                  </Td>
                  <Td mono>
                    {isBalanceOp ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid="accounts-deal-balance-op">
                        {dict.history.balanceOperation}
                      </span>
                    ) : (
                      deal.symbol
                    )}
                  </Td>
                  <Td mono>{deal.side}</Td>
                  <Td mono tabular>
                    {formatVolume(deal.volume)}
                  </Td>
                  <Td mono tabular>
                    {formatPrice(deal.price) ?? dict.card.unavailable}
                  </Td>
                  <Td mono tabular className={profitNumeric > 0 ? "text-profit" : profitNumeric < 0 ? "text-loss" : undefined}>
                    {profit}
                  </Td>
                  <Td mono tabular muted>
                    {formatMoney(deal.commission, currency, { signed: true }) ?? dict.card.unavailable}
                  </Td>
                  <Td mono tabular muted>
                    {formatMoney(deal.swap, currency, { signed: true }) ?? dict.card.unavailable}
                  </Td>
                  <Td mono muted>
                    {formatShortTime(deal.executedAt)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2.5 md:hidden">
        {deals.map((deal) => {
          const isBalanceOp = deal.symbol === null;
          const profit = formatMoney(deal.profit, currency, { signed: true }) ?? dict.card.unavailable;
          const profitNumeric = deal.profit === null ? 0 : Number(deal.profit);
          return (
            <div key={deal.id} className="rounded-lg border border-border bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-foreground">{isBalanceOp ? dict.history.balanceOperation : deal.symbol}</span>
                <span className={cn("font-mono text-sm tabular-nums", profitNumeric > 0 ? "text-profit" : profitNumeric < 0 ? "text-loss" : "text-foreground")}>
                  {profit}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                <MobileCell label={dict.history.columns.side} value={deal.side} mono />
                <MobileCell label={dict.history.columns.volume} value={formatVolume(deal.volume)} mono />
                <MobileCell label={dict.history.columns.price} value={formatPrice(deal.price) ?? dict.card.unavailable} mono />
                <MobileCell label={dict.history.columns.executedAt} value={formatShortTime(deal.executedAt)} mono />
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared small pieces ──────────────────────────────────────────────────────

function HeaderAction({
  label,
  onClick,
  pending = false,
  destructive = false,
  disabled = false,
  testid,
  children,
}: {
  label: string;
  onClick: () => void;
  pending?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  testid: string;
  children?: React.ReactNode;
}) {
  return (
    <Button
      variant={destructive ? "ghost" : "outline"}
      size="sm"
      className={cn("min-h-8 gap-1.5 text-xs", destructive && "text-loss hover:bg-loss/10 hover:text-loss")}
      onClick={onClick}
      disabled={disabled || pending}
      data-testid={testid}
    >
      {children}
      {label}
    </Button>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border/60 py-2 last:border-b-0">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-xs text-foreground", mono && "font-mono tabular-nums")}>{value}</dd>
    </div>
  );
}

function Td({
  children,
  mono = false,
  tabular = false,
  muted = false,
  className,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { mono?: boolean; tabular?: boolean; muted?: boolean }) {
  return (
    <td
      className={cn(
        "px-3 py-2 text-foreground",
        mono && "font-mono text-xs",
        tabular && "tabular-nums",
        muted && "text-muted-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

function MobileCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-xs text-foreground", mono && "font-mono tabular-nums")}>{value}</dd>
    </div>
  );
}

function EmptyPanel({
  testid,
  children,
}: {
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface px-6 py-10 text-center" data-testid={testid}>
      {children}
    </div>
  );
}

function translateDetailError(dict: AccountsDict, error: unknown): string {
  const code = apiErrorCode(error);
  if (code && code in dict.errors) {
    return dict.errors[code as keyof typeof dict.errors];
  }
  return dict.errors.fallback;
}

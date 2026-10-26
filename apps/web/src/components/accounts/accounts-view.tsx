"use client";

import * as React from "react";
import { AlertTriangle, Plus, RefreshCcw, ShieldOff, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NowClockContext } from "@/components/monitoring/monitoring-primitives";
import { useNowMs } from "@/lib/realtime/use-now";
import {
  useTradingAccountProviders,
  useTradingAccounts,
  useTradingBrokerCatalog,
  useSyncTradingAccount,
} from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";

import { AccountCard, AccountCardSkeleton } from "./account-card";
import { ConnectAccountDialog } from "./connect-account-dialog";
import { AccountDetailDrawer } from "./account-detail-drawer";

/**
 * Accounts overview (Phase 02 Step Four) - the at-a-glance surface. Reads
 * ONLY the /trading-accounts list (details per account, snapshot embedded);
 * no positions/orders/deals are fetched here (they load on demand inside the
 * detail drawer). Aggregate metrics stay per-account: accounts may use
 * different currencies and no verified conversion exists, so no misleading
 * total is ever rendered (spec §9.2).
 */

function SummaryLine({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-1 flex-col gap-0.5" data-testid={testId}>
      <span className="ledger-label">{label}</span>
      <span className="font-mono text-xl tabular-nums">{value}</span>
    </div>
  );
}

export function AccountsView() {
  const dict = useDict();
  const P = dict.accounts.page;
  const S = dict.accounts.states;
  const nowMs = useNowMs(1000);
  const accounts = useTradingAccounts();
  const providers = useTradingAccountProviders();
  const brokerCatalog = useTradingBrokerCatalog();
  const sync = useSyncTradingAccount();

  const [connectOpen, setConnectOpen] = React.useState(false);
  const [detailAccountId, setDetailAccountId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const list = accounts.data?.accounts ?? [];
  const connectedCount = list.filter(
    (account) => account.connection?.status === "CONNECTED" || account.connection?.status === "CONNECTING",
  ).length;
  const attentionCount = list.filter((account) => account.connection?.status === "ERROR").length;
  const currencies = new Set(list.map((account) => account.currency));
  const mixedCurrencies = currencies.size > 1;

  const openDetail = (accountId: string) => {
    setDetailAccountId(accountId);
    setDetailOpen(true);
  };

  return (
    <NowClockContext.Provider value={nowMs}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{P.title}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">{P.subtitle}</p>
            </div>
            <Button onClick={() => setConnectOpen(true)} data-testid="accounts-add-button">
              <Plus className="size-4" aria-hidden />
              {P.add}
            </Button>
          </div>
        </header>

        {accounts.isError ? (
          <Card className="flex flex-col items-start gap-3 bg-surface p-5" data-testid="accounts-error">
            <p className="flex items-center gap-2 font-medium text-loss">
              <AlertTriangle className="size-4" aria-hidden />
              {S.errorTitle}
            </p>
            <p className="text-sm text-muted-foreground">{S.errorBody}</p>
            <Button variant="outline" size="sm" onClick={() => accounts.refetch()} data-testid="accounts-error-retry">
              <RefreshCcw className="size-3.5" aria-hidden />
              {dict.common.retry}
            </Button>
          </Card>
        ) : accounts.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2" data-testid="accounts-loading">
            <AccountCardSkeleton />
            <AccountCardSkeleton />
          </div>
        ) : list.length === 0 ? (
          <Card className="flex flex-col items-start gap-3 bg-surface p-6" data-testid="accounts-empty">
            <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
              <Wallet className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="font-heading text-base font-semibold">{S.emptyTitle}</p>
              <p className="max-w-xl text-sm text-muted-foreground">{S.emptyBody}</p>
            </div>
            <ul className="grid gap-1.5 text-xs text-muted-foreground" data-testid="accounts-empty-providers">
              {(providers.data?.providers ?? []).map((provider) => (
                <li key={provider.providerId} className="flex items-center gap-2">
                  <span
                    className="size-1.5 rounded-full bg-accent"
                    aria-hidden
                  />
                  <span className="font-medium text-foreground">{provider.providerName}</span>
                  <span>- connectable now ({provider.isMock ? "simulated" : provider.platform})</span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-muted-foreground">
                <ShieldOff className="size-3.5" aria-hidden />
                <span>{S.emptyProvidersNote}</span>
              </li>
            </ul>
            <Button onClick={() => setConnectOpen(true)} data-testid="accounts-empty-add">
              <Plus className="size-4" aria-hidden />
              {P.add}
            </Button>
          </Card>
        ) : (
          <>
            <div className="stat-strip" data-testid="accounts-summary">
              <SummaryLine label={dict.accounts.summary.accounts} value={String(list.length)} testId="accounts-summary-total" />
              <SummaryLine label={dict.accounts.summary.connected} value={String(connectedCount)} testId="accounts-summary-connected" />
              <SummaryLine
                label={dict.accounts.summary.attention}
                value={String(attentionCount)}
                testId="accounts-summary-attention"
              />
              <SummaryLine
                label={dict.accounts.summary.openPositions}
                value={String(
                  list.reduce((sum, account) => sum + (account.synchronization.lastRun?.positionsUpserted ?? 0), 0),
                )}
                testId="accounts-summary-positions"
              />
            </div>
            {mixedCurrencies ? (
              <p className="text-xs text-muted-foreground" data-testid="accounts-currencies-note">
                {dict.accounts.summary.mixedCurrenciesHint}
              </p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2" data-testid="accounts-collection">
              {list.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  nowMs={nowMs}
                  onOpen={() => openDetail(account.id)}
                  onSync={() => sync.mutate(account.id)}
                  syncing={sync.isPending && sync.variables === account.id}
                />
              ))}
            </div>
          </>
        )}

        <ConnectAccountDialog
          open={connectOpen}
          onOpenChange={setConnectOpen}
          providers={providers.data?.providers ?? []}
          brokers={brokerCatalog.data?.brokers ?? []}
          onConnected={openDetail}
        />
        <AccountDetailDrawer
          accountId={detailOpen ? detailAccountId : null}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      </div>
    </NowClockContext.Provider>
  );
}

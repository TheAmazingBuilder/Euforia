"use client";

import * as React from "react";
import { ArrowRight, RefreshCcw } from "lucide-react";

import type { TradingAccountDetails } from "@cosmoz/shared";
import { formatMoney, formatSignedMoney } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ageFromIso } from "@/components/monitoring/monitoring-primitives";
import { environmentStamp } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

import {
  ConnectionStatusBadge,
  EnvironmentStamp,
  SimulatedProviderBadge,
  SyncStatusBadge,
} from "./account-badges";

/**
 * One connected account in the overview collection. Identity + provider +
 * environment stamp + the two financial metrics that matter at a glance
 * (balance, equity) + both status axes + freshness. Every value renders from
 * the details response; nothing is derived client-side, and a null metric
 * renders "-" with its "Not reported" label — never a fabricated zero.
 */

export function AccountMoneyValue({
  amount,
  currency,
  signed = false,
  testId,
}: {
  amount: string | null | undefined;
  currency: TradingAccountDetails["currency"];
  signed?: boolean;
  testId?: string;
}) {
  if (amount === null || amount === undefined) {
    return (
      <span className="font-mono text-sm tabular-nums text-muted-foreground" data-testid={testId}>
        -
      </span>
    );
  }
  const formatted = signed
    ? formatSignedMoney(amount, currency)
    : formatMoney(amount, currency);
  const negative = amount.trim().startsWith("-");
  return (
    <span
      className={cn(
        "font-mono text-sm tabular-nums",
        signed && negative && "text-loss",
        signed && !negative && amount !== "0" && amount !== "0.00" && "text-profit",
      )}
      data-testid={testId}
    >
      {formatted}
    </span>
  );
}

function SyncAgeLine({ iso, nowMs }: { iso: string | null; nowMs: number | null }) {
  const age = ageFromIso(iso, nowMs);
  if (age === null) {
    return <span className="text-xs text-muted-foreground">Never synced</span>;
  }
  const minutes = Math.floor(age / 60_000);
  const label =
    age < 60_000
      ? "just now"
      : minutes < 60
        ? `${minutes} min ago`
        : `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <RefreshCcw className="size-3" aria-hidden />
      Synced {label}
    </span>
  );
}

export function AccountCardSkeleton() {
  return (
    <Card className="bg-surface p-5" aria-busy="true" data-testid="account-card-skeleton">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
      </div>
    </Card>
  );
}

export function AccountCard({
  account,
  nowMs,
  onOpen,
  onSync,
  syncing,
}: {
  account: TradingAccountDetails;
  nowMs: number | null;
  onOpen: () => void;
  onSync: () => void;
  syncing: boolean;
}) {
  const snapshot = account.snapshot;
  const openPositions = account.synchronization.lastRun?.positionsUpserted ?? 0;
  const positionsLabel =
    account.synchronization.status === "UNKNOWN"
      ? "No sync yet"
      : `${openPositions} open position${openPositions === 1 ? "" : "s"} (last run)`;

  return (
    <Card
      className="flex flex-col gap-4 bg-surface p-5 transition-colors hover:border-accent/40"
      data-testid="account-card"
      data-account-id={account.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="truncate text-left font-heading text-base font-semibold tracking-tight text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              data-testid="account-card-name"
            >
              {account.name}
            </button>
            <EnvironmentStamp environment={account.type} />
            {account.provider.isMock ? <SimulatedProviderBadge /> : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {account.provider.providerName} · {account.broker} · {account.externalAccountId} ·{" "}
            {account.currency}
            {account.brokerIdentification &&
            account.brokerIdentification.confidence !== "UNKNOWN" ? (
              <span
                className="text-foreground/70"
                data-testid="account-card-broker-detected"
              >
                {" "}· {account.brokerIdentification.displayName}
              </span>
            ) : null}
          </p>
        </div>
        <ConnectionStatusBadge
          status={account.connection?.status ?? "DISCONNECTED"}
          testId="account-card-connection"
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="ledger-label">Balance</dt>
          <dd>
            <AccountMoneyValue
              amount={snapshot?.balance ?? null}
              currency={account.currency}
              testId="account-card-balance"
            />
          </dd>
        </div>
        <div>
          <dt className="ledger-label">Equity</dt>
          <dd>
            <AccountMoneyValue
              amount={snapshot?.equity ?? null}
              currency={account.currency}
              testId="account-card-equity"
            />
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex flex-col gap-1">
          <SyncStatusBadge status={account.synchronization.status} testId="account-card-sync" />
          <SyncAgeLine iso={account.synchronization.lastSyncAt ?? null} nowMs={nowMs} />
          <span className="text-xs text-muted-foreground">{positionsLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={onSync}
            disabled={syncing || account.connection?.status !== "CONNECTED"}
            data-testid="account-card-sync-button"
            aria-label={`Sync ${account.name} now`}
          >
            <RefreshCcw className={cn("size-3.5", syncing && "animate-spin")} aria-hidden />
            {syncing ? "Syncing…" : "Sync"}
          </Button>
          <Button variant="ghost" size="xs" onClick={onOpen} data-testid="account-card-open">
            Details
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <p className="text-[11px] leading-4 text-muted-foreground">
        {environmentStamp(account.type)} ·{" "}
        {account.connection?.credentialsHint ? (
          <>
            credential <span className="font-mono">{account.connection.credentialsHint}</span> ·{" "}
          </>
        ) : null}
        {snapshot?.syncedAt ? `snapshot ${new Date(snapshot.syncedAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : "no snapshot yet"}
      </p>
    </Card>
  );
}

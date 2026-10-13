"use client";

import * as React from "react";
import { KeyRound, LifeBuoy, Pencil, RefreshCcw, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

import type { TradingConnectionTestResponse } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { ConfirmDialog } from "@/components/settings/settings-primitives";
import { apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import {
  useDisconnectTradingAccount,
  useReconnectTradingAccount,
  useRenameTradingAccount,
  useSyncTradingAccount,
  useTestTradingConnection,
  useTradingAccountDeals,
  useTradingAccountDetails,
  useTradingAccountOrders,
  useTradingAccountPositions,
} from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";

import { ConnectionStatusBadge, SimulatedProviderBadge, SyncStatusBadge } from "./account-badges";
import { AccountMoneyValue } from "./account-card";
import {
  ExternalDealsTable,
  ExternalOrdersTable,
  ExternalPositionsTable,
} from "./external-activity-tables";

/**
 * Account detail (Phase 02 Step Five) — Dialog on desktop, Sheet on mobile
 * (established useIsDesktop convention). Organized as Overview (snapshot +
 * connection + latest run) and three SEPARATE read-only activity tabs:
 * positions ≠ orders ≠ deals (spec §7.4 — different record kinds stay
 * distinct, and none of them is a journal trade).
 *
 * Actions exposed are exactly what the backend supports: rename, test (4
 * named checks), reconnect (with fresh credentials), sync, disconnect
 * (requireTyped confirmation). Nothing else — no close, no modify, no
 * cancel: read-only by construction.
 */

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

function TestChecksPanel({ accountId }: { accountId: string }) {
  const dict = useDict();
  const T = dict.accounts.test;
  const test = useTestTradingConnection(accountId);
  const [result, setResult] = React.useState<TradingConnectionTestResponse | null>(null);

  const run = () => {
    test.mutate(undefined, {
      onSuccess: (response) => setResult(response),
      onError: (error) => toast.error(apiErrorMessage(error, dict.accounts.errors.test)),
    });
  };

  return (
    <div className="rounded-lg border border-border p-3" data-testid="connection-test-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldQuestion className="size-4 text-muted-foreground" aria-hidden />
          {T.title}
        </p>
        <Button variant="outline" size="xs" onClick={run} disabled={test.isPending} data-testid="connection-test-run">
          {test.isPending ? T.running : result ? T.rerun : T.run}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{T.subtitle}</p>
      {result ? (
        <ul className="mt-3 grid gap-1.5" data-testid="connection-test-results">
          {result.checks.map((check) => (
            <li key={check.name} className="flex items-start gap-2 text-xs">
              <span
                className={
                  check.ok
                    ? "font-mono font-semibold text-profit"
                    : "font-mono font-semibold text-loss"
                }
              >
                {check.ok ? "PASS" : "FAIL"}
              </span>
              <span>
                <span className="font-medium text-foreground">{T.checks[check.name as keyof typeof T.checks]}</span>
                <span className="block text-muted-foreground">{check.detail}</span>
              </span>
            </li>
          ))}
          <li className="mt-1 text-xs" aria-live="polite">
            {result.ok ? T.allGood : T.someFailed}
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function ReconnectDialog({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const dict = useDict();
  const D = dict.accounts.detail;
  const reconnect = useReconnectTradingAccount();
  const [secret, setSecret] = React.useState("");

  // Reset-on-close flows through the open handler — no effect, no cascades.
  const handleOpenChange = (next: boolean) => {
    if (!next) setSecret("");
    onOpenChange(next);
  };

  const submit = () => {
    reconnect.mutate(
      { accountId, input: { credentials: { method: "API_KEY", secret: secret.trim() } } },
      {
        onSuccess: () => {
          toast.success(D.reconnectTitle);
          onOpenChange(false);
        },
        onError: (error) => {
          const code = apiErrorCode(error);
          toast.error(
            code === "ALREADY_CONNECTED"
              ? dict.accounts.status.connected
              : code === "INVALID_CREDENTIALS"
                ? dict.accounts.connect.errors.invalidCredentials
                : apiErrorMessage(error, dict.accounts.errors.reconnect),
          );
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-surface" data-testid="reconnect-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{D.reconnectTitle}</DialogTitle>
          <DialogDescription>{D.reconnectHint}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="reconnect-secret">{D.reconnectLabel}</Label>
          <Input
            id="reconnect-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            autoComplete="new-password"
            data-testid="reconnect-secret"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {dict.common.cancel}
          </Button>
          <Button onClick={submit} disabled={secret.trim().length === 0 || reconnect.isPending} data-testid="reconnect-submit">
            {reconnect.isPending ? dict.common.saving : D.reconnect}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccountDetailDrawer({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const dict = useDict();
  const D = dict.accounts.detail;
  const isDesktop = useIsDesktop();
  const details = useTradingAccountDetails(open ? accountId : null);
  const positions = useTradingAccountPositions(open ? accountId : null);
  const orders = useTradingAccountOrders(open ? accountId : null);
  const deals = useTradingAccountDeals(open ? accountId : null);
  const rename = useRenameTradingAccount();
  const disconnect = useDisconnectTradingAccount();
  const sync = useSyncTradingAccount();

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [disconnectOpen, setDisconnectOpen] = React.useState(false);
  const [reconnectOpen, setReconnectOpen] = React.useState(false);

  const account = details.data?.account ?? null;

  if (accountId === null) return null;

  const submitRename = (name: string) => {
    if (!account || name.trim() === "" || name.trim() === account.name) {
      setRenameOpen(false);
      return;
    }
    rename.mutate(
      { accountId: account.id, input: { name: name.trim() } },
      {
        onSuccess: () => {
          toast.success(D.renameTitle);
          setRenameOpen(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, dict.accounts.errors.rename)),
      },
    );
  };

  const submitDisconnect = () => {
    if (!account) return;
    disconnect.mutate(account.id, {
      onSuccess: () => {
        toast.success(D.disconnectConfirmLabel);
        setDisconnectOpen(false);
        onOpenChange(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, dict.accounts.errors.disconnect)),
    });
  };

  const submitSync = () => {
    if (!account) return;
    sync.mutate(account.id, {
      onSuccess: (response) => {
        toast.success(
          response.run.status === "COMPLETED"
            ? `${D.syncNow} — ${response.run.dealsUpserted + response.run.ordersUpserted + response.run.positionsUpserted} records`
            : dict.accounts.status.syncError,
        );
      },
      onError: (error) => {
        const code = apiErrorCode(error);
        toast.error(
          code === "SYNC_ALREADY_RUNNING"
            ? "A synchronization is already running."
            : code === "INVALID_CREDENTIALS"
              ? dict.accounts.connect.errors.invalidCredentials
              : apiErrorMessage(error, dict.accounts.errors.sync),
        );
      },
    });
  };

  const body = (
    <Tabs defaultValue="overview" className="mt-4">
      <TabsList className="w-full" data-testid="account-detail-tabs">
        <TabsTrigger value="overview" className="flex-1">{D.overviewTab}</TabsTrigger>
        <TabsTrigger value="positions" className="flex-1">{D.positionsTab}</TabsTrigger>
        <TabsTrigger value="orders" className="flex-1">{D.ordersTab}</TabsTrigger>
        <TabsTrigger value="deals" className="flex-1">{D.dealsTab}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4 grid gap-4" data-testid="account-detail-overview">
        {account?.provider.isMock ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning" data-testid="account-simulated-note">
            <LifeBuoy className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {D.simulatedNote}
          </p>
        ) : null}

        {account ? (
          <>
            <div className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{D.snapshotSection}</p>
                <SyncStatusBadge status={account.synchronization.status} testId="account-detail-sync-status" />
              </div>
              <dl className="mt-2">
                <DetailRow label={D.balance}>
                  <AccountMoneyValue amount={account.snapshot?.balance ?? null} currency={account.currency} testId="account-detail-balance" />
                </DetailRow>
                <DetailRow label={D.equity}>
                  <AccountMoneyValue amount={account.snapshot?.equity ?? null} currency={account.currency} testId="account-detail-equity" />
                </DetailRow>
                <DetailRow label="Unrealized P&L">
                  <AccountMoneyValue amount={account.snapshot?.unrealizedPnl ?? null} currency={account.currency} signed testId="account-detail-unrealized" />
                </DetailRow>
                <DetailRow label="Margin">
                  <AccountMoneyValue amount={account.snapshot?.margin ?? null} currency={account.currency} />
                </DetailRow>
                <DetailRow label="Free margin">
                  <AccountMoneyValue amount={account.snapshot?.freeMargin ?? null} currency={account.currency} />
                </DetailRow>
                <DetailRow label="Margin level">
                  <AccountMoneyValue amount={account.snapshot?.marginLevel ?? null} currency={account.currency} />
                </DetailRow>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                {account.snapshot
                  ? `Snapshot taken ${account.snapshot.syncedAt.slice(0, 16).replace("T", " ")} UTC — values are the last synced state, not live.`
                  : D.positionsNeverSynced}
              </p>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {D.connectionSection}
                <ConnectionStatusBadge status={account.connection?.status ?? "DISCONNECTED"} testId="account-detail-connection-status" />
              </p>
              <dl className="mt-2">
                <DetailRow label={D.provider}>{account.provider.providerName}</DetailRow>
                <DetailRow label={D.platform}>{account.provider.platform}</DetailRow>
                <DetailRow label={D.environment}>{account.type === "PROP_FIRM" ? "PROP" : account.type}</DetailRow>
                <DetailRow label={D.externalId}>
                  <span className="font-mono">{account.externalAccountId}</span>
                </DetailRow>
                <DetailRow label={D.currency}>{account.currency}</DetailRow>
                <DetailRow label={D.startingBalance}>
                  <span className="font-mono tabular-nums">{account.startingBalance}</span>
                </DetailRow>
                <DetailRow label={D.method}>{account.connection?.method ?? "—"}</DetailRow>
                <DetailRow label="Credential">
                  {account.connection?.credentialsHint ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                      <KeyRound className="size-3 text-muted-foreground" aria-hidden />
                      {account.connection.credentialsHint}
                    </span>
                  ) : (
                    "—"
                  )}
                </DetailRow>
                <DetailRow label={D.permissions}>
                  <span className="font-mono text-xs">{account.connection?.permissions.length ?? 0} READ</span>
                </DetailRow>
                {account.connection?.lastError ? (
                  <DetailRow label="Last error">
                    <span className="text-xs text-loss">{account.connection.lastError}</span>
                  </DetailRow>
                ) : null}
              </dl>
            </div>

            <TestChecksPanel accountId={account.id} />

            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{D.syncSection}</p>
              <dl className="mt-2">
                <DetailRow label={D.lastSyncAt}>
                  {account.synchronization.lastSyncAt
                    ? account.synchronization.lastSyncAt.slice(0, 16).replace("T", " ") + " UTC"
                    : "—"}
                </DetailRow>
                <DetailRow label={D.lastRun}>
                  {account.synchronization.lastRun
                    ? `${account.synchronization.lastRun.status} · ${account.synchronization.lastRun.trigger}`
                    : "—"}
                </DetailRow>
                <DetailRow label={D.runDuration}>
                  {account.synchronization.lastRun?.durationMs != null
                    ? `${account.synchronization.lastRun.durationMs} ms`
                    : "—"}
                </DetailRow>
                <DetailRow label={D.runCounts}>
                  {account.synchronization.lastRun
                    ? `P ${account.synchronization.lastRun.positionsUpserted} · O ${account.synchronization.lastRun.ordersUpserted} · D ${account.synchronization.lastRun.dealsUpserted}`
                    : "—"}
                </DetailRow>
                {account.synchronization.lastRun?.errorCode ? (
                  <DetailRow label={D.runError}>
                    <span className="font-mono text-xs text-loss">{account.synchronization.lastRun.errorCode}</span>
                  </DetailRow>
                ) : null}
              </dl>
            </div>
          </>
        ) : null}
      </TabsContent>

      <TabsContent value="positions" className="mt-4" data-testid="account-detail-positions">
        {positions.data ? (
          <ExternalPositionsTable
            positions={positions.data.positions}
            currency={account?.currency ?? "USD"}
            hasSynced={account?.synchronization.status !== "UNKNOWN"}
          />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">{dict.common.loading}</p>
        )}
      </TabsContent>

      <TabsContent value="orders" className="mt-4" data-testid="account-detail-orders">
        {orders.data ? (
          <ExternalOrdersTable orders={orders.data.orders} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">{dict.common.loading}</p>
        )}
      </TabsContent>

      <TabsContent value="deals" className="mt-4" data-testid="account-detail-deals">
        {deals.data ? (
          <ExternalDealsTable deals={deals.data.deals} currency={account?.currency ?? "USD"} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">{dict.common.loading}</p>
        )}
      </TabsContent>
    </Tabs>
  );

  const footer = account ? (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4" data-testid="account-detail-actions">
      <Button
        variant="outline"
        size="sm"
        onClick={submitSync}
        disabled={sync.isPending || account.connection?.status !== "CONNECTED"}
        data-testid="account-detail-sync"
      >
        <RefreshCcw className={["size-3.5", sync.isPending ? "animate-spin" : ""].join(" ").trim()} aria-hidden />
        {sync.isPending ? D.syncNow + "…" : D.syncNow}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setReconnectOpen(true)}
        disabled={account.connection?.status === "CONNECTED"}
        data-testid="account-detail-reconnect"
      >
        <KeyRound className="size-3.5" aria-hidden />
        {D.reconnect}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)} data-testid="account-detail-rename">
        <Pencil className="size-3.5" aria-hidden />
        {D.rename}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        className="ml-auto"
        onClick={() => setDisconnectOpen(true)}
        data-testid="account-detail-disconnect"
      >
        {D.disconnect}
      </Button>
    </div>
  ) : null;

  const titleBlock = account ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-heading text-lg font-semibold tracking-tight" data-testid="account-detail-name">
        {account.name}
      </span>
      {account.provider.isMock ? <SimulatedProviderBadge /> : null}
    </div>
  ) : (
    D.title
  );

  if (isDesktop) {
    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            className="max-h-[85dvh] max-w-2xl overflow-y-auto bg-surface"
            data-testid="account-detail-dialog"
          >
            <DialogHeader>
              <DialogTitle>{titleBlock}</DialogTitle>
              <DialogDescription>
                {account ? `${account.provider.providerName} · ${account.broker} · ${account.externalAccountId}` : D.title}
              </DialogDescription>
            </DialogHeader>
            {body}
            {footer}

            <RenameDialogShell
              key={`rename-${account?.id ?? "none"}-${account?.name ?? ""}`}
              open={renameOpen}
              onOpenChange={setRenameOpen}
              title={D.renameTitle}
              label={D.renameLabel}
              hint={D.renameHint}
              initialName={account?.name ?? ""}
              pending={rename.isPending}
              onSubmit={submitRename}
            />
            <ReconnectDialog accountId={accountId} open={reconnectOpen} onOpenChange={setReconnectOpen} />
            <ConfirmDialog
              open={disconnectOpen}
              onOpenChange={setDisconnectOpen}
              title={D.disconnectTitle}
              description={D.disconnectBody}
              confirmLabel={D.disconnectConfirmLabel}
              onConfirm={submitDisconnect}
              pending={disconnect.isPending}
              destructive
              requireTyped={account?.name}
              testid="account-disconnect"
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto bg-surface"
          data-testid="account-detail-sheet"
        >
          <SheetHeader>
            <SheetTitle>{titleBlock}</SheetTitle>
          </SheetHeader>
          {body}
          {footer}
          <RenameDialogShell
            key={`rename-${account?.id ?? "none"}-${account?.name ?? ""}`}
            open={renameOpen}
            onOpenChange={setRenameOpen}
            title={D.renameTitle}
            label={D.renameLabel}
            hint={D.renameHint}
            initialName={account?.name ?? ""}
            pending={rename.isPending}
            onSubmit={submitRename}
          />
          <ReconnectDialog accountId={accountId} open={reconnectOpen} onOpenChange={setReconnectOpen} />
          <ConfirmDialog
            open={disconnectOpen}
            onOpenChange={setDisconnectOpen}
            title={D.disconnectTitle}
            description={D.disconnectBody}
            confirmLabel={D.disconnectConfirmLabel}
            onConfirm={submitDisconnect}
            pending={disconnect.isPending}
            destructive
            requireTyped={account?.name}
            testid="account-disconnect"
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function RenameDialogShell({
  open,
  onOpenChange,
  title,
  label,
  hint,
  initialName,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  label: string;
  hint: string;
  /** Draft seed — the component is remounted (key) when the name changes. */
  initialName: string;
  pending: boolean;
  onSubmit: (name: string) => void;
}) {
  const dict = useDict();
  const [draft, setDraft] = React.useState(initialName);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-surface" data-testid="rename-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="rename-input">{label}</Label>
          <Input
            id="rename-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={64}
            data-testid="rename-input"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {dict.common.cancel}
          </Button>
          <Button
            onClick={() => onSubmit(draft)}
            disabled={pending || draft.trim().length === 0}
            data-testid="rename-submit"
          >
            {pending ? dict.common.saving : dict.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

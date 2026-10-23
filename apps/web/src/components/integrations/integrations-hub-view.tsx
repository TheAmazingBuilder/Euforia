"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Database,
  HeartPulse,
  KeyRound,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Webhook,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  IntegrationProvider,
  IntegrationsOverviewResponse,
} from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ConfirmDialog } from "@/components/settings/settings-primitives";
import {
  useConnectIntegration,
  useDisconnectIntegration,
  useIntegrationsOverview,
  useSimulateWebhook,
  useSyncIntegration,
  useTestIntegration,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  KindChip,
  PERMISSION_LABELS,
  StatusBadge,
  SyncLine,
} from "./hub-shared";

/**
 * /integrations — the professional Integration Hub (§3 structure):
 * Overview · Trading Accounts · Brokers · Exchanges · Market Data ·
 * Economic Data · Market News · TradingView · Notifications · External
 * Services. The active tab persists in the URL (?tab=).
 */

type Provider = IntegrationProvider;
type Overview = IntegrationsOverviewResponse;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Trading Accounts" },
  { id: "brokers", label: "Brokers" },
  { id: "exchanges", label: "Exchanges" },
  { id: "market-data", label: "Market Data" },
  { id: "economic", label: "Economic Data" },
  { id: "news", label: "Market News" },
  { id: "tradingview", label: "TradingView" },
  { id: "notifications", label: "Notifications" },
  { id: "external", label: "External Services" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const VAULT_REF_REGEX = /^vault:\/\/[\w-]+\/[\w-]+$/;

const utc = (iso: string | null): string =>
  iso === null ? "never" : `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;

export function IntegrationsHubView() {
  const { data: overview, isLoading } = useIntegrationsOverview();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [connectId, setConnectId] = React.useState<string | null>(null);
  const [disconnectId, setDisconnectId] = React.useState<string | null>(null);
  const [vaultRef, setVaultRef] = React.useState("");
  // Session-scoped health-check results (module upgrade) — "test now" leaves
  // visible evidence on the card, not just a toast.
  const [lastTest, setLastTest] = React.useState<Record<string, { ok: boolean; summary: string; at: string }>>({});

  const connect = useConnectIntegration();
  const disconnect = useDisconnectIntegration();
  const test = useTestIntegration();
  const sync = useSyncIntegration();
  const simulateWebhook = useSimulateWebhook();

  const rawTab = searchParams.get("tab") ?? "overview";
  const activeTab: TabId = (TABS.some((tab) => tab.id === rawTab) ? rawTab : "overview") as TabId;

  const setTab = React.useCallback(
    (next: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const connectTarget = overview?.providers.find((provider) => provider.id === connectId) ?? null;
  const disconnectTarget = overview?.providers.find((provider) => provider.id === disconnectId) ?? null;

  const onConfirmConnect = () => {
    if (connectId === null) return;
    if (!VAULT_REF_REGEX.test(vaultRef)) {
      toast.error("Vault reference must look like vault://provider/key");
      return;
    }
    connect.mutate(
      { providerId: connectId, input: { vaultRef } },
      {
        onSuccess: (provider) => {
          toast.success(
            provider.status === "AUTH_REQUIRED"
              ? `${provider.name} paired - but the stored credential failed the test. Reconnect after rotating the key.`
              : `${provider.name} connected - read-only scope`,
          );
          setConnectId(null);
          setVaultRef("");
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Could not connect the provider")),
      },
    );
  };

  const onConfirmDisconnect = () => {
    if (disconnectId === null) return;
    disconnect.mutate(disconnectId, {
      onSuccess: (result) => {
        toast.success(`${result.providerId} disconnected - synced history preserved`);
        setDisconnectId(null);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Could not disconnect")),
    });
  };

  const onTest = (provider: Provider) => {
    test.mutate(provider.id, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(`${provider.name}: connection test passed (auth, permissions, connectivity)`);
          setLastTest((previous) => ({
            ...previous,
            [provider.id]: { ok: true, summary: "auth · permissions · connectivity · provider response - all passed", at: new Date().toISOString() },
          }));
        } else {
          const failed = result.checks.filter((check) => !check.ok).map((check) => check.detail);
          toast.error(`${provider.name}: test failed - ${failed.join(" · ")}`);
          setLastTest((previous) => ({
            ...previous,
            [provider.id]: { ok: false, summary: failed.join(" · "), at: new Date().toISOString() },
          }));
        }
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Connection test failed")),
    });
  };

  /** One-click reconnect (module upgrade) — clean simulated OAuth: the
   * vault ref is derived from the provider id, no dialog, full pipeline
   * (pair → credential test → status) re-runs server-side. */
  const onReconnect = (provider: Provider) => {
    connect.mutate(
      { providerId: provider.id, input: { vaultRef: `vault://${provider.id}/api-key` } },
      {
        onSuccess: (result) => {
          toast.success(
            result.status === "AUTH_REQUIRED"
              ? `${result.name} re-paired - but the credential still fails the test. Rotate the key in the provider console.`
              : `${result.name} reconnected - ${result.status.toLowerCase()}`,
          );
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Reconnect failed")),
      },
    );
  };

  const onSync = (provider: Provider) => {
    sync.mutate(provider.id, {
      onSuccess: (result) => {
        toast.success(
          `${provider.name}: sync ${result.status === "DEGRADED" ? "partial" : "ok"} - ${result.sync.recordsProcessed.toLocaleString("en-US")} record(s)`,
        );
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Sync failed")),
    });
  };

  if (isLoading || overview === undefined) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          Integrations
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The platform layer between Euforia and the outside world - brokers,
          exchanges, market data, economic feeds, news, charting and delivery
          channels. One contract, many adapters; read-only by design.
        </p>
      </header>

      <SummaryBand summary={overview.summary} />

      <div
        role="tablist"
        aria-label="Integration sections"
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
        data-testid="hub-tablist"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`hub-tab-${tab.id}`}
              onClick={() => setTab(tab.id)}
              className={cn(
                "whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                active
                  ? "border-b-2 border-accent text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <OverviewPanel
          overview={overview}
          onTest={onTest}
          onSync={onSync}
          onReconnect={onReconnect}
          lastTest={lastTest}
          onConnect={(provider) => {
            setVaultRef(`vault://${provider.id}/api-key`);
            setConnectId(provider.id);
          }}
          onDisconnect={(provider) => setDisconnectId(provider.id)}
          busy={connect.isPending || disconnect.isPending || test.isPending || sync.isPending}
        />
      )}
      {activeTab === "accounts" && <AccountsPanel overview={overview} />}
      {activeTab === "brokers" && (
        <ProviderGridPanel
          providers={overview.providers.filter((provider) => provider.kind === "BROKER")}
          onTest={onTest}
          onSync={onSync}
          onReconnect={onReconnect}
          lastTest={lastTest}
          onConnect={(provider) => {
            setVaultRef(`vault://${provider.id}/api-key`);
            setConnectId(provider.id);
          }}
          onDisconnect={(provider) => setDisconnectId(provider.id)}
          busy={connect.isPending || disconnect.isPending || test.isPending || sync.isPending}
        />
      )}
      {activeTab === "exchanges" && (
        <ProviderGridPanel
          providers={overview.providers.filter((provider) => provider.kind === "EXCHANGE")}
          onTest={onTest}
          onSync={onSync}
          onReconnect={onReconnect}
          lastTest={lastTest}
          onConnect={(provider) => {
            setVaultRef(`vault://${provider.id}/api-key`);
            setConnectId(provider.id);
          }}
          onDisconnect={(provider) => setDisconnectId(provider.id)}
          busy={connect.isPending || disconnect.isPending || test.isPending || sync.isPending}
          footnote="Exchanges differ from brokers: custody, API scopes and limits are provider-specific. Withdrawal scopes are refused by policy - Euforia journals, it never trades."
        />
      )}
      {activeTab === "market-data" && (
        <MarketDataPanel
          overview={overview}
          onTest={onTest}
          onSync={onSync}
          onReconnect={onReconnect}
          lastTest={lastTest}
          onConnect={(provider) => {
            setVaultRef(`vault://${provider.id}/api-key`);
            setConnectId(provider.id);
          }}
          onDisconnect={(provider) => setDisconnectId(provider.id)}
          busy={connect.isPending || disconnect.isPending || test.isPending || sync.isPending}
        />
      )}
      {activeTab === "economic" && (
        <EconomicPanel
          overview={overview}
          onTest={onTest}
          onSync={onSync}
          onReconnect={onReconnect}
          lastTest={lastTest}
          onConnect={(provider) => {
            setVaultRef(`vault://${provider.id}/api-key`);
            setConnectId(provider.id);
          }}
          onDisconnect={(provider) => setDisconnectId(provider.id)}
          busy={connect.isPending || disconnect.isPending || test.isPending || sync.isPending}
        />
      )}
      {activeTab === "news" && <NewsPanel overview={overview} />}
      {activeTab === "tradingview" && (
        <ProviderGridPanel
          providers={overview.providers.filter((provider) => provider.kind === "CHARTING")}
          onTest={onTest}
          onSync={onSync}
          onReconnect={onReconnect}
          lastTest={lastTest}
          onConnect={(provider) => {
            setVaultRef(`vault://${provider.id}/api-key`);
            setConnectId(provider.id);
          }}
          onDisconnect={(provider) => setDisconnectId(provider.id)}
          busy={connect.isPending || disconnect.isPending || test.isPending || sync.isPending}
          footnote="TradingView renders market display and chart interaction. Positions, executions and account state stay owned by the broker adapter - the chart layer can never write them."
        />
      )}
      {activeTab === "notifications" && (
        <ProviderGridPanel
          providers={overview.providers.filter((provider) => provider.kind === "NOTIFICATION")}
          onTest={onTest}
          onSync={onSync}
          onReconnect={onReconnect}
          lastTest={lastTest}
          onConnect={(provider) => {
            setVaultRef(`vault://${provider.id}/api-key`);
            setConnectId(provider.id);
          }}
          onDisconnect={(provider) => setDisconnectId(provider.id)}
          busy={connect.isPending || disconnect.isPending || test.isPending || sync.isPending}
          footnote="The in-app alert engine is already live - your notification preferences (Settings → Notifications) route every alert. These providers add the email and push channels on top."
        />
      )}
      {activeTab === "external" && (
        <ExternalPanel
          overview={overview}
          onConnect={(provider) => {
            setVaultRef(`vault://${provider.id}/api-key`);
            setConnectId(provider.id);
          }}
          onDisconnect={(provider) => setDisconnectId(provider.id)}
          onTest={onTest}
          onSync={onSync}
          onReconnect={onReconnect}
          lastTest={lastTest}
          busy={connect.isPending || disconnect.isPending || test.isPending || sync.isPending}
          simulating={simulateWebhook.isPending}
          onSimulate={(mode) => {
            const released = overview.ecoEvents.find((event) => event.status === "RELEASED");
            if (released === undefined) {
              toast.error("No released macro event to update - run an economic sync first");
              return;
            }
            simulateWebhook.mutate(
              {
                endpointId: "wh-macro",
                input: {
                  eventType: "eco.actual.released",
                  payload: { eventRef: released.providerKey, actual: "0.4%" },
                  mode,
                },
              },
              {
                onSuccess: (result) => {
                  if (result.accepted) toast.success(result.message);
                  else if (result.duplicate) toast.warning(result.message);
                  else toast.error(result.message);
                },
                onError: (error) => toast.error(apiErrorMessage(error, "Webhook simulation failed")),
              },
            );
          }}
        />
      )}

      {/* §25/§18 — connect = attach a vault reference, never the secret. */}
      <Dialog
        open={connectId !== null}
        onOpenChange={(open) => {
          if (!open) setConnectId(null);
        }}
      >
        <DialogContent className="max-w-md bg-surface" data-testid="hub-connect-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Connect {connectTarget?.name ?? "provider"}
            </DialogTitle>
            <DialogDescription>
              Paste the vault reference of the credential you stored in
              Security. The secret itself never reaches the hub - only this
              reference does.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="hub-connect-input">Vault reference</Label>
            <Input
              id="hub-connect-input"
              value={vaultRef}
              onChange={(event) => setVaultRef(event.target.value)}
              placeholder="vault://provider/api-key"
              className="font-mono text-sm"
              autoComplete="off"
              data-testid="hub-connect-input"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={onConfirmConnect}
              disabled={connect.isPending}
              data-testid="hub-connect-submit"
            >
              {connect.isPending ? "Connecting…" : "Connect read-only"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* §26 — disconnecting never deletes synced history. */}
      <ConfirmDialog
        open={disconnectId !== null}
        onOpenChange={(open) => {
          if (!open) setDisconnectId(null);
        }}
        title={`Disconnect ${disconnectTarget?.name ?? "provider"}?`}
        description="The connection is revoked and its credentials removed from the vault. Everything already synced stays in your journal - disconnecting never deletes history."
        confirmLabel="Disconnect"
        destructive
        onConfirm={onConfirmDisconnect}
        pending={disconnect.isPending}
        testid="hub-disconnect"
      />
    </div>
  );
}

// ── Summary band (§5) ────────────────────────────────────────────────────────

function SummaryBand({ summary }: { summary: Overview["summary"] }) {
  const chips: Array<{ label: string; count: number; tone: string }> = [
    { label: "Connected", count: summary.connected, tone: "border-accent/40 text-accent" },
    { label: "Syncing", count: summary.syncing, tone: "border-border text-muted-foreground" },
    { label: "Degraded", count: summary.degraded, tone: "border-border text-muted-foreground" },
    { label: "Disconnected", count: summary.disconnected, tone: "border-border text-muted-foreground" },
    { label: "Auth required", count: summary.authRequired, tone: "border-destructive/40 text-destructive" },
    { label: "Error", count: summary.error, tone: "border-destructive/40 text-destructive" },
  ];
  return (
    <div className="flex flex-wrap gap-2" data-testid="hub-summary">
      {chips.map((chip) => (
        <span
          key={chip.label}
          data-testid={`hub-summary-${chip.label.toLowerCase().replace(" ", "-")}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border bg-surface px-3 py-1 text-xs font-medium",
            chip.tone,
          )}
        >
          <span className="font-mono font-semibold tabular-nums">{chip.count}</span>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

// ── Provider card (used by every category tab) ──────────────────────────────

function ProviderCard({
  provider,
  onTest,
  onSync,
  onConnect,
  onDisconnect,
  onReconnect,
  lastTest,
  busy,
}: {
  provider: Provider;
  onTest: (provider: Provider) => void;
  onSync: (provider: Provider) => void;
  onConnect: (provider: Provider) => void;
  onDisconnect: (provider: Provider) => void;
  onReconnect: (provider: Provider) => void;
  lastTest: Record<string, { ok: boolean; summary: string; at: string }>;
  busy: boolean;
}) {
  const licenseBlocked = !provider.licensing.verified && provider.status === "DISCONNECTED";
  const needsAuth = provider.status === "ERROR" || provider.status === "AUTH_REQUIRED";
  const testResult = lastTest[provider.id];
  return (
    <Card className="border-border bg-surface" data-testid={`provider-card-${provider.id}`}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            {provider.name}
            <KindChip kind={provider.kind} />
            {provider.readOnly && (
              <Badge variant="outline" className="font-mono text-[10px]">
                read-only
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{provider.tagline}</CardDescription>
        </div>
        <StatusBadge status={provider.status} testid={`provider-status-${provider.id}`} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{provider.description}</p>

        {provider.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {provider.capabilities.map((permission) => (
              <Badge key={permission} variant="secondary" className="text-[11px]">
                {PERMISSION_LABELS[permission] ?? permission}
              </Badge>
            ))}
          </div>
        )}

        <SyncLine sync={{ ...provider.sync }} latencyMs={provider.latencyMs} />

        <div className="flex items-start gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium text-foreground">
              {provider.licensing.verified ? "License verified" : "License review required"}
            </span>{" "}
            - {provider.licensing.note}
          </span>
        </div>

        {provider.credentials !== null && (
          <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
            <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
            <span data-testid={`provider-vault-${provider.id}`}>
              {provider.credentials.vaultRef} · {provider.credentials.maskedHint}
            </span>
          </div>
        )}

        {testResult !== undefined && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
              testResult.ok ? "border-border bg-background/60 text-muted-foreground" : "border-destructive/40 bg-destructive/5 text-destructive",
            )}
            data-testid={`provider-lasttest-${provider.id}`}
          >
            <HeartPulse className={cn("mt-0.5 size-3.5 shrink-0", testResult.ok ? "text-profit" : "text-destructive")} aria-hidden="true" />
            <span>
              <span className="font-medium text-foreground">Last health check {testResult.at.slice(11, 19)} UTC:</span>{" "}
              {testResult.summary}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {provider.status !== "DISCONNECTED" ? (
            <>
              {needsAuth && (
                <Button
                  size="sm"
                  onClick={() => onReconnect(provider)}
                  disabled={busy}
                  data-testid={`provider-reconnect-${provider.id}`}
                >
                  <PlugZap className="size-3.5" aria-hidden="true" />
                  Reconnect (1-click)
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTest(provider)}
                disabled={busy}
                data-testid={`provider-test-${provider.id}`}
              >
                Test now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSync(provider)}
                disabled={busy}
                data-testid={`provider-sync-${provider.id}`}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Sync
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDisconnect(provider)}
                disabled={busy}
                data-testid={`provider-disconnect-${provider.id}`}
              >
                <Unplug className="size-3.5" aria-hidden="true" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => onConnect(provider)}
              disabled={busy || licenseBlocked}
              data-testid={`provider-connect-${provider.id}`}
            >
              <PlugZap className="size-3.5" aria-hidden="true" />
              {licenseBlocked ? "License review required" : "Connect"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type ProviderActions = {
  onTest: (provider: Provider) => void;
  onSync: (provider: Provider) => void;
  onConnect: (provider: Provider) => void;
  onDisconnect: (provider: Provider) => void;
  onReconnect: (provider: Provider) => void;
  lastTest: Record<string, { ok: boolean; summary: string; at: string }>;
  busy: boolean;
};

// ── Overview panel ───────────────────────────────────────────────────────────

function OverviewPanel({
  overview,
  onSync,
  onConnect,
  onDisconnect,
  busy,
}: ProviderActions & { overview: Overview }) {
  const sorted = [...overview.providers].sort((a, b) => {
    const order: Record<string, number> = {
      ERROR: 0,
      AUTH_REQUIRED: 1,
      DEGRADED: 2,
      SYNCING: 3,
      DISCONNECTED: 4,
      CONNECTED: 5,
    };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="flex flex-col gap-4">
      {overview.errors.length > 0 && (
        <Card className="border-destructive/30 bg-surface" data-testid="hub-errors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
              Open errors
            </CardTitle>
            <CardDescription>
              Sanitized, actionable, never containing provider secrets.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {overview.errors.map((error) => (
              <div
                key={error.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5"
                data-testid={`error-row-${error.code}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{error.message}</p>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    {error.code} · {utc(error.occurredAt)} · {error.actionHint}
                  </p>
                </div>
                {error.retryable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const provider = overview.providers.find((candidate) => candidate.id === error.providerId);
                      if (provider !== undefined) onSync(provider);
                    }}
                  >
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            All integrations
          </CardTitle>
          <CardDescription>
            Sorted by attention needed - errors first, healthy connections last.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {sorted.map((provider) => (
            <div
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5"
              data-testid={`provider-row-${provider.id}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {provider.name}
                    <KindChip kind={provider.kind} />
                  </p>
                  <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                    {provider.sync.lastSuccessAt === null
                      ? "never synced"
                      : `last sync ${utc(provider.sync.lastSuccessAt)}`}
                    {provider.latencyMs !== null ? ` · ${provider.latencyMs} ms` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={provider.status} testid={`row-status-${provider.id}`} />
                {provider.status === "DISCONNECTED" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onConnect(provider)}
                    disabled={busy || !provider.licensing.verified}
                    data-testid={`row-connect-${provider.id}`}
                  >
                    {provider.licensing.verified ? "Connect" : "License review"}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDisconnect(provider)}
                    disabled={busy}
                    data-testid={`row-disconnect-${provider.id}`}
                  >
                    <Unplug className="size-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sync journal (module upgrade) — last import + rejected lines per provider */}
      <Card className="border-border bg-surface" data-testid="sync-journal">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Sync journal</CardTitle>
          <CardDescription>
            Last import per provider - records processed, records REJECTED and the retry posture.
            Rejected lines never enter your journal silently.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {overview.providers.map((provider) => (
            <div
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5"
              data-testid={`sync-journal-${provider.id}`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {provider.name}
                  <KindChip kind={provider.kind} />
                </p>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  last import: {utc(provider.sync.lastSuccessAt)}
                  {provider.sync.lastAttemptedAt !== null &&
                    provider.sync.lastAttemptedAt !== provider.sync.lastSuccessAt &&
                    ` · last attempt ${utc(provider.sync.lastAttemptedAt)} (failed)`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
                <span className="text-muted-foreground">
                  {provider.sync.recordsProcessed.toLocaleString("en-US")} processed
                </span>
                <span className={provider.sync.recordsFailed > 0 ? "text-destructive" : "text-muted-foreground"}>
                  {provider.sync.recordsFailed.toLocaleString("en-US")} rejected
                </span>
                {provider.sync.retryCount > 0 && (
                  <span className="text-amber-500">{provider.sync.retryCount} retries</span>
                )}
                {provider.sync.nextRetryAt !== null && (
                  <span className="text-muted-foreground">next retry {utc(provider.sync.nextRetryAt)}</span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">
              Recent activity
            </CardTitle>
            <CardDescription>The §24 audit trail - every connection event.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1.5" data-testid="hub-events">
            {overview.events.slice(0, 8).map((event) => (
              <div key={event.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">
                  <span className="font-medium text-foreground">{event.providerName}</span>{" "}
                  - {event.message}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {event.occurredAt.slice(11, 19)} UTC
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <Database className="size-4 text-accent" aria-hidden="true" />
              Data retention
            </CardTitle>
            <CardDescription>
              Enforced per policy - provider licensing and storage rights respected.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1.5 font-mono text-xs tabular-nums">
            {[
              ["Market data", `${overview.retention.marketDataDays} days`],
              ["News items", `${overview.retention.newsDays} days`],
              ["Economic history", `${overview.retention.economicHistoryDays} days`],
              ["Sync logs", `${overview.retention.syncLogsDays} days`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <span className="font-sans uppercase tracking-wide text-[11px] text-muted-foreground">
                  {label}
                </span>
                <span className="text-foreground">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Trading Accounts (§6) ────────────────────────────────────────────────────

function AccountsPanel({ overview }: { overview: Overview }) {
  return (
    <div className="flex flex-col gap-4">
      {overview.accounts.map((account) => (
        <Card key={account.accountIdentifier} className="border-border bg-surface">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="font-heading text-base font-semibold">
                {account.accountIdentifier}
              </CardTitle>
              <CardDescription>
                {account.providerName} · {account.accountType}
              </CardDescription>
            </div>
            <StatusBadge
              status={
                overview.providers.find((provider) => provider.id === account.providerId)
                  ?.status ?? "DISCONNECTED"
              }
            />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5 font-mono text-xs tabular-nums sm:grid-cols-2">
              <div className="flex justify-between gap-4">
                <span className="font-sans uppercase tracking-wide text-[11px] text-muted-foreground">
                  Currency
                </span>
                <span className="text-foreground">{account.currency}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="font-sans uppercase tracking-wide text-[11px] text-muted-foreground">
                  Balance / Equity
                </span>
                <span className="text-foreground" data-testid="account-balance-state">
                  {account.balance === null ? "pending adapter sync" : account.balance}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="font-sans uppercase tracking-wide text-[11px] text-muted-foreground">
                  Open positions
                </span>
                <span className="text-foreground">
                  {account.positionsOpen === null ? "-" : account.positionsOpen}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="font-sans uppercase tracking-wide text-[11px] text-muted-foreground">
                  Last sync
                </span>
                <span className="text-foreground">{utc(account.lastSyncAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {account.readOnly && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  read-only
                </Badge>
              )}
              {account.permissions.map((permission) => (
                <Badge key={permission} variant="secondary" className="text-[11px]">
                  {PERMISSION_LABELS[permission] ?? permission}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Where are the numbers?
          </CardTitle>
          <CardDescription>
            Balance, equity and positions stream from the broker adapter once
            it connects - Euforia never invents account figures (the honesty
            rule the Session Live broker panel already follows). The normalized
            contract (<span className="font-mono text-xs">brokerSessionResponseSchema</span>)
            is stable; only the answer changes when the adapter lands.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

// ── Category grid (Brokers / Exchanges / TradingView / Notifications) ───────

function ProviderGridPanel({
  providers,
  footnote,
  ...actions
}: ProviderActions & { providers: Provider[]; footnote?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} {...actions} />
        ))}
      </div>
      {footnote !== undefined && (
        <Card className="border-border bg-surface">
          <CardContent className="text-sm text-muted-foreground">{footnote}</CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Market Data (§8) ─────────────────────────────────────────────────────────

function MarketDataPanel({ overview, ...actions }: ProviderActions & { overview: Overview }) {
  const providers = overview.providers.filter((provider) => provider.kind === "MARKET_DATA");
  const columns: Array<{ key: "tick" | "ohlc" | "volume" | "spread" | "sessions"; label: string }> = [
    { key: "tick", label: "Tick" },
    { key: "ohlc", label: "OHLC" },
    { key: "volume", label: "Volume" },
    { key: "spread", label: "Spread" },
    { key: "sessions", label: "Sessions" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Capability matrix
          </CardTitle>
          <CardDescription>
            Market data is independent from broker accounts - and no two
            providers supply identical data. Declared honestly per source.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="hub-market-matrix">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Provider</th>
                {columns.map((column) => (
                  <th key={column.key} className="pb-2 pr-4 text-center font-medium">
                    {column.label}
                  </th>
                ))}
                <th className="pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {providers.map((provider) => (
                <tr key={provider.id} className="border-t border-border">
                  <td className="py-2 pr-4 font-sans text-sm font-medium">{provider.name}</td>
                  {columns.map((column) => {
                    const supported = provider.marketData?.[column.key] === true;
                    return (
                      <td key={column.key} className="py-2 pr-4 text-center">
                        {supported ? (
                          <Check className="mx-auto size-4 text-accent" aria-label="supported" />
                        ) : (
                          <X className="mx-auto size-4 text-muted-foreground/50" aria-label="not supplied" />
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 text-right">
                    <StatusBadge status={provider.status} testid={`market-status-${provider.id}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <ProviderGridPanel providers={providers} {...actions} />
    </div>
  );
}

// ── Economic Data (§9, §22) ──────────────────────────────────────────────────

function EconomicPanel({ overview, ...actions }: ProviderActions & { overview: Overview }) {
  const provider = overview.providers.find((candidate) => candidate.kind === "ECONOMIC");
  const upcoming = overview.ecoEvents
    .filter((event) => event.status === "SCHEDULED")
    .slice(0, 5);
  const released = [...overview.ecoEvents]
    .filter((event) => event.status !== "SCHEDULED")
    .slice(-5)
    .reverse();

  return (
    <div className="flex flex-col gap-4">
      {provider !== undefined && (
        <ProviderCard provider={provider} {...actions} />
      )}

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Normalized event feed
          </CardTitle>
          <CardDescription>
            Previous / forecast / actual / impact / status - normalized from the
            provider payload and upserted idempotently by provider key. The
            Calendar module reads this pipeline; real-time webhook updates land
            here directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="hub-eco-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Scheduled</th>
                <th className="pb-2 pr-3 font-medium">Country</th>
                <th className="pb-2 pr-3 font-medium">Event</th>
                <th className="pb-2 pr-3 text-right font-medium">Prev</th>
                <th className="pb-2 pr-3 text-right font-medium">Forecast</th>
                <th className="pb-2 pr-3 text-right font-medium">Actual</th>
                <th className="pb-2 pr-3 font-medium">Impact</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {[...released, ...upcoming].map((event) => (
                <tr key={event.id} className="border-t border-border">
                  <td className="whitespace-nowrap py-2 pr-3">{utc(event.scheduledAt)}</td>
                  <td className="py-2 pr-3 font-sans">{event.country}</td>
                  <td className="py-2 pr-3 font-sans">{event.title}</td>
                  <td className="py-2 pr-3 text-right">{event.previous ?? "-"}</td>
                  <td className="py-2 pr-3 text-right">{event.forecast ?? "-"}</td>
                  <td className="py-2 pr-3 text-right" data-testid={`eco-actual-${event.providerKey}`}>
                    {event.actual ?? "-"}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant={event.impact === "HIGH" ? "destructive" : event.impact === "MEDIUM" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {event.impact}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <Badge variant={event.status === "SCHEDULED" ? "outline" : "secondary"} className="text-[10px]">
                      {event.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Market News (§10, §29) ───────────────────────────────────────────────────

function NewsPanel({ overview }: { overview: Overview }) {
  const provider = overview.providers.find((candidate) => candidate.kind === "NEWS");
  return (
    <div className="flex flex-col gap-4">
      {provider !== undefined && (
        <Card className="border-border bg-surface" data-testid="hub-news-license">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="font-heading text-base font-semibold">
                {provider.name}
              </CardTitle>
              <CardDescription>{provider.description}</CardDescription>
            </div>
            <StatusBadge status={provider.status} />
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">Licensing gate (§29)</span> -{" "}
                {provider.licensing.note} The pipeline below is provider-ready;
                the sample items are generated locally and never redistributed.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Normalized item shape
          </CardTitle>
          <CardDescription>
            Headline · source · category · publication time · related
            symbols/currencies · importance - exactly what a licensed provider
            will deliver.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2" data-testid="hub-news-list">
          {overview.news.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2"
              data-testid="hub-news-item"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.headline}</p>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {item.source} · {utc(item.publishedAt)} ·{" "}
                  {item.relatedSymbols.join(", ") || "-"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  {item.category}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  P{item.importance}
                </Badge>
                {item.sample && (
                  <Badge variant="outline" className="text-[10px]">
                    sample
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── External Services + Webhooks (§12) ──────────────────────────────────────

function ExternalPanel({
  overview,
  onConnect,
  onDisconnect,
  onTest,
  onSync,
  onReconnect,
  lastTest,
  busy,
  simulating,
  onSimulate,
}: ProviderActions & {
  overview: Overview;
  simulating: boolean;
  onSimulate: (mode: "valid" | "bad-signature" | "stale-timestamp" | "replay") => void;
}) {
  const externals = overview.providers.filter((provider) => provider.kind === "EXTERNAL");
  const [showOutgoingDocs, setShowOutgoingDocs] = React.useState(false);
  return (
    <div className="flex flex-col gap-4">
      <ProviderGridPanel providers={externals} {...{ onConnect, onDisconnect, onTest, onSync, onReconnect, lastTest, busy }} />

      {overview.webhooks.map((hook) => (
        <Card key={hook.id} className="border-border bg-surface" data-testid={`webhook-${hook.id}`}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
                <Webhook className="size-4 text-accent" aria-hidden="true" />
                Inbound webhook - {hook.providerId}
              </CardTitle>
              <CardDescription>
                <span className="font-mono text-xs">{hook.path}</span> · secret{" "}
                <span className="font-mono text-xs">{hook.secretMaskedHint}</span> (vault only)
              </CardDescription>
            </div>
            <Badge variant={hook.status === "ACTIVE" ? "default" : "outline"}>{hook.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={simulating}
                onClick={() => onSimulate("valid")}
                data-testid="webhook-sim-valid"
              >
                Send valid event
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={simulating}
                onClick={() => onSimulate("bad-signature")}
                data-testid="webhook-sim-bad-signature"
              >
                Bad signature
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={simulating}
                onClick={() => onSimulate("stale-timestamp")}
                data-testid="webhook-sim-stale"
              >
                Stale timestamp
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={simulating}
                onClick={() => onSimulate("replay")}
                data-testid="webhook-sim-replay"
              >
                Replay last
              </Button>
            </div>
            <div className="grid gap-1.5" data-testid="webhook-deliveries">
              {hook.deliveries.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No deliveries yet - run one of the pipeline tests above.
                </p>
              )}
              {hook.deliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs tabular-nums"
                >
                  <span className="font-sans text-sm">{delivery.message}</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {delivery.signatureValid ? "sig ✓" : "sig ✗"}
                    {delivery.accepted ? " · accepted" : " · rejected"}
                    {delivery.duplicate ? " · duplicate" : ""}
                    {" · "}
                    {utc(delivery.receivedAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Outgoing webhooks (module upgrade) - documented contract with a
          sample JSON payload Euforia DELIVERS to customer endpoints. */}
      <Card className="border-border bg-surface" data-testid="outgoing-webhooks">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <Webhook className="size-4 text-accent" aria-hidden="true" />
              Outgoing webhooks
            </CardTitle>
            <CardDescription>
              Euforia POSTs journal events to your endpoints - HMAC-SHA256 signed, retried with
              backoff. The sample payload below documents the contract.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOutgoingDocs((open) => !open)}
            aria-expanded={showOutgoingDocs}
            data-testid="outgoing-webhooks-toggle"
          >
            {showOutgoingDocs ? "Hide documentation" : "View documentation"}
          </Button>
        </CardHeader>
        {showOutgoingDocs && (
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  { event: "trade.closed", description: "A trade reached a terminal state" },
                  { event: "goal.at_risk", description: "A goal slipped behind its pace" },
                  { event: "sync.failed", description: "A provider sync failed permanently" },
                ] as const
              ).map((item) => (
                <div key={item.event} className="rounded-lg border border-border bg-background/60 px-3 py-2">
                  <p className="font-mono text-xs font-semibold">{item.event}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
            <pre
              className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
              data-testid="outgoing-webhooks-sample"
            >
              {`POST <your-endpoint-url>
Content-Type: application/json
X-Euforia-Event: trade.closed
X-Euforia-Signature: sha256=<hmac-of-body-with-endpoint-secret>
X-Euforia-Delivery: <unique-uuid>

{
  "event": "trade.closed",
  "occurredAt": "2026-10-01T14:32:11Z",
  "data": {
    "tradeId": "9f1d2a34-1111-4c2e-9b7f-0d6f5f3a1e02",
    "symbol": "EURUSD",
    "direction": "BUY",
    "pnlNet": "152.40",
    "rMultiple": "1.8"
  }
}`}
            </pre>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Verification: recompute the HMAC over the raw body with your endpoint secret
              (vault-stored, masked in this UI). Deliveries retry 5× with exponential backoff;
              duplicates carry the same <span className="font-mono">X-Euforia-Delivery</span> id -
              dedupe on it. Respond 2xx within 10 s to acknowledge.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

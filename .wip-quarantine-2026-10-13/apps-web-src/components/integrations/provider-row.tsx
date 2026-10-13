"use client";

import * as React from "react";
import { Loader2, RefreshCw, ShieldCheck, Unplug, Link2 } from "lucide-react";
import type { IntegrationStatus, IntegrationView } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  HealthReadout,
  ProviderIdentity,
  ProviderMeta,
  ScopeChips,
  StatusPill,
  SyncReadout,
  useHubActions,
} from "@/components/integrations/hub-bits";
import { cn } from "@/lib/utils";

/**
 * Provider rows — the hub matrix and the category catalog reuse one ruled
 * row. Actions are raised through the hub context; status is data, never
 * decoration. Provider-specific logic stays out of the row: everything
 * dynamic (fields, scopes, capabilities) comes from the provider record.
 */

function effectiveStatus(view: IntegrationView, syncing: boolean): IntegrationStatus {
  if (syncing) return "SYNCING";
  return view.state.status;
}

function canSync(status: IntegrationStatus): boolean {
  return status === "CONNECTED" || status === "DEGRADED" || status === "ERROR";
}

function RowActions({ view }: { view: IntegrationView }) {
  const actions = useHubActions();
  const status = effectiveStatus(view, actions.syncingId === view.provider.id);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {status === "DISCONNECTED" || status === "AUTH_REQUIRED" ? (
        <Button
          size="sm"
          onClick={() => actions.openConnect(view)}
          data-testid={`integration-connect-${view.provider.id}`}
        >
          <Link2 className="size-3.5" aria-hidden="true" />
          {status === "AUTH_REQUIRED" ? "Reauthorize" : "Connect"}
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.openTest(view)}
            data-testid={`integration-test-${view.provider.id}`}
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.syncNow(view)}
            disabled={!canSync(status)}
            data-testid={`integration-sync-${view.provider.id}`}
          >
            {actions.syncingId === view.provider.id ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            {status === "ERROR" ? "Retry sync" : "Sync"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => actions.openDisconnect(view)}
            aria-label={`Disconnect ${view.provider.name}`}
            data-testid={`integration-disconnect-${view.provider.id}`}
          >
            <Unplug className="size-3.5" aria-hidden="true" />
            Disconnect
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Compact row — the hub matrix (Overview). Identity, status, sync + health
 * readouts, actions. Hairline-ruled, stacks under `sm`.
 */
export function ProviderRow({ view, nowMs }: { view: IntegrationView; nowMs: number }) {
  const actions = useHubActions();
  const status = effectiveStatus(view, actions.syncingId === view.provider.id);

  return (
    <div
      className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:gap-6"
      data-testid={`hub-row-${view.provider.id}`}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} testId={`hub-status-${view.provider.id}`} />
          <ProviderIdentity view={view} compact />
        </div>
        {view.state.credentialsMask && view.state.credentialsMask.length > 0 ? (
          <p className="font-mono text-[11px] text-muted-foreground/80">
            {view.state.credentialsMask.join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <SyncReadout view={view} nowMs={nowMs} />
        <HealthReadout view={view} />
      </div>
      <RowActions view={view} />
    </div>
  );
}

/**
 * Detailed row — the category tabs. Adds the full description, capabilities,
 * scopes and the operating rules (licensing, retention, rate limit, retry).
 */
export function ProviderRowDetailed({
  view,
  nowMs,
  children,
}: {
  view: IntegrationView;
  nowMs: number;
  /** Category-specific extra content rendered under the row (pipelines…). */
  children?: React.ReactNode;
}) {
  const actions = useHubActions();
  const status = effectiveStatus(view, actions.syncingId === view.provider.id);
  const { provider, state } = view;

  return (
    <div className="space-y-4 py-5" data-testid={`hub-detail-${provider.id}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} testId={`hub-status-${provider.id}`} />
            <ProviderIdentity view={view} />
          </div>
          {state.credentialsMask && state.credentialsMask.length > 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground/80">
              {state.credentialsMask.join(" · ")}
            </p>
          ) : null}
        </div>
        <RowActions view={view} />
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
        <SyncReadout view={view} nowMs={nowMs} />
        <HealthReadout view={view} className="justify-start lg:justify-end" />
      </div>

      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {provider.description}
      </p>

      <div className="flex flex-wrap items-center gap-1.5" aria-label="Capabilities">
        {provider.capabilities.map((capability) => (
          <span
            key={capability}
            className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {capability}
          </span>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="ledger-label text-[10px]">Permissions</p>
        <ScopeChips scopes={provider.scopes} />
      </div>

      <ProviderMeta view={view} />

      {state.health.lastErrorMessage && state.status !== "DISCONNECTED" ? (
        <p
          className={cn(
            "rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed",
            state.status === "ERROR"
              ? "border-loss/40 bg-loss/10 text-loss"
              : "border-warning/40 bg-warning/10 text-warning",
          )}
          data-testid={`hub-error-${provider.id}`}
        >
          Last error — {state.health.lastErrorMessage}
        </p>
      ) : null}

      {children}
    </div>
  );
}

/** Ruled list wrapper — one hairline set for any number of rows. */
export function RuledRows({
  children,
  label,
  testId,
}: {
  children: React.ReactNode;
  label?: string;
  testId?: string;
}) {
  return (
    <section aria-label={label}>
      {label ? <p className="ledger-label mb-1">{label}</p> : null}
      <div className="divide-y divide-border border-y border-border" data-testid={testId}>
        {children}
      </div>
    </section>
  );
}

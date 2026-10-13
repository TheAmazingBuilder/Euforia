"use client";

import * as React from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, XCircle } from "lucide-react";
import type { IntegrationView } from "@cosmoz/shared";
import { toast } from "sonner";

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
import { ScopeChips } from "@/components/integrations/hub-bits";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useConnectIntegration,
  useDisconnectIntegration,
  useTestIntegration,
} from "@/lib/api/queries/integrations";
import { cn } from "@/lib/utils";

/**
 * Provider dialogs — connect (§18 credential vault), disconnect (§26 history
 * retained) and the safe read-only connection test (§27). One instance each;
 * the hub controls which provider they act on.
 */

export type ProviderDialogState =
  | { kind: "connect"; view: IntegrationView }
  | { kind: "disconnect"; view: IntegrationView }
  | { kind: "test"; view: IntegrationView }
  | null;

// ── Connect / reauthorize (§18) ──────────────────────────────────────────────

function ConnectDialog({
  view,
  open,
  onOpenChange,
}: {
  view: IntegrationView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { provider } = view;
  const connect = useConnectIntegration();
  const isReauthorize = view.state.status === "AUTH_REQUIRED";
  const [values, setValues] = React.useState<Record<string, string>>({});
  // The dialog unmounts when closed (ProviderDialogs renders null), so the
  // form starts fresh on every open — no reset effect needed.

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    connect.mutate(
      { providerId: provider.id, credentials: values },
      {
        onSuccess: (response) => {
          toast.success(response.message);
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, "The connection could not be established."));
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isReauthorize ? `Reauthorize ${provider.name}` : `Connect ${provider.name}`}
          </DialogTitle>
          <DialogDescription>{provider.tagline}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {provider.credentialFields.length > 0 ? (
            <div className="space-y-3">
              {provider.credentialFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`credential-${provider.id}-${field.key}`}>
                    {field.label}
                    {field.secret ? (
                      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        secret
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id={`credential-${provider.id}-${field.key}`}
                    type={field.secret ? "password" : "text"}
                    placeholder={field.placeholder ?? undefined}
                    autoComplete="off"
                    value={values[field.key] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                    required
                  />
                  {field.help ? (
                    <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {field.help}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-border px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
              No credentials required for this provider.
            </p>
          )}

          <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
            <p className="ledger-label text-[10px]">Permissions granted</p>
            <ScopeChips scopes={provider.scopes} />
            <p className="flex items-start gap-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              <KeyRound className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              Credentials are stored encrypted (AES-256-GCM at rest), never returned by the API
              and never displayed again. This build is read-only — no order execution exists.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {isReauthorize ? "Reauthorize" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Disconnect (§26 — revoke, retain history) ────────────────────────────────

function DisconnectDialog({
  view,
  open,
  onOpenChange,
}: {
  view: IntegrationView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const disconnect = useDisconnectIntegration();

  function handleDisconnect() {
    disconnect.mutate(view.provider.id, {
      onSuccess: (response) => {
        toast.success(response.message);
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(apiErrorMessage(error, "The integration could not be disconnected."));
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Disconnect {view.provider.name}?</DialogTitle>
          <DialogDescription>
            Stored credentials are revoked immediately. The connection can be restored at any
            time.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm leading-relaxed text-foreground">
          Journal history and past synchronizations are <strong>retained</strong> — nothing is
          deleted. Reconnecting resumes from the last synchronization cursor, so no trade,
          execution or event is duplicated or lost.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDisconnect} disabled={disconnect.isPending}>
            {disconnect.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Connection test (§27 — safe, read-only) ──────────────────────────────────

function TestDialog({
  view,
  open,
  onOpenChange,
}: {
  view: IntegrationView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { provider } = view;
  // Result lives in the mutation itself — fresh on every mount, and the
  // re-run button clears it synchronously before the next probe.
  const test = useTestIntegration();

  function runTest() {
    test.mutate(provider.id, {
      onError: (error) => {
        toast.error(apiErrorMessage(error, "The connection test could not run."));
      },
    });
  }

  function rerun() {
    test.reset();
    runTest();
  }

  // Probe once when the dialog mounts (it mounts only while open).
  React.useEffect(() => {
    if (!open) return;
    test.mutate(provider.id, {
      onError: (error) => {
        toast.error(apiErrorMessage(error, "The connection test could not run."));
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider.id]);

  const result = test.data ?? null;
  const allOk = result?.ok ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Test — {provider.name}</DialogTitle>
          <DialogDescription>
            Read-only probe: authentication → permissions → connectivity → provider response.
            No trades or orders are ever created by a test.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border rounded-lg border border-border" data-testid="integration-test-checks">
          {test.isPending ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Probing {provider.name}…
            </div>
          ) : result ? (
            result.checks.map((check) => (
              <div key={check.label} className="flex items-start gap-3 px-3 py-2.5">
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-profit" aria-hidden="true" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-loss" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{check.label}</p>
                  <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {check.ms} ms
                </span>
              </div>
            ))
          ) : (
            <div className="px-3 py-6 text-sm text-muted-foreground">No result yet.</div>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span
            className={cn(
              "font-mono text-[11px] font-semibold uppercase tracking-wide",
              result ? (allOk ? "text-profit" : "text-warning") : "text-muted-foreground",
            )}
          >
            {result ? (allOk ? "All checks passed" : "Issues reported — see details") : "Running…"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={rerun} disabled={test.isPending}>
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Re-run
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Host — one instance at hub level ─────────────────────────────────────────

export function ProviderDialogs({
  state,
  onOpenChange,
}: {
  state: ProviderDialogState;
  onOpenChange: (state: ProviderDialogState) => void;
}) {
  if (!state) return null;
  const common = { view: state.view, open: true, onOpenChange: (open: boolean) => { if (!open) onOpenChange(null); } };
  switch (state.kind) {
    case "connect":
      return <ConnectDialog {...common} />;
    case "disconnect":
      return <DisconnectDialog {...common} />;
    case "test":
      return <TestDialog {...common} />;
  }
}

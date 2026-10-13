"use client";

import * as React from "react";
import { Ban, CircleCheck, KeyRound, LoaderCircle, ShieldAlert } from "lucide-react";
import type { TradingAccountDetails, TradingConnectionTestResponse } from "@cosmoz/shared";
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
import { apiErrorMessage } from "@/lib/api/client";
import {
  useDisconnectTradingAccount,
  useReconnectTradingAccount,
  useTestTradingConnection,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Connection lifecycle dialogs (Accounts prompt §18, §31): disconnect with
 * explicit confirmation and data-retention copy, reconnect with fresh
 * credentials, and the honest per-check connection test (§19).
 *
 * Live accounts receive stronger contextual confirmation (§9): the
 * destructive action on a LIVE account spells out what will stop.
 */

// ── Disconnect (§31 — explicit, history preserved) ───────────────────────────

export function DisconnectDialog({
  account,
  open,
  onOpenChange,
}: {
  account: TradingAccountDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const disconnect = useDisconnectMutationSafe();
  const [pending, setPending] = React.useState(false);

  const onDisconnect = () => {
    if (account === null || pending) return;
    setPending(true);
    disconnect(
      account.id,
      {
        onSuccess: () => {
          setPending(false);
          onOpenChange(false);
          toast("Account disconnected", {
            description: `${account.name} — synchronization stopped, history preserved.`,
          });
        },
        onError: () => setPending(false),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="disconnect-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-bold tracking-tight">
            Disconnect {account?.name ?? "account"}?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Cosmoz will stop synchronizing this account. Your historical Cosmoz
            data will not be automatically deleted.
          </DialogDescription>
        </DialogHeader>
        {account?.type === "LIVE" ? (
          <p
            className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning"
            data-testid="disconnect-live-warning"
          >
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            This is a live account — real trading capital. Disconnecting only
            stops synchronization; nothing is sent to your broker.
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onDisconnect}
            disabled={pending}
            data-testid="disconnect-confirm"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Ban className="size-4" aria-hidden="true" />
            )}
            Disconnect Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reconnect (fresh credentials — §30) ──────────────────────────────────────

export function ReconnectDialog({
  account,
  open,
  onOpenChange,
}: {
  account: TradingAccountDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reconnect = useReconnectTradingAccount();
  const [secret, setSecret] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  /** Reset-on-close keeps reopened dialogs pristine without an effect. */
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSecret("");
      setError(null);
    }
    onOpenChange(next);
  };

  const onReconnect = () => {
    if (account === null || secret.trim().length < 4) return;
    reconnect.mutate(
      { accountId: account.id, input: { credentials: { method: "API_KEY", secret } } },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast("Account reconnected", {
            description: `${account.name} — synchronization resumed.`,
          });
        },
        onError: (mutationError) =>
          setError(
            apiErrorMessage(
              mutationError,
              "The provider rejected these credentials. Verify the API key and try again.",
            ),
          ),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" data-testid="reconnect-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-bold tracking-tight">
            Reconnect {account?.name ?? "account"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Provide a fresh API key to restore synchronization. The previous
            credentials were destroyed when the connection dropped.
          </DialogDescription>
        </DialogHeader>
        {account?.connection?.lastError ? (
          <p className="rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-xs leading-relaxed text-loss">
            {account.connection.lastError}
          </p>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="reconnect-secret">API key</Label>
          <Input
            id="reconnect-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Provider API key"
            autoComplete="new-password"
          />
          {error !== null ? (
            <p role="alert" className="text-xs text-loss" data-testid="reconnect-error">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onReconnect}
            disabled={secret.trim().length < 4 || reconnect.isPending}
            data-testid="reconnect-confirm"
          >
            {reconnect.isPending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="size-4" aria-hidden="true" />
            )}
            Reconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Connection test (§19 — honest per-check results) ─────────────────────────

export function TestConnectionDialog({
  account,
  open,
  onOpenChange,
}: {
  account: TradingAccountDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const test = useTestConnectionSafe();
  const [result, setResult] = React.useState<TradingConnectionTestResponse | null>(null);

  /** Reset-on-close — a reopened test dialog starts fresh, no effect needed. */
  const handleOpenChange = (next: boolean) => {
    if (!next) setResult(null);
    onOpenChange(next);
  };

  const runTest = () => {
    if (account === null) return;
    test.run(account.id, {
      onSuccess: (data) => setResult(data),
      onError: () => setResult(null),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="max-w-md" data-testid="test-connection-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-bold tracking-tight">
            Connection test
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Health-check the stored connection for {account?.name ?? "this account"}.
            Read-only — nothing is sent to your broker.
          </DialogDescription>
        </DialogHeader>
        {result === null ? (
          <div className="flex min-h-24 items-center justify-center">
            {test.isPending ? (
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={runTest}>
                Run test
              </Button>
            )}
          </div>
        ) : (
          <div data-testid="test-connection-results">
            <ul className="grid gap-2">
              {result.checks.map((check) => (
                <li key={check.name} className="flex items-start gap-2.5 text-sm">
                  {check.ok ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-profit" aria-hidden="true" />
                  ) : (
                    <Ban className="mt-0.5 size-4 shrink-0 text-loss" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className={cn("block capitalize", check.ok ? "" : "text-loss")}>
                      {check.name.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    <span className="block text-xs text-muted-foreground">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p
              className={cn(
                "mt-3 text-sm font-medium",
                result.ok ? "text-profit" : "text-loss",
              )}
              data-testid="test-connection-verdict"
            >
              {result.ok ? "Connection successful" : "Connection issues detected"}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {result !== null && !test.isPending ? (
            <Button type="button" size="sm" onClick={runTest}>
              Run again
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mutation hooks re-exported through thin wrappers (keeps dialogs testable) ─

function useDisconnectMutationSafe() {
  const mutation = useDisconnectTradingAccount();
  return (
    accountId: string,
    handlers: { onSuccess: () => void; onError: () => void },
  ) => mutation.mutate(accountId, handlers);
}

function useTestConnectionSafe() {
  const mutation = useTestTradingConnection();
  return {
    isPending: mutation.isPending,
    run: (
      accountId: string,
      handlers: {
        onSuccess: (data: TradingConnectionTestResponse) => void;
        onError: () => void;
      },
    ) => mutation.mutate(accountId, handlers),
  };
}

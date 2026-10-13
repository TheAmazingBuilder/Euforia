"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";
import type { TradingAccountDetails } from "@cosmoz/shared";

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
import { Switch } from "@/components/ui/switch";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useDisconnectTradingAccount,
  useReconnectTradingAccount,
  useUpdateTradingAccount,
} from "@/lib/api/queries";
import { maskAccountNumber } from "./accounts-format";

/**
 * Account management dialogs (spec §30–§31): explicit disconnect with data
 * retention copy, reconnect with fresh read-only credentials, rename +
 * default flag. Destructive actions are never visually dominant (spec §21).
 */

export function DisconnectDialog({
  account,
  open,
  onOpenChange,
  onDisconnected,
}: {
  account: TradingAccountDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisconnected?: () => void;
}) {
  const disconnectMutation = useDisconnectTradingAccount();
  const [busy, setBusy] = React.useState(false);
  if (!account) return null;
  const isLive = account.type === "LIVE" || account.type === "PROP_FIRM";

  const confirm = async () => {
    setBusy(true);
    try {
      await disconnectMutation.mutateAsync(account.id);
      toast.success(`${account.name} disconnected`, {
        description: "Synchronization stopped. Your historical Cosmoz data is preserved.",
      });
      onOpenChange(false);
      onDisconnected?.();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="disconnect-dialog">
        <DialogHeader className="space-y-2">
          <DialogTitle>Disconnect {account.provider.providerName}?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p>
                Cosmoz will stop synchronizing{" "}
                <span className="font-medium text-foreground">
                  {account.name} ({maskAccountNumber(account.externalAccountId)})
                </span>
                . Your historical Cosmoz data will not be automatically deleted.
              </p>
              {isLive && (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  This is a live account. Reconnecting later will require fresh read-only
                  credentials.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void confirm()}
            disabled={busy}
            data-testid="disconnect-confirm"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Disconnect Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReconnectDialog({
  account,
  open,
  onOpenChange,
}: {
  account: TradingAccountDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reconnectMutation = useReconnectTradingAccount();
  const [secret, setSecret] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  if (!account) return null;

  const submit = async () => {
    if (!secret.trim()) {
      setError("Enter your read-only API key.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reconnectMutation.mutateAsync({
        accountId: account.id,
        input: { credentials: { method: "API_KEY", secret: secret.trim() } },
      });
      toast.success(`${account.name} reconnected`, {
        description: "Synchronization is live again.",
      });
      setSecret("");
      onOpenChange(false);
    } catch (reconnectError) {
      setError(apiErrorMessage(reconnectError, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSecret("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="reconnect-dialog">
        <DialogHeader className="space-y-1">
          <DialogTitle>Reconnect {account.name}</DialogTitle>
          <DialogDescription>
            Provide fresh read-only credentials to restore synchronization. The previous
            credentials were removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reconnect-api-key">Read-only API key</Label>
          <Input
            id="reconnect-api-key"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            aria-invalid={Boolean(error)}
            data-testid="reconnect-api-key"
          />
          {error && (
            <p role="alert" className="text-xs text-destructive" data-testid="reconnect-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy} data-testid="reconnect-submit">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Reconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ManageAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: TradingAccountDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateMutation = useUpdateTradingAccount();
  const [name, setName] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [initialized, setInitialized] = React.useState<string | null>(null);

  // Re-seed the draft when the dialog opens for a (different) account.
  if (open && account && initialized !== account.id) {
    setName(account.name);
    setIsDefault(account.isDefault);
    setInitialized(account.id);
  }

  if (!account) return null;

  const save = async () => {
    setBusy(true);
    try {
      const trimmed = name.trim();
      await updateMutation.mutateAsync({
        accountId: account.id,
        input: {
          ...(trimmed && trimmed !== account.name ? { displayName: trimmed } : {}),
          ...(isDefault !== account.isDefault ? { isDefault } : {}),
        },
      });
      toast.success("Account updated");
      onOpenChange(false);
    } catch (updateError) {
      toast.error(apiErrorMessage(updateError, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="manage-account-dialog">
        <DialogHeader className="space-y-1">
          <DialogTitle>Manage account</DialogTitle>
          <DialogDescription>
            Rename this account or set it as the primary account used across Cosmoz.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manage-account-name">Display name</Label>
            <Input
              id="manage-account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={64}
              data-testid="manage-account-name"
            />
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">Set as primary account</span>
              <span className="block text-xs text-muted-foreground">
                The primary account is preselected across Dashboard, Session Live and Analytics.
              </span>
            </span>
            <Switch
              checked={isDefault}
              onCheckedChange={setIsDefault}
              aria-label="Set as primary account"
              data-testid="manage-account-default"
            />
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="manage-account-save">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

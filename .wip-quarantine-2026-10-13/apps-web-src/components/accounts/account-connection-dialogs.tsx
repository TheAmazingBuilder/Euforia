"use client";

import * as React from "react";
import { toast } from "sonner";

import { apiErrorCode } from "@/lib/api/client";
import { useDisconnectTradingAccount, useReconnectTradingAccount } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/settings/settings-primitives";
import { useI18n } from "@/i18n/i18n-provider";
import type { AccountsDict } from "@/i18n/dictionaries/en/accounts";
import type { TradingAccountDetails } from "@cosmoz/shared";

/**
 * Connection lifecycle dialogs (§31): disconnect is explicit with a
 * retention statement (history is NEVER silently deleted), and LIVE
 * accounts require a typed confirmation (§9 stronger contextual
 * confirmation). Reconnect restores the connection with fresh credentials
 * while preserving the account and its synchronized history (§52).
 */

function translateError(dict: AccountsDict, error: unknown): string {
  const code = apiErrorCode(error);
  if (code && code in dict.errors) {
    return dict.errors[code as keyof typeof dict.errors];
  }
  return dict.errors.fallback;
}

export function DisconnectAccountDialog({
  account,
  onOpenChange,
  dict,
  onDisconnected,
}: {
  account: TradingAccountDetails | null;
  onOpenChange: (open: boolean) => void;
  dict: AccountsDict;
  onDisconnected: (account: TradingAccountDetails) => void;
}) {
  const disconnect = useDisconnectTradingAccount();
  // Mounted with account=null → render nothing (dialog closed).
  if (!account) return null;
  const isLive = account.type !== "DEMO";

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={dict.disconnect.title}
      description={
        isLive
          ? `${dict.disconnect.body} ${dict.disconnect.liveExtra}`
          : dict.disconnect.body
      }
      confirmLabel={dict.disconnect.confirmLabel}
      pending={disconnect.isPending}
      destructive
      requireTyped={isLive ? dict.disconnect.liveTypedPhrase : undefined}
      testid="accounts-disconnect-dialog"
      onConfirm={() =>
        disconnect.mutate(account.id, {
          onSuccess: () => {
            toast.success(dict.disconnect.successTitle, {
              description: `${account.name} ${dict.disconnect.successBodySuffix}`,
            });
            onOpenChange(false);
            onDisconnected(account);
          },
          onError: (error) => {
            toast.error(dict.wizard.errorTitle, {
              description: translateError(dict, error),
            });
          },
        })
      }
    />
  );
}

export function ReconnectAccountDialog({
  account,
  onOpenChange,
  dict,
}: {
  account: TradingAccountDetails | null;
  onOpenChange: (open: boolean) => void;
  dict: AccountsDict;
}) {
  const [secret, setSecret] = React.useState("");
  const { dict: root } = useI18n();
  const reconnect = useReconnectTradingAccount(account?.id ?? "");

  const handleOpenChange = (next: boolean) => {
    if (!next) setSecret("");
    onOpenChange(next);
  };

  if (!account) return null;

  const handleReconnect = () => {
    if (secret.trim() === "") return;
    reconnect.mutate(
      { credentials: { method: "API_KEY", secret: secret.trim() } },
      {
        onSuccess: () => {
          toast.success(dict.reconnect.successTitle, {
            description: `${account.name} ${dict.reconnect.successBodySuffix}`,
          });
          handleOpenChange(false);
        },
        onError: (error) => {
          toast.error(dict.wizard.errorTitle, {
            description: translateError(dict, error),
          });
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-md overflow-y-auto rounded-xl border-border bg-surface"
        data-testid="accounts-reconnect-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-semibold">
            {dict.reconnect.title}
          </DialogTitle>
          <DialogDescription>{dict.reconnect.body}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accounts-reconnect-secret">{dict.reconnect.secretLabel}</Label>
          <Input
            id="accounts-reconnect-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={dict.reconnect.secretPlaceholder}
            autoComplete="new-password"
            data-testid="accounts-reconnect-secret"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            {root.common.cancel}
          </Button>
          <Button
            onClick={handleReconnect}
            disabled={secret.trim() === "" || reconnect.isPending}
            data-testid="accounts-reconnect-confirm"
          >
            {reconnect.isPending ? dict.reconnect.pendingLabel : dict.reconnect.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

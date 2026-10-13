"use client";

import * as React from "react";
import { toast } from "sonner";
import type { Account, CreateBrokerConnectionInput } from "@cosmoz/shared";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiErrorMessage } from "@/lib/api/client";
import { useConnectBroker } from "@/lib/api/queries";

/**
 * Connect a broker feed (multi-portfolio): links a journal account to a
 * broker provider. Connecting pulls the feed once immediately (first sync),
 * and the auto-import switch keeps pulling whenever the last sync is stale.
 */

const PROVIDERS: readonly CreateBrokerConnectionInput["provider"][] = ["MT4", "MT5", "DERIV", "BINANCE", "CTRADER", "OTHER"];

export interface ConnectBrokerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  /** Pre-selected account (e.g. from an account row's connect action). */
  defaultAccountId?: string | null;
}

export function ConnectBrokerDialog({ open, onOpenChange, accounts, defaultAccountId }: ConnectBrokerDialogProps) {
  const connect = useConnectBroker();
  const [accountId, setAccountId] = React.useState<string>(defaultAccountId ?? accounts[0]?.id ?? "");
  const [provider, setProvider] = React.useState<CreateBrokerConnectionInput["provider"]>("MT5");
  const [label, setLabel] = React.useState("");
  const [autoImport, setAutoImport] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset the draft each time the dialog opens — guarded render-time
  // adjustment per the React docs "You might not need an effect" pattern
  // (same idiom as the risk EditLimitDialog).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAccountId(defaultAccountId ?? accounts[0]?.id ?? "");
      setProvider("MT5");
      setLabel("");
      setAutoImport(true);
      setError(null);
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (accountId === "") {
      setError("Pick an account to connect the feed to");
      return;
    }
    setSubmitting(true);
    try {
      const result = await connect.mutateAsync({
        accountId,
        provider,
        label: label.trim() !== "" ? label.trim() : `${provider} feed`,
        autoImport,
      });
      toast.success(`${provider} connected`, {
        description:
          result.batch === null
            ? "Feed linked — sync it to pull trades."
            : `First sync imported ${result.imported} trade(s) from ${result.batch.source}.`,
      });
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not connect the broker feed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect broker</DialogTitle>
          <DialogDescription>
            Link a broker feed to a journal account. Connecting pulls the feed once — auto-import keeps it fresh.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="connection-account">Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="connection-account" data-testid="connection-account">
                <SelectValue placeholder="Pick an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {account.broker}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="connection-provider">Provider</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as CreateBrokerConnectionInput["provider"])}>
              <SelectTrigger id="connection-provider" data-testid="connection-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="connection-label">Label (optional)</Label>
            <Input
              id="connection-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={`${provider} — main feed`}
              autoComplete="off"
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
            <span>
              <span className="font-medium text-foreground">Auto-import</span>
              <span className="block text-xs text-muted-foreground">
                Pull new trades when the last sync is older than 24 h.
              </span>
            </span>
            <Switch
              checked={autoImport}
              onCheckedChange={setAutoImport}
              data-testid="connection-auto-create"
            />
          </label>

          {error !== null ? (
            <p className="text-sm text-[var(--loss)]" role="alert" data-testid="connection-error">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="success"
              disabled={submitting || accounts.length === 0}
              data-testid="connection-submit"
            >
              {submitting ? "Connecting…" : "Connect & sync"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

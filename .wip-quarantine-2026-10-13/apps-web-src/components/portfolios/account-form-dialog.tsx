"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  parseDecimal,
  propFirmConfigSchema,
  type Account,
  type AccountType,
  type Broker,
  type Currency,
  type PropFirmConfig,
} from "@cosmoz/shared";

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
import { useCreateAccount, useUpdateAccount } from "@/lib/api/queries";

/**
 * Account editor (multi-portfolio): creates a journal account or edits an
 * existing one — name, type, broker, currency, starting balance and the
 * prop-firm challenge config (PROP_FIRM only). The default flag can move
 * here but never be dropped from the last default account (server guard).
 */

const ACCOUNT_TYPES: readonly AccountType[] = ["LIVE", "PROP_FIRM", "DEMO"];
const BROKERS: readonly Broker[] = ["MANUAL", "MT4", "MT5", "DERIV", "BINANCE", "CTRADER", "OTHER"];
const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "NZD", "SGD"];

export interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Account to edit; null → create mode. */
  account: Account | null;
}

interface Draft {
  name: string;
  type: AccountType;
  broker: Broker;
  currency: Currency;
  startingBalance: string;
  isDefault: boolean;
  firm: string;
  maxDailyLossPct: string;
  maxTotalDd: string;
  profitTarget: string;
  minTradingDays: string;
}

const emptyDraft = (): Draft => ({
  name: "",
  type: "LIVE",
  broker: "MANUAL",
  currency: "USD",
  startingBalance: "10000",
  isDefault: false,
  firm: "",
  maxDailyLossPct: "",
  maxTotalDd: "",
  profitTarget: "",
  minTradingDays: "",
});

const draftFromAccount = (account: Account): Draft => ({
  name: account.name,
  type: account.type,
  broker: account.broker,
  currency: account.currency,
  startingBalance: account.startingBalance,
  isDefault: account.isDefault,
  firm: account.propConfig?.firm ?? "",
  maxDailyLossPct: account.propConfig?.maxDailyLossPct !== undefined ? String(account.propConfig.maxDailyLossPct) : "",
  maxTotalDd: account.propConfig?.maxTotalDd !== undefined ? String(account.propConfig.maxTotalDd) : "",
  profitTarget: account.propConfig?.profitTarget !== undefined ? String(account.propConfig.profitTarget) : "",
  minTradingDays: account.propConfig?.minTradingDays !== undefined ? String(account.propConfig.minTradingDays) : "",
});

function optionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = parseDecimal(trimmed);
  return value === null || Number.isNaN(value) ? undefined : value;
}

export function AccountFormDialog({ open, onOpenChange, account }: AccountFormDialogProps) {
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const editing = account !== null;
  const [draft, setDraft] = React.useState<Draft>(() => emptyDraft());
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset the draft each time the dialog opens — guarded render-time
  // adjustment per the React docs "You might not need an effect" pattern
  // (same idiom as the risk EditLimitDialog).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(account === null ? emptyDraft() : draftFromAccount(account));
      setError(null);
    }
  }

  const patch = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const name = draft.name.trim();
    if (name === "") {
      setError("Account name is required");
      return;
    }
    const starting = parseDecimal(draft.startingBalance);
    if (starting === null || starting <= 0) {
      setError("Starting balance must be a positive number");
      return;
    }

    let propConfig: PropFirmConfig | null = null;
    if (draft.type === "PROP_FIRM") {
      const maxDailyLossPct = optionalNumber(draft.maxDailyLossPct);
      const maxTotalDd = optionalNumber(draft.maxTotalDd);
      const profitTarget = optionalNumber(draft.profitTarget);
      const minTradingDays = optionalNumber(draft.minTradingDays);
      const parsed = propFirmConfigSchema.safeParse({
        ...(draft.firm.trim() !== "" ? { firm: draft.firm.trim() } : {}),
        ...(maxDailyLossPct !== undefined ? { maxDailyLossPct } : {}),
        ...(maxTotalDd !== undefined ? { maxTotalDd } : {}),
        ...(profitTarget !== undefined ? { profitTarget } : {}),
        ...(minTradingDays !== undefined ? { minTradingDays: Math.round(minTradingDays) } : {}),
      });
      propConfig = parsed.success ? parsed.data : null;
    }

    setSubmitting(true);
    try {
      if (editing) {
        await updateAccount.mutateAsync({
          accountId: account.id,
          input: {
            name,
            type: draft.type,
            broker: draft.broker,
            currency: draft.currency,
            startingBalance: draft.startingBalance.trim(),
            propConfig,
          },
        });
        toast.success("Account updated", { description: name });
      } else {
        await createAccount.mutateAsync({
          name,
          type: draft.type,
          broker: draft.broker,
          currency: draft.currency,
          startingBalance: draft.startingBalance.trim(),
          isDefault: draft.isDefault === true,
          propConfig,
        });
        toast.success("Account created", {
          description: `${name} · ${draft.currency} ${starting.toLocaleString("en-US")}`,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the account"));
    } finally {
      setSubmitting(false);
    }
  };

  const isProp = draft.type === "PROP_FIRM";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the journal account. Starting-balance edits shift its computed balance."
              : "Add a journal account to the desk — demo, live or prop-firm challenge."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Name</Label>
              <Input
                id="account-name"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="FTMO Swing 50k"
                autoComplete="off"
                data-testid="account-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-type">Type</Label>
              <Select value={draft.type} onValueChange={(type) => patch({ type: type as AccountType })}>
                <SelectTrigger id="account-type" data-testid="account-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "PROP_FIRM" ? "Prop firm" : type.charAt(0) + type.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-broker">Broker</Label>
              <Select value={draft.broker} onValueChange={(broker) => patch({ broker: broker as Broker })}>
                <SelectTrigger id="account-broker" data-testid="account-broker">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BROKERS.map((broker) => (
                    <SelectItem key={broker} value={broker}>
                      {broker}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-currency">Currency</Label>
              <Select value={draft.currency} onValueChange={(currency) => patch({ currency: currency as Currency })}>
                <SelectTrigger id="account-currency" data-testid="account-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-starting">Starting balance</Label>
              <Input
                id="account-starting"
                value={draft.startingBalance}
                onChange={(event) => patch({ startingBalance: event.target.value })}
                inputMode="decimal"
                className="font-mono"
                data-testid="account-starting"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={draft.isDefault}
                  onCheckedChange={(checked) => patch({ isDefault: checked })}
                  disabled={editing && account.isDefault}
                  data-testid="account-default"
                />
                Default account
              </label>
            </div>
          </div>

          {isProp ? (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Challenge rules — prop firm config
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="col-span-2 space-y-1.5 sm:col-span-3">
                  <Label htmlFor="account-firm">Firm</Label>
                  <Input
                    id="account-firm"
                    value={draft.firm}
                    onChange={(event) => patch({ firm: event.target.value })}
                    placeholder="FTMO"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-max-daily">Max daily loss %</Label>
                  <Input
                    id="account-max-daily"
                    value={draft.maxDailyLossPct}
                    onChange={(event) => patch({ maxDailyLossPct: event.target.value })}
                    inputMode="decimal"
                    className="font-mono"
                    placeholder="5"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-max-dd">Max drawdown %</Label>
                  <Input
                    id="account-max-dd"
                    value={draft.maxTotalDd}
                    onChange={(event) => patch({ maxTotalDd: event.target.value })}
                    inputMode="decimal"
                    className="font-mono"
                    placeholder="10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-target">Profit target %</Label>
                  <Input
                    id="account-target"
                    value={draft.profitTarget}
                    onChange={(event) => patch({ profitTarget: event.target.value })}
                    inputMode="decimal"
                    className="font-mono"
                    placeholder="10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-days">Min trading days</Label>
                  <Input
                    id="account-days"
                    value={draft.minTradingDays}
                    onChange={(event) => patch({ minTradingDays: event.target.value })}
                    inputMode="numeric"
                    className="font-mono"
                    placeholder="4"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {error !== null ? (
            <p className="text-sm text-[var(--loss)]" role="alert" data-testid="account-error">
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
              disabled={submitting}
              data-testid="account-submit"
            >
              {submitting ? "Saving…" : editing ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

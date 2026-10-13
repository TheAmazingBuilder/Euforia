"use client";

import * as React from "react";
import { Check, ChevronLeft, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import type { TradingProviderDescriptor } from "@cosmoz/shared";

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
import { apiErrorCode } from "@/lib/api/client";
import { useConnectTradingAccount } from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { SimulatedProviderBadge } from "./account-badges";

/**
 * The add-account entry point (Phase 02 Step Six). Capability-driven and
 * honest: the connectable list comes from the REAL provider registry — the
 * mock provider is selectable and stamped "Simulated provider", while
 * planned providers render an explicit "Planned — not connectable yet"
 * state instead of a fake setup path. No simulated success screen exists:
 * the dialog closes on the backend's 201 and the new account appears in the
 * list. The initial sync runs server-side; its failure is visible on the
 * account, never hidden.
 *
 * Out of scope by design (spec §11.3): OAuth, provider-side account
 * discovery, credential storage beyond the backend vault — the secret is
 * typed once, sent to the backend, never mirrored into any client store,
 * URL, or log.
 */

const PLANNED_PROVIDERS: Array<{ id: string; name: string; note: string }> = [
  { id: "oanda", name: "OANDA", note: "Official v20 REST API — adapter phase next." },
  { id: "ctrader", name: "cTrader", note: "Open API over OAuth 2.0 — covers IC Markets cTrader accounts." },
  { id: "mt5", name: "MetaTrader 5", note: "Requires a terminal bridge — decision pending." },
  { id: "deriv", name: "Deriv", note: "Official WebSocket API — later phase." },
  { id: "tradingview", name: "TradingView", note: "No account-data interface exists — not plannable." },
];

type WizardStep = "provider" | "environment" | "identity";

const STEP_ORDER: WizardStep[] = ["provider", "environment", "identity"];

export function ConnectAccountDialog({
  open,
  onOpenChange,
  providers,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Registry descriptors — the parent owns the providers query. */
  providers: TradingProviderDescriptor[];
  onConnected: (accountId: string) => void;
}) {
  const dict = useDict();
  const C = dict.accounts.connect;
  const connect = useConnectTradingAccount();

  const [step, setStep] = React.useState<WizardStep>("provider");
  const [provider, setProvider] = React.useState<TradingProviderDescriptor | null>(null);
  const [environment, setEnvironment] = React.useState<string | null>(null);
  const [externalAccountId, setExternalAccountId] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [secret, setSecret] = React.useState("");

  const reset = React.useCallback(() => {
    setStep("provider");
    setProvider(null);
    setEnvironment(null);
    setExternalAccountId("");
    setDisplayName("");
    setSecret("");
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const canSubmit =
    provider !== null &&
    environment !== null &&
    externalAccountId.trim().length > 0 &&
    secret.trim().length > 0;

  const submit = () => {
    if (!provider || !environment) return;
    connect.mutate(
      {
        providerId: provider.providerId,
        environment: environment as "DEMO" | "LIVE" | "PROP_FIRM",
        externalAccountId: externalAccountId.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        credentials: { method: "API_KEY", secret: secret.trim() },
      },
      {
        onSuccess: (response) => {
          toast.success(C.successTitle, { description: C.successBody });
          handleOpenChange(false);
          onConnected(response.account.id);
        },
        onError: (error) => {
          const code = apiErrorCode(error);
          const message =
            code === "UNSUPPORTED_PROVIDER"
              ? C.errors.unsupportedProvider
              : code === "UNSUPPORTED_ACCOUNT"
                ? C.errors.unsupportedAccount
                : code === "DUPLICATE_ACCOUNT"
                  ? C.errors.duplicate
                  : code === "INVALID_CREDENTIALS"
                    ? C.errors.invalidCredentials
                    : code === "RATE_LIMITED"
                      ? C.errors.rateLimited
                      : C.errors.generic;
          toast.error(message);
        },
      },
    );
  };

  const stepIndex = STEP_ORDER.indexOf(step) + 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg bg-surface"
        data-testid="connect-account-dialog"
        aria-describedby="connect-account-description"
      >
        <DialogHeader>
          <DialogTitle className="font-heading">{C.title}</DialogTitle>
          <DialogDescription id="connect-account-description">
            {step === "provider" ? C.providerBody : step === "environment" ? C.environmentBody : C.identityTitle}
          </DialogDescription>
        </DialogHeader>

        <ol
          className="flex items-center gap-2 text-xs text-muted-foreground"
          aria-label={`Step ${stepIndex} of ${STEP_ORDER.length}`}
          data-testid="connect-steps"
        >
          {[C.providerStep, C.environmentStep, C.identityStep].map((label, index) => (
            <li key={label} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border font-mono text-[10px]",
                  index + 1 < stepIndex && "border-accent bg-accent/10 text-accent",
                  index + 1 === stepIndex && "border-accent text-accent",
                  index + 1 > stepIndex && "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {index + 1 < stepIndex ? <Check className="size-3" /> : index + 1}
              </span>
              <span className={cn(index + 1 === stepIndex && "font-medium text-foreground")}>{label}</span>
              {index < STEP_ORDER.length - 1 ? <span className="text-border" aria-hidden>·</span> : null}
            </li>
          ))}
        </ol>

        {step === "provider" ? (
          <div className="grid gap-2" role="radiogroup" aria-label={C.providerTitle}>
            {providers.map((candidate) => (
              <button
                key={candidate.providerId}
                type="button"
                role="radio"
                aria-checked={provider?.providerId === candidate.providerId}
                onClick={() => setProvider(candidate)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  provider?.providerId === candidate.providerId
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/40",
                )}
                data-testid={`connect-provider-${candidate.providerId}`}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    provider?.providerId === candidate.providerId ? "border-accent text-accent" : "border-border",
                  )}
                  aria-hidden
                >
                  {provider?.providerId === candidate.providerId ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{candidate.providerName}</span>
                    {candidate.isMock ? <SimulatedProviderBadge /> : null}
                    <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
                      {C.providerAvailable}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {candidate.isMock
                      ? C.providerMockNote
                      : `${candidate.platform} · ${candidate.supportedConnectionMethods.join(", ")}`}
                  </span>
                </span>
              </button>
            ))}
            {PLANNED_PROVIDERS.map((planned) => (
              <div
                key={planned.id}
                className="flex items-start gap-3 rounded-lg border border-dashed border-border p-3 opacity-70"
                data-testid={`connect-provider-planned-${planned.id}`}
                aria-label={`${planned.name} — ${C.providerPlanned}`}
              >
                <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-muted-foreground">{planned.name}</span>
                    <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
                      {C.providerPlanned}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{planned.note}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {step === "environment" && provider ? (
          <div className="grid gap-2" role="radiogroup" aria-label={C.environmentTitle}>
            {provider.supportedEnvironments.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={environment === candidate}
                onClick={() => setEnvironment(candidate)}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-3 text-left transition-colors",
                  environment === candidate
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/40",
                )}
                data-testid={`connect-environment-${candidate}`}
              >
                <span className="font-medium text-foreground">
                  {candidate === "PROP_FIRM" ? "Prop firm" : candidate.charAt(0) + candidate.slice(1).toLowerCase()}
                </span>
                {environment === candidate ? <Check className="size-4 text-accent" aria-hidden /> : null}
              </button>
            ))}
            <p className="text-xs text-muted-foreground">
              {provider.providerName} serves {provider.supportedEnvironments.join(" and ")} accounts — other
              environments are refused by the provider.
            </p>
          </div>
        ) : null}

        {step === "identity" && provider ? (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="connect-external-id">{C.externalIdLabel}</Label>
              <Input
                id="connect-external-id"
                value={externalAccountId}
                onChange={(event) => setExternalAccountId(event.target.value)}
                placeholder="e.g. 5021347"
                autoComplete="off"
                data-testid="connect-external-id"
              />
              <p className="text-xs text-muted-foreground">{C.externalIdHint}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="connect-display-name">{C.displayNameLabel}</Label>
              <Input
                id="connect-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={`${provider.providerName} ${environment ?? ""}`}
                autoComplete="off"
                data-testid="connect-display-name"
              />
              <p className="text-xs text-muted-foreground">{C.displayNameHint}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="connect-secret">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {C.secretLabel}
                </span>
              </Label>
              <Input
                id="connect-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="new-password"
                data-testid="connect-secret"
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
                {C.secretHint}
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (step === "provider") {
                handleOpenChange(false);
                return;
              }
              setStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1]!);
            }}
            data-testid="connect-back"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {step === "provider" ? dict.common.cancel : C.back}
          </Button>
          {step === "identity" ? (
            <Button type="button" onClick={submit} disabled={!canSubmit || connect.isPending} data-testid="connect-submit">
              {connect.isPending ? C.connecting : C.submit}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setStep(STEP_ORDER[STEP_ORDER.indexOf(step) + 1]!)}
              disabled={(step === "provider" && provider === null) || (step === "environment" && environment === null)}
              data-testid="connect-next"
            >
              {C.next}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

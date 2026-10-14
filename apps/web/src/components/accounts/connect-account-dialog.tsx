"use client";

import * as React from "react";
import { Check, ChevronLeft, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import type { BrokerCatalogEntry, BrokerIdentification, TradingProviderDescriptor } from "@cosmoz/shared";

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
import { useConnectTradingAccount, useIdentifyBroker } from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { SimulatedProviderBadge } from "./account-badges";

/**
 * The add-account entry point (Phase 02 Step Six; Phase 07 universal layer).
 * Capability-driven and honest:
 *  - the connectable list comes from the REAL provider registry (the mock is
 *    stamped "Simulated provider");
 *  - the RECOGNIZED list comes from the universal broker catalog — every
 *    known broker/platform stays visible with its truthful connector status,
 *    never a fake setup path;
 *  - while the user types the account number, the identity step calls the
 *    rule-based identify endpoint (debounced, rate-limited, NO secrets sent)
 *    and answers the owner's question "WHICH broker is this?" in real time.
 * No simulated success screen exists: the dialog closes on the backend's 201
 * and the new account appears in the list. The initial sync runs server-side.
 *
 * Out of scope by design (spec §11.3): OAuth, provider-side account
 * discovery, credential storage beyond the backend vault — the secret is
 * typed once, sent to the backend, never mirrored into any client store,
 * URL, or log.
 */

type WizardStep = "provider" | "environment" | "identity";

const STEP_ORDER: WizardStep[] = ["provider", "environment", "identity"];

export function ConnectAccountDialog({
  open,
  onOpenChange,
  providers,
  brokers,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Registry descriptors — the parent owns the providers query. */
  providers: TradingProviderDescriptor[];
  /** Universal broker catalog (Phase 07) — the parent owns the catalog query. */
  brokers: BrokerCatalogEntry[];
  onConnected: (accountId: string) => void;
}) {
  const dict = useDict();
  const C = dict.accounts.connect;
  const connect = useConnectTradingAccount();
  const identifyBroker = useIdentifyBroker();

  const [step, setStep] = React.useState<WizardStep>("provider");
  const [provider, setProvider] = React.useState<TradingProviderDescriptor | null>(null);
  const [environment, setEnvironment] = React.useState<string | null>(null);
  const [externalAccountId, setExternalAccountId] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [secret, setSecret] = React.useState("");
  /** Identification result tagged with the hint pair it belongs to — derived
   * visibility (no sync setState in the effect): the UI shows a result only
   * while it matches the CURRENT provider + account number. */
  const [identification, setIdentification] = React.useState<{
    key: string;
    value: BrokerIdentification;
  } | null>(null);
  const identificationKey = `${provider?.providerId ?? ""}:${externalAccountId.trim()}`;
  const shownIdentification =
    identification && identification.key === identificationKey ? identification.value : null;

  const reset = React.useCallback(() => {
    setStep("provider");
    setProvider(null);
    setEnvironment(null);
    setExternalAccountId("");
    setDisplayName("");
    setSecret("");
    setIdentification(null);
  }, []);

  // Phase 07 — live broker identification while the account number is typed.
  // Debounced 600 ms; the hint payload contains NO secret (rule-based probe,
  // 30/15-min server rate limit — far above this cadence). Stale results are
  // filtered by the derived key comparison above, not by sync setState.
  React.useEffect(() => {
    if (step !== "identity" || !provider) {
      return;
    }
    const id = externalAccountId.trim();
    if (id.length < 5) {
      return;
    }
    const timer = setTimeout(() => {
      identifyBroker.mutate(
        { providerId: provider.providerId, externalAccountId: id },
        {
          onSuccess: (response) =>
            setIdentification({ key: `${provider.providerId}:${id}`, value: response.identification }),
          onError: () => {},
        },
      );
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, provider?.providerId, externalAccountId]);

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
            {/* Phase 07 — the universal broker catalog: every known broker
                stays visible with its honest connector status. Entries whose
                connector IS available already render as radio cards above.
                The recognized list is scroll-compact so the connectable
                cards stay in view — 17+ catalog entries would otherwise
                bury them. */}
            {brokers.filter((entry) => entry.connectorStatus !== "CONNECTOR_AVAILABLE").length >
            0 ? (
              <div className="rounded-lg border border-border/60 bg-muted/20">
                <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {C.providerRecognizedSection}
                </p>
                <div
                  className="max-h-52 overflow-y-auto px-3 pb-2 pt-1"
                  data-testid="connect-recognized-brokers"
                >
                  <div className="grid gap-1.5">
                    {brokers
                      .filter((entry) => entry.connectorStatus !== "CONNECTOR_AVAILABLE")
                      .map((entry) => (
                        <div
                          key={entry.brokerId}
                          className="flex items-start gap-2.5 rounded-md border border-dashed border-border bg-surface p-2.5 opacity-80"
                          data-testid={`connect-provider-recognized-${entry.brokerId}`}
                          aria-label={`${entry.displayName} — ${C.providerRecognized}`}
                        >
                          <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">
                                {entry.displayName}
                              </span>
                              <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[9px] uppercase leading-none tracking-wide text-muted-foreground">
                                {C.providerRecognized}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {entry.notes}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : null}
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
              {shownIdentification ? (
                <p
                  className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground"
                  data-testid="connect-broker-identification"
                >
                  <span className="font-medium text-foreground">{C.detectedBroker}:</span>
                  <span>
                    {shownIdentification.displayName}
                    {" · "}
                    {C.detectedConfidence[shownIdentification.confidence]}
                  </span>
                </p>
              ) : null}
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

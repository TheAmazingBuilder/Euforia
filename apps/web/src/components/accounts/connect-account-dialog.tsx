"use client";

import * as React from "react";
import {
  Briefcase,
  Check,
  ChevronLeft,
  FlaskConical,
  Landmark,
  Lock,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import type {
  BridgePairing,
  BrokerCatalogEntry,
  BrokerIdentification,
  TradingProviderDescriptor,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorCode } from "@/lib/api/client";
import { useConnectTradingAccount, useIdentifyBroker } from "@/lib/api/queries";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { SimulatedProviderBadge } from "./account-badges";
import { BridgePairingPanel } from "./bridge-pairing-panel";

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
 * No simulated success screen exists: on the backend's 201 the dialog closes
 * and the new account appears in the list. The initial sync runs server-side.
 * EXCEPTION (Phase 08): PLATFORM_BRIDGE providers (mt5-bridge) carry NO
 * client credential — the identity step hides the secret field behind an
 * honest explainer ("Euforia generates the bridge secret"), the submit body
 * omits `credentials`, and a 201 whose account carries a `pairing` sheet
 * keeps the dialog open on the BridgePairingPanel (ingest URL / key /
 * secret / EA download). Done closes and hands the account to the parent.
 *
 * Layout (overflow fix): the wizard is a PINNED-HEADER / SCROLLABLE-BODY /
 * PINNED-FOOTER shell — `grid-rows-[auto_minmax(0,1fr)_auto]` under a hard
 * `max-h-[85dvh]`, so the dialog can never grow past the viewport (the 17+
 * broker catalog on step 1 used to push it off-screen). Only the step body
 * scrolls; the title, the step rail and the actions always stay visible.
 * Desktop renders the wide dialog; mobile renders the canonical bottom
 * Sheet (same responsive contract as the trade modal and the account
 * detail drawer).
 */

type WizardStep = "provider" | "environment" | "identity";

const STEP_ORDER: WizardStep[] = ["provider", "environment", "identity"];

/** Environment presentation — icon + honest one-liner per capability value.
 * Keys mirror `supportedEnvironments` (DEMO | LIVE | PROP_FIRM). */
const ENVIRONMENT_META: Record<string, { icon: LucideIcon; noteKey: "environmentDemo" | "environmentLive" | "environmentPropFirm" }> = {
  DEMO: { icon: FlaskConical, noteKey: "environmentDemo" },
  LIVE: { icon: Briefcase, noteKey: "environmentLive" },
  PROP_FIRM: { icon: Trophy, noteKey: "environmentPropFirm" },
};

function environmentMeta(candidate: string) {
  return (
    ENVIRONMENT_META[candidate] ?? {
      icon: Landmark,
      noteKey: "environmentLive" as const,
    }
  );
}

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
  const isDesktop = useIsDesktop();

  const [step, setStep] = React.useState<WizardStep>("provider");
  const [provider, setProvider] = React.useState<TradingProviderDescriptor | null>(null);
  const [environment, setEnvironment] = React.useState<string | null>(null);
  const [externalAccountId, setExternalAccountId] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [secret, setSecret] = React.useState("");
  /** Phase 08 — the connect-time MT5 pairing sheet. When the 201 response
   * carries account.pairing (PLATFORM_BRIDGE providers), the wizard stays
   * open on a dedicated pairing view instead of closing — the secret is
   * handed over right where the user is. onConnected fires on Done so the
   * detail drawer never covers the sheet. */
  const [completed, setCompleted] = React.useState<{ accountId: string; pairing: BridgePairing } | null>(null);
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
    setCompleted(null);
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

  /** Phase 08 — bridge providers carry NO client credential: the submit body
   * omits `credentials` entirely and the backend generates the bridge secret. */
  const isBridgeProvider = provider?.supportedConnectionMethods.includes("PLATFORM_BRIDGE") ?? false;

  const canSubmit =
    provider !== null &&
    environment !== null &&
    externalAccountId.trim().length > 0 &&
    (isBridgeProvider || secret.trim().length > 0);

  const submit = () => {
    if (!provider || !environment) return;
    connect.mutate(
      {
        providerId: provider.providerId,
        environment: environment as "DEMO" | "LIVE" | "PROP_FIRM",
        externalAccountId: externalAccountId.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(isBridgeProvider ? {} : { credentials: { method: "API_KEY", secret: secret.trim() } }),
      },
      {
        onSuccess: (response) => {
          const pairing = response.account.pairing ?? null;
          if (pairing) {
            // Bridge flow — render the pairing sheet instead of closing.
            toast.success(C.bridge.successTitle, { description: C.bridge.successBody });
            setCompleted({ accountId: response.account.id, pairing });
            return;
          }
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

  const goBack = () => {
    if (step === "provider") {
      handleOpenChange(false);
      return;
    }
    setStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1]!);
  };

  const goNext = () => {
    setStep(STEP_ORDER[STEP_ORDER.indexOf(step) + 1]!);
  };

  /** Pinned step rail — compact chips joined by hairline segments; a filled
   * segment marks the path already walked (token colors only). */
  const stepRail = (
    <ol
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      aria-label={`Step ${stepIndex} of ${STEP_ORDER.length}`}
      data-testid="connect-steps"
    >
      {[C.providerStep, C.environmentStep, C.identityStep].map((label, index) => {
        const position = index + 1;
        const done = position < stepIndex;
        const active = position === stepIndex;
        return (
          <React.Fragment key={label}>
            {index > 0 ? (
              <span
                aria-hidden
                className={cn("h-px w-3 shrink-0", done ? "bg-accent/50" : "bg-border")}
              />
            ) : null}
            <li className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                  done && "border-accent bg-accent/10 text-accent",
                  active && "border-accent text-accent",
                  !done && !active && "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3" /> : position}
              </span>
              <span className={cn("whitespace-nowrap", active && "font-medium text-foreground")}>
                {label}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );

  const stepBody =
    step === "provider" ? C.providerBody : step === "environment" ? C.environmentBody : C.identityTitle;

  /** The scrollable step content — the ONLY region that scrolls. */
  const stepContent = (
    <>
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
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                provider?.providerId === candidate.providerId
                  ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                  : "border-border hover:border-accent/40 hover:bg-muted/30",
              )}
              data-testid={`connect-provider-${candidate.providerId}`}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  provider?.providerId === candidate.providerId ? "border-accent text-accent" : "border-border",
                )}
                aria-hidden
              >
                {provider?.providerId === candidate.providerId ? <Check className="size-3" /> : null}
              </span>
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                  provider?.providerId === candidate.providerId
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-border bg-surface-raised text-muted-foreground",
                )}
                aria-hidden
              >
                <Landmark className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{candidate.providerName}</span>
                  {candidate.isMock ? <SimulatedProviderBadge /> : null}
                  <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wide text-muted-foreground">
                    {C.providerAvailable}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
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
          {provider.supportedEnvironments.map((candidate) => {
            const meta = environmentMeta(candidate);
            const Icon = meta.icon;
            const selected = environment === candidate;
            return (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setEnvironment(candidate)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                    : "border-border hover:border-accent/40 hover:bg-muted/30",
                )}
                data-testid={`connect-environment-${candidate}`}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    selected
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-border bg-surface-raised text-muted-foreground",
                  )}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">
                    {candidate === "PROP_FIRM"
                      ? "Prop firm"
                      : candidate.charAt(0) + candidate.slice(1).toLowerCase()}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {C[meta.noteKey]}
                  </span>
                </span>
                {selected ? <Check className="size-4 shrink-0 text-accent" aria-hidden /> : null}
              </button>
            );
          })}
          <p className="text-xs leading-relaxed text-muted-foreground">
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
          {isBridgeProvider ? (
            // Phase 08 — PLATFORM_BRIDGE: no credential input exists. The
            // honest explainer replaces the API-key/secret field.
            <div className="grid gap-2" data-testid="connect-bridge-explainer">
              <p className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs leading-relaxed text-accent">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {C.bridge.explainer}
              </p>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
                {C.bridge.identityNote}
              </p>
            </div>
          ) : (
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
          )}
        </div>
      ) : null}
    </>
  );

  /** Phase 08 — leave the pairing view: close (resets) THEN hand the fresh
   * account to the parent, so the detail drawer never covers the sheet. */
  const finishPairing = () => {
    const accountId = completed?.accountId ?? null;
    handleOpenChange(false);
    if (accountId) onConnected(accountId);
  };

  const pairingView =
    completed !== null ? (
      <div className="grid gap-4" data-testid="connect-bridge-pairing-view">
        <BridgePairingPanel pairing={completed.pairing} testIdPrefix="connect-bridge-pairing" />
      </div>
    ) : null;

  const footerActions = completed !== null ? (
    <Button type="button" onClick={finishPairing} data-testid="connect-bridge-done">
      {C.bridge.done}
    </Button>
  ) : (
    <>
      <Button type="button" variant="ghost" onClick={goBack} data-testid="connect-back">
        <ChevronLeft className="size-4" aria-hidden />
        {step === "provider" ? dict.common.cancel : C.back}
      </Button>
      {step === "identity" ? (
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit || connect.isPending}
          data-testid="connect-submit"
        >
          {connect.isPending ? C.connecting : C.submit}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={goNext}
          disabled={(step === "provider" && provider === null) || (step === "environment" && environment === null)}
          data-testid="connect-next"
        >
          {C.next}
        </Button>
      )}
    </>
  );

  if (!open || isDesktop === null) return null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85dvh] overflow-hidden bg-surface sm:max-w-xl"
          data-testid="connect-account-dialog"
          aria-describedby="connect-account-description"
        >
          <DialogHeader className="-mx-4 -mt-4 gap-2 border-b border-border px-4 pb-3 pt-4">
            <div className="pr-8">
              <DialogTitle className="font-heading text-lg font-semibold text-foreground">
                {completed !== null ? C.bridge.successTitle : C.title}
              </DialogTitle>
              <DialogDescription id="connect-account-description" className="text-xs leading-relaxed">
                {completed !== null ? C.bridge.successBody : stepBody}
              </DialogDescription>
            </div>
            {completed === null ? stepRail : null}
          </DialogHeader>

          <div className="-mx-4 min-h-0 overflow-y-auto px-4" data-testid="connect-body">
            {completed !== null ? pairingView : stepContent}
          </div>

          <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            {footerActions}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-t-xl bg-surface"
        data-testid="connect-account-sheet"
        aria-describedby="connect-account-description"
      >
        <SheetHeader className="gap-1.5 border-b border-border pb-3">
          <SheetTitle className="font-heading text-lg font-semibold text-foreground">
            {completed !== null ? C.bridge.successTitle : C.title}
          </SheetTitle>
          <SheetDescription id="connect-account-description" className="text-xs leading-relaxed">
            {completed !== null ? C.bridge.successBody : stepBody}
          </SheetDescription>
          {completed === null ? stepRail : null}
        </SheetHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4" data-testid="connect-body">
          {completed !== null ? pairingView : stepContent}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-muted/50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {footerActions}
        </div>
      </SheetContent>
    </Sheet>
  );
}

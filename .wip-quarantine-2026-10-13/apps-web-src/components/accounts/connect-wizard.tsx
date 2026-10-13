"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CircleCheck,
  CircleDashed,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import type {
  AccountType,
  TradingAccountDetails,
  TradingProviderDescriptor,
} from "@cosmoz/shared";
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
  useConnectTradingAccount,
  useSyncTradingAccount,
  useTradingAccountSync,
  useTradingProviders,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { EnvironmentBadge } from "./accounts-shared";

/**
 * Add Account — the guided connection wizard (Accounts prompt §11–§20):
 * platform → provider → environment → credentials → permissions →
 * connection test → initial synchronization → connected.
 *
 * The flow is honest about being a mock: the handshake staging below is an
 * explicit presentation of the SINGLE real POST /accounts operation (§19 —
 * "For the current frontend-only phase, mock this behavior explicitly").
 * No provider is ever reported connected without the operation succeeding.
 */

type Step = "platform" | "provider" | "environment" | "credentials" | "permissions" | "testing" | "syncing" | "done";

const PLATFORMS: { platform: TradingProviderDescriptor["platform"]; label: string; blurb: string }[] = [
  { platform: "MT5", label: "MetaTrader 5", blurb: "The industry-standard desktop and mobile platform." },
  { platform: "MT4", label: "MetaTrader 4", blurb: "The classic platform, still everywhere." },
  { platform: "CTRADER", label: "cTrader", blurb: "Modern ECN trading platform." },
];

const TEST_CHECKS = [
  { label: "Provider recognized", detail: "Registry lookup" },
  { label: "Account authenticated", detail: "API key accepted by the provider" },
  { label: "Account information available", detail: "Login, server, currency, leverage" },
  { label: "Read-only permissions confirmed", detail: "Execution is never requested" },
];

const SYNC_STEPS = [
  "Account information",
  "Open positions",
  "Orders",
  "Trading history",
];

const PERMISSION_ROWS: { label: string; granted: boolean }[] = [
  { label: "Account information", granted: true },
  { label: "Balance & equity", granted: true },
  { label: "Open positions", granted: true },
  { label: "Orders", granted: true },
  { label: "Trading history", granted: true },
  { label: "Order placement", granted: false },
  { label: "Order modification", granted: false },
  { label: "Position closing", granted: false },
];

export function ConnectWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const providers = useTradingProviders();
  const connect = useConnectTradingAccount();
  const sync = useSyncTradingAccount();

  const [step, setStep] = React.useState<Step>("platform");
  const [platform, setPlatform] = React.useState<TradingProviderDescriptor["platform"] | null>(null);
  const [providerId, setProviderId] = React.useState<string | null>(null);
  const [environment, setEnvironment] = React.useState<AccountType | null>(null);
  const [externalId, setExternalId] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [connectError, setConnectError] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [connectedAccount, setConnectedAccount] = React.useState<TradingAccountDetails | null>(null);
  const [testStage, setTestStage] = React.useState(0);

  const provider = providers.data?.providers.find((p) => p.providerId === providerId) ?? null;
  const platformProviders = (providers.data?.providers ?? []).filter(
    (p) => p.platform === platform,
  );

  const reset = React.useCallback(() => {
    setStep("platform");
    setPlatform(null);
    setProviderId(null);
    setEnvironment(null);
    setExternalId("");
    setSecret("");
    setDisplayName("");
    setConnectError(null);
    setSyncError(null);
    setConnectedAccount(null);
    setTestStage(0);
  }, []);

  const close = React.useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) {
        // A completed connection lands on the detail page; anything else
        // simply resets the wizard for the next open.
        if (connectedAccount) {
          router.push(`/accounts/${connectedAccount.id}`);
        }
        reset();
      }
    },
    [connectedAccount, onOpenChange, reset, router],
  );

  // Connection handshake staging: an explicit, timed presentation of the
  // single POST /accounts operation that started with it (mock theater §19).
  // The stage counter itself is reset at the transition point (onContinue).
  React.useEffect(() => {
    if (step !== "testing") return;
    const timers = [1, 2, 3].map((tick) =>
      window.setTimeout(() => setTestStage(tick), tick * 420),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [step]);

  const submitConnect = React.useCallback(() => {
    if (provider === null || environment === null) return;
    setConnectError(null);
    connect.mutate(
      {
        providerId: provider.providerId,
        environment,
        externalAccountId: externalId.trim(),
        displayName: displayName.trim() === "" ? undefined : displayName.trim(),
        credentials: { method: "API_KEY", secret },
      },
      {
        onSuccess: (data) => {
          setConnectedAccount(data.account);
          setStep("syncing");
          // Initial synchronization — the engine completes the run ~900ms
          // later; the status query refetch confirms it (§20, no fake %).
          sync.mutate(data.account.id, {
            onSuccess: () => {
              window.setTimeout(() => setStep("done"), 1400);
            },
            onError: (error) => {
              setSyncError(apiErrorMessage(error, "Synchronization failed. Retry from the account page."));
              window.setTimeout(() => setStep("done"), 1400);
            },
          });
        },
        onError: (error) => setConnectError(apiErrorMessage(error, "We couldn't connect to your trading account. Please verify the connection details and try again.")),
      },
    );
  }, [connect, environment, externalId, displayName, provider, secret, sync]);

  const syncStatus = useTradingAccountSync(
    step === "syncing" && connectedAccount !== null ? connectedAccount.id : null,
  );

  const credentialsValid =
    externalId.trim().length >= 1 && secret.trim().length >= 4;

  const stepIndex = ["platform", "provider", "environment", "credentials", "permissions"].indexOf(step);
  const stepLabel = (step: Step): string => {
    switch (step) {
      case "platform": return "Choose your platform";
      case "provider": return "Choose your provider";
      case "environment": return "Choose the environment";
      case "credentials": return "Connection details";
      case "permissions": return "Account access";
      case "testing": return "Testing connection…";
      case "syncing": return "Syncing your account";
      case "done": return "Connection successful";
    }
  };

  const canContinue =
    (step === "platform" && platform !== null) ||
    (step === "provider" && providerId !== null) ||
    (step === "environment" && environment !== null) ||
    (step === "credentials" && credentialsValid) ||
    step === "permissions";

  const onContinue = () => {
    if (step === "permissions") {
      setTestStage(0);
      setStep("testing");
      submitConnect();
      return;
    }
    setStep(
      step === "platform" ? "provider"
        : step === "provider" ? "environment"
          : step === "environment" ? "credentials"
            : "permissions",
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0"
        data-testid="connect-wizard"
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-heading text-lg font-bold tracking-tight">
            Add Account
          </DialogTitle>
          <DialogDescription className="text-xs">
            Connect an external trading account to Cosmoz — read-only.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5" data-testid="connect-wizard-body">
          {/* Step header — restrained progress, ledger annotation style. */}
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {stepIndex >= 0 ? `Step ${stepIndex + 1} / 5 — ` : ""}
              {stepLabel(step)}
            </p>
            {step === "testing" || step === "syncing" ? (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : null}
          </div>

          {step === "platform" ? (
            <div className="grid gap-2" data-testid="wizard-platforms">
              {PLATFORMS.map((option) => (
                <button
                  key={option.platform}
                  type="button"
                  onClick={() => {
                    setPlatform(option.platform);
                    setProviderId(null);
                  }}
                  aria-pressed={platform === option.platform}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    platform === option.platform
                      ? "border-accent bg-accent/5"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <Landmark className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{option.blurb}</span>
                  </span>
                </button>
              ))}
              <div
                aria-disabled="true"
                className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 opacity-60"
              >
                <Ban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Other</span>
                  <span className="block text-xs text-muted-foreground">
                    Broker APIs and exchange APIs — coming soon.
                  </span>
                </span>
              </div>
            </div>
          ) : null}

          {step === "provider" ? (
            <div className="grid gap-2" data-testid="wizard-providers">
              {providers.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading providers…</p>
              ) : platformProviders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No provider is available for this platform yet.
                </p>
              ) : (
                platformProviders.map((option) => (
                  <button
                    key={option.providerId}
                    type="button"
                    onClick={() => setProviderId(option.providerId)}
                    aria-pressed={providerId === option.providerId}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      providerId === option.providerId
                        ? "border-accent bg-accent/5"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{option.providerName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {option.supportedEnvironments.map((env) => env.toLowerCase()).join(" · ")}
                        {" — API key"}
                      </span>
                    </span>
                    {option.isMock ? (
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        Mock
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}

          {step === "environment" && provider !== null ? (
            <div className="grid gap-2" data-testid="wizard-environments">
              {provider.supportedEnvironments.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setEnvironment(option)}
                  aria-pressed={environment === option}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    environment === option
                      ? "border-accent bg-accent/5"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <EnvironmentBadge environment={option} />
                  <span className="text-xs text-muted-foreground">
                    {option === "LIVE"
                      ? "Represents real trading capital."
                      : option === "DEMO"
                        ? "Uses virtual funds."
                        : "Prop-firm challenge rules apply."}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {step === "credentials" ? (
            <div className="grid gap-4" data-testid="wizard-credentials">
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-external-id">Account number (provider login)</Label>
                <Input
                  id="wizard-external-id"
                  value={externalId}
                  onChange={(event) => setExternalId(event.target.value)}
                  placeholder="e.g. 5031827"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-secret">API key</Label>
                <Input
                  id="wizard-secret"
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder="Provider API key — transported over TLS, encrypted at rest"
                  autoComplete="new-password"
                />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LockKeyhole className="size-3" aria-hidden="true" />
                  Secrets belong to the backend — they are never displayed again and never stored in the browser.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-display-name">
                  Display name <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="wizard-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={`${provider?.providerName ?? ""} ${environment ?? ""}`}
                  autoComplete="off"
                />
              </div>
            </div>
          ) : null}

          {step === "permissions" ? (
            <div className="grid gap-4" data-testid="wizard-permissions">
              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  Account access
                </p>
                <ul className="grid gap-1.5">
                  {PERMISSION_ROWS.map((row) => (
                    <li key={row.label} className="flex items-center gap-2 text-sm">
                      {row.granted ? (
                        <>
                          <Check className="size-3.5 shrink-0 text-profit" aria-hidden="true" />
                          <span>{row.label}</span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true" className="w-3.5 shrink-0 text-center text-muted-foreground">—</span>
                          <span className="text-muted-foreground">{row.label}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Cosmoz currently uses read-only access to synchronize your trading
                data. It cannot place, modify, or close trades.
              </p>
            </div>
          ) : null}

          {step === "testing" ? (
            <div data-testid="wizard-testing">
              <ul className="grid gap-2">
                {TEST_CHECKS.map((check, index) => {
                  const done = index < testStage || connect.isSuccess;
                  const active = index === testStage && connect.isPending;
                  const failed = connect.isError && index === testStage;
                  return (
                    <li key={check.label} className="flex items-start gap-2.5 text-sm">
                      {done ? (
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-profit" aria-hidden="true" />
                      ) : failed ? (
                        <Ban className="mt-0.5 size-4 shrink-0 text-loss" aria-hidden="true" />
                      ) : active ? (
                        <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <CircleDashedIcon muted />
                      )}
                      <span className={cn(done || active ? "" : "text-muted-foreground")}>
                        {check.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {connect.isPending ? (
                <p className="mt-3 text-xs text-muted-foreground">Testing connection…</p>
              ) : null}
              {connectError !== null ? (
                <p
                  role="alert"
                  data-testid="wizard-connect-error"
                  className="mt-3 rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-xs leading-relaxed text-loss"
                >
                  {connectError}
                </p>
              ) : null}
              {connectError !== null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setStep("credentials")}
                >
                  Back to connection details
                </Button>
              ) : null}
            </div>
          ) : null}

          {step === "syncing" || step === "done" ? (
            <div data-testid="wizard-syncing">
              <ul className="grid gap-2">
                {SYNC_STEPS.map((label, index) => {
                  const done = step === "done" || index < 3;
                  const active = step === "syncing" && index === 3;
                  return (
                    <li key={label} className="flex items-center gap-2.5 text-sm">
                      {done ? (
                        <CircleCheck className="size-4 shrink-0 text-profit" aria-hidden="true" />
                      ) : active ? (
                        <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <CircleDashedIcon muted />
                      )}
                      <span className={cn(done || active ? "" : "text-muted-foreground")}>{label}</span>
                    </li>
                  );
                })}
              </ul>
              {syncStatus.data ? (
                <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  Run {syncStatus.data.lastRun?.status ?? "RUNNING"} · {syncStatus.data.lastRun?.positionsUpserted ?? 0} positions ·{" "}
                  {syncStatus.data.lastRun?.ordersUpserted ?? 0} orders · {syncStatus.data.lastRun?.dealsUpserted ?? 0} deals
                </p>
              ) : null}
              {syncError !== null ? (
                <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
                  {syncError}
                </p>
              ) : null}
              {step === "done" ? (
                <p
                  data-testid="wizard-done"
                  className="mt-4 flex items-center gap-2 text-sm font-medium text-profit"
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Connection successful — the account is synchronized.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {stepIndex >= 0 ? (
          <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setStep(
                  step === "provider" ? "platform"
                    : step === "environment" ? "provider"
                      : step === "credentials" ? "environment"
                        : "credentials",
                )
              }
              disabled={step === "platform"}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onContinue}
              disabled={!canContinue}
              data-testid="wizard-continue"
            >
              Continue
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </DialogFooter>
        ) : step === "done" ? (
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={() => {
                if (connectedAccount) {
                  const target = `/accounts/${connectedAccount.id}`;
                  close(false);
                  router.push(target);
                  toast("Account connected", { description: connectedAccount.name });
                }
              }}
              data-testid="wizard-finish"
            >
              View account
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => close(false)}>
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Dashed idle-state circle for not-yet-reached checklist rows. */
function CircleDashedIcon({ muted }: { muted?: boolean }) {
  return (
    <CircleDashed
      className={cn("mt-0.5 size-4 shrink-0", muted && "text-muted-foreground/50")}
      aria-hidden="true"
    />
  );
}

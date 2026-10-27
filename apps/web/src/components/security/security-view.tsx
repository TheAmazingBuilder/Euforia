"use client";

import * as React from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ApiKeyView,
  SessionRevokeInput,
  TwoFactorEnrollment,
} from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
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
import { ConfirmDialog } from "@/components/settings/settings-primitives";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/client";
import { useAuth } from "@/components/auth/auth-provider";
import {
  useChangePassword,
  useConfirmTwoFactor,
  useCreateApiKey,
  useDisableTwoFactor,
  useEnableTwoFactor,
  useEnableEmailTwoFactor,
  useRegenerateRecoveryCodes,
  useRevokeApiKey,
  useRevokeSessions,
  useSecurityOverview,
} from "@/lib/api/queries";
import {
  ReAuthDialog,
  SecretOnceDialog,
} from "./security-primitives";
import {
  ApiKeysPanel,
  AuthenticationPanel,
  ConnectedAccountsPanel,
  DevicesPanel,
  EventsPanel,
  LoginHistoryPanel,
  OverviewPanel,
  SessionsPanel,
  TwoFactorPanel,
} from "./security-panels";

/**
 * /security - the professional Security & Account Protection center
 * (MASTER PROMPT §3 structure): Overview · Authentication · Sessions ·
 * Two-Factor · API Keys · Connected Accounts · Security Events ·
 * Login History · Active Devices. The active tab persists in the URL (?tab=).
 *
 * Every sensitive action (§13) flows through the ReAuthDialog: a short-lived
 * single-use token is minted with the account password, then consumed by the
 * mutation. Failures (wrong password, lockout) are surfaced inline and
 * recorded in the append-only event log.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "authentication", label: "Authentication" },
  { id: "sessions", label: "Sessions" },
  { id: "two-factor", label: "Two-Factor" },
  { id: "api-keys", label: "API Keys" },
  { id: "connected-accounts", label: "Connected Accounts" },
  { id: "events", label: "Security Events" },
  { id: "login-history", label: "Login History" },
  { id: "devices", label: "Active Devices" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ReauthRequest {
  actionLabel: string;
  run: (token: string) => void;
}

export function SecurityCenterView() {
  const { data: overview, isLoading } = useSecurityOverview();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") ?? "overview";
  const activeTab: TabId = (TABS.some((tab) => tab.id === rawTab) ? rawTab : "overview") as TabId;

  const setTab = React.useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  // ── Sensitive-action gate (§13) ────────────────────────────────────────────
  const [reauthRequest, setReauthRequest] = React.useState<ReauthRequest | null>(null);
  const requestReauth = (actionLabel: string, run: (token: string) => void) =>
    setReauthRequest({ actionLabel, run });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const { logout } = useAuth();
  const changePassword = useChangePassword();
  const enableTwoFactor = useEnableTwoFactor();
  const enableEmailTwoFactor = useEnableEmailTwoFactor();
  const confirmTwoFactor = useConfirmTwoFactor();
  const disableTwoFactor = useDisableTwoFactor();
  const regenerateCodes = useRegenerateRecoveryCodes();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const revokeSessions = useRevokeSessions();

  const busy =
    changePassword.isPending ||
    enableTwoFactor.isPending ||
    enableEmailTwoFactor.isPending ||
    confirmTwoFactor.isPending ||
    disableTwoFactor.isPending ||
    regenerateCodes.isPending ||
    createApiKey.isPending ||
    revokeApiKey.isPending ||
    revokeSessions.isPending;

  // ── 2FA enrollment (codes shown ONCE) ──────────────────────────────────────
  const [enrollment, setEnrollment] = React.useState<TwoFactorEnrollment | null>(null);
  const [enrollSaved, setEnrollSaved] = React.useState(false);
  const [enrollCode, setEnrollCode] = React.useState("");

  // ── One-time secret (API key) / regenerated codes ──────────────────────────
  const [secretOnce, setSecretOnce] = React.useState<{ title: string; secret: string } | null>(null);
  const [codesOnce, setCodesOnce] = React.useState<string[] | null>(null);
  const [disableConfirmOpen, setDisableConfirmOpen] = React.useState(false);

  // ── Flows ──────────────────────────────────────────────────────────────────
  const onChangePassword = (newPassword: string, onDone: () => void) => {
    requestReauth("Changing your password", (token) =>
      changePassword.mutate(
        { reauthToken: token, newPassword },
        {
          onSuccess: () => {
            toast.success("Password updated after re-authentication - journal data untouched");
            onDone();
          },
          onError: (error) => toast.error(apiErrorMessage(error, "Could not update the password")),
        },
      ),
    );
  };

  const onEnableTwoFactor = () => {
    requestReauth("Enabling two-factor authentication", (token) =>
      enableTwoFactor.mutate(token, {
        onSuccess: (result) => {
          setEnrollSaved(false);
          setEnrollCode("");
          setEnrollment(result);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Could not start the 2FA setup")),
      }),
    );
  };

  const onEnableEmailTwoFactor = () => {
    requestReauth("Enabling email-code two-factor authentication", (token) =>
      enableEmailTwoFactor.mutate(token, {
        onSuccess: (result) => {
          setCodesOnce(result.recoveryCodes);
          toast.success("Email-code two-factor authentication is on");
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Could not enable email-code 2FA")),
      }),
    );
  };

  const onConfirmEnrollment = () => {
    if (enrollment === null) return;
    confirmTwoFactor.mutate(
      { code: enrollCode },
      {
        onSuccess: () => {
          toast.success("Two-factor authentication is on - recovery codes stay hidden");
          setEnrollment(null);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Challenge failed")),
      },
    );
  };

  const onDisableTwoFactor = () => {
    requestReauth("Disabling two-factor authentication", (token) =>
      disableTwoFactor.mutate(token, {
        onSuccess: () => toast.success("Two-factor disabled - recovery codes destroyed"),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not disable 2FA")),
      }),
    );
  };

  const onRegenerateCodes = () => {
    requestReauth("Regenerating recovery codes", (token) =>
      regenerateCodes.mutate(token, {
        onSuccess: (result) => setCodesOnce(result.recoveryCodes),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not regenerate codes")),
      }),
    );
  };

  const onCreateApiKey = (input: {
    name: string;
    scopes: ApiKeyView["scopes"];
    expiresInDays: number | null;
  }) => {
    requestReauth(`Creating the API key “${input.name}”`, (token) =>
      createApiKey.mutate(
        { ...input, reauthToken: token },
        {
          onSuccess: (created) => {
            setSecretOnce({ title: `API key “${created.key.name}” created`, secret: created.secret });
          },
          onError: (error) => toast.error(apiErrorMessage(error, "Could not create the API key")),
        },
      ),
    );
  };

  const onRevokeApiKey = (key: ApiKeyView) => {
    requestReauth(`Revoking the API key “${key.name}”`, (token) =>
      revokeApiKey.mutate(
        { keyId: key.id, reauthToken: token },
        {
          onSuccess: () => toast.success(`API key “${key.name}” revoked - clients lose access now`),
          onError: (error) => toast.error(apiErrorMessage(error, "Could not revoke the key")),
        },
      ),
    );
  };

  const onRevokeSessions = (input: SessionRevokeInput) => {
    revokeSessions.mutate(input, {
      onSuccess: (result) => {
        if (result.currentSessionAffected) {
          toast.success(
            `${result.revokedCount} session(s) revoked - signing you out`,
          );
          // Real application auth (spec §21): revoking the current session
          // ends it - the auth provider performs the full teardown.
          void logout({ reason: "revoked" });
        } else {
          toast.success(`${result.revokedCount} session(s) revoked - device(s) signed out`);
        }
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Could not revoke sessions")),
    });
  };

  if (isLoading || overview === undefined) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          Security
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your account protection center - authentication, sessions, two-factor,
          API keys, connected accounts and the append-only audit trail. Sensitive
          actions always ask you to confirm it&apos;s you.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Security sections"
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
        data-testid="security-tablist"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`security-tab-${tab.id}`}
              onClick={() => setTab(tab.id)}
              className={cn(
                "whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                active
                  ? "border-b-2 border-accent text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && <OverviewPanel overview={overview} goTo={setTab} />}
      {activeTab === "authentication" && (
        <AuthenticationPanel
          overview={overview}
          onChangePassword={onChangePassword}
          pending={busy}
        />
      )}
      {activeTab === "sessions" && (
        <SessionsPanel overview={overview} onRevoke={onRevokeSessions} pending={busy} />
      )}
      {activeTab === "two-factor" && (
        <TwoFactorPanel
          overview={overview}
          onEnable={onEnableTwoFactor}
          onEnableEmail={onEnableEmailTwoFactor}
          onDisable={() => setDisableConfirmOpen(true)}
          onRegenerate={onRegenerateCodes}
          pending={busy}
        />
      )}
      {activeTab === "api-keys" && (
        <ApiKeysPanel
          overview={overview}
          onCreate={onCreateApiKey}
          onRevoke={onRevokeApiKey}
          pending={busy}
        />
      )}
      {activeTab === "connected-accounts" && <ConnectedAccountsPanel overview={overview} />}
      {activeTab === "events" && <EventsPanel overview={overview} />}
      {activeTab === "login-history" && <LoginHistoryPanel overview={overview} />}
      {activeTab === "devices" && (
        <DevicesPanel overview={overview} onRevoke={onRevokeSessions} pending={busy} />
      )}

      {/* ── Sensitive-action gate (§13) ── */}
      <ReAuthDialog
        open={reauthRequest !== null}
        onOpenChange={(open) => !open && setReauthRequest(null)}
        actionLabel={reauthRequest?.actionLabel ?? ""}
        onAuthenticated={(token) => {
          const request = reauthRequest;
          setReauthRequest(null);
          request?.run(token);
        }}
        testid="reauth-dialog"
      />

      {/* ── 2FA enrollment - secret + demo code + recovery codes, shown once ── */}
      <Dialog
        open={enrollment !== null}
        onOpenChange={(open) => !open && setEnrollment(null)}
      >
        <DialogContent className="sm:max-w-md" data-testid="tfa-enroll-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Set up your authenticator</DialogTitle>
            <DialogDescription>
              Add the secret to your authenticator app, verify the challenge and
              keep the recovery codes - they are displayed only once.
            </DialogDescription>
          </DialogHeader>
          {enrollment !== null && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Secret</Label>
                <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm">
                  {enrollment.secret}
                </div>
                <p className="rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                  Demo environment - no real authenticator exists. The code your
                  app would generate is{" "}
                  <span className="font-mono font-medium text-foreground">
                    {enrollment.demoCode}
                  </span>
                  .
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label>Recovery codes - {enrollment.recoveryCodes.length} single-use codes</Label>
                <div className="grid grid-cols-2 gap-1.5" data-testid="tfa-recovery-codes">
                  {enrollment.recoveryCodes.map((code) => (
                    <span
                      key={code}
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-center font-mono text-sm tabular-nums"
                    >
                      {code}
                    </span>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enrollSaved}
                    onChange={(event) => setEnrollSaved(event.target.checked)}
                    data-testid="tfa-saved"
                  />
                  I stored my recovery codes somewhere safe
                </label>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tfa-code">Verification code</Label>
                <Input
                  id="tfa-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={enrollCode}
                  onChange={(event) =>
                    setEnrollCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="6-digit code"
                  data-testid="tfa-code"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollment(null)}>
              Finish later
            </Button>
            <Button
              onClick={onConfirmEnrollment}
              disabled={!enrollSaved || enrollCode.length !== 6 || confirmTwoFactor.isPending}
              data-testid="tfa-verify"
            >
              {confirmTwoFactor.isPending ? "Verifying…" : "Verify & activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Disable 2FA confirm → reauth ── */}
      <ConfirmDialog
        open={disableConfirmOpen}
        onOpenChange={setDisableConfirmOpen}
        title="Disable two-factor authentication?"
        description="Sign-ins will rely on the password alone. Your remaining recovery codes are destroyed. Disabling requires re-authentication."
        confirmLabel="Disable 2FA"
        destructive
        onConfirm={() => {
          setDisableConfirmOpen(false);
          onDisableTwoFactor();
        }}
        pending={busy}
        testid="tfa-disable-confirm"
      />

      {/* ── One-time secret (API key creation) ── */}
      <SecretOnceDialog
        open={secretOnce !== null}
        onOpenChange={(open) => !open && setSecretOnce(null)}
        title={secretOnce?.title ?? ""}
        description="Copy and store it now - this is the only time the full secret is shown."
        secret={secretOnce?.secret}
        testid="secret-once"
      />

      {/* ── Regenerated recovery codes (shown once) ── */}
      <SecretOnceDialog
        open={codesOnce !== null}
        onOpenChange={(open) => !open && setCodesOnce(null)}
        title="New recovery codes"
        description="The previous set is now invalid. Store these ten single-use codes now - they will never be shown again."
        recoveryCodes={codesOnce ?? undefined}
        testid="codes-once"
      />

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Security events and login history are append-only - they cannot be
          edited or deleted from the app.
        </span>
        <Badge variant="outline">READ-ONLY VAULT</Badge>
      </p>
    </div>
  );
}

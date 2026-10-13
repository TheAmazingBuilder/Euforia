"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  ApiKey,
  SecurityAuditEvent,
  SecurityCenterOverview,
  SecurityControl,
  SecurityControlAction,
  SecurityEventKind,
  SecurityLoginV2,
  SecuritySessionV2,
  TwoFactorSetupResponse,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIntegrations } from "@/lib/api/queries";
import {
  useApiKeys,
  useChangePasswordV2,
  useConfirmTwoFactor,
  useCreateApiKey,
  useDisableTwoFactor,
  useLoginHistory,
  useLogoutAll,
  useLogoutOthers,
  useRevokeApiKey,
  useRevokeSession,
  useSecurityAudit,
  useSecurityCenter,
  useSecuritySessions,
  useSetupTwoFactor,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { passwordIssue, passwordsMatch } from "@/lib/auth/demo";
import { clearSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

import {
  DATE_TIME,
  DemoNote,
  KIND_META,
  ReauthDialog,
  SecretCode,
  copyText,
  downloadTextFile,
  relativeTime,
} from "./security-bits";

/**
 * Security Center — Overview, Authentication, Two-Factor, Sessions, API
 * Keys, Connected Accounts, Events and Login History behind one tab set.
 * Security rules rendered as UI (§16/§18): secrets appear exactly once,
 * audit rows are read-only, sensitive actions pass the reauth gate.
 */

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "authentication", label: "Authentication" },
  { value: "twofactor", label: "Two-Factor" },
  { value: "sessions", label: "Sessions" },
  { value: "apikeys", label: "API Keys" },
  { value: "connected", label: "Connected Accounts" },
  { value: "events", label: "Events" },
  { value: "logins", label: "Login History" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function SectionCard({
  title,
  description,
  action,
  children,
  testId,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Card className="bg-surface" data-testid={testId}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base font-semibold">{title}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const ACTION_TARGET: Record<SecurityControlAction, TabValue> = {
  enable_2fa: "twofactor",
  rotate_password: "authentication",
  review_sessions: "sessions",
  review_api_keys: "apikeys",
};

// ── Overview (§4) — checklist-based readiness, no invented score ─────────────

function OverviewSection({
  data,
  onNavigate,
}: {
  data: SecurityCenterOverview;
  onNavigate: (tab: TabValue) => void;
}) {
  const [nowMs] = React.useState(() => Date.now());
  const done = data.controls.filter((control) => control.done).length;

  return (
    <div className="space-y-4">
      {/* Readiness — the methodology IS the checklist */}
      <SectionCard
        title={`Account protection — ${done} of ${data.controls.length} controls on`}
        description="Readiness counts the controls below, nothing more: each row states how it is evaluated."
        testId="security-readiness"
      >
        <ul className="space-y-3">
          {data.controls.map((control) => (
            <ControlRow key={control.id} control={control} onNavigate={onNavigate} />
          ))}
        </ul>
      </SectionCard>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="security-status-cards">
        <StatusCard
          label="Two-factor"
          value={data.twoFactor.enabled ? "On" : "Off"}
          tone={data.twoFactor.enabled ? "good" : "warn"}
          detail={
            data.twoFactor.enabled
              ? `Since ${DATE_TIME.format(new Date(data.twoFactor.enabledAt ?? data.passwordLastChangedAt))}`
              : "No second factor yet"
          }
        />
        <StatusCard
          label="Active sessions"
          value={String(data.activeSessionCount)}
          tone={data.activeSessionCount > 3 ? "warn" : "neutral"}
          detail="Devices holding a live key"
        />
        <StatusCard
          label="Active API keys"
          value={String(data.activeApiKeyCount)}
          tone={data.activeApiKeyCount > 3 ? "warn" : "neutral"}
          detail="Masked keys only"
        />
        <StatusCard
          label="Connected accounts"
          value={String(data.connectedAccountCount)}
          tone="neutral"
          detail="Integrations with access"
        />
      </div>

      {/* Recent events + recent logins */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Recent security events"
          description="The append-only trail — newest first."
          action={
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate("events")}>
              All events <ExternalLink className="size-3" aria-hidden="true" />
            </Button>
          }
          testId="security-recent-events"
        >
          <ul className="space-y-2.5">
            {data.recentEvents.map((event) => (
              <EventRow key={event.id} event={event} nowMs={nowMs} />
            ))}
          </ul>
        </SectionCard>
        <SectionCard
          title="Recent logins"
          description="Successes and the attempts that bounced."
          action={
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate("logins")}>
              Full history <ExternalLink className="size-3" aria-hidden="true" />
            </Button>
          }
          testId="security-recent-logins"
        >
          <ul className="space-y-2.5">
            {data.recentLogins.map((login) => (
              <LoginRow key={login.id} login={login} nowMs={nowMs} compact />
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function ControlRow({
  control,
  onNavigate,
}: {
  control: SecurityControl;
  onNavigate: (tab: TabValue) => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3" data-testid={`security-control-${control.id}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        {control.done ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-profit" aria-hidden="true" />
        ) : (
          <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className={cn("text-sm font-medium", control.done ? "text-muted-foreground line-through" : "text-foreground")}>
            {control.title}
          </p>
          <p className="text-xs text-muted-foreground">{control.detail}</p>
        </div>
      </div>
      {!control.done && control.action ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 text-xs"
          onClick={() => onNavigate(ACTION_TARGET[control.action!])}
        >
          Fix
        </Button>
      ) : null}
    </li>
  );
}

function StatusCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warn" | "neutral";
}) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-surface px-4 py-3">
      <p className="ledger-label">{label}</p>
      <p
        className={cn(
          "font-mono text-xl font-semibold tabular-nums",
          tone === "good" && "text-profit",
          tone === "warn" && "text-warning",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EventRow({ event, nowMs }: { event: SecurityAuditEvent; nowMs: number }) {
  const mark = KIND_META[event.kind];
  const Icon = mark.Icon;
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-md ring-1 ring-foreground/10", mark.ringClass)}
      >
        <Icon className={cn("size-3.5", mark.tintClass)} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {mark.label}
          {event.outcome === "failure" ? <span className="ml-1.5 text-xs font-semibold text-loss">failed</span> : null}
        </p>
        {event.detail ? <p className="truncate text-xs text-muted-foreground">{event.detail}</p> : null}
      </div>
      <time dateTime={event.at} className="shrink-0 pt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
        {relativeTime(event.at, nowMs)}
      </time>
    </li>
  );
}

function LoginRow({
  login,
  nowMs,
  compact = false,
  className,
}: {
  login: SecurityLoginV2;
  nowMs: number;
  compact?: boolean;
  className?: string;
}) {
  return (
    <li className={cn("flex items-start justify-between gap-3", className)} data-testid={`security-login-${login.id}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {login.device}
          <span className="ml-1.5 font-normal text-muted-foreground">· {login.location}</span>
        </p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {login.browser} · {login.os} · {login.ipMasked}
          {!compact && login.reason ? <span className="text-loss"> — {login.reason}</span> : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <span
          className={cn(
            "font-mono text-[10px] font-semibold uppercase tracking-wide",
            login.outcome === "success" ? "text-profit" : "text-loss",
          )}
        >
          {login.outcome === "success" ? "Signed in" : "Failed"}
        </span>
        <time dateTime={login.at} className="block font-mono text-[10px] tabular-nums text-muted-foreground">
          {relativeTime(login.at, nowMs)}
        </time>
      </div>
    </li>
  );
}

// ── Authentication (§5) — password rotation behind the reauth gate ──────────

function AuthenticationSection({ data }: { data: SecurityCenterOverview }) {
  const changePassword = useChangePasswordV2();
  const [reauthOpen, setReauthOpen] = React.useState(false);
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const nextIssue = next.length > 0 ? passwordIssue(next) : null;
  const matchOk = passwordsMatch(next, confirm);
  const canSave =
    current.length > 0 && next.length >= 8 && confirm.length > 0 && next === confirm && !changePassword.isPending;

  function handleSave() {
    if (!canSave) return;
    setReauthOpen(true);
  }

  function handleAuthenticated(token: string) {
    changePassword.mutate(
      { currentPassword: current, newPassword: next, reauthToken: token },
      {
        onSuccess: () => {
          toast.success("Password changed — every other session stays alive (demo).");
          setCurrent("");
          setNext("");
          setConfirm("");
          setError(null);
        },
        onError: (cause) => setError(apiErrorMessage(cause, "The password could not be changed.")),
      },
    );
  }

  const revealButton = (
    <button
      type="button"
      onClick={() => setReveal((value) => !value)}
      aria-label={reveal ? "Hide passwords" : "Show passwords"}
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {reveal ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
    </button>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="Password"
        description={`Last changed ${DATE_TIME.format(new Date(data.passwordLastChangedAt))} — rotation is re-authenticated, then applied.`}
        testId="security-password"
      >
        <div className="grid max-w-md gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="security-password-current">Current password</Label>
            <div className="relative">
              <Input
                id="security-password-current"
                type={reveal ? "text" : "password"}
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                className="h-9 pr-9"
                autoComplete="current-password"
                data-testid="security-password-current"
              />
              {revealButton}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="security-password-new">New password</Label>
            <div className="relative">
              <Input
                id="security-password-new"
                type={reveal ? "text" : "password"}
                value={next}
                onChange={(event) => setNext(event.target.value)}
                className="h-9 pr-9"
                autoComplete="new-password"
                data-testid="security-password-new"
              />
              {revealButton}
            </div>
            {nextIssue ? <p className="text-xs text-loss">{nextIssue}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="security-password-confirm">Confirm new password</Label>
            <div className="relative">
              <Input
                id="security-password-confirm"
                type={reveal ? "text" : "password"}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="h-9 pr-9"
                autoComplete="new-password"
                data-testid="security-password-confirm"
              />
              {revealButton}
            </div>
            {confirm.length > 0 ? (
              <p aria-live="polite" className={cn("text-xs", matchOk ? "text-profit" : "text-loss")}>
                {matchOk ? "Passwords match" : "Passwords don't match"}
              </p>
            ) : null}
          </div>
          {error ? <p className="text-xs text-loss">{error}</p> : null}
          <div>
            <Button onClick={handleSave} disabled={!canSave} data-testid="security-password-save">
              {changePassword.isPending ? "Saving…" : "Change password"}
            </Button>
          </div>
        </div>
      </SectionCard>
      <DemoNote>
        Demo build: no credential is stored or transmitted — shape rules only. Failed attempts are
        rate-limited (5 per 10 minutes) and logged as security events.
      </DemoNote>
      <ReauthDialog
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        title="Change password"
        description="Confirm your password to authorize this sensitive change."
        onAuthenticated={handleAuthenticated}
      />
    </div>
  );
}

// ── Two-Factor (§6) — enrollment with ONE-TIME recovery codes ────────────────

type EnrollmentState =
  | { phase: "idle" }
  | { phase: "verifying"; setup: TwoFactorSetupResponse }
  | { phase: "recovery-codes"; setup: TwoFactorSetupResponse };

function TwoFactorSection({ data }: { data: SecurityCenterOverview }) {
  const setup = useSetupTwoFactor();
  const confirmTwoFactor = useConfirmTwoFactor();
  const disableTwoFactor = useDisableTwoFactor();
  const [enrollment, setEnrollment] = React.useState<EnrollmentState>({ phase: "idle" });
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [codesStored, setCodesStored] = React.useState(false);
  const [reauthOpen, setReauthOpen] = React.useState(false);

  function startEnrollment() {
    setup.mutate(undefined, {
      onSuccess: (result) => {
        setCode("");
        setCodeError(null);
        setCodesStored(false);
        setEnrollment({ phase: "verifying", setup: result });
      },
      onError: (cause) => toast.error(apiErrorMessage(cause, "The setup could not start.")),
    });
  }

  function verifyCode() {
    if (enrollment.phase !== "verifying" || code.length !== 6) return;
    confirmTwoFactor.mutate(
      { code },
      {
        onSuccess: () => {
          setEnrollment((state) =>
            state.phase === "verifying" ? { phase: "recovery-codes", setup: state.setup } : state,
          );
        },
        onError: (cause) => setCodeError(apiErrorMessage(cause, "Invalid code — try again.")),
      },
    );
  }

  function finishEnrollment() {
    setEnrollment({ phase: "idle" });
    toast.success("Two-factor authentication is on.");
  }

  function handleDisable(token: string) {
    disableTwoFactor.mutate(
      { reauthToken: token },
      {
        onSuccess: () => toast.success("Two-factor authentication is off."),
        onError: (cause) => toast.error(apiErrorMessage(cause, "The change was rejected.")),
      },
    );
  }

  const enabled = data.twoFactor.enabled;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Two-step verification"
        description={
          enabled
            ? "A second factor guards every sign-in. Keep the recovery codes offline."
            : "Add an authenticator app (TOTP). Setup issues eight one-time recovery codes."
        }
        testId="security-2fa"
        action={
          enabled ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-muted-foreground hover:text-loss"
              onClick={() => setReauthOpen(true)}
              data-testid="security-2fa-disable"
            >
              <ShieldAlert className="size-3.5" aria-hidden="true" />
              Disable
            </Button>
          ) : (
            <Button size="sm" className="h-8" onClick={startEnrollment} disabled={setup.isPending} data-testid="security-2fa-enable">
              {setup.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-3.5" aria-hidden="true" />}
              Enable
            </Button>
          )
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            {enabled ? (
              <ShieldCheck className="size-5 text-profit" aria-hidden="true" />
            ) : (
              <ShieldAlert className="size-5 text-warning" aria-hidden="true" />
            )}
            <p className="text-sm text-foreground" data-testid="security-2fa-status">
              {enabled
                ? `On since ${DATE_TIME.format(new Date(data.twoFactor.enabledAt ?? ""))} — ${data.twoFactor.recoveryCodesLeft ?? 0} recovery code${data.twoFactor.recoveryCodesLeft === 1 ? "" : "s"} left.`
                : "Two-factor authentication is off."}
            </p>
          </div>
          {enabled ? (
            <DemoNote>
              Recovery codes are hashed at rest — this screen only ever shows how many remain, never
              the codes themselves.
            </DemoNote>
          ) : null}
        </div>
      </SectionCard>

      {/* Enrollment dialog: secret → verify → recovery codes ONCE */}
      <Dialog
        open={enrollment.phase !== "idle"}
        onOpenChange={(open) => {
          if (!open) setEnrollment({ phase: "idle" });
        }}
      >
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          {enrollment.phase === "verifying" ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">Set up an authenticator</DialogTitle>
                <DialogDescription>
                  Add the secret to your authenticator app (manual entry), then verify the six-digit code.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="ledger-label">Secret</p>
                  <div className="flex items-center gap-2">
                    <span data-testid="security-2fa-secret">
                      <SecretCode value={enrollment.setup.secret} className="tracking-widest" />
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      aria-label="Copy secret"
                      onClick={() => void copyText(enrollment.setup.secret).then((ok) => toast[ok ? "success" : "error"](ok ? "Secret copied." : "Copy failed — select it manually."))}
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="font-mono text-[10px] break-all text-muted-foreground">{enrollment.setup.otpauthUrl}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="security-2fa-code">Six-digit code</Label>
                  <Input
                    id="security-2fa-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    className="h-9 font-mono tracking-[0.4em]"
                    autoFocus
                    data-testid="security-2fa-code"
                  />
                  {codeError ? <p className="text-xs text-loss" role="alert">{codeError}</p> : null}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setEnrollment({ phase: "idle" })}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={verifyCode} disabled={code.length !== 6 || confirmTwoFactor.isPending} data-testid="security-2fa-verify">
                    {confirmTwoFactor.isPending ? "Verifying…" : "Verify & enable"}
                  </Button>
                </DialogFooter>
              </div>
            </>
          ) : enrollment.phase === "recovery-codes" ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">Store your recovery codes</DialogTitle>
                <DialogDescription>
                  Eight one-time codes. This is the ONLY time they are shown — after this dialog they
                  are hashed and can never be displayed again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2" data-testid="security-2fa-recovery-codes">
                  {enrollment.setup.recoveryCodes.map((recoveryCode) => (
                    <SecretCode key={recoveryCode} value={recoveryCode} className="text-center" />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      void copyText(enrollment.setup.recoveryCodes.join("\n")).then((ok) =>
                        toast[ok ? "success" : "error"](ok ? "Codes copied." : "Copy failed."),
                      )
                    }
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    Copy all
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      downloadTextFile(
                        `Cosmoz recovery codes\nAccount: ${data.email}\nGenerated: ${new Date().toISOString()}\n\n${enrollment.setup.recoveryCodes.join("\n")}\n`,
                        "cosmoz-recovery-codes.txt",
                        "text/plain",
                      )
                    }
                  >
                    Download .txt
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={codesStored} onCheckedChange={(checked) => setCodesStored(checked === true)} data-testid="security-2fa-stored" />
                  I stored these codes somewhere safe (offline).
                </label>
                <DialogFooter>
                  <Button size="sm" onClick={finishEnrollment} disabled={!codesStored} data-testid="security-2fa-done">
                    Done
                  </Button>
                </DialogFooter>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReauthDialog
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        title="Disable two-factor"
        description="Confirm your password to remove the second factor."
        onAuthenticated={handleDisable}
      />
    </div>
  );
}

// ── Sessions & devices (§7, §12) ─────────────────────────────────────────────

function SessionsSection() {
  const sessionsQuery = useSecuritySessions();
  const revoke = useRevokeSession();
  const logoutOthers = useLogoutOthers();
  const logoutAll = useLogoutAll();
  const router = useRouter();
  const [reauthAction, setReauthAction] = React.useState<"others" | "all" | null>(null);
  const [nowMs] = React.useState(() => Date.now());

  function handleReauthed(action: "others" | "all", token: string) {
    const mutation = action === "others" ? logoutOthers : logoutAll;
    mutation.mutate(
      { reauthToken: token },
      {
        onSuccess: (result) => {
          if (result.currentEnded) {
            toast.success(`Signed out ${result.revoked} other session${result.revoked === 1 ? "" : "s"} — this one ends now.`);
            // The demo session lives in localStorage; ending it = sign-out.
            window.setTimeout(() => {
              clearSession();
              router.replace("/login");
            }, 600);
          } else {
            toast.success(`Signed out ${result.revoked} session${result.revoked === 1 ? "" : "s"}.`);
          }
        },
        onError: (cause) => toast.error(apiErrorMessage(cause, "The sign-out failed.")),
      },
    );
  }

  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Active sessions"
        description="Devices holding a live door key — the current session cannot revoke itself."
        testId="security-sessions"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={sessions.filter((session) => !session.current).length === 0}
              onClick={() => setReauthAction("others")}
              data-testid="security-logout-others"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              Logout others
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-loss"
              onClick={() => setReauthAction("all")}
              data-testid="security-logout-all"
            >
              Logout all
            </Button>
          </div>
        }
      >
        {sessionsQuery.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                nowMs={nowMs}
                revokePending={revoke.isPending}
                onRevoke={() =>
                  revoke.mutate(session.id, {
                    onSuccess: () => toast.success("Session revoked."),
                    onError: (cause) => toast.error(apiErrorMessage(cause, "The session could not be revoked.")),
                  })
                }
              />
            ))}
          </div>
        )}
      </SectionCard>
      <ReauthDialog
        open={reauthAction !== null}
        onOpenChange={(open) => {
          if (!open) setReauthAction(null);
        }}
        title={reauthAction === "all" ? "Logout all sessions" : "Logout other sessions"}
        description="Confirm your password to sign out the selected sessions."
        onAuthenticated={(token) => {
          const action = reauthAction;
          setReauthAction(null);
          if (action !== null) handleReauthed(action, token);
        }}
      />
    </div>
  );
}

function SessionRow({
  session,
  nowMs,
  revokePending,
  onRevoke,
}: {
  session: SecuritySessionV2;
  nowMs: number;
  revokePending: boolean;
  onRevoke: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`security-session-${session.id}`}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {session.device}
          {session.current ? (
            <span className="rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-accent">
              Current
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {session.browser} · {session.os} · {session.location} · {session.ipMasked}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          created {DATE_TIME.format(new Date(session.createdAt))} · active {relativeTime(session.lastActiveAt, nowMs)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 text-muted-foreground hover:text-loss disabled:opacity-50"
        disabled={session.current || revokePending}
        onClick={onRevoke}
        data-testid={`security-revoke-${session.id}`}
      >
        {revokePending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        Revoke
      </Button>
    </div>
  );
}

// ── API Keys (§8) — plaintext shown ONCE, masked forever after ───────────────

const API_SCOPES: { value: "read:journal" | "write:journal" | "read:analytics" | "export:data" | "read:market"; label: string }[] = [
  { value: "read:journal", label: "Read journal" },
  { value: "write:journal", label: "Write journal" },
  { value: "read:analytics", label: "Read analytics" },
  { value: "export:data", label: "Export data" },
  { value: "read:market", label: "Read market data" },
];

function ApiKeysSection() {
  const keysQuery = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const [nowMs] = React.useState(() => Date.now());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = React.useState<string>("30");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [reauthOpen, setReauthOpen] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<ApiKey | null>(null);
  const [created, setCreated] = React.useState<{ key: ApiKey; plaintext: string } | null>(null);
  const [plaintextRevealed, setPlaintextRevealed] = React.useState(false);

  function openCreate() {
    setName("");
    setScopes([]);
    setExpiresInDays("30");
    setFormError(null);
    setCreateOpen(true);
  }

  function handleAuthenticated(token: string) {
    createKey.mutate(
      {
        name: name.trim(),
        scopes: scopes as CreateApiKeyScopes,
        expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
        reauthToken: token,
      },
      {
        onSuccess: (result) => {
          setCreateOpen(false);
          setPlaintextRevealed(true);
          setCreated(result);
        },
        onError: (cause) => setFormError(apiErrorMessage(cause, "The key could not be created.")),
      },
    );
  }

  function handleRevoke(token: string) {
    if (!revokeTarget) return;
    revokeKey.mutate(
      { id: revokeTarget.id, input: { reauthToken: token } },
      {
        onSuccess: () => {
          toast.success(`"${revokeTarget.name}" revoked.`);
          setRevokeTarget(null);
        },
        onError: (cause) => toast.error(apiErrorMessage(cause, "The key could not be revoked.")),
      },
    );
  }

  const keys = keysQuery.data?.keys ?? [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="API keys"
        description="Programmatic access with explicit scopes. The full key is shown once, at creation — then only the mask."
        testId="security-api-keys"
        action={
          <Button size="sm" className="h-8 gap-1.5" onClick={openCreate} data-testid="security-api-key-create">
            <Plus className="size-3.5" aria-hidden="true" />
            New key
          </Button>
        }
      >
        {keysQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : keys.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No API key yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {keys.map((key) => (
              <div key={key.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`security-api-key-${key.id}`}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    {key.name}
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
                        key.status === "active" && "border-profit/40 bg-profit/10 text-profit",
                        key.status === "revoked" && "border-loss/40 bg-loss/10 text-loss",
                        key.status === "expired" && "border-border bg-surface-raised text-muted-foreground",
                      )}
                    >
                      {key.status}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground" data-testid={`security-api-key-mask-${key.id}`}>
                    {key.maskedKey}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {key.scopes.map((scope) => (
                      <span key={scope} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {scope}
                      </span>
                    ))}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    created {DATE_TIME.format(new Date(key.createdAt))}
                    {key.lastUsedAt ? ` · last used ${relativeTime(key.lastUsedAt, nowMs)}` : " · never used"}
                    {key.expiresAt ? ` · expires ${DATE_TIME.format(new Date(key.expiresAt))}` : " · no expiry"}
                  </p>
                </div>
                {key.status === "active" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 text-muted-foreground hover:text-loss"
                    onClick={() => setRevokeTarget(key)}
                    data-testid={`security-api-key-revoke-${key.id}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Create an API key</DialogTitle>
            <DialogDescription>Name it, choose the narrowest scopes that work, set an expiry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="api-key-name">Key name</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Zapier bridge"
                maxLength={64}
                data-testid="security-api-key-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Scopes</Label>
              <div className="grid gap-1.5">
                {API_SCOPES.map((scope) => (
                  <label key={scope.value} className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={scopes.includes(scope.value)}
                      onCheckedChange={(checked) =>
                        setScopes((current) =>
                          checked === true
                            ? [...current, scope.value]
                            : current.filter((value) => value !== scope.value),
                        )
                      }
                      data-testid={`security-api-key-scope-${scope.value.replace(":", "-")}`}
                    />
                    <span className="font-mono text-xs">{scope.value}</span>
                    <span className="text-xs text-muted-foreground">{scope.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Expiration</Label>
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger className="h-9" data-testid="security-api-key-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="never">No expiry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formError ? <p className="text-xs text-loss" role="alert">{formError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={name.trim().length === 0 || scopes.length === 0}
              onClick={() => setReauthOpen(true)}
              data-testid="security-api-key-save"
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plaintext reveal — ONCE */}
      <Dialog
        open={created !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreated(null);
            setPlaintextRevealed(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-heading">Copy your key now</DialogTitle>
            <DialogDescription>
              This is the ONLY time the full key is visible. After this dialog it is hashed on the
              server and shown masked — a lost key must be revoked and recreated.
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-xs",
                    plaintextRevealed ? "text-foreground" : "select-none text-transparent",
                  )}
                  data-testid="security-api-key-plaintext"
                >
                  {plaintextRevealed ? created.plaintext : "•".repeat(created.plaintext.length)}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={plaintextRevealed ? "Hide key" : "Show key"}
                  onClick={() => setPlaintextRevealed((value) => !value)}
                >
                  {plaintextRevealed ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label="Copy key"
                  onClick={() => void copyText(created.plaintext).then((ok) => toast[ok ? "success" : "error"](ok ? "Key copied." : "Copy failed — reveal and copy manually."))}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <DialogFooter>
                <Button size="sm" onClick={() => setCreated(null)} data-testid="security-api-key-copied">
                  I stored the key
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReauthDialog
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        title="Create API key"
        description="Confirm your password to authorize key creation."
        onAuthenticated={(token) => handleAuthenticated(token)}
      />
      <ReauthDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={`Revoke "${revokeTarget?.name ?? ""}"`}
        description="Clients using this key stop working immediately. Confirm your password to revoke."
        onAuthenticated={handleRevoke}
      />
    </div>
  );
}

type CreateApiKeyScopes = ApiKey["scopes"];

// ── Connected accounts (§9) — read from the Integration Hub state ────────────

function ConnectedAccountsSection() {
  const integrations = useIntegrations();
  const [nowMs] = React.useState(() => Date.now());
  const views = integrations.data?.integrations ?? [];

  const STATUS_TONE: Record<string, string> = {
    CONNECTED: "border-profit/40 bg-profit/10 text-profit",
    SYNCING: "border-accent/40 bg-accent/10 text-accent",
    DEGRADED: "border-warning/40 bg-warning/10 text-warning",
    AUTH_REQUIRED: "border-warning/40 bg-warning/10 text-warning",
    ERROR: "border-loss/40 bg-loss/10 text-loss",
    DISCONNECTED: "border-border bg-surface-raised text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Connected accounts"
        description="Every external account with access to your data — brokers, exchanges, data feeds and communication platforms."
        testId="security-connected"
        action={
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" asChild>
            <a href="/integrations">
              Open Integration Hub <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </Button>
        }
      >
        {integrations.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : views.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No integration configured yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {views.map((view) => (
              <div key={view.provider.id} className="flex flex-col gap-1.5 px-4 py-3" data-testid={`security-connected-${view.provider.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{view.provider.name}</p>
                  <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide", STATUS_TONE[view.state.status] ?? STATUS_TONE.DISCONNECTED!)}>
                    {view.state.status}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {view.provider.category}
                  {view.state.credentialsMask && view.state.credentialsMask.length > 0
                    ? ` · ${view.state.credentialsMask.join(" · ")}`
                    : " · no credential stored"}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  scopes: {view.provider.scopes.length > 0 ? view.provider.scopes.join(", ") : "none"}
                  {view.state.sync.lastSuccessAt
                    ? ` · last sync ${relativeTime(view.state.sync.lastSuccessAt, nowMs)}`
                    : " · never synced"}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <DemoNote>
        Secrets never appear here — only masked hints. Permissions are declared per provider; trading
        integrations are read-only. Disconnect happens in the Integration Hub and is logged as a
        security event.
      </DemoNote>
    </div>
  );
}

// ── Events (§10/§18) — append-only audit trail ───────────────────────────────

const EVENT_FILTERS: { value: string; label: string; kinds: SecurityEventKind[] | null }[] = [
  { value: "all", label: "All", kinds: null },
  { value: "signin", label: "Sign-in", kinds: ["login", "logout", "login_failed"] },
  { value: "keys", label: "Keys & 2FA", kinds: ["api_key_created", "api_key_revoked", "two_factor_enabled", "two_factor_disabled", "recovery_codes_generated", "password_changed", "password_reset_requested"] },
  { value: "integrations", label: "Integrations", kinds: ["integration_connected", "integration_disconnected"] },
  { value: "sensitive", label: "Sensitive", kinds: ["session_revoked", "sensitive_settings_changed", "data_exported"] },
];

function EventsSection() {
  const audit = useSecurityAudit();
  const [filter, setFilter] = React.useState<string>("all");
  const [nowMs] = React.useState(() => Date.now());

  const events = React.useMemo(() => {
    const all = audit.data?.events ?? [];
    const definition = EVENT_FILTERS.find((item) => item.value === filter)!;
    if (definition.kinds === null) return all;
    const allowed = definition.kinds;
    return all.filter((event) => allowed.includes(event.kind));
  }, [audit.data, filter]);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Event filters"
        className="flex w-fit flex-wrap overflow-hidden rounded-lg border border-border bg-surface"
      >
        {EVENT_FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={cn(
              "px-3.5 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              filter === item.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`security-events-filter-${item.value}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-foreground/10" data-testid="security-events">
        {audit.isPending ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : events.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No event in this scope.</p>
        ) : (
          <ol>
            {events.map((event) => {
              const mark = KIND_META[event.kind];
              const Icon = mark.Icon;
              return (
                <li key={event.id} className="flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 sm:px-5">
                  <span aria-hidden="true" className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ring-1 ring-foreground/10", mark.ringClass)}>
                    <Icon className={cn("size-4", mark.tintClass)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {mark.label}
                      <span className={cn("ml-2 font-mono text-[10px] font-semibold uppercase", event.outcome === "failure" ? "text-loss" : "text-profit")}>
                        {event.outcome}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{event.actor}</p>
                    {event.detail ? <p className="truncate text-xs text-muted-foreground">{event.detail}</p> : null}
                  </div>
                  <time dateTime={event.at} className="shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {relativeTime(event.at, nowMs)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <DemoNote>
        The audit trail is append-only: there is no edit or delete endpoint, and ordinary users
        cannot modify security logs. Rows persist with actor, context and outcome.
      </DemoNote>
    </div>
  );
}

// ── Login history (§11) ──────────────────────────────────────────────────────

function LoginHistorySection() {
  const history = useLoginHistory();
  const [nowMs] = React.useState(() => Date.now());
  const logins = history.data?.logins ?? [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-foreground/10" data-testid="security-login-history">
        {history.isPending ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : logins.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No sign-in recorded yet.</p>
        ) : (
          <ol>
            {logins.map((login) => (
              <LoginRow key={login.id} login={login} nowMs={nowMs} className="border-b border-border/60 px-4 py-3 last:border-b-0 sm:px-5" />
            ))}
          </ol>
        )}
      </div>
      <DemoNote>
        Devices, browsers and approximate locations only. Full IP addresses are masked at the source
        and never stored client-side — data minimization (§19).
      </DemoNote>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export function SecurityCenterView() {
  const overview = useSecurityCenter();
  const [tab, setTab] = React.useState<TabValue>("overview");

  function navigate(next: TabValue) {
    setTab(next);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="security-center">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Security
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The locks on the account: authentication, sessions, API keys, connected accounts and the
          append-only audit trail.
        </p>
      </header>

      {overview.isError ? (
        <p className="border-y border-border py-14 text-center text-sm text-muted-foreground">
          The security state could not be loaded. Try again in a moment.
        </p>
      ) : overview.isPending || !overview.data ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-48 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(value) => navigate(value as TabValue)}>
          <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
            <TabsList className="h-auto w-fit min-w-full gap-0 rounded-lg border border-border bg-surface p-0">
              {TABS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="rounded-none border-r border-border px-3.5 py-2 text-xs last:border-r-0 sm:text-sm"
                  data-testid={`security-tab-${item.value}`}
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="overview" className="mt-4">
            <OverviewSection data={overview.data} onNavigate={navigate} />
          </TabsContent>
          <TabsContent value="authentication" className="mt-4">
            <AuthenticationSection data={overview.data} />
          </TabsContent>
          <TabsContent value="twofactor" className="mt-4">
            <TwoFactorSection data={overview.data} />
          </TabsContent>
          <TabsContent value="sessions" className="mt-4">
            <SessionsSection />
          </TabsContent>
          <TabsContent value="apikeys" className="mt-4">
            <ApiKeysSection />
          </TabsContent>
          <TabsContent value="connected" className="mt-4">
            <ConnectedAccountsSection />
          </TabsContent>
          <TabsContent value="events" className="mt-4">
            <EventsSection />
          </TabsContent>
          <TabsContent value="logins" className="mt-4">
            <LoginHistorySection />
          </TabsContent>
        </Tabs>
      )}
      <p className="sr-only">Security events are immutable; sensitive actions require re-authentication.</p>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  CheckCircle2,
  Copy,
  Fingerprint,
  KeyRound,
  Laptop,
  Link2,
  LockKeyhole,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import type {
  ApiKeyView,
  ConnectedAccount,
  LoginRecord,
  SecurityEvent,
  SecurityOverviewResponse,
  SecuritySession,
  SessionRevokeInput,
} from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ConfirmDialog } from "@/components/settings/settings-primitives";
import {
  KindChip,
  PERMISSION_LABELS,
  StatusBadge,
} from "@/components/integrations/hub-shared";
import { cn } from "@/lib/utils";
import { EventBadge, EventOutcomeIcon, utc } from "./security-primitives";

/**
 * Tab panels of the Security center (MASTER PROMPT §3):
 * Overview · Authentication · Sessions · Two-Factor · API Keys ·
 * Connected Accounts · Security Events · Login History · Active Devices.
 * Presentation only - every mutation and re-auth flow lives in the parent.
 */

type Overview = SecurityOverviewResponse;

export const API_SCOPE_META: Record<ApiKeyView["scopes"][number], { label: string; detail: string }> = {
  "read:trades": { label: "read:trades", detail: "Read trade history and journal entries" },
  "read:analytics": { label: "read:analytics", detail: "Read aggregate analytics" },
  "write:journal": { label: "write:journal", detail: "Create and edit journal entries" },
  "read:calendar": { label: "read:calendar", detail: "Read the economic calendar" },
};

// ── §4 Overview ──────────────────────────────────────────────────────────────

export function OverviewPanel({
  overview,
  goTo,
}: {
  overview: Overview;
  goTo: (tab: string) => void;
}) {
  const activeKeys = overview.apiKeys.filter((key) => !key.revoked);
  const stats = [
    {
      id: "two-factor",
      label: "Two-factor",
      value: overview.twoFactor.enabled ? "On" : "Off",
      tab: "two-factor",
    },
    {
      id: "sessions",
      label: "Active sessions",
      value: String(overview.sessions.length),
      tab: "sessions",
    },
    {
      id: "api-keys",
      label: "Active API keys",
      value: String(activeKeys.length),
      tab: "api-keys",
    },
    {
      id: "connected",
      label: "Connected accounts",
      value: String(
        overview.connectedAccounts.filter((account) => account.status === "CONNECTED").length,
      ),
      tab: "connected-accounts",
    },
  ];

  return (
    <div className="grid gap-4">
      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
            Security checklist
          </CardTitle>
          <CardDescription>
            Every check is a hard fact about the account, evaluated with the stated methodology.
            The score is derived from those same checks - real state, never vibes.
          </CardDescription>
        </CardHeader>
        {/* Real-state score banner (module upgrade) */}
        <div className="px-6" data-testid="security-score-banner">
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3",
              overview.securityScore.rating === "STRONG"
                ? "border-accent/40 bg-accent/10"
                : overview.securityScore.rating === "FAIR"
                  ? "border-warning/40 bg-warning/10"
                  : "border-destructive/40 bg-destructive/10",
            )}
          >
            <p className="font-mono text-3xl font-bold tabular-nums">{overview.securityScore.score}</p>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{overview.securityScore.rating} - {overview.securityScore.passed}/{overview.securityScore.total} checks pass</p>
              <p className="text-xs text-muted-foreground">
                Fix the ACTION items below to raise the score - it recomputes from the live engine state on every read.
              </p>
            </div>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  overview.securityScore.rating === "STRONG" ? "bg-accent" : overview.securityScore.rating === "FAIR" ? "bg-warning" : "bg-destructive",
                )}
                style={{ width: `${overview.securityScore.score}%` }}
              />
            </div>
          </div>
        </div>
        <CardContent className="mt-3 grid gap-2 sm:grid-cols-2">
          {overview.protection.map((check) => (
            <div
              key={check.id}
              className="flex items-start gap-2.5 rounded-lg border border-border bg-background/60 px-3 py-2.5"
              data-testid={`protection-${check.id}`}
            >
              {check.pass ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-accent"
                  aria-hidden="true"
                />
              ) : (
                <XCircle
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {check.label}
                  <Badge variant={check.pass ? "secondary" : "outline"} className="ml-2">
                    {check.pass ? "PASS" : "ACTION"}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">{check.detail}</p>
                <p className="mt-1 text-[11px] italic text-muted-foreground/80">
                  Methodology: {check.methodology}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <button
            key={stat.id}
            type="button"
            onClick={() => goTo(stat.tab)}
            data-testid={`overview-stat-${stat.id}`}
            className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/50"
          >
            <p className="font-mono text-2xl font-semibold tabular-nums">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-surface">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="font-heading text-base font-semibold">
              Recent security events
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => goTo("events")}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {overview.events.slice(0, 5).map((event) => (
              <EventRow key={event.id} event={event} compact />
            ))}
          </CardContent>
        </Card>
        <Card className="border-border bg-surface">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="font-heading text-base font-semibold">
              Recent sign-ins
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => goTo("login-history")}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {overview.logins.slice(0, 3).map((login) => (
              <LoginRow key={login.id} login={login} compact />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── §5 Authentication - the Password card design is preserved ────────────────

export function AuthenticationPanel({
  overview,
  onChangePassword,
  pending,
}: {
  overview: Overview;
  /** Parent runs the re-auth gate + mutation; onDone clears the form. */
  onChangePassword: (newPassword: string, onDone: () => void) => void;
  pending: boolean;
}) {
  const [password, setPassword] = React.useState({ current: "", next: "", confirm: "" });

  const onSavePassword = () => {
    if (!password.current || !password.next || !password.confirm) return;
    if (password.next !== password.confirm) return;
    if (password.next.length < 10) return;
    onChangePassword(password.next, () => setPassword({ current: "", next: "", confirm: "" }));
  };

  const validationError =
    password.next.length > 0 && password.next.length < 10
      ? "Use at least 10 characters."
      : password.confirm.length > 0 && password.next !== password.confirm
        ? "New password and confirmation do not match."
        : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <LockKeyhole className="size-4 text-accent" aria-hidden="true" />
              Password
            </CardTitle>
            <CardDescription>
              Change it any time - journal data stays untouched.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="security-password-current">Current password</Label>
              <Input
                id="security-password-current"
                type="password"
                autoComplete="current-password"
                value={password.current}
                onChange={(event) =>
                  setPassword((p) => ({ ...p, current: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="security-password-new">New password</Label>
              <Input
                id="security-password-new"
                type="password"
                autoComplete="new-password"
                value={password.next}
                onChange={(event) =>
                  setPassword((p) => ({ ...p, next: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="security-password-confirm">Confirm new password</Label>
              <Input
                id="security-password-confirm"
                type="password"
                autoComplete="new-password"
                value={password.confirm}
                onChange={(event) =>
                  setPassword((p) => ({ ...p, confirm: event.target.value }))
                }
              />
            </div>
            {validationError !== null && (
              <p className="text-xs font-medium text-destructive">{validationError}</p>
            )}
            <Button
              onClick={onSavePassword}
              disabled={
                pending ||
                !password.current ||
                !password.next ||
                !password.confirm ||
                password.next !== password.confirm ||
                password.next.length < 10
              }
              className="justify-self-start"
              data-testid="password-submit"
            >
              {pending ? "Updating…" : "Update password"}
            </Button>
            <p className="text-xs text-muted-foreground">
              At least 10 characters. Last changed{" "}
              <span className="font-mono tabular-nums">{utc(overview.auth.passwordLastChangedAt)}</span>.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              Account &amp; verification
            </CardTitle>
            <CardDescription>
              Identity basics - verified email, password policy, throttling.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2.5">
              <div>
                <p className="font-medium">{overview.auth.email}</p>
                <p className="text-xs text-muted-foreground">
                  {overview.auth.emailVerified
                    ? "Verified - confirmation link used."
                    : "Not verified yet."}
                </p>
              </div>
              <Badge variant={overview.auth.emailVerified ? "secondary" : "destructive"}>
                {overview.auth.emailVerified ? "VERIFIED" : "PENDING"}
              </Badge>
            </div>
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
              <p className="font-medium">Password policy</p>
              <p className="text-xs text-muted-foreground">
                Minimum length{" "}
                <span className="font-mono tabular-nums">{overview.auth.passwordMinLength}</span>{" "}
                characters - changes require re-authentication and are logged.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
              <p className="font-medium">Rate limiting</p>
              <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">
                {overview.rateLimits.map((rule) => (
                  <li key={rule.scope} className="flex items-baseline justify-between gap-3">
                    <span>{rule.scope}</span>
                    <span className="font-mono tabular-nums">
                      {rule.limit} / {rule.windowLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── §7 Sessions ──────────────────────────────────────────────────────────────

function SessionMeta({ session }: { session: SecuritySession }) {
  return (
    <p className="font-mono text-xs tabular-nums text-muted-foreground">
      {session.browser} · {session.os} · IP {session.ipMasked} · {session.location}
    </p>
  );
}

export function SessionsPanel({
  overview,
  onRevoke,
  pending,
}: {
  overview: Overview;
  onRevoke: (input: SessionRevokeInput) => void;
  pending: boolean;
}) {
  const [confirmScope, setConfirmScope] = React.useState<"others" | "all" | null>(null);

  return (
    <Card className="border-border bg-surface">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <MonitorSmartphone className="size-4 text-accent" aria-hidden="true" />
            Active sessions
          </CardTitle>
          <CardDescription>
            Devices currently signed in. Revoking one signs it out immediately.
          </CardDescription>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmScope("others")}
            disabled={pending}
            data-testid="sessions-logout-others"
          >
            Logout other sessions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmScope("all")}
            disabled={pending}
            data-testid="sessions-logout-all"
          >
            Logout all sessions
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {overview.sessions.map((session) => (
          <div
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2.5"
            data-testid={`session-row-${session.id}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Laptop className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {session.device}
                  {session.current && (
                    <Badge variant="secondary" className="ml-2">
                      This device
                    </Badge>
                  )}
                </p>
                <SessionMeta session={session} />
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                  last activity {utc(session.lastActivityAt)} · signed in {utc(session.createdAt)}
                </p>
              </div>
            </div>
            {session.current ? (
              <span className="font-mono text-xs text-muted-foreground">active now</span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRevoke({ sessionId: session.id, scope: "one" })}
                disabled={pending}
                data-testid={`session-revoke-${session.id}`}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
      </CardContent>

      <ConfirmDialog
        open={confirmScope !== null}
        onOpenChange={(open) => !open && setConfirmScope(null)}
        title={confirmScope === "all" ? "Logout all sessions?" : "Logout other sessions?"}
        description={
          confirmScope === "all"
            ? "Every device is signed out - including this one. In production the current session ends immediately; the demo keeps you signed in."
            : "All other devices are signed out immediately. Unsaved work on those devices is lost."
        }
        confirmLabel={confirmScope === "all" ? "Logout all" : "Logout others"}
        destructive
        onConfirm={() => {
          if (confirmScope !== null) onRevoke({ sessionId: null, scope: confirmScope });
          setConfirmScope(null);
        }}
        pending={pending}
        testid="sessions-confirm"
      />
    </Card>
  );
}

// ── §6 Two-Factor - the 2FA card design is preserved ────────────────────────

export function TwoFactorPanel({
  overview,
  onEnable,
  onEnableEmail,
  emailEnrollmentPending,
  emailEnrollCode,
  onEmailEnrollCodeChange,
  onConfirmEmailEnrollment,
  onDisable,
  onRegenerate,
  pending,
}: {
  overview: Overview;
  onEnable: () => void;
  onEnableEmail: () => void;
  emailEnrollmentPending: boolean;
  emailEnrollCode: string;
  onEmailEnrollCodeChange: (value: string) => void;
  onConfirmEmailEnrollment: () => void;
  /** Disable goes through a confirm first - the parent owns both steps. */
  onDisable: () => void;
  onRegenerate: () => void;
  pending: boolean;
}) {
  const twoFactor = overview.twoFactor;

  return (
    <Card className="border-border bg-surface">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            A second factor on top of your password at every sign-in.
          </CardDescription>
        </div>
        <Switch
          checked={twoFactor.enabled}
          onCheckedChange={(checked) => (checked ? onEnable() : onDisable())}
          disabled={pending || twoFactor.pending}
          aria-label="Two-factor authentication"
          data-testid="tfa-switch"
        />
      </CardHeader>
      <CardContent className="grid gap-2 text-xs text-muted-foreground">
        {twoFactor.enabled ? (
          <>
            <p>
              You are asked for a one-time code at each new sign-in. Recovery
              codes were shown once at setup - they are never displayed again.
            </p>
            <div className="grid gap-1.5 rounded-lg border border-border bg-background/60 px-3 py-2.5 font-mono text-xs tabular-nums">
              <span>method · {twoFactor.method === "EMAIL" ? "email code" : "authenticator app"}</span>
              <span>enabled · {utc(twoFactor.enabledAt)}</span>
              <span>last verified · {utc(twoFactor.lastVerifiedAt)}</span>
              <span>
                recovery codes · {twoFactor.recoveryCodesRemaining} of 10 unused
              </span>
            </div>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                disabled={pending}
                className="gap-1.5"
                data-testid="tfa-regenerate"
              >
                <Fingerprint className="size-3.5" aria-hidden="true" />
                Regenerate recovery codes
              </Button>
            </div>
          </>
        ) : emailEnrollmentPending ? (
          <div className="grid max-w-sm gap-2 rounded-lg border border-border bg-background/60 p-3">
            <p className="text-sm text-foreground">Enter the 6-digit code sent to your verified email. The code expires shortly.</p>
            <Label htmlFor="email-mfa-enrollment-code">Email verification code</Label>
            <Input
              id="email-mfa-enrollment-code"
              value={emailEnrollCode}
              onChange={(event) => onEmailEnrollCodeChange(event.target.value.replace(/\\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              data-testid="email-mfa-enrollment-code"
            />
            <Button onClick={onConfirmEmailEnrollment} disabled={pending || emailEnrollCode.length !== 6} data-testid="email-mfa-enrollment-confirm">
              Confirm email and enable 2FA
            </Button>
          </div>
        ) : twoFactor.pending ? (
          <p>Setup in progress - confirm the authenticator challenge to activate 2FA.</p>
        ) : (
          <>
            <p>
              Choose an authenticator app (TOTP) or a one-time code sent to your verified email.
              Setup issues 10 recovery codes, shown once, then stored only as a count.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onEnableEmail}
              disabled={pending}
              className="mt-1 w-fit"
              data-testid="tfa-enable-email"
            >
              Use email verification codes
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── §8 API keys ──────────────────────────────────────────────────────────────

export function ApiKeysPanel({
  overview,
  onCreate,
  onRevoke,
  pending,
}: {
  overview: Overview;
  onCreate: (input: { name: string; scopes: ApiKeyView["scopes"]; expiresInDays: number | null }) => void;
  onRevoke: (key: ApiKeyView) => void;
  pending: boolean;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<ApiKeyView["scopes"]>(["read:trades"]);
  const [expiresInDays, setExpiresInDays] = React.useState<number | null>(90);
  const [revokeTarget, setRevokeTarget] = React.useState<ApiKeyView | null>(null);

  // Snapshot once per mount - expiry display only, recomputed on next visit.
  const [nowMs] = React.useState(() => Date.now());

  const submitCreate = () => {
    if (name.trim().length === 0 || scopes.length === 0) return;
    onCreate({ name, scopes, expiresInDays });
    setCreateOpen(false);
    setName("");
    setScopes(["read:trades"]);
    setExpiresInDays(90);
  };

  const toggleScope = (scope: ApiKeyView["scopes"][number]) => {
    setScopes((previous) =>
      previous.includes(scope)
        ? previous.filter((entry) => entry !== scope)
        : [...previous, scope],
    );
  };

  return (
    <Card className="border-border bg-surface">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <KeyRound className="size-4 text-accent" aria-hidden="true" />
            API keys
          </CardTitle>
          <CardDescription>
            Scoped programmatic access. The secret is displayed once at
            creation, then only a prefix and a fingerprint remain.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={pending}
          data-testid="api-key-create"
        >
          Create API key
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2">
        {overview.apiKeys.map((key) => {
          const expired = key.expiresAt !== null && new Date(key.expiresAt).getTime() < nowMs;
          return (
            <div
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2.5"
              data-testid={`api-key-row-${key.id}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {key.name}
                  <Badge
                    variant={key.revoked ? "outline" : expired ? "destructive" : "secondary"}
                    className="ml-2"
                  >
                    {key.revoked ? "REVOKED" : expired ? "EXPIRED" : "ACTIVE"}
                  </Badge>
                </p>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {key.prefix} · fingerprint {key.fingerprint}
                </p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {key.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {API_SCOPE_META[scope].label}
                    </span>
                  ))}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  created {utc(key.createdAt)} · last used {utc(key.lastUsedAt)} · expires{" "}
                  {key.expiresAt === null ? "never" : utc(key.expiresAt)}
                </p>
              </div>
              {!key.revoked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRevokeTarget(key)}
                  disabled={pending}
                  data-testid={`api-key-revoke-${key.id}`}
                >
                  Revoke
                </Button>
              )}
            </div>
          );
        })}
        {overview.apiKeys.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No API keys yet - create a scoped key instead of sharing your password.
          </p>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md" data-testid="api-key-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Create an API key</DialogTitle>
            <DialogDescription>
              Give it a name, grant only the scopes it needs and set an
              expiration. Creating requires re-authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Export script, TradingView bridge…"
                data-testid="api-key-name"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Scopes</Label>
              <div className="grid gap-1.5">
                {(Object.keys(API_SCOPE_META) as ApiKeyView["scopes"]).map((scope) => (
                  <label
                    key={scope}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      data-testid={`api-key-scope-${scope.replace(":", "-")}`}
                    />
                    <span>
                      <span className="font-mono text-xs">{API_SCOPE_META[scope].label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {API_SCOPE_META[scope].detail}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="api-key-expiry">Expiration</Label>
              <select
                id="api-key-expiry"
                value={expiresInDays === null ? "never" : String(expiresInDays)}
                onChange={(event) =>
                  setExpiresInDays(
                    event.target.value === "never" ? null : Number(event.target.value),
                  )
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                data-testid="api-key-expiry"
              >
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days - recommended</option>
                <option value="never">Never expires (weakens the protection score)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitCreate}
              disabled={name.trim().length === 0 || scopes.length === 0}
              data-testid="api-key-dialog-create"
            >
              Continue - confirm identity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={`Revoke “${revokeTarget?.name ?? ""}”?`}
        description="Clients using this key lose access immediately. The row stays visible for the audit trail. Revocation requires re-authentication."
        confirmLabel="Revoke key"
        destructive
        onConfirm={() => {
          if (revokeTarget !== null) onRevoke(revokeTarget);
          setRevokeTarget(null);
        }}
        pending={pending}
        testid="api-key-revoke-confirm"
      />
    </Card>
  );
}

// ── §9 Connected accounts ────────────────────────────────────────────────────

export function ConnectedAccountsPanel({ overview }: { overview: Overview }) {
  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Link2 className="size-4 text-accent" aria-hidden="true" />
          Connected accounts
        </CardTitle>
        <CardDescription>
          Security&apos;s view over Integrations - derived live from the hub.
          Passwords, private keys and secret tokens are never shown here: only
          masked hints from the vault.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {overview.connectedAccounts.map((account) => (
          <ConnectedAccountRow key={account.providerId} account={account} />
        ))}
      </CardContent>
    </Card>
  );
}

function ConnectedAccountRow({ account }: { account: ConnectedAccount }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2.5"
      data-testid={`connected-${account.providerId}`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          {account.providerName}
          <KindChip kind={account.kind} />
        </p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {account.identifier} · credential {account.credentialHint}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5">
          {account.permissions.map((permission) => (
            <span
              key={permission}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {PERMISSION_LABELS[permission] ?? permission}
            </span>
          ))}
        </p>
      </div>
      <div className="text-right">
        <StatusBadge status={account.status} />
        <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          last sync {account.lastSyncAt === null ? "never" : utc(account.lastSyncAt)}
        </p>
      </div>
    </div>
  );
}

// ── §10 Security events (append-only) ────────────────────────────────────────

function EventRow({ event, compact, detailed = false }: { event: SecurityEvent; compact?: boolean; detailed?: boolean }) {
  if (detailed) {
    // Readable WHO / WHAT / WHEN layout for the audit-history panel.
    return (
      <div
        className="grid gap-1 rounded-lg border border-border bg-background/60 px-3 py-2 sm:grid-cols-[86px_1fr_auto] sm:items-start"
        data-testid={`event-${event.type}`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Who</span>
        <span className="text-sm font-medium">{event.actor}</span>
        <span aria-hidden="true" className="hidden sm:block" />

        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What</span>
        <span className="min-w-0">
          <EventBadge type={event.type} />
          <span className="ml-2 text-xs text-muted-foreground">{event.context}</span>
        </span>
        <span aria-hidden="true" className="hidden sm:block" />

        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">When</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {event.at.slice(0, 10)} · {event.at.slice(11, 19)} UTC
        </span>
        <span className="justify-self-end sm:justify-self-auto">
          <EventOutcomeIcon outcome={event.outcome} />
        </span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2",
        compact && "py-1.5",
      )}
      data-testid={`event-${event.type}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-1">
          <EventOutcomeIcon outcome={event.outcome} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <EventBadge type={event.type} />
            <span className="text-xs text-muted-foreground">{event.actor}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{event.context}</p>
        </div>
      </div>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {event.at.slice(11, 19)} UTC
      </span>
    </div>
  );
}

export function EventsPanel({ overview }: { overview: Overview }) {
  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <ScrollText className="size-4 text-accent" aria-hidden="true" />
          Sensitive changes history
        </CardTitle>
        <CardDescription>
          Append-only audit trail of every sensitive change, readable as WHO (actor) · WHAT
          (type + context) · WHEN (full UTC timestamp). Events cannot be edited or deleted from
          the app. Retention:{" "}
          <span className="font-mono tabular-nums">
            {overview.retention.securityEventsDays} days
          </span>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-h-[32rem] gap-1.5 overflow-y-auto">
        {overview.events.map((event) => (
          <EventRow key={event.id} event={event} detailed />
        ))}
      </CardContent>
    </Card>
  );
}

// ── §11 Login history ────────────────────────────────────────────────────────

function LoginRow({ login, compact }: { login: LoginRecord; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2",
        compact && "py-1.5",
      )}
      data-testid={`login-${login.success ? "ok" : "fail"}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-1">
          <EventOutcomeIcon outcome={login.success ? "SUCCESS" : "FAILURE"} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {login.success ? "Sign-in" : "Failed sign-in"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {login.device} · {login.browser} · {login.os}
            </span>
          </p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            IP {login.ipMasked} · {login.location}
          </p>
          {login.reason !== null && (
            <p className="mt-0.5 text-xs text-destructive/90">{login.reason}</p>
          )}
        </div>
      </div>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {login.at.slice(0, 10)} {login.at.slice(11, 19)} UTC
      </span>
    </div>
  );
}

export function LoginHistoryPanel({ overview }: { overview: Overview }) {
  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Copy className="size-4 text-accent" aria-hidden="true" />
          Login history
        </CardTitle>
        <CardDescription>
          Sign-in attempts on the account. IP addresses are partially masked -
          full addresses never reach the client. Retention:{" "}
          <span className="font-mono tabular-nums">
            {overview.retention.loginHistoryDays} days
          </span>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-h-[32rem] gap-1.5 overflow-y-auto">
        {overview.logins.map((login) => (
          <LoginRow key={login.id} login={login} />
        ))}
      </CardContent>
    </Card>
  );
}

// ── §12 Active devices ───────────────────────────────────────────────────────

export function DevicesPanel({
  overview,
  onRevoke,
  pending,
}: {
  overview: Overview;
  onRevoke: (input: SessionRevokeInput) => void;
  pending: boolean;
}) {
  const current = overview.sessions.find((session) => session.current);
  const others = overview.sessions.filter((session) => !session.current);

  return (
    <div className="grid gap-4">
      <Card className="border-accent/40 border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <MonitorSmartphone className="size-4 text-accent" aria-hidden="true" />
            Current device
          </CardTitle>
          <CardDescription>
            The session you are using right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {current !== undefined ? (
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
              <p className="text-sm font-medium">
                {current.device}
                <Badge variant="secondary" className="ml-2">
                  This device
                </Badge>
              </p>
              <SessionMeta session={current} />
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                signed in {utc(current.createdAt)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The current session was revoked - in production it would end now.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <Smartphone className="size-4 text-accent" aria-hidden="true" />
            Previously active devices
          </CardTitle>
          <CardDescription>
            Other devices holding a valid session - revoke to sign them out.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {others.map((session) => (
            <div
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Laptop className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{session.device}</p>
                  <SessionMeta session={session} />
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    last activity {utc(session.lastActivityAt)}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRevoke({ sessionId: session.id, scope: "one" })}
                disabled={pending}
              >
                Revoke session
              </Button>
            </div>
          ))}
          {others.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No other active devices - only this session is signed in.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

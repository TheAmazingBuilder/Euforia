"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  KeyRound,
  Laptop,
  LockKeyhole,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * /security — the account-security surface: password, 2FA, active sessions
 * and the credentials vault that stores broker keys for Integrations.
 * Boundary rule: identity and secrets live HERE; user preferences stay in
 * Settings and system health stays in Monitoring.
 */

type VaultEntry = {
  provider: string;
  scope: string;
  masked: string;
};

const VAULT_SEED: VaultEntry[] = [
  {
    provider: "Deriv",
    scope: "read · market data",
    masked: "••••••••••••4f2a",
  },
  {
    provider: "MT5 — Local Bridge",
    scope: "read · bridge pairing",
    masked: "— none stored —",
  },
];

type SessionRow = {
  id: string;
  device: string;
  meta: string;
  current: boolean;
};

const SESSIONS_SEED: SessionRow[] = [
  {
    id: "s-current",
    device: "This device",
    meta: "Active now · this browser",
    current: true,
  },
  {
    id: "s-1",
    device: "MacBook Pro — Safari",
    meta: "Last seen yesterday, 21:04",
    current: false,
  },
  {
    id: "s-2",
    device: "iPhone 14 — Cosmoz PWA",
    meta: "Last seen 3 days ago, 08:41",
    current: false,
  },
];

export function SecurityView() {
  const [twoFactor, setTwoFactor] = React.useState(false);
  const [sessions, setSessions] = React.useState(SESSIONS_SEED);
  const [vault] = React.useState(VAULT_SEED);
  const [password, setPassword] = React.useState({
    current: "",
    next: "",
    confirm: "",
  });

  const onSavePassword = () => {
    if (!password.current || !password.next || !password.confirm) {
      toast.error("Fill every field before saving");
      return;
    }
    if (password.next !== password.confirm) {
      toast.error("New password and confirmation do not match");
      return;
    }
    if (password.next.length < 10) {
      toast.error("Use at least 10 characters for the new password");
      return;
    }
    setPassword({ current: "", next: "", confirm: "" });
    toast.success("Password updated — other sessions stay signed in");
  };

  const onRevoke = (row: SessionRow) => {
    setSessions((previous) => previous.filter((item) => item.id !== row.id));
    toast.success(`Session revoked — ${row.device}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Security
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your sessions, your password and the vault that keeps broker keys
          out of reach — even from backups and exports.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <LockKeyhole className="size-4 text-accent" aria-hidden="true" />
              Password
            </CardTitle>
            <CardDescription>
              Change it any time — journal data stays untouched.
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
            <Button onClick={onSavePassword} className="justify-self-start">
              Update password
            </Button>
          </CardContent>
        </Card>

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
              checked={twoFactor}
              onCheckedChange={(checked) => {
                setTwoFactor(checked);
                toast.success(
                  checked
                    ? "Two-factor enabled for this account"
                    : "Two-factor disabled",
                );
              }}
              aria-label="Two-factor authentication"
            />
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {twoFactor
              ? "You will be asked for a rotating code at each new sign-in. Recovery codes live in the vault below."
              : "Recommended — an authenticator app is all it takes."}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <MonitorSmartphone className="size-4 text-accent" aria-hidden="true" />
            Active sessions
          </CardTitle>
          <CardDescription>
            Devices currently signed in. Revoking one signs it out immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {sessions.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <Laptop className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">
                    {row.device}
                    {row.current && (
                      <Badge variant="secondary" className="ml-2">
                        This device
                      </Badge>
                    )}
                  </p>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    {row.meta}
                  </p>
                </div>
              </div>
              {row.current ? (
                <span className="font-mono text-xs text-muted-foreground">
                  active
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRevoke(row)}
                  className="gap-1.5"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <KeyRound className="size-4 text-accent" aria-hidden="true" />
            Credentials vault
          </CardTitle>
          <CardDescription>
            Broker keys used by Integrations — masked at rest, never included
            in backups or JSON exports.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {vault.map((entry) => (
            <div
              key={entry.provider}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">{entry.provider}</p>
                <p className="text-xs text-muted-foreground">{entry.scope}</p>
              </div>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {entry.masked}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

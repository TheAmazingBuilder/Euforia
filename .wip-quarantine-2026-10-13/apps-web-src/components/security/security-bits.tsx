"use client";

import * as React from "react";
import {
  AlertTriangle,
  Download,
  Fingerprint,
  Globe,
  KeyRound,
  LogIn,
  LogOut,
  PlugZap,
  ScrollText,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Unplug,
  Unlock,
  UserCog,
} from "lucide-react";
import type { SecurityEventKind } from "@cosmoz/shared";

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
import { useReauth } from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Shared pieces of the Security Center: audit-event metadata, one-time
 * secret display and the re-authentication gate for sensitive actions (§13).
 * The reauth dialog exchanges the password for a short-lived token — the
 * password itself is never stored, logged or echoed anywhere.
 */

// ── Audit event metadata ─────────────────────────────────────────────────────

export const KIND_META: Record<
  SecurityEventKind,
  { label: string; Icon: React.ComponentType<{ className?: string }>; tintClass: string; ringClass: string }
> = {
  login: { label: "Sign-in", Icon: LogIn, tintClass: "text-profit", ringClass: "bg-profit/12" },
  logout: { label: "Sign-out", Icon: LogOut, tintClass: "text-muted-foreground", ringClass: "bg-muted" },
  login_failed: { label: "Failed sign-in", Icon: AlertTriangle, tintClass: "text-loss", ringClass: "bg-loss/12" },
  password_changed: { label: "Password changed", Icon: UserCog, tintClass: "text-accent", ringClass: "bg-accent/12" },
  password_reset_requested: { label: "Password reset", Icon: Unlock, tintClass: "text-warning", ringClass: "bg-warning/12" },
  two_factor_enabled: { label: "2FA enabled", Icon: ShieldCheck, tintClass: "text-profit", ringClass: "bg-profit/12" },
  two_factor_disabled: { label: "2FA disabled", Icon: ShieldOff, tintClass: "text-warning", ringClass: "bg-warning/12" },
  recovery_codes_generated: { label: "Recovery codes", Icon: Fingerprint, tintClass: "text-accent", ringClass: "bg-accent/12" },
  api_key_created: { label: "API key created", Icon: KeyRound, tintClass: "text-accent", ringClass: "bg-accent/12" },
  api_key_revoked: { label: "API key revoked", Icon: Trash2, tintClass: "text-loss", ringClass: "bg-loss/12" },
  integration_connected: { label: "Integration connected", Icon: PlugZap, tintClass: "text-chart-2", ringClass: "bg-chart-2/12" },
  integration_disconnected: { label: "Integration disconnected", Icon: Unplug, tintClass: "text-muted-foreground", ringClass: "bg-muted" },
  session_revoked: { label: "Session revoked", Icon: Globe, tintClass: "text-warning", ringClass: "bg-warning/12" },
  sensitive_settings_changed: { label: "Sensitive settings", Icon: ScrollText, tintClass: "text-warning", ringClass: "bg-warning/12" },
  data_exported: { label: "Data exported", Icon: Download, tintClass: "text-muted-foreground", ringClass: "bg-muted" },
};

export function relativeTime(iso: string, nowMs: number): string {
  const delta = nowMs - Date.parse(iso);
  if (!Number.isFinite(delta)) return iso;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));
}

export const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// ── One-time secret screen (recovery codes, plaintext API key) ───────────────

/** Copy helper with a built-in fallback for restricted clipboards. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function downloadTextFile(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ── Re-authentication gate (§13) ─────────────────────────────────────────────

export function ReauthDialog({
  open,
  onOpenChange,
  title,
  description,
  onAuthenticated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onAuthenticated: (token: string) => void;
}) {
  const reauth = useReauth();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Fresh dialog content on every open — no stale input or error state.
  const key = open ? "reauth-open" : "reauth-closed";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length === 0 || reauth.isPending) return;
    reauth.mutate(
      { password },
      {
        onSuccess: (result) => {
          setPassword("");
          setError(null);
          onOpenChange(false);
          onAuthenticated(result.token);
        },
        onError: (cause) => setError(apiErrorMessage(cause, "Re-authentication failed — try again.")),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" key={key}>
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="reauth-password" className="text-sm font-medium text-foreground">
              Confirm your password
            </label>
            <Input
              id="reauth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              data-testid="reauth-password"
            />
            {error ? (
              <p className="text-xs text-loss" role="alert" data-testid="reauth-error">
                {error}
              </p>
            ) : null}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            Sensitive action — the token lives 5 minutes, the password is never stored or logged. Demo
            build: use the demo password.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={password.length === 0 || reauth.isPending} data-testid="reauth-submit">
              {reauth.isPending ? "Verifying…" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Small shared atoms ───────────────────────────────────────────────────────

export function SecretCode({ value, className }: { value: string; className?: string }) {
  return (
    <code
      className={cn(
        "rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs text-foreground",
        className,
      )}
    >
      {value}
    </code>
  );
}

export function DemoNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-background/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

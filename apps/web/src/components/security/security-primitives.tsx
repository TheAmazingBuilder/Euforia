"use client";

import * as React from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import type { SecurityEventType } from "@cosmoz/shared";

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
import { apiErrorMessage } from "@/lib/api/client";
import { useReauth } from "@/lib/api/queries";

/**
 * Shared primitives for the Security center: the re-authentication gate for
 * sensitive actions (§13), the one-time secret/code reveal (§8, §6, §16) and
 * the event-type presentation registry (§10).
 */

export const utc = (iso: string | null): string =>
  iso === null ? "never" : `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;

export const EVENT_TYPE_META: Record<SecurityEventType, { label: string }> = {
  LOGIN_SUCCESS: { label: "Sign-in" },
  LOGIN_FAILED: { label: "Failed sign-in" },
  LOGOUT: { label: "Sign-out" },
  PASSWORD_CHANGED: { label: "Password changed" },
  PASSWORD_RESET_REQUESTED: { label: "Password reset" },
  EMAIL_VERIFIED: { label: "Email verified" },
  TFA_ENABLED: { label: "2FA enabled" },
  TFA_DISABLED: { label: "2FA disabled" },
  TFA_CHALLENGE_FAILED: { label: "2FA challenge failed" },
  RECOVERY_CODES_REGENERATED: { label: "Recovery codes" },
  API_KEY_CREATED: { label: "API key created" },
  API_KEY_REVOKED: { label: "API key revoked" },
  INTEGRATION_CONNECTED: { label: "Integration connected" },
  INTEGRATION_DISCONNECTED: { label: "Integration disconnected" },
  SESSION_REVOKED: { label: "Session revoked" },
  SENSITIVE_SETTINGS_CHANGED: { label: "Sensitive setting" },
  REAUTH_OK: { label: "Re-auth OK" },
  REAUTH_FAILED: { label: "Re-auth failed" },
  ACCOUNT_DELETION_REQUESTED: { label: "Deletion request" },
  // Trading-connectivity lifecycle facts emitted by the Accounts context
  // through the same append-only log (backend Phase 3; catalog reconciled
  // in Phase 16) - rendered like any other event in the audit trail.
  TRADING_ACCOUNT_CONNECTED: { label: "Trading account connected" },
  TRADING_ACCOUNT_CONNECTION_FAILED: { label: "Connection failed" },
  TRADING_ACCOUNT_DISCONNECTED: { label: "Trading account disconnected" },
  TRADING_ACCOUNT_SYNC_FAILED: { label: "Sync failed" },
  OCR_UPLOAD: { label: "Screenshot uploaded" },
  OCR_PROCESSING_FAILED: { label: "Screenshot processing failed" },
  OCR_RESULT_CONFIRMED: { label: "Recognition confirmed" },
  OCR_RESULT_DELETED: { label: "Recognition deleted" },
  // Phase 21 - the confirmation→journal bridge audit facts.
  OCR_TRADE_IMPORTED: { label: "Trade imported from screenshot" },
  OCR_TRADE_IMPORT_SKIPPED: { label: "Screenshot import skipped" },
  OCR_REPROCESSED: { label: "Screenshot reprocessed" },
  OCR_COLLECTION_CREATED: { label: "Screenshot collection created" },
  OCR_COLLECTION_DELETED: { label: "Screenshot collection deleted" },
};

// ── Re-authentication gate (§13) ─────────────────────────────────────────────

/**
 * Password confirmation before a sensitive action. On success the parent
 * receives a short-lived single-use token. Failures stay inline: wrong
 * password (401) and the temporary lockout (429, Retry-After) are both
 * surfaced without ever echoing the typed password.
 */
export function ReAuthDialog({
  open,
  onOpenChange,
  actionLabel,
  onAuthenticated,
  testid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the token will authorize - shown in the dialog copy. */
  actionLabel: string;
  onAuthenticated: (token: string) => void;
  testid: string;
}) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const reauth = useReauth();

  const reset = () => {
    setPassword("");
    setError(null);
  };

  const submit = () => {
    if (password.length === 0) {
      setError("Type your password to confirm this action.");
      return;
    }
    reauth.mutate(
      { password },
      {
        onSuccess: (result) => {
          reset();
          onOpenChange(false);
          onAuthenticated(result.token);
        },
        onError: (mutationError) => {
          setError(apiErrorMessage(mutationError, "Re-authentication failed."));
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid={testid}>
        <DialogHeader>
          <DialogTitle className="font-heading">Confirm it&apos;s you</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{actionLabel}</span>{" "}
            is a sensitive action - re-enter your account password to
            authorize it. The confirmation is valid for one action and a few
            minutes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`${testid}-password`}>Account password</Label>
          <Input
            id={`${testid}-password`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            data-testid={`${testid}-password`}
          />
          {error !== null && (
            <p
              className="text-xs font-medium text-destructive"
              data-testid={`${testid}-error`}
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={reauth.isPending}
            data-testid={`${testid}-submit`}
          >
            {reauth.isPending ? "Verifying…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── One-time reveal (§8, §6 - never shown again) ─────────────────────────────

/**
 * The ONLY surface where a secret or recovery codes are ever rendered. Once
 * closed, the data is gone - the list views only ever show prefix +
 * fingerprint (§16).
 */
export function SecretOnceDialog({
  open,
  onOpenChange,
  title,
  description,
  secret,
  recoveryCodes,
  testid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Plaintext secret for API keys (mutually exclusive with recoveryCodes). */
  secret?: string;
  /** Recovery codes for 2FA (mutually exclusive with secret). */
  recoveryCodes?: string[];
  testid: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const payload = secret ?? recoveryCodes?.join("\n") ?? "";
  const canClose = secret !== undefined ? true : saved;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid={testid}>
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex items-start gap-2 rounded-md border border-border bg-background/60 px-3 py-2.5">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="text-xs text-muted-foreground">
              For security, {secret !== undefined ? "this secret is" : "these codes are"}{" "}
              displayed <span className="font-medium text-foreground">only once</span>.
              Euforia stores just a masked prefix and a fingerprint - nobody can
              retrieve it later, not even support.
            </p>
          </div>

          {secret !== undefined ? (
            <div
              className="rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm break-all"
              data-testid={`${testid}-secret`}
            >
              {secret}
            </div>
          ) : (
            <div
              className="grid grid-cols-2 gap-1.5"
              data-testid={`${testid}-codes`}
            >
              {recoveryCodes?.map((code) => (
                <span
                  key={code}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-center font-mono text-sm tabular-nums"
                >
                  {code}
                </span>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={copy}
            className="justify-self-start gap-1.5"
            data-testid={`${testid}-copy`}
          >
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : null}
            {copied ? "Copied" : "Copy"}
          </Button>

          {recoveryCodes !== undefined && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
                data-testid={`${testid}-saved`}
              />
              I stored my recovery codes somewhere safe
            </label>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              setSaved(false);
              onOpenChange(false);
            }}
            disabled={!canClose}
            data-testid={`${testid}-done`}
          >
            {secret !== undefined ? "Done - I saved it" : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Small shared atoms ───────────────────────────────────────────────────────

export function EventOutcomeIcon({ outcome }: { outcome: "SUCCESS" | "FAILURE" }) {
  return outcome === "SUCCESS" ? (
    <Check className="size-3.5 text-accent" aria-hidden="true" />
  ) : (
    <X className="size-3.5 text-destructive" aria-hidden="true" />
  );
}

export function EventBadge({ type }: { type: SecurityEventType }) {
  // Keep the audit trail renderable if an older API, persisted event, or
  // partially migrated dataset contains a missing or not-yet-catalogued type.
  const eventType =
    typeof type === "string" && type.trim().length > 0
      ? type.trim()
      : "UNKNOWN_EVENT";
  const meta = EVENT_TYPE_META[eventType as SecurityEventType];
  const label =
    meta?.label ??
    eventType
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());

  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      {label}
    </Badge>
  );
}

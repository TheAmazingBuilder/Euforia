"use client";

import * as React from "react";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { authErrorMessage, useAuth } from "@/components/providers/auth-provider";

/**
 * Change-password card (profile page) — POST /auth/password/change with
 * the current session token. Inline confirmation replaces the old disabled
 * stub row.
 */
export function PasswordChangeCard() {
  const { changePassword } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      toast.error("Passwords do not match", {
        description: "The confirmation field must match the new password.",
      });
      return;
    }
    setPending(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setDone(true);
      setOpen(false);
      reset();
      toast.success("Password changed", {
        description: "Use the new password at your next sign-in.",
      });
    } catch (error) {
      toast.error("Could not change the password", {
        description: authErrorMessage(error, "Check the current password and try again."),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface-raised/60 px-3.5 py-3" data-testid="password-change-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <KeyRound className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">Password</p>
            <p className="text-xs text-muted-foreground">
              {done ? "Changed just now" : "At least 8 characters — protect your journal."}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen((previous) => !previous);
            setDone(false);
          }}
          aria-expanded={open}
          data-testid="password-change-toggle"
        >
          {open ? "Cancel" : "Change"}
        </Button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="password-current" className="text-xs text-muted-foreground">
              Current password
            </Label>
            <PasswordInput
              id="password-current"
              autoComplete="current-password"
              value={current}
              onChange={(value) => setCurrent(value)}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="password-new" className="text-xs text-muted-foreground">
                New password
              </Label>
              <PasswordInput
                id="password-new"
                autoComplete="new-password"
                value={next}
                onChange={(value) => setNext(value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-confirm" className="text-xs text-muted-foreground">
                Confirm new password
              </Label>
              <PasswordInput
                id="password-confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(value) => setConfirm(value)}
                required
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-4" aria-hidden="true" />
              )}
              {pending ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

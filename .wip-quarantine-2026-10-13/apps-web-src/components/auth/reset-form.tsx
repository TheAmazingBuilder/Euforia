"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";

/**
 * Reset password — step 2: new password + mandatory confirmation.
 * Mock: any valid pair resets; the user is sent back to sign in.
 */
export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [touchedConfirm, setTouchedConfirm] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const showMismatch = touchedConfirm && mismatch;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (mismatch) {
      setError("Passwords do not match — check the confirmation.");
      return;
    }
    toast.success("Password updated", {
      description: "Sign in with your new password.",
    });
    router.push("/login");
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <PasswordField
        id="reset-password"
        label="New password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        showStrength
        testId="reset-password"
      />

      <PasswordField
        id="reset-confirm"
        label="Confirm new password"
        value={confirm}
        onChange={(value) => {
          setConfirm(value);
          setTouchedConfirm(true);
        }}
        autoComplete="new-password"
        invalid={showMismatch}
        testId="reset-confirm"
      />
      {showMismatch ? (
        <p className="-mt-1 text-xs font-medium text-loss" role="alert" data-testid="reset-mismatch">
          Passwords do not match.
        </p>
      ) : confirm.length > 0 && !mismatch ? (
        <p className="-mt-1 text-xs font-medium text-profit" data-testid="reset-match-ok">
          Passwords match.
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs font-medium text-loss"
          role="alert"
          data-testid="reset-error"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
        data-testid="reset-submit"
      >
        Update password
      </Button>

      <Link
        href="/login"
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        &larr; Back to sign in
      </Link>
    </form>
  );
}

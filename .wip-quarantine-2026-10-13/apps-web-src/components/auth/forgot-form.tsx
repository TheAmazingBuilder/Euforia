"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Forgot password — step 1: request the reset code. The mock skips the inbox
 * and reveals the demo code on the confirmation state.
 */
export function ForgotForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="grid gap-4" data-testid="forgot-sent">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-profit" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Reset code sent</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
              It expires in 10 minutes. Demo build: the code is{" "}
              <span className="font-mono font-semibold text-foreground">246810</span>.
            </p>
          </div>
        </div>
        <Button
          className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
          onClick={() => router.push("/reset-password")}
          data-testid="forgot-continue"
        >
          Continue to reset
        </Button>
        <Link
          href="/login"
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          &larr; Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="forgot-email"
        />
      </div>

      {error ? (
        <p
          className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs font-medium text-loss"
          role="alert"
          data-testid="forgot-error"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
        data-testid="forgot-submit"
      >
        Send reset code
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

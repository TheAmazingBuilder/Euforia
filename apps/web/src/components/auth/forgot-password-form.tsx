"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailQuestion } from "lucide-react";

import type { ForgotPasswordResponse } from "@cosmoz/shared";
import { forgotPasswordInputSchema } from "@cosmoz/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForgotPasswordMutation } from "@/lib/api/queries/auth";
import { apiErrorMessage, apiErrorCode } from "@/lib/api/client";
import { authCopy } from "@/components/auth/auth-copy";
import {
  AuthField,
  FormError,
  FormSuccess,
  SubmitButton,
} from "@/components/auth/auth-primitives";

/**
 * Forgot password (spec §18) — the success state is deliberately GENERIC
 * ("if an account exists…"): the UI never confirms whether an address is
 * registered. In the mocked environment the one-time reset link is surfaced
 * with an explicit MOCKED panel (demoCode precedent).
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const forgot = useForgotPasswordMutation();

  const [email, setEmail] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<ForgotPasswordResponse | null>(null);

  const mocked = process.env.NEXT_PUBLIC_API_MOCKED === "true";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = forgotPasswordInputSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setFieldError(null);

    forgot.mutate(parsed.data, {
      onSuccess: (data) => setSent(data),
      onError: (error) => {
        if (apiErrorCode(error) === "RATE_LIMITED") {
          setFormError(apiErrorMessage(error, authCopy.errors.rateLimited));
          return;
        }
        if (error instanceof Error && error.message.startsWith("Network error")) {
          setFormError(authCopy.errors.network);
          return;
        }
        setFormError(apiErrorMessage(error, authCopy.errors.server));
      },
    });
  }

  if (sent) {
    const resetHref = sent.resetToken
      ? `/reset-password?token=${encodeURIComponent(sent.resetToken)}`
      : null;
    return (
      <div className="flex flex-col gap-6" data-testid="forgot-sent">
        <header className="flex flex-col gap-2">
          <span className="grid size-11 place-items-center rounded-xl border border-border bg-surface">
            <MailQuestion className="size-5 text-accent" aria-hidden="true" />
          </span>
          <h1 className="font-heading text-xl font-semibold">
            {authCopy.forgot.sentTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{authCopy.forgot.sentBody}</p>
        </header>

        <FormSuccess body={authCopy.forgot.sentBody} testId="forgot-sent-banner" />

        {mocked && resetHref ? (
          <div className="flex flex-col gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {authCopy.forgot.sentMockTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {authCopy.forgot.sentMockBody}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push(resetHref)}
              data-testid="forgot-open-reset"
            >
              {authCopy.forgot.sentMockOpen}
            </Button>
          </div>
        ) : null}

        <footer className="text-sm">
          <Link
            href="/login"
            data-testid="forgot-to-login"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            &larr; {authCopy.forgot.backToLogin}
          </Link>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="forgot-form">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-xl font-semibold">
          {authCopy.forgot.title}
        </h1>
        <p className="text-sm text-muted-foreground">{authCopy.forgot.subtitle}</p>
      </header>

      {formError ? <FormError body={formError} testId="forgot-error" /> : null}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <AuthField
          id="forgot-email"
          label={authCopy.forgot.email}
          error={fieldError}
        >
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={forgot.isPending}
            autoFocus
          />
        </AuthField>

        <SubmitButton
          pending={forgot.isPending}
          label={authCopy.forgot.submit}
          pendingLabel={authCopy.forgot.submitting}
          testId="forgot-submit"
        />
      </form>

      <footer className="text-sm">
        <Link
          href="/login"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          &larr; {authCopy.forgot.backToLogin}
        </Link>
      </footer>
    </div>
  );
}

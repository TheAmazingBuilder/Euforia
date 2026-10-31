"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, CircleX, Clock3, CopyCheck } from "lucide-react";

import { resetPasswordInputSchema } from "@cosmoz/shared";
import { useResetPasswordMutation } from "@/lib/api/queries/auth";
import { apiErrorMessage, apiErrorCode } from "@/lib/api/client";
import { useDict } from "@/i18n/i18n-provider";
import {
  AuthField,
  FormError,
  PasswordField,
  PasswordStrength,
  SubmitButton,
} from "@/components/auth/auth-primitives";

/**
 * Password reset (spec §19) - token states (valid / expired / invalid /
 * already used) each get a deliberate screen; success explains the session
 * policy set by the backend response (reset signs existing sessions out).
 */
type Outcome =
  | { kind: "form" }
  | { kind: "success" }
  | { kind: "expired" }
  | { kind: "used" }
  | { kind: "invalid" };

export function ResetPasswordForm() {
  const auth = useDict().auth;
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const reset = useResetPasswordMutation();

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome>(
    token ? { kind: "form" } : { kind: "invalid" },
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setFormError(null);

    const parsed = resetPasswordInputSchema.safeParse({ token, password });
    const errors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    if (confirm !== password) errors.confirm = auth.register.mismatch;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !parsed.success) return;

    reset.mutate(parsed.data, {
      onSuccess: () => setOutcome({ kind: "success" }),
      onError: (error) => {
        const code = apiErrorCode(error);
        if (code === "EXPIRED_TOKEN") setOutcome({ kind: "expired" });
        else if (code === "TOKEN_ALREADY_USED") setOutcome({ kind: "used" });
        else if (code === "INVALID_TOKEN") setOutcome({ kind: "invalid" });
        else setFormError(apiErrorMessage(error, auth.errors.server));
      },
    });
  }

  const header: Partial<Record<Outcome["kind"], { icon: React.ReactNode; title: string; body: string; testId: string }>> = {
    success: {
      icon: <BadgeCheck className="size-5 text-emerald-500" aria-hidden="true" />,
      title: auth.reset.successTitle,
      body: auth.reset.successBody,
      testId: "reset-state-success",
    },
    expired: {
      icon: <Clock3 className="size-5 text-amber-500" aria-hidden="true" />,
      title: auth.reset.expiredTitle,
      body: auth.reset.expiredBody,
      testId: "reset-state-expired",
    },
    used: {
      icon: <CopyCheck className="size-5 text-accent" aria-hidden="true" />,
      title: auth.reset.usedTitle,
      body: auth.reset.usedBody,
      testId: "reset-state-used",
    },
    invalid: {
      icon: <CircleX className="size-5 text-destructive" aria-hidden="true" />,
      title: auth.reset.invalidTitle,
      body: auth.reset.invalidBody,
      testId: "reset-state-invalid",
    },
  };

  const banner = header[outcome.kind];

  return (
    <div className="flex flex-col gap-6" data-testid="reset-password">
      {banner ? (
        <>
          <header className="flex flex-col gap-2">
            <span className="grid size-11 place-items-center rounded-xl border border-border bg-surface">
              {banner.icon}
            </span>
            <h1
              className="font-heading text-xl font-semibold"
              aria-live="polite"
              data-testid={banner.testId}
            >
              {banner.title}
            </h1>
            <p className="text-sm text-muted-foreground">{banner.body}</p>
          </header>

          {outcome.kind === "success" ? (
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="min-h-11 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:opacity-90"
              data-testid="reset-continue"
            >
              {auth.reset.successCta}
            </button>
          ) : (
            <Link
              href="/forgot-password"
              data-testid="reset-request-new"
              className="min-h-11 text-sm text-accent underline-offset-4 hover:underline"
            >
              {auth.reset.requestNew}
            </Link>
          )}
        </>
      ) : (
        <>
          <header className="flex flex-col gap-1.5">
            <h1 className="font-heading text-xl font-extrabold">
              {auth.reset.title}
            </h1>
            <p className="text-sm text-muted-foreground">{auth.reset.subtitle}</p>
          </header>

          {formError ? <FormError body={formError} testId="reset-error" /> : null}

          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <AuthField
                id="reset-password"
                label={auth.reset.password}
                error={fieldErrors.password}
                hint={auth.register.passwordRule}
              >
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  disabled={reset.isPending}
                  autoFocus
                />
              </AuthField>
              <PasswordStrength password={password} />
            </div>

            <AuthField
              id="reset-confirm"
              label={auth.reset.confirmPassword}
              error={fieldErrors.confirm}
            >
              <PasswordField
                id="reset-confirm"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                disabled={reset.isPending}
              />
            </AuthField>

            <SubmitButton
              pending={reset.isPending}
              label={auth.reset.submit}
              pendingLabel={auth.reset.submitting}
              testId="reset-submit"
            />
          </form>

          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            &larr; {auth.forgot.backToLogin}
          </Link>
        </>
      )}
    </div>
  );
}

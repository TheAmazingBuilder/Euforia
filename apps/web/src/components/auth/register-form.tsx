"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";

import type { RegisterResponse } from "@cosmoz/shared";
import { registerInputSchema } from "@cosmoz/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRegisterMutation, useResendVerificationMutation } from "@/lib/api/queries/auth";
import { apiErrorMessage, apiErrorCode } from "@/lib/api/client";
import { API_MOCKED } from "@/lib/api/mode";
import { useDict } from "@/i18n/i18n-provider";
import {
  AuthField,
  FormError,
  FormInfo,
  FormSuccess,
  PasswordField,
  PasswordStrength,
  SubmitButton,
} from "@/components/auth/auth-primitives";

/**
 * Registration (spec §15, §16) — Zod-validated through the SHARED contract
 * schema (client validation is UX; server validation stays authoritative).
 * Success lands on a deliberate verification-pending state (§17).
 */
export function RegisterForm() {
  const auth = useDict().auth;
  const router = useRouter();
  const register = useRegisterMutation();
  const resend = useResendVerificationMutation();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<RegisterResponse | null>(null);
  const [resent, setResent] = React.useState(false);

  const mocked = API_MOCKED;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    // Shared Zod contract → field errors (§40, §80).
    const parsed = registerInputSchema.safeParse({ name, email, password });
    const errors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    if (confirm !== password) {
      errors.confirm = auth.register.mismatch;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !parsed.success) return;

    register.mutate(parsed.data, {
      onSuccess: (response) => {
        setPending(response);
      },
      onError: (error) => {
        const code = apiErrorCode(error);
        if (code === "EMAIL_ALREADY_USED") {
          setFieldErrors({ email: apiErrorMessage(error, "An account already exists for this email address.") });
          return;
        }
        if (code === "RATE_LIMITED") {
          setFormError(apiErrorMessage(error, auth.errors.rateLimited));
          return;
        }
        if (error instanceof Error && error.message.startsWith("Network error")) {
          setFormError(auth.errors.network);
          return;
        }
        setFormError(apiErrorMessage(error, auth.errors.server));
      },
    });
  }

  async function resendEmail() {
    if (!pending) return;
    resend.mutate(pending.user.email, {
      onSuccess: (data) => {
        setResent(true);
        if (data.verificationToken) {
          setPending({ ...pending, verificationToken: data.verificationToken });
        }
      },
      onError: (error) => {
        setFormError(apiErrorMessage(error, auth.errors.rateLimited));
      },
    });
  }

  // ── Verification-pending state (§17, §48) ─────────────────────────────────

  if (pending) {
    const verificationHref = pending.verificationToken
      ? `/verify-email?token=${encodeURIComponent(pending.verificationToken)}`
      : null;
    return (
      <div className="flex flex-col gap-6" data-testid="register-pending">
        <header className="flex flex-col gap-2">
          <span className="grid size-11 place-items-center rounded-xl border border-border bg-surface">
            <MailCheck className="size-5 text-accent" aria-hidden="true" />
          </span>
          <h1 className="font-heading text-xl font-semibold">
            {auth.register.pendingTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {auth.register.pendingBody}
          </p>
        </header>

        <FormSuccess body={pending.user.email} testId="register-pending-success" />

        {mocked && verificationHref ? (
          <div className="flex flex-col gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {auth.register.pendingMockTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {auth.register.pendingMockBody}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push(verificationHref)}
              data-testid="register-open-verification"
            >
              {auth.register.pendingMockOpen}
            </Button>
          </div>
        ) : null}

        {resent ? (
          <FormSuccess body={auth.verifyEmail.resendDone} testId="register-resend-success" />
        ) : null}
        {formError ? <FormError body={formError} testId="register-resend-error" /> : null}

        <div className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            onClick={resendEmail}
            disabled={resend.isPending}
            className="min-h-11 text-left text-accent underline-offset-4 hover:underline disabled:opacity-60"
          >
            {resend.isPending ? auth.register.resending : auth.register.resend}
          </button>
          <Link
            href="/login"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            &larr; {auth.register.signIn}
          </Link>
        </div>
      </div>
    );
  }

  // ── Registration form ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6" data-testid="register-form">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-xl font-semibold">
          {auth.register.title}
        </h1>
        <p className="text-sm text-muted-foreground">{auth.register.subtitle}</p>
      </header>

      {formError ? <FormError body={formError} testId="register-error" /> : null}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <AuthField id="register-name" label={auth.register.name} error={fieldErrors.name}>
          <Input
            type="text"
            autoComplete="name"
            placeholder="Alex Moreau"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={register.isPending}
            autoFocus
          />
        </AuthField>

        <AuthField id="register-email" label={auth.register.email} error={fieldErrors.email}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={register.isPending}
          />
        </AuthField>

        <div className="flex flex-col gap-2">
          <AuthField
            id="register-password"
            label={auth.register.password}
            error={fieldErrors.password}
            hint={auth.register.passwordRule}
          >
            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              disabled={register.isPending}
            />
          </AuthField>
          <PasswordStrength password={password} />
        </div>

        <AuthField
          id="register-confirm"
          label={auth.register.confirmPassword}
          error={fieldErrors.confirm}
        >
          <PasswordField
            id="register-confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            disabled={register.isPending}
          />
        </AuthField>

        <SubmitButton
          pending={register.isPending}
          label={auth.register.submit}
          pendingLabel={auth.register.submitting}
          testId="register-submit"
        />
      </form>

      {mocked ? (
        <FormInfo
          title={auth.login.demoHintTitle}
          body={auth.login.demoHintNote}
          testId="register-mock-note"
        />
      ) : null}

      <footer className="text-sm text-muted-foreground">
        {auth.register.haveAccount}{" "}
        <Link
          href="/login"
          data-testid="register-to-login"
          className="text-accent underline-offset-4 hover:underline"
        >
          {auth.register.signIn}
        </Link>
      </footer>
    </div>
  );
}

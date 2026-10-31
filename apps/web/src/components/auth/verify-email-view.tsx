"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, CircleX, Clock3, CopyCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useResendVerificationMutation, useVerifyEmailMutation } from "@/lib/api/queries/auth";
import { apiErrorCode } from "@/lib/api/client";
import { useAuth } from "@/components/auth/auth-provider";
import { useDict } from "@/i18n/i18n-provider";
import { FormError, FormSuccess } from "@/components/auth/auth-primitives";

/**
 * Email verification experience (spec §17, §36) - one view for every
 * outcome: verifying, success, expired, invalid, already used / verified,
 * plus resend with rate-limit handling.
 */
type Outcome =
  | { kind: "verifying" }
  | { kind: "success" }
  | { kind: "already" }
  | { kind: "expired" }
  | { kind: "used" }
  | { kind: "invalid" };

export function VerifyEmailView() {
  const auth = useDict().auth;
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, logout } = useAuth();

  const verify = useVerifyEmailMutation();
  const resend = useResendVerificationMutation();

  const [verifyOutcome, setVerifyOutcome] = React.useState<Outcome | null>(null);
  const [resendError, setResendError] = React.useState<string | null>(null);
  const [resent, setResent] = React.useState(false);
  const [resendEmail, setResendEmail] = React.useState("");

  // Derived: no token at all → invalid without any effect-driven setState.
  const outcome: Outcome =
    token === null
      ? { kind: "invalid" }
      : verifyOutcome ?? { kind: "verifying" };

  // Strict Mode double-invokes effects in dev - the one-time token must be
  // submitted exactly once, so a ref guard dedupes the mutation.
  const verifyStarted = React.useRef(false);
  React.useEffect(() => {
    if (!token || verifyStarted.current) return;
    verifyStarted.current = true;
    verify.mutate(token, {
      onSuccess: () => setVerifyOutcome({ kind: "success" }),
      onError: (error) => {
        const code = apiErrorCode(error);
        if (code === "EXPIRED_TOKEN") setVerifyOutcome({ kind: "expired" });
        else if (code === "TOKEN_ALREADY_USED") setVerifyOutcome({ kind: "used" });
        else setVerifyOutcome({ kind: "invalid" });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per token
  }, [token]);

  function requestNew() {
    if (!resendEmail.trim()) return;
    setResendError(null);
    resend.mutate(resendEmail.trim(), {
      onSuccess: () => setResent(true),
      onError: (error) => {
        setResendError(
          apiErrorCode(error) === "RATE_LIMITED"
            ? auth.errors.rateLimited
            : auth.errors.server,
        );
      },
    });
  }

  const content: Record<
    Outcome["kind"],
    { icon: React.ReactNode; title: string; body: string; testId: string }
  > = {
    verifying: {
      icon: <span className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />,
      title: auth.verifyEmail.verifying,
      body: "",
      testId: "verify-state-verifying",
    },
    success: {
      icon: <BadgeCheck className="size-5 text-emerald-500" aria-hidden="true" />,
      title: auth.verifyEmail.successTitle,
      body: auth.verifyEmail.successBody,
      testId: "verify-state-success",
    },
    already: {
      icon: <CopyCheck className="size-5 text-accent" aria-hidden="true" />,
      title: auth.verifyEmail.alreadyTitle,
      body: auth.verifyEmail.alreadyBody,
      testId: "verify-state-already",
    },
    expired: {
      icon: <Clock3 className="size-5 text-amber-500" aria-hidden="true" />,
      title: auth.verifyEmail.expiredTitle,
      body: auth.verifyEmail.expiredBody,
      testId: "verify-state-expired",
    },
    used: {
      icon: <CopyCheck className="size-5 text-accent" aria-hidden="true" />,
      title: auth.verifyEmail.usedTitle,
      body: auth.verifyEmail.usedBody,
      testId: "verify-state-used",
    },
    invalid: {
      icon: <CircleX className="size-5 text-destructive" aria-hidden="true" />,
      title: auth.verifyEmail.invalidTitle,
      body: auth.verifyEmail.invalidBody,
      testId: "verify-state-invalid",
    },
  };

  const current = content[outcome.kind];
  const needsResend = outcome.kind === "expired" || outcome.kind === "invalid" || outcome.kind === "used";

  return (
    <div className="flex flex-col gap-6" data-testid="verify-email">
      <header className="flex flex-col gap-2">
        <span className="grid size-11 place-items-center rounded-xl border border-border bg-surface">
          {current.icon}
        </span>
        <h1
          className="font-heading text-xl font-semibold"
          aria-live="polite"
          data-testid={current.testId}
        >
          {current.title}
        </h1>
        {current.body ? (
          <p className="text-sm text-muted-foreground">{current.body}</p>
        ) : null}
      </header>

      {outcome.kind === "success" ? (
        <>
          <FormSuccess body={auth.verifyEmail.successBody} testId="verify-success-banner" />
          <Button
            type="button"
            className="w-full"
            onClick={() => router.replace("/login?reason=verified")}
            data-testid="verify-continue"
          >
            {auth.verifyEmail.successCta}
          </Button>
        </>
      ) : null}

      {needsResend ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="verify-resend-email" className="text-sm font-medium">
              {auth.verifyEmail.resend}
            </label>
            <input
              id="verify-resend-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={resendEmail}
              onChange={(event) => setResendEmail(event.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={requestNew}
            disabled={resend.isPending || !resendEmail.trim()}
            data-testid="verify-resend"
          >
            {resend.isPending ? auth.verifyEmail.resending : auth.verifyEmail.resend}
          </Button>
          {resent ? (
            <FormSuccess
              body={auth.verifyEmail.resendDone}
              testId="verify-resend-success"
            />
          ) : null}
          {resendError ? <FormError body={resendError} testId="verify-resend-error" /> : null}
        </div>
      ) : null}

      <footer className="flex flex-col gap-2 text-sm">
        {user ? (
          <button
            type="button"
            onClick={() => logout({ reason: "signed-out" })}
            className="min-h-11 text-left text-accent underline-offset-4 hover:underline"
          >
            {auth.gate.signOut}
          </button>
        ) : (
          <Link
            href="/login"
            data-testid="verify-to-login"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {auth.verifyEmail.ctaLogin}
          </Link>
        )}
      </footer>
    </div>
  );
}

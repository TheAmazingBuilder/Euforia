"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import type { AuthSuccess } from "@cosmoz/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  useLoginMutation,
  useMfaChallengeMutation,
  useMfaRecoveryMutation,
} from "@/lib/api/queries/auth";
import { apiErrorMessage, apiErrorCode } from "@/lib/api/client";
import { setAccessToken } from "@/lib/auth/token-store";
import { useAuth } from "@/components/auth/auth-provider";
import { useDict } from "@/i18n/i18n-provider";
import {
  AuthField,
  FormError,
  FormInfo,
  FormSuccess,
  PasswordField,
  SubmitButton,
} from "@/components/auth/auth-primitives";

/**
 * Only same-origin, relative destinations survive returnTo validation
 * (spec §35 - open-redirect prevention).
 */
function safeReturnTo(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.includes("://")) return "/";
  return raw;
}

type Step = "credentials" | "mfa";

/**
 * Login flow (spec §14, §25, §37): credentials → optional MFA challenge →
 * authenticated. Every failure mode the backend can return has a deliberate,
 * non-sensitive UI state; anti-enumeration messages stay generic.
 */
export function LoginForm() {
  const auth = useDict().auth;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuthenticated, user } = useAuth();

  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const reason = searchParams.get("reason");
  const registered = searchParams.get("registered") === "true";
  const emailParam = searchParams.get("email");

  // Already signed in? Straight to the destination (no re-auth dance).
  React.useEffect(() => {
    if (user) router.replace(returnTo);
  }, [user, returnTo, router]);

  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState(emailParam ?? "");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [formError, setFormError] = React.useState<{ body: string; hint?: string } | null>(null);

  const [challengeToken, setChallengeToken] = React.useState<string | null>(null);
  const [mfaMethod, setMfaMethod] = React.useState<"AUTHENTICATOR_APP" | "EMAIL">("AUTHENTICATOR_APP");
  const [mfaCode, setMfaCode] = React.useState("");
  const [recoveryMode, setRecoveryMode] = React.useState(false);

  const login = useLoginMutation();
  const mfaChallenge = useMfaChallengeMutation();
  const mfaRecovery = useMfaRecoveryMutation();

  function mapError(error: unknown): { body: string; hint?: string } {
    const code = apiErrorCode(error);
    const serverMessage = apiErrorMessage(error, "");
    switch (code) {
      case "INVALID_CREDENTIALS":
        return { body: auth.errors.invalidCredentials };
      case "EMAIL_NOT_VERIFIED":
        return {
          body: auth.errors.emailNotVerified,
          hint: "Signed in but blocked? Visit /verify-email for options.",
        };
      case "ACCOUNT_SUSPENDED":
        return { body: auth.errors.suspended };
      case "ACCOUNT_DEACTIVATED":
        return { body: auth.errors.deactivated };
      case "RATE_LIMITED":
        return { body: serverMessage || auth.errors.rateLimited };
      case "INVALID_MFA_CODE":
        return {
          body: recoveryMode
            ? auth.errors.recoveryInvalid
            : auth.errors.invalidMfa,
        };
      case "INVALID_CHALLENGE":
        return { body: auth.errors.challengeExpired };
      case "VALIDATION_ERROR":
        return { body: serverMessage || "Check the form and try again." };
      default: {
        if (error instanceof Error && error.message.startsWith("Network error")) {
          return { body: auth.errors.network };
        }
        return { body: serverMessage || auth.errors.server };
      }
    }
  }

  function switchToMfa(params: { challengeToken: string; method: "AUTHENTICATOR_APP" | "EMAIL" }) {
    setChallengeToken(params.challengeToken);
    setMfaMethod(params.method);
    setMfaCode("");
    setFormError(null);
    setStep("mfa");
  }

  function onAuthenticated(success: AuthSuccess) {
    // Hold the short-lived access token in memory ONLY (spec §9, §11) -
    // the refresh credential lives in the HttpOnly cookie the backend set.
    setAccessToken(success.accessToken, success.accessTokenExpiresAt);
    setAuthenticated(success.user, success.session);
    router.replace(returnTo);
  }

  function handleCredentialsSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    login.mutate(
      { email: email.trim(), password, remember },
      {
        onSuccess: (data) => {
          if (data.outcome === "MFA_REQUIRED") {
            switchToMfa({
              challengeToken: data.challengeToken,
              method: data.method,
            });
            return;
          }
          onAuthenticated(data);
        },
        onError: (error) => setFormError(mapError(error)),
      },
    );
  }

  function handleMfaSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!challengeToken) return;
    setFormError(null);
    const mutate = recoveryMode ? mfaRecovery : mfaChallenge;
    const body = recoveryMode
      ? { challengeToken, recoveryCode: mfaCode.trim().toUpperCase() }
      : { challengeToken, code: mfaCode.trim() };
    mutate.mutate(body as never, {
      onSuccess: (data) => {
        if (data.outcome === "MFA_REQUIRED") {
          setFormError({ body: auth.errors.challengeExpired });
          setStep("credentials");
          return;
        }
        onAuthenticated(data);
      },
      onError: (error) => {
        const mapped = mapError(error);
        // A dead challenge sends the user back to credentials, cleanly.
        if (apiErrorCode(error) === "INVALID_CHALLENGE") {
          setFormError(mapped);
          setStep("credentials");
          setPassword("");
          return;
        }
        setFormError(mapped);
      },
    });
  }

  const pending = login.isPending || mfaChallenge.isPending || mfaRecovery.isPending;

  return (
    <div className="flex flex-col gap-6" data-testid="login-form">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-xl font-extrabold">
          {auth.login.title}
        </h1>
        <p className="text-sm text-muted-foreground">{auth.login.subtitle}</p>
      </header>

      {reason && auth.reasons[reason] ? (
        <FormInfo
          title={auth.reasons[reason]!.title}
          body={auth.reasons[reason]!.body}
          testId={`login-reason-${reason}`}
        />
      ) : null}

      {registered ? (
        <FormSuccess
          title="Compte créé avec succès !"
          body="Votre compte est actif. Vous pouvez vous connecter dès maintenant."
          testId="login-registered-success"
        />
      ) : null}

      {formError ? <FormError body={formError.body} testId="login-error">{formError.hint}</FormError> : null}

      {step === "credentials" ? (
        <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-4" noValidate>
          <AuthField id="login-email" label={auth.login.email}>
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
              autoFocus
            />
          </AuthField>

          <AuthField id="login-password" label={auth.login.password}>
            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              disabled={pending}
            />
          </AuthField>

          <div className="flex items-center justify-between gap-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked === true)}
                data-testid="login-remember"
              />
              {auth.login.remember}
            </label>
            <Link
              href="/forgot-password"
              data-testid="login-forgot"
              className="text-sm text-accent underline-offset-4 hover:underline"
            >
              {auth.login.forgot}
            </Link>
          </div>

          <SubmitButton
            pending={login.isPending}
            label={auth.login.submit}
            pendingLabel={auth.login.submitting}
            testId="login-submit"
          />
        </form>
      ) : (
        <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4" noValidate>
          <div
            className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3.5 py-3"
            role="status"
          >
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">{auth.login.mfaTitle}</p>
              <p className="text-xs text-muted-foreground">
                {recoveryMode
                  ? "Enter one of your unused recovery codes (e.g. 1A2B-3C4D)."
                  : mfaMethod === "EMAIL"
                    ? "We sent a 6-digit sign-in code to your verified email address."
                    : auth.login.mfaSubtitle}
              </p>
            </div>
          </div>

          <AuthField
            id="login-mfa-code"
            label={recoveryMode ? auth.login.mfaRecoveryLabel : mfaMethod === "EMAIL" ? "Email sign-in code" : auth.login.mfaCode}
          >
            <Input
              key={recoveryMode ? "recovery" : mfaMethod === "EMAIL" ? "email-code" : "totp"}
              inputMode={recoveryMode ? "text" : "numeric"}
              autoComplete={recoveryMode ? "off" : "one-time-code"}
              placeholder={recoveryMode ? "1A2B-3C4D" : "123456"}
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              disabled={pending}
              autoFocus
              data-testid="login-mfa-code"
              className="font-mono tracking-[0.35em]"
              maxLength={recoveryMode ? 9 : 6}
            />
          </AuthField>

          <SubmitButton
            pending={mfaChallenge.isPending || mfaRecovery.isPending}
            label={auth.login.mfaSubmit}
            pendingLabel={auth.login.mfaVerifying}
            testId="login-mfa-submit"
          />

          <button
            type="button"
            onClick={() => {
              setRecoveryMode((mode) => !mode);
              setMfaCode("");
              setFormError(null);
            }}
            className="min-h-11 text-sm text-accent underline-offset-4 hover:underline"
          >
            {recoveryMode ? auth.login.mfaUseCode : auth.login.mfaUseRecovery}
          </button>
        </form>
      )}

      <footer className="flex flex-col gap-2 text-sm">
        {step === "credentials" ? (
          <p className="text-muted-foreground">
            {auth.login.noAccount}{" "}
            <Link
              href="/register"
              data-testid="login-to-register"
              className="text-accent underline-offset-4 hover:underline"
            >
              {auth.login.createAccount}
            </Link>
          </p>
        ) : null}
      </footer>
    </div>
  );
}

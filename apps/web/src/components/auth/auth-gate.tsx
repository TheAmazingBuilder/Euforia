"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EuforiaLogo } from "@/components/brand/euforia-logo";
import { useAuth } from "@/components/auth/auth-provider";
import { useResendVerificationMutation } from "@/lib/api/queries/auth";
import { apiErrorCode } from "@/lib/api/client";
import { API_MOCKED } from "@/lib/api/mode";
import { useDict } from "@/i18n/i18n-provider";

/**
 * Centralized protected-route mechanism (spec §34, §36, §7) - applied ONCE
 * at the (app) layout, never per page. Handles the full state machine:
 * initializing (splash), unauthenticated (redirect with returnTo), and the
 * account-status gates (PENDING_VERIFICATION / SUSPENDED / DEACTIVATED).
 *
 * This is UX protection only - the backend remains the security boundary
 * (§32): hiding a page never equals enforcing authorization.
 */

function AuthSplash({ label }: { label: string }) {
  return (
    <div
      className="grid min-h-screen place-items-center bg-background px-4"
      role="status"
      aria-live="polite"
      data-testid="auth-splash"
    >
      <div className="flex flex-col items-center gap-4">
        <EuforiaLogo className="size-10 animate-pulse" />
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

function VerificationRequiredScreen() {
  const auth = useDict().auth;
  const { user, logout } = useAuth();
  const resend = useResendVerificationMutation();
  const [resent, setResent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mocked = API_MOCKED;

  function requestNew() {
    if (!user?.email) return;
    setError(null);
    resend.mutate(user.email, {
      onSuccess: () => setResent(true),
      onError: (err) =>
        setError(
          apiErrorCode(err) === "RATE_LIMITED"
            ? auth.errors.rateLimited
            : auth.errors.server,
        ),
    });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4">
          <span className="grid size-11 place-items-center rounded-xl border border-border bg-background">
            <ShieldAlert className="size-5 text-accent" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-lg font-extrabold">
              {auth.gate.verificationTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {auth.gate.verificationBody.replace(
                "your email address",
                user?.email ?? "your email address",
              )}
            </p>
          </div>

          {mocked ? (
            <Button asChild variant="outline" className="w-full" data-testid="gate-open-verification">
              <Link href="/verify-email">{auth.gate.verificationMockOpen}</Link>
            </Button>
          ) : null}

          {resent ? (
            <p
              role="status"
              data-testid="gate-resend-success"
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-600 dark:text-emerald-400"
            >
              ✓ {auth.verifyEmail.resendDone}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              ✕ {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 text-sm">
            <button
              type="button"
              onClick={requestNew}
              disabled={resend.isPending}
              className="min-h-11 text-left text-accent underline-offset-4 hover:underline disabled:opacity-60"
            >
              {resend.isPending ? auth.verifyEmail.resending : auth.verifyEmail.resend}
            </button>
            <button
              type="button"
              onClick={() => logout({ reason: "signed-out" })}
              className="min-h-11 text-left text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {auth.gate.signOut}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountStatusScreen({ status }: { status: "SUSPENDED" | "DEACTIVATED" }) {
  const auth = useDict().auth;
  const { logout } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4">
          <span className="grid size-11 place-items-center rounded-xl border border-destructive/40 bg-destructive/10">
            <ShieldOff className="size-5 text-destructive" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-lg font-extrabold">
              {auth.gate.blockedTitle}
            </h1>
            <p className="text-sm text-muted-foreground">{auth.gate.blockedBody}</p>
            <p className="text-xs uppercase tracking-wider text-muted-foreground/70" data-testid="gate-status">
              Status: {status}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => logout({ reason: "signed-out" })}
          >
            {auth.gate.signOut}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useDict().auth;
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const redirected = React.useRef(false);

  React.useEffect(() => {
    if (status === "unauthenticated" && !redirected.current) {
      redirected.current = true;
      const returnTo = encodeURIComponent(pathname);
      router.replace(`/login?returnTo=${returnTo}`);
    }
    if (status === "authenticated") redirected.current = false;
  }, [status, pathname, router]);

  if (status === "initializing" || status === "unauthenticated") {
    // The splash keeps the session-resolution state visible (§8: never
    // treat "not resolved yet" as logged out).
    return <AuthSplash label={auth.gate.splashLabel} />;
  }

  if (user?.status === "PENDING_VERIFICATION") {
    return <VerificationRequiredScreen />;
  }
  if (user?.status === "SUSPENDED" || user?.status === "DEACTIVATED") {
    return <AccountStatusScreen status={user.status} />;
  }

  return <>{children}</>;
}

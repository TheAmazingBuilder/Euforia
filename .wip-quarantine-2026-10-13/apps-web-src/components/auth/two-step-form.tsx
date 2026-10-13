"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { maskEmail, simulateLatency } from "@/lib/auth/demo";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Two-step verification — six OTP boxes with auto-advance, backspace to
 * the previous box, arrow navigation and paste-fill. verify mode = "prove
 * it's you" at sign-in; setup mode = enrollment copy. Demo build: any
 * 6-digit code is accepted, and the screen says so.
 */
export function TwoStepForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "setup" ? "setup" : "verify";
  const email = searchParams.get("email") ?? "your email";

  const [digits, setDigits] = React.useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [submitting, setSubmitting] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const inputsRef = React.useRef<(HTMLInputElement | null)[]>([]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const setDigit = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    if (digit !== "" && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && digits[index] === "" && index > 0) {
      inputsRef.current[index - 1]?.focus();
      setDigits((current) => {
        const next = [...current];
        next[index - 1] = "";
        return next;
      });
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (pasted === "") return;
    setDigits((current) => {
      const next = [...current];
      for (let index = 0; index < CODE_LENGTH; index += 1) {
        next[index] = pasted[index] ?? "";
      }
      return next;
    });
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  const complete = digits.every((digit) => digit !== "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || submitting) return;
    setSubmitting(true);
    await simulateLatency(600);
    setSubmitting(false);
    toast.success(
      mode === "setup"
        ? "Two-step verification enabled"
        : "Welcome back — session verified",
    );
    router.push("/");
  }

  function handleResend() {
    setDigits(Array(CODE_LENGTH).fill(""));
    setCooldown(RESEND_COOLDOWN_SECONDS);
    inputsRef.current[0]?.focus();
    toast.info("A new code is on its way", {
      description: "Demo build — any 6-digit code is accepted.",
    });
  }

  return (
    <div className="space-y-6" data-testid="two-step-form">
      <div className="space-y-4">
        <span className="grid size-11 place-items-center rounded-xl border border-border bg-surface text-accent">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {mode === "setup" ? "Secure your account" : "Confirm it's you"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "setup"
              ? "Two-step verification protects your registry. Enter the 6-digit code your authenticator app just generated."
              : `Enter the 6-digit code from your authenticator app to finish signing in as ${maskEmail(email)}.`}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div
          className="grid grid-cols-6 gap-2"
          role="group"
          aria-label="6-digit verification code"
          data-testid="otp-grid"
        >
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputsRef.current[index] = element;
              }}
              size={1}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={`Digit ${index + 1}`}
              value={digit}
              onChange={(event) => setDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              onFocus={(event) => event.target.select()}
              className="h-12 w-full min-w-0 rounded-lg border border-input bg-transparent text-center font-mono text-lg font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          ))}
        </div>

        <Button type="submit" className="w-full" disabled={!complete || submitting} data-testid="two-step-submit">
          {submitting
            ? "Verifying…"
            : mode === "setup"
              ? "Enable two-step verification"
              : "Verify and sign in"}
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="self-start text-accent underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline disabled:opacity-70"
          data-testid="two-step-resend"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
        <p className="text-xs text-muted-foreground">
          Demo build — any 6-digit code is accepted.
        </p>
        <Link
          href="/login"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          &larr; Back to sign in
        </Link>
      </div>
    </div>
  );
}

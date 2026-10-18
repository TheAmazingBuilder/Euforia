"use client";

import * as React from "react";

import { EuforiaLogo } from "@/components/brand/euforia-logo";
import { Button } from "@/components/ui/button";

import type { OnboardingStepProps } from "./step-types";

/**
 * Step 1 — Welcome. Brand reveal + concise promise + the two exits
 * (Get started / Skip introduction). The entrance is animated but SHORT —
 * interaction is available immediately (buttons never wait for the tween).
 */
export function WelcomeStep({ controller, dict, onAdvance }: OnboardingStepProps) {
  const [pending, setPending] = React.useState<"start" | "skip" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleStart() {
    if (pending) return;
    setError(null);
    setPending("start");
    const started = await controller.start();
    setPending(null);
    if (!started) {
      setError(dict.welcome.errors.start);
      return;
    }
    onAdvance();
  }

  async function handleSkip() {
    if (pending) return;
    setError(null);
    setPending("skip");
    const skipped = await controller.skip();
    setPending(null);
    if (!skipped) {
      setError(dict.welcome.errors.skip);
      return;
    }
    // Status flips to SKIPPED — the overlay closes itself via eligibility.
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <span data-onb="brand" className="inline-flex">
        <EuforiaLogo variant="full" tone="auto" size="lg" />
      </span>

      <h1
        data-onb="reveal"
        data-onb-focus
        tabIndex={-1}
        className="max-w-xl font-heading text-3xl font-extrabold tracking-tight text-foreground outline-none sm:text-4xl"
      >
        {dict.welcome.headline}
      </h1>

      <p
        data-onb="reveal"
        className="max-w-lg text-balance text-base leading-relaxed text-muted-foreground"
      >
        {dict.welcome.body}
      </p>

      <div data-onb="reveal" className="mt-2 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
        <Button
          type="button"
          size="lg"
          className="w-full min-h-11 sm:w-48"
          disabled={pending !== null || controller.isSyncing}
          onClick={handleStart}
          data-testid="onb-get-started"
        >
          {pending === "start" ? dict.ready.completing : dict.welcome.getStarted}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          className="w-full min-h-11 text-muted-foreground sm:w-auto"
          disabled={pending !== null || controller.isSyncing}
          onClick={handleSkip}
          data-testid="onb-skip"
        >
          {dict.welcome.skip}
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="onb-welcome-error"
          className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

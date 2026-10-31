"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { OnboardingStepProps } from "./step-types";

/**
 * Step 6 - Ready. The completion state is NOT assumed: "Open my dashboard"
 * persists COMPLETED first and only navigates after the backend CONFIRMS.
 * A failed save shows an honest error and offers retry - the user is never
 * falsely marked as done (spec §9). No fabricated trades, balances or
 * automatic accounts are created here.
 */
export function ReadyStep({ controller, dict, onCompleteNavigate }: OnboardingStepProps) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleOpenDashboard() {
    if (pending) return;
    setError(null);
    setPending(true);
    const completed = await controller.complete();
    if (!completed) {
      setPending(false);
      setError(dict.ready.errors.complete);
      return;
    }
    onCompleteNavigate("/");
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <span
        data-onb="success"
        className="grid size-16 place-items-center rounded-full border border-emerald-500/40 bg-emerald-500/10"
      >
        <Check className="size-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      </span>

      <h2
        data-onb="reveal"
        data-onb-focus
        tabIndex={-1}
        className="max-w-xl font-heading text-2xl font-extrabold tracking-tight text-foreground outline-none sm:text-3xl"
      >
        {dict.ready.headline}
      </h2>

      <p
        data-onb="reveal"
        className="max-w-lg text-balance text-sm leading-relaxed text-muted-foreground"
      >
        {dict.ready.body}
      </p>

      <div data-onb="reveal" className="flex w-full flex-col items-center gap-3 sm:w-auto">
        <Button
          type="button"
          size="lg"
          className="w-full min-h-11 sm:w-56"
          disabled={pending || controller.isSyncing}
          onClick={handleOpenDashboard}
          data-testid="onb-open-dashboard"
        >
          {pending ? dict.ready.completing : dict.ready.open}
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="onb-ready-error"
          className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

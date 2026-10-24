"use client";

import * as React from "react";
import { ShieldQuestion } from "lucide-react";

import type { Dictionary } from "@/i18n/dictionaries/en";

import { Button } from "@/components/ui/button";

/**
 * Deliberate recovery path when the onboarding STATUS could not be
 * determined (spec §11 - a failed status request never assumes the user is
 * new). The dashboard stays fully usable; this small notice offers a retry
 * and a session-only dismissal. Never blocks, never fabricates eligibility.
 */
export function OnboardingStatusError({
  dict,
  onRetry,
}: {
  dict: Dictionary["onboarding"]["errorNotice"];
  onRetry: () => void;
}) {
  const [dismissed, setDismissed] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);

  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="onb-status-error"
      className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background">
          <ShieldQuestion className="size-4 text-accent" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="font-heading text-sm font-bold">{dict.title}</p>
          <p className="text-sm text-muted-foreground">{dict.body}</p>
          <div className="mt-1 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retrying}
              onClick={() => {
                setRetrying(true);
                onRetry();
                // The query settles asynchronously - release the control so
                // a second retry stays possible if the refetch failed again.
                window.setTimeout(() => setRetrying(false), 800);
              }}
              data-testid="onb-status-error-retry"
            >
              {dict.retry}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
              data-testid="onb-status-error-dismiss"
            >
              {dict.dismiss}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

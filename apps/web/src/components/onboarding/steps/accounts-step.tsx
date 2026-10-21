"use client";

import * as React from "react";
import { Link2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { OnboardingStepProps } from "./step-types";

/**
 * Step 4 — Trading accounts. The tour NEVER embeds account creation or
 * broker connectivity: it LINKS to the existing flows (Accounts page for
 * manual accounts, Integrations hub for broker connections) AFTER the
 * backend confirms completion. No credentials are requested here, no
 * connection is faked, no trade is executed. "Continue without an account"
 * simply advances — nothing is fabricated.
 */
export function AccountsStep({ controller, dict, onAdvance, onCompleteNavigate }: OnboardingStepProps) {
  const [pendingTarget, setPendingTarget] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCompleteNavigate(href: string) {
    if (pendingTarget) return;
    setError(null);
    setPendingTarget(href);
    const completed = await controller.complete();
    if (!completed) {
      setPendingTarget(null);
      setError(dict.ready.errors.complete);
      return;
    }
    // Completion confirmed by the backend — safe to leave the tour.
    onCompleteNavigate(href);
  }

  const actions = [
    {
      href: "/accounts",
      icon: Plus,
      title: dict.accounts.openAccounts,
      hint: dict.accounts.openAccountsHint,
    },
    {
      href: "/integrations",
      icon: Link2,
      title: dict.accounts.openIntegrations,
      hint: dict.accounts.openIntegrationsHint,
    },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h2
          data-onb="reveal"
          data-onb-focus
          tabIndex={-1}
          className="font-heading text-2xl font-extrabold tracking-tight text-foreground outline-none sm:text-3xl"
        >
          {dict.accounts.headline}
        </h2>
        <p data-onb="reveal" className="text-sm leading-relaxed text-muted-foreground">
          {dict.accounts.body}
        </p>
      </header>

      <div data-onb="reveal" className="flex flex-col gap-3">
        {actions.map((action) => (
          <button
            key={action.href}
            type="button"
            onClick={() => handleCompleteNavigate(action.href)}
            disabled={pendingTarget !== null || controller.isSyncing}
            data-testid={`onb-account-${action.href.replace("/", "")}`}
            className="flex min-h-11 items-center gap-3.5 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/50 hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background">
              <action.icon className="size-4.5 text-accent" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-heading text-sm font-bold text-foreground">
                {pendingTarget === action.href ? dict.ready.completing : action.title}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">{action.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="onb-account-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div data-onb="reveal" className="mt-1 flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-muted-foreground"
          onClick={onAdvance}
          disabled={pendingTarget !== null || controller.isSyncing}
          data-testid="onb-account-continue"
        >
          {dict.accounts.continueWithout}
        </Button>
      </div>
    </div>
  );
}

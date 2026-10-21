"use client";

import * as React from "react";
import {
  currencySchema,
  marketSessionSchema,
  type Currency,
  type MarketSession,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { OnboardingStepProps } from "./step-types";

/** Curated IANA list — every entry is schema-valid (ianaTimezoneSchema). */
const COMMON_TIMEZONES = [
  "UTC",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Zurich",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

/**
 * Step 3 — Trading preferences. REAL writes only, through the EXISTING
 * endpoints: timezone → PATCH /me (single source of truth — the server
 * computes trading-day keys from it), display currency + preferred session
 * → the whole-domain trading PATCH. Display preferences never touch a
 * trading account's base currency or balances (copy says it explicitly).
 * Everything is optional: "Skip for now" performs NO write at all.
 */
export function PreferencesStep({ controller, dict, onAdvance, onBack }: OnboardingStepProps) {
  const mirrorTimezone = controller.mirrorTimezone ?? "UTC";
  const [timezone, setTimezone] = React.useState<string>(mirrorTimezone);
  const [currency, setCurrency] = React.useState<Currency>(
    controller.trading?.displayCurrency ?? "USD",
  );
  const [session, setSession] = React.useState<MarketSession>(
    controller.trading?.defaultSession ?? "LONDON",
  );
  const [pending, setPending] = React.useState<"save" | "skip" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const timezoneOptions = React.useMemo(() => {
    const set = new Set<string>([mirrorTimezone, timezone, ...COMMON_TIMEZONES]);
    return [...set].sort();
  }, [mirrorTimezone, timezone]);

  async function handleSave() {
    if (pending) return;
    setError(null);
    setPending("save");
    const saved = await controller.savePreferencesStep({
      timezone,
      displayCurrency: currency,
      defaultSession: session,
    });
    setPending(null);
    if (!saved) {
      setError(dict.preferences.errors.save);
      return;
    }
    onAdvance();
  }

  function handleSkip() {
    if (pending) return;
    setError(null);
    setPending("skip");
    // No write at all — skipping performs nothing (honest by construction).
    onAdvance();
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h2
          data-onb="reveal"
          data-onb-focus
          tabIndex={-1}
          className="font-heading text-2xl font-extrabold tracking-tight text-foreground outline-none sm:text-3xl"
        >
          {dict.preferences.headline}
        </h2>
        <p data-onb="reveal" className="text-sm leading-relaxed text-muted-foreground">
          {dict.preferences.body}
        </p>
      </header>

      <div data-onb="reveal" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onb-timezone">{dict.preferences.timezone.label}</Label>
          <Select value={timezone} onValueChange={(value) => setTimezone(value)}>
            <SelectTrigger id="onb-timezone" className="min-h-11 w-full" data-testid="onb-pref-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{dict.preferences.timezone.hint}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onb-currency">{dict.preferences.displayCurrency.label}</Label>
          <Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}>
            <SelectTrigger id="onb-currency" className="min-h-11 w-full" data-testid="onb-pref-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencySchema.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{dict.preferences.displayCurrency.hint}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onb-session">{dict.preferences.session.label}</Label>
          <Select value={session} onValueChange={(value) => setSession(value as MarketSession)}>
            <SelectTrigger id="onb-session" className="min-h-11 w-full" data-testid="onb-pref-session">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {marketSessionSchema.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {dict.preferences.sessions[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{dict.preferences.session.hint}</p>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="onb-pref-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div data-onb="reveal" className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-muted-foreground"
          onClick={onBack}
          disabled={pending !== null}
          data-testid="onb-back"
        >
          {dict.progress.back}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 text-muted-foreground"
            onClick={handleSkip}
            disabled={pending !== null || controller.isSyncing}
            data-testid="onb-pref-skip"
          >
            {dict.preferences.skip}
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-h-11 sm:min-w-44"
            onClick={handleSave}
            disabled={pending !== null || controller.isSyncing}
            data-testid="onb-pref-save"
          >
            {pending === "save" ? dict.ready.completing : dict.preferences.save}
          </Button>
        </div>
      </div>
    </div>
  );
}

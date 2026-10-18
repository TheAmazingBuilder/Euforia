import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AppearancePreferences,
  Currency,
  DashboardLayout,
  MarketSession,
  OnboardingPreferences,
  OnboardingStepId as SharedOnboardingStepId,
  TradingPreferences,
} from "@cosmoz/shared";

import { useAuth } from "@/components/auth/auth-provider";
import { usePreferences, useUpdatePreferencesDomain } from "@/lib/api/queries/preferences";
import { useUpdateProfile } from "@/lib/api/queries/profile";
import { queryKeys } from "@/lib/api/keys";

import {
  appearanceDomainWithOverlay,
  onboardingCompleteInput,
  onboardingSkipInput,
  onboardingStartInput,
  onboardingStepInput,
  resolveOnboardingEligibility,
  resolveResumeStep,
  tradingDomainWithOverlay,
  type OnboardingEligibility,
} from "./state";
import type { OnboardingStepId } from "./steps";

/**
 * Onboarding controller — the SINGLE integration point between the first-run
 * experience and the app (spec §7). Mounts inside the authenticated shell
 * (AuthGate children), so it only ever runs once identity is resolved.
 *
 * Persistence rules:
 *  - authoritative state = the backend preferences document (PATCH
 *    /me/preferences/onboarding) — localStorage is never consulted;
 *  - progress writes happen ONLY on meaningful step changes;
 *  - completion is persisted FIRST and confirmed by the server BEFORE the
 *    UI reports success (a failed PATCH never fakes completion);
 *  - preference writes reuse the existing per-domain PATCH semantics and
 *    never touch account-level data (display currency ≠ account currency).
 */

export type OnboardingPhase = OnboardingEligibility;

export type OnboardingPreferencesStepInput = {
  displayCurrency?: Currency;
  defaultSession?: MarketSession;
  timezone?: string;
};

export function useOnboardingController() {
  const { status: authStatus, user } = useAuth();
  const queryClient = useQueryClient();
  const preferencesQuery = usePreferences();
  const updateProfile = useUpdateProfile();

  const updateOnboarding = useUpdatePreferencesDomain("onboarding");
  const updateTrading = useUpdatePreferencesDomain("trading");
  const updateAppearance = useUpdatePreferencesDomain("appearance");

  const doc = preferencesQuery.data;
  const onboarding: OnboardingPreferences | undefined = doc?.onboarding;
  const trading: TradingPreferences | undefined = doc?.trading;
  const appearance: AppearancePreferences | undefined = doc?.appearance;

  const eligibility = resolveOnboardingEligibility({
    authStatus,
    userStatus: user?.status,
    preferencesStatus: preferencesQuery.status,
    onboarding,
  });

  const resumeStep: SharedOnboardingStepId | null = React.useMemo(
    () => (eligibility === "eligible" ? resolveResumeStep(onboarding) : null),
    [eligibility, onboarding],
  );

  // Double-submission guard: while any onboarding write is in flight, every
  // submit control disables (the spec's deterministic-navigation rule).
  const isSyncing =
    updateOnboarding.isPending || updateTrading.isPending || updateAppearance.isPending || updateProfile.isPending;

  const nowIso = () => new Date().toISOString();

  /** Start (or re-enter) the flow — enters IN_PROGRESS at the first step. */
  const start = React.useCallback(async (): Promise<boolean> => {
    try {
      await updateOnboarding.mutateAsync(onboardingStartInput(onboarding, nowIso()));
      return true;
    } catch {
      return false;
    }
  }, [updateOnboarding, onboarding]);

  /**
   * Persist a step navigation. `markDone` records the milestone the user
   * just confirmed (true on advance, false on back-navigation).
   */
  const goToStep = React.useCallback(
    async (step: SharedOnboardingStepId, options?: { markDone?: boolean }): Promise<boolean> => {
      try {
        await updateOnboarding.mutateAsync(
          onboardingStepInput(onboarding, step, {
            markDone: options?.markDone ?? false,
            now: nowIso(),
          }),
        );
        return true;
      } catch {
        return false;
      }
    },
    [updateOnboarding, onboarding],
  );

  /** Skip the introduction — NEVER fabricates completion (see state.ts). */
  const skip = React.useCallback(async (): Promise<boolean> => {
    try {
      await updateOnboarding.mutateAsync(onboardingSkipInput(onboarding, nowIso()));
      return true;
    } catch {
      return false;
    }
  }, [updateOnboarding, onboarding]);

  /**
   * Persist completion and WAIT for the server confirmation. The caller
   * must treat `false` as "not completed" — the overlay keeps its error
   * state and offers retry; the client cache has been rolled back by the
   * mutation, so no false success can leak into the UI.
   */
  const complete = React.useCallback(async (): Promise<boolean> => {
    try {
      await updateOnboarding.mutateAsync(onboardingCompleteInput(onboarding, nowIso()));
      return true;
    } catch {
      return false;
    }
  }, [updateOnboarding, onboarding]);

  /**
   * Preferences step — writes ONLY what actually changed, through the
   * EXISTING endpoints: timezone via PATCH /me (single source of truth),
   * display currency + preferred session via the whole-domain trading PATCH.
   * Nothing changed → no request at all.
   */
  const savePreferencesStep = React.useCallback(
    async (input: OnboardingPreferencesStepInput): Promise<boolean> => {
      try {
        const timezoneChanged =
          input.timezone !== undefined && input.timezone !== doc?.localization.timezone;
        if (timezoneChanged) {
          const result = await updateProfile.mutateAsync({ timezone: input.timezone });
          // Keep the whole-doc cache coherent with the server mirror.
          if (doc) {
            queryClient.setQueryData(queryKeys.preferences, {
              ...doc,
              localization: { ...doc.localization, timezone: result.timezone },
            });
          }
        }

        const overlay: { displayCurrency?: Currency; defaultSession?: MarketSession } = {};
        if (input.displayCurrency !== undefined && input.displayCurrency !== trading?.displayCurrency) {
          overlay.displayCurrency = input.displayCurrency;
        }
        if (input.defaultSession !== undefined && input.defaultSession !== trading?.defaultSession) {
          overlay.defaultSession = input.defaultSession;
        }
        if (Object.keys(overlay).length > 0) {
          await updateTrading.mutateAsync(tradingDomainWithOverlay(trading, overlay));
        }
        return true;
      } catch {
        return false;
      }
    },
    [doc, queryClient, trading, updateProfile, updateTrading],
  );

  /** Personalization step — whole-domain appearance PATCH (layout only). */
  const saveLayout = React.useCallback(
    async (layout: DashboardLayout): Promise<boolean> => {
      try {
        await updateAppearance.mutateAsync(appearanceDomainWithOverlay(appearance, layout));
        return true;
      } catch {
        return false;
      }
    },
    [appearance, updateAppearance],
  );

  /** Deliberate recovery when eligibility cannot be determined (§11). */
  const retry = React.useCallback(() => {
    void preferencesQuery.refetch();
  }, [preferencesQuery]);

  return {
    /** loading | not_required | eligible | error — the overlay renders on eligible only. */
    status: eligibility,
    /** Where an interrupted flow resumes (null when not eligible). */
    resumeStep,
    onboarding,
    trading,
    appearance,
    /** The localization mirror of Profile.timezone (read-side reference). */
    mirrorTimezone: doc?.localization.timezone ?? null,
    isSyncing,
    start,
    goToStep,
    skip,
    complete,
    savePreferencesStep,
    saveLayout,
    retry,
  } as const;
}

export type OnboardingController = ReturnType<typeof useOnboardingController>;
export type { OnboardingStepId };

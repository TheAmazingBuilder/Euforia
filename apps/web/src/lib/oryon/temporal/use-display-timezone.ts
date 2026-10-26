"use client";

import * as React from "react";

import { useProfile } from "@/lib/api/queries";
import { isValidIanaZone } from "@/lib/oryon/temporal/display";

/**
 * Display-timezone hook (Phase 8 spec §9.1) - REUSES the repo's single
 * source of truth: Profile.timezone (PATCH /me). No Oryon-specific
 * timezone setting is introduced: a second preference would fork the
 * trading-day key convention the server computes.
 *
 * Behavior:
 *  - the resolved value is validated against the platform (a profile row
 *    from an older schema could carry anything - an invalid zone falls
 *    back instead of throwing Intl exceptions across the workspace);
 *  - while the profile query is loading (or the user is signed out in a
 *    mocked route) the REPO DEFAULT is used - the same value the settings
 *    defaults ship ("America/Toronto"), so the workspace renders a stable
 *    convention instead of a per-render guess;
 *  - the value is display-only: it never mutates events, sessions or the
 *    chart time basis (spec §9.1).
 */
export const ORYON_FALLBACK_TIMEZONE = "America/Toronto";

export function useDisplayTimezone(): string {
  const profile = useProfile();
  const candidate = profile.data?.timezone;

  return React.useMemo(() => {
    if (candidate === undefined || candidate === null || candidate === "") {
      return ORYON_FALLBACK_TIMEZONE;
    }
    return isValidIanaZone(candidate) ? candidate : ORYON_FALLBACK_TIMEZONE;
  }, [candidate]);
}

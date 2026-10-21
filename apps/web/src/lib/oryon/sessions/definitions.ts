import type { AssetClass } from "@cosmoz/shared";

/**
 * Oryon market-session definitions (Phase 8 spec §4.1).
 *
 * These are VERSIONED CODE CONSTANTS, not user data: a saved layout must
 * never resurrect an outdated schedule, so the layout contract (v3) stores
 * only the per-panel on/off preference and always renders against THESE
 * definitions.
 *
 * Honesty contract (spec §4.2):
 *  - Times are LOCAL wall times interpreted in the session's own IANA zone
 *    (daylight-saving correct by construction — never a fixed UTC offset).
 *  - NO verified exchange calendar or holiday source exists in this
 *    repository (audited Phase 8 §2): sessions are an INDICATIVE reference
 *    (standard interbank FX windows) — the UI says so, and no code path may
 *    present a session as exchange-grade open/closed truth.
 *  - Asset-class scope: FX interbank windows drive the FOREX class; London/
 *    New York also shade METAL/ENERGY/INDEX charts as an INDICATIVE regional
 *    reference; CRYPTO and SYNTHETIC trade continuously — sessions do not
 *    apply to them (§4: "do not assume all instruments follow the same
 *    schedule"), and the UI displays that honestly.
 */

/** Local wall-clock time "HH:mm" (24h) in the session's own zone. */
export type OryonSessionHHmm = string;

/** A market-session definition — pure configuration, no runtime state. */
export interface OryonSessionDefinition {
  /** Stable identifier (persisted nowhere — panel prefs key off these). */
  readonly id: "sydney" | "tokyo" | "london" | "newyork";
  /** Display name (product copy). */
  readonly name: string;
  /** IANA timezone identifier — NEVER a fixed UTC offset (spec §4.1). */
  readonly ianaZone: string;
  /** Local start time, "HH:mm" in `ianaZone`. */
  readonly startHHmm: OryonSessionHHmm;
  /** Local end time, "HH:mm" in `ianaZone` — ≤ start means cross-midnight. */
  readonly endHHmm: OryonSessionHHmm;
  /** Applicable LOCAL days of week (0=Sun..6=Sat) in `ianaZone`. */
  readonly daysLocal: readonly number[];
  /** Asset classes this session shades (scope, spec §4.1). */
  readonly scope: readonly AssetClass[];
  /**
   * Chart color as a THEME TOKEN KEY (repo golden rule — resolved at render
   * time, never a raw hex). Keys exist in the chart categorical palette.
   */
  readonly colorToken: string;
  /**
   * Optional holiday-calendar reference — null everywhere: no verified
   * source exists, and inventing one would claim unverified accuracy.
   */
  readonly holidayCalendar: null;
}

export const ORYON_SESSION_DEFINITIONS: readonly OryonSessionDefinition[] = [
  {
    id: "sydney",
    name: "Sydney",
    ianaZone: "Australia/Sydney",
    startHHmm: "07:00",
    endHHmm: "16:00",
    daysLocal: [1, 2, 3, 4, 5],
    scope: ["FOREX"],
    colorToken: "cat-pa",
    holidayCalendar: null,
  },
  {
    id: "tokyo",
    name: "Tokyo",
    ianaZone: "Asia/Tokyo",
    startHHmm: "09:00",
    endHHmm: "18:00",
    daysLocal: [1, 2, 3, 4, 5],
    scope: ["FOREX"],
    colorToken: "cat-ta",
    holidayCalendar: null,
  },
  {
    id: "london",
    name: "London",
    ianaZone: "Europe/London",
    startHHmm: "08:00",
    endHHmm: "17:00",
    daysLocal: [1, 2, 3, 4, 5],
    scope: ["FOREX", "METAL", "ENERGY", "INDEX"],
    colorToken: "cat-strategies",
    holidayCalendar: null,
  },
  {
    id: "newyork",
    name: "New York",
    ianaZone: "America/New_York",
    startHHmm: "08:00",
    endHHmm: "17:00",
    daysLocal: [1, 2, 3, 4, 5],
    scope: ["FOREX", "METAL", "ENERGY", "INDEX"],
    colorToken: "cat-indicators",
    holidayCalendar: null,
  },
];

/**
 * Sessions applicable to an asset class, in display order (Sydney → NY).
 * Unknown asset classes resolve to no sessions — an empty result is the
 * honest "sessions do not apply" state, never a guessed schedule.
 */
export function sessionsForAssetClass(assetClass: AssetClass): readonly OryonSessionDefinition[] {
  return ORYON_SESSION_DEFINITIONS.filter((def) => def.scope.includes(assetClass));
}

/** Definition lookup by stable id — null for an unknown id. */
export function sessionDefinitionById(id: string): OryonSessionDefinition | null {
  return ORYON_SESSION_DEFINITIONS.find((def) => def.id === id) ?? null;
}

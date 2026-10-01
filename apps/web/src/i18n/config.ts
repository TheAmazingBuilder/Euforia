/**
 * i18n core configuration — dynamic runtime translation layer.
 *
 * Design contract (user requirement: "dynamique, pas des traductions codées,
 * anglais par défaut"):
 *   - EN is the DEFAULT and canonical locale: dictionaries render English
 *     with zero network, zero configuration.
 *   - Language packs are plain dictionary modules (`en` / `fr`) — adding a
 *     locale is one file + one line here, no code changes.
 *   - Switching is RUNTIME: the I18nProvider swaps the active dictionary in
 *     React state — every consumer re-renders in the new language without a
 *     reload (`<html lang>` follows).
 *   - Fallback chain: missing key in the active pack resolves through the EN
 *     dictionary (typed: `fr` must satisfy `Dictionary = typeof en`, so a
 *     missing key can only be a deliberate partial, never a typo).
 *
 * Persistence seam (sandbox): the language choice is written by the i18n
 * provider to a localStorage mirror for instant boot restore, and by the
 * mock preferences backend to its own jar (same pattern as the auth mock
 * jar) so the SERVER document stays the account-level truth. A real NestJS
 * backend replaces the jar transparently — `PATCH /me/preferences/localization`.
 */

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** BCP-47 tag for Intl formatting (single source — LocalizationCard uses it too). */
export function localeTag(locale: Locale): string {
  return locale === "fr" ? "fr-FR" : "en-US";
}

/** localStorage mirror for the pre-hydration boot restore (anti-flash). */
export const LOCALE_MIRROR_KEY = "cosmoz:i18n:locale";

export function readLocaleMirror(): Locale {
  try {
    const value = window.localStorage.getItem(LOCALE_MIRROR_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeLocaleMirror(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_MIRROR_KEY, locale);
  } catch {
    // Storage unavailable — runtime switching still works this session.
  }
}

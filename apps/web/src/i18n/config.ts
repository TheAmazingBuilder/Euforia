/**
 * i18n core configuration — English-only application.
 *
 * Design contract (user decision: the app ships in ONE language, English):
 *   - EN is the ONLY locale: dictionaries render English with zero network,
 *     zero configuration. The full French pack and the language switcher
 *     have been removed.
 *   - The `dict.*` engine (I18nProvider + typed Dictionary) is kept: it
 *     remains the single source of structured copy for every module.
 *
 * Persistence seam (sandbox): the locale mirror key is kept as a no-op
 * guard so stale localStorage values from previous builds simply expire.
 */

export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return value === "en";
}

/** BCP-47 tag for Intl formatting (single source — LocalizationCard uses it too). */
export function localeTag(_locale?: Locale): string {
  return "en-US";
}

/** Legacy mirror key — read only to clear stale values from old builds. */
export const LOCALE_MIRROR_KEY = "cosmoz:i18n:locale";

export function readLocaleMirror(): Locale {
  try {
    // English-only app: wipe any stale language choice from earlier builds.
    window.localStorage.removeItem(LOCALE_MIRROR_KEY);
  } catch {
    // Storage unavailable — nothing to clean.
  }
  return DEFAULT_LOCALE;
}

export function writeLocaleMirror(_locale: Locale): void {
  // English-only — no language persistence needed anymore.
}

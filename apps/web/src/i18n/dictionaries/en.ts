import { SIDEBAR_ITEMS, NAV_SECTIONS, BOTTOM_NAV_ITEMS } from "@/lib/navigation";
import { authCopy } from "@/components/auth/auth-copy";

/**
 * EN dictionary — the CANONICAL language pack and the type source for every
 * other locale (`Dictionary = typeof en`). Nav labels are derived from the
 * single source of truth in lib/navigation so the sidebar and the dictionary
 * can never drift.
 *
 * Namespaces:
 *   common   — cross-module strings (actions, shared toasts)
 *   nav      — app shell: sidebar items (keyed by href), section titles,
 *              mobile bottom nav, page-title fallbacks
 *   auth     — the full auth surface (auth-copy.ts, migrated verbatim)
 *   settings — settings shell categories + the Localization card
 */
const en = {
  common: {
    save: "Save",
    saving: "Saving…",
    reset: "Reset",
    cancel: "Cancel",
    close: "Close",
    retry: "Retry",
    loading: "Loading…",
    sessionExpiredTitle: "Your session has expired",
    sessionExpiredBody: "Please sign in again to continue.",
  },

  nav: {
    items: Object.fromEntries(SIDEBAR_ITEMS.map((item) => [item.href, item.label])) as Record<string, string>,
    sections: Object.fromEntries(NAV_SECTIONS.map((section) => [section.title, section.title])) as Record<string, string>,
    bottom: Object.fromEntries(BOTTOM_NAV_ITEMS.map((item) => [item.href, item.label])) as Record<string, string>,
    app: "Cosmoz",
    profile: "Profile",
    signIn: "Sign in",
    createAccount: "Create account",
  },

  auth: authCopy,

  settings: {
    categories: {
      profile: { label: "Profile", description: "Avatar, name, handle, bio, timezone" },
      trading: { label: "Trading", description: "Defaults for the trade form and session runner" },
      risk: { label: "Risk", description: "Risk numbers and Rules Engine linkage" },
      journal: { label: "Journal", description: "Required fields, tracking, reminders" },
      notifications: { label: "Notifications", description: "Per event, per channel" },
      appearance: { label: "Appearance", description: "Theme, density, P&L display" },
      academy: { label: "Academy", description: "Learning preferences and reminders" },
      privacy: { label: "Privacy", description: "Analytics, visibility and data ownership" },
      localization: { label: "Localization", description: "Language, formats, timezone" },
      account: { label: "Account", description: "Plan, connected accounts, dangerous actions" },
    } as Record<string, { label: string; description: string }>,

    localization: {
      title: "Localization",
      description: "Language, formats and how numbers present themselves — everywhere in the journal.",
      preview: "Preview",
      language: "Language",
      timezone: "Timezone",
      timezoneHint: "Saves instantly via your profile — it defines your trading days.",
      dateFormat: "Date format",
      timeFormat: "Time format",
      decimalSeparator: "Decimal separator",
      numberFormat: "Number format",
      currencyDisplay: "Currency display",
      weekStart: "Week starts on",
      optionLanguageDefault: "Language default",
      optionDecimalComma: "Comma — 1 234,50",
      optionDecimalDot: "Dot — 1,234.50",
      optionCurrencyCode: "Code — USD 1,234.50",
      optionCurrencySymbol: "Symbol — $1,234.50",
      optionMonday: "Monday",
      optionSunday: "Sunday",
      toastSaved: "Localization saved",
      toastSaveFailed: "Could not save localization",
      toastTimezoneSaved: "Timezone updated — trading days follow it",
      toastTimezoneFailed: "Could not update timezone",
      toastReset: "Localization reset to defaults",
      resetTitle: "Reset to defaults?",
      resetBody: "Formats return to the safe defaults (your timezone is untouched). This cannot be undone.",
      resetConfirm: "Reset card",
    },
  },
} as const;

/**
 * Deep structural widening: EN's `as const` literal values become primitive
 * types while the KEY STRUCTURE stays strictly checked — another pack must
 * provide every key (compile error otherwise) but with its own strings.
 * The mapped types are HOMOMORPHIC (readonly/optionality preserved), so the
 * literal EN pack itself still satisfies `Dictionary` and packs interoperate.
 */
type Widen<T> =
  T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends readonly (infer U)[]
          ? readonly Widen<U>[]
          : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof en>;
export { en };

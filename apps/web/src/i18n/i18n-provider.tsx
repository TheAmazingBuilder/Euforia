"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";

import {
  DEFAULT_LOCALE,
  isLocale,
  readLocaleMirror,
  writeLocaleMirror,
  type Locale,
} from "@/i18n/config";
import { en, type Dictionary } from "@/i18n/dictionaries/en";

/**
 * I18nProvider — the dictionary engine (English-only application).
 *
 * The locale machinery is KEPT but pinned: `setLocale` accepts only "en"
 * (a no-op at runtime), so the whole `dict.*` consumer surface keeps
 * working untouched. The French pack and the language switcher were
 * removed by product decision — one language, zero switching chrome.
 */

const PACKS: Record<Locale, Dictionary> = { en };

/**
 * Locale as an EXTERNAL STORE (the app's established pattern — see
 * lib/utils/preferences.ts): module state + useSyncExternalStore. The boot
 * mirror read happens lazily inside getSnapshot — hydration renders the EN
 * server snapshot, then React switches to the client snapshot WITHOUT a
 * hydration mismatch and without any setState-in-effect cascade.
 */
const localeListeners = new Set<() => void>();
let currentLocale: Locale = DEFAULT_LOCALE;
let mirrorChecked = false;

function subscribeLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

function getLocaleSnapshot(): Locale {
  if (!mirrorChecked && typeof window !== "undefined") {
    mirrorChecked = true;
    currentLocale = readLocaleMirror();
  }
  return currentLocale;
}

function getLocaleServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function commitLocale(next: Locale): void {
  if (next === currentLocale) return;
  currentLocale = next;
  writeLocaleMirror(next);
  for (const listener of localeListeners) listener();
}

type I18nContextValue = {
  locale: Locale;
  /** Switch the runtime language (re-renders the app in place). */
  setLocale: (locale: Locale) => void;
  /** The ACTIVE dictionary — use for structured values (arrays, objects). */
  dict: Dictionary;
  /** Translate a leaf string by dot path, e.g. t("auth.login.title"). */
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

function resolvePath(root: unknown, path: string): string | undefined {
  let node: unknown = root;
  for (const part of path.split(".")) {
    if (node !== null && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleServerSnapshot);

  // <html lang> follows the runtime language (fixes the hardcoded lang attr).
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = React.useCallback((next: Locale) => {
    commitLocale(next);
  }, []);

  const value = React.useMemo<I18nContextValue>(() => {
    const dict = PACKS[locale] ?? en;
    const t = (path: string, vars?: Record<string, string | number>): string => {
      const hit = resolvePath(dict, path) ?? resolvePath(en, path);
      if (hit === undefined) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[i18n] missing key: "${path}"`);
        }
        return path;
      }
      return interpolate(hit, vars);
    };
    return { locale, setLocale, dict, t };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Full i18n access: locale, setLocale, structured dictionary and t(). */
export function useI18n(): I18nContextValue {
  const value = React.useContext(I18nContext);
  if (value === null) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}

/** Structured dictionary access — for arrays/objects (e.g. auth.pillars). */
export function useDict(): Dictionary {
  return useI18n().dict;
}

/** Leaf-string translation helper with interpolation ({name}). */
export function useT() {
  return useI18n().t;
}

export { isLocale };

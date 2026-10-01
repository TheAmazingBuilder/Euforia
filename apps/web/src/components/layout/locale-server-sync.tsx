"use client";

import * as React from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { isLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";
import { usePreferences } from "@/lib/api/queries";

/**
 * LocaleServerSync — invisible bridge between the ACCOUNT-level language
 * preference (PATCH /me/preferences/localization) and the RUNTIME language
 * engine (I18nProvider). Same pattern as DensitySync: mounted once in the
 * authenticated shell, renders nothing.
 *
 * Why it exists: every language switch (header selector, Settings card)
 * now writes through to the server document, so the preference follows the
 * ACCOUNT across devices. On boot, the localStorage mirror restores the
 * last choice on THIS device instantly (anti-flash); once the preferences
 * document arrives, this bridge reconciles — if the account preference
 * differs (chosen on another device, or a previous write failed), the
 * account value WINS and the runtime flips once, silently.
 *
 * Reconciliation runs ONCE per user per session (refs — no effect loops)
 * and never fires a PATCH: it only reads the account document and applies
 * it. Local switches made afterwards always win and write through.
 *
 * Race note: a switch made in the sub-second window before the document
 * first arrives can be overwritten by this one-shot reconcile; the next
 * switch writes through normally (the cache is loaded by then). Accepted —
 * the user cannot realistically open the dropdown before the document
 * lands (single-digit-ms mock latency, first paint takes longer).
 */
export function LocaleServerSync() {
  const { status } = useAuth();
  const { locale, setLocale } = useI18n();
  const { data: prefs } = usePreferences();
  const syncedUserRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (status !== "authenticated" || !prefs) return;
    if (syncedUserRef.current === prefs.userId) return;
    syncedUserRef.current = prefs.userId;

    const accountLanguage = prefs.localization.language;
    if (isLocale(accountLanguage) && accountLanguage !== locale) {
      setLocale(accountLanguage);
    }
  }, [status, prefs, locale, setLocale]);

  return null;
}

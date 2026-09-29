"use client";

import * as React from "react";
import { toast } from "sonner";
import { Globe2 } from "lucide-react";
import type { UserPreferences } from "@cosmoz/shared";

import {
  ConfirmDialog,
  SettingsCategoryCard,
  SettingsCardSkeleton,
  SettingsRow,
  SettingsSelect,
  TIMEZONE_OPTIONS,
  useDomainDraft,
} from "@/components/settings/settings-primitives";
import {
  usePreferences,
  useResetPreferencesDomain,
  useUpdatePreferencesDomain,
  useUpdateProfile,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";

/**
 * Localization — language, formats and the timezone MIRROR. The timezone
 * select writes through PATCH /me (single source of truth for trading-day
 * keys); every other field saves with the localization domain. The preview
 * line renders one sample through the exact Intl pipeline the app uses.
 */

const localeFor = (language: UserPreferences["localization"]["language"]): string =>
  language === "fr" ? "fr-FR" : "en-US";

function previewFor(localization: UserPreferences["localization"]): {
  date: string;
  number: string;
  money: string;
} {
  const locale = localeFor(localization.language);
  const sample = new Date("2026-03-09T14:30:00.000Z");

  const dateStyle =
    localization.dateFormat === "LONG" ? "long" : localization.dateFormat === "ISO" ? "iso" : undefined;
  let date: string;
  if (dateStyle === "iso") {
    // YYYY-MM-DD in the user's timezone — the trading-day key format.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: localization.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(sample);
    date = parts;
  } else if (dateStyle === "long") {
    date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: localization.timezone }).format(sample);
  } else {
    const eu = localization.dateFormat === "EU";
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: localization.timezone,
    };
    // US renders month-first; EU day-first; ISO handled above.
    date = eu
      ? new Intl.DateTimeFormat(locale, options).format(sample)
      : new Intl.DateTimeFormat("en-US", options).format(sample);
  }

  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: localization.timeFormat === "H12",
    timeZone: localization.timezone,
  }).format(sample);

  const numberLocale =
    localization.decimalSeparator === "DOT" ? "en-US" : localization.decimalSeparator === "COMMA" ? "fr-FR" : locale;
  const number = new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 2 }).format(1234.5);
  const money = new Intl.NumberFormat(numberLocale, {
    style: "currency",
    currency: "USD",
    currencyDisplay: localization.currencyDisplay === "CODE" ? "code" : "symbol",
  }).format(1234.5);

  return { date: `${date} · ${time}`, number, money };
}

export function LocalizationCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("localization");
  const resetDomain = useResetPreferencesDomain();
  const updateProfile = useUpdateProfile();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.localization);
  const [resetOpen, setResetOpen] = React.useState(false);

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={5} />;
  }

  const patch = (changes: Partial<UserPreferences["localization"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  /**
   * Timezone writes through the PROFILE endpoint — the server computes
   * trading-day keys from it. The mock keeps the localization mirror in
   * sync, so this card re-hydrates after the mutation lands.
   */
  const onTimezoneChange = (timezone: string) => {
    updateProfile.mutate(
      { timezone },
      {
        onSuccess: () => toast.success("Timezone updated — trading days follow it"),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not update timezone")),
      },
    );
  };

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success("Localization saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save localization")),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "localization" },
      { onSuccess: () => toast.success("Localization reset to defaults") },
    );
  };

  const preview = previewFor({ ...draft, timezone: prefs.localization.timezone });

  return (
    <SettingsCategoryCard
      icon={Globe2}
      title="Localization"
      description="Language, formats and how numbers present themselves — everywhere in the journal."
      testid="settings-localization"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <div
        className="grid gap-2 rounded-xl border border-border bg-background/60 p-4 font-mono text-sm tabular-nums"
        data-testid="settings-localization-preview"
        aria-label="Format preview"
      >
        <span className="text-[11px] font-sans font-medium uppercase tracking-wide text-muted-foreground">
          Preview
        </span>
        <span>{preview.date}</span>
        <span>{preview.number}</span>
        <span>{preview.money}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label="Language" htmlFor="settings-localization-language">
          <SettingsSelect
            value={draft.language}
            onChange={(value) => patch({ language: value as UserPreferences["localization"]["language"] })}
            options={[
              { value: "en", label: "English" },
              { value: "fr", label: "Français" },
            ]}
            testid="settings-localization-language"
          />
        </SettingsRow>
        <SettingsRow
          label="Timezone"
          htmlFor="settings-localization-timezone"
          hint="Saves instantly via your profile — it defines your trading days."
        >
          <SettingsSelect
            value={prefs.localization.timezone}
            onChange={onTimezoneChange}
            options={TIMEZONE_OPTIONS.map((zone) => ({ value: zone, label: zone }))}
            testid="settings-localization-timezone"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label="Date format" htmlFor="settings-localization-date">
          <SettingsSelect
            value={draft.dateFormat}
            onChange={(value) => patch({ dateFormat: value as UserPreferences["localization"]["dateFormat"] })}
            options={[
              { value: "ISO", label: "2026-03-09" },
              { value: "EU", label: "09/03/2026 (EU)" },
              { value: "US", label: "03/09/2026 (US)" },
              { value: "LONG", label: "March 9, 2026" },
            ]}
            testid="settings-localization-date"
          />
        </SettingsRow>
        <SettingsRow label="Time format" htmlFor="settings-localization-time">
          <SettingsSelect
            value={draft.timeFormat}
            onChange={(value) => patch({ timeFormat: value as UserPreferences["localization"]["timeFormat"] })}
            options={[
              { value: "H24", label: "24 h — 14:30" },
              { value: "H12", label: "12 h — 02:30 PM" },
            ]}
            testid="settings-localization-time"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SettingsRow label="Decimal separator" htmlFor="settings-localization-decimal">
          <SettingsSelect
            value={draft.decimalSeparator}
            onChange={(value) =>
              patch({ decimalSeparator: value as UserPreferences["localization"]["decimalSeparator"] })
            }
            options={[
              { value: "LOCALE", label: "Language default" },
              { value: "COMMA", label: "Comma — 1 234,50" },
              { value: "DOT", label: "Dot — 1,234.50" },
            ]}
            testid="settings-localization-decimal"
          />
        </SettingsRow>
        <SettingsRow label="Currency display" htmlFor="settings-localization-currency">
          <SettingsSelect
            value={draft.currencyDisplay}
            onChange={(value) =>
              patch({ currencyDisplay: value as UserPreferences["localization"]["currencyDisplay"] })
            }
            options={[
              { value: "CODE", label: "Code — USD 1,234.50" },
              { value: "SYMBOL", label: "Symbol — $1,234.50" },
            ]}
            testid="settings-localization-currency"
          />
        </SettingsRow>
        <SettingsRow label="Week starts on" htmlFor="settings-localization-week">
          <SettingsSelect
            value={draft.weekStart}
            onChange={(value) => patch({ weekStart: value as UserPreferences["localization"]["weekStart"] })}
            options={[
              { value: "MONDAY", label: "Monday" },
              { value: "SUNDAY", label: "Sunday" },
            ]}
            testid="settings-localization-week"
          />
        </SettingsRow>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to defaults?"
        description="Formats return to the safe defaults (your timezone is untouched). This cannot be undone."
        confirmLabel="Reset card"
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-localization-reset"
      />
    </SettingsCategoryCard>
  );
}

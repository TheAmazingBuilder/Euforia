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
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Localization — formats and the timezone MIRROR. The timezone select
 * writes through PATCH /me (single source of truth for trading-day keys);
 * every other field saves with the localization domain. The preview line
 * renders one sample through the exact Intl pipeline the app uses.
 * The application is English-only: no language row (legacy `language`
 * field stays "en" in the stored document).
 */

const localeFor = (_language: UserPreferences["localization"]["language"]): string => "en-US";

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
  const number = formatNumberSample(localization.numberFormat, numberLocale, localization.decimalSeparator);
  const money = new Intl.NumberFormat(numberLocale, {
    style: "currency",
    currency: "USD",
    currencyDisplay: localization.currencyDisplay === "CODE" ? "code" : "symbol",
  }).format(1234.5);

  return { date: `${date} · ${time}`, number, money };
}

/**
 * Renders 1234.5 through the digit-grouping preference (§12). Built from
 * Intl parts so the decimal separator preference keeps applying: the
 * grouping symbol is swapped AFTER the locale formats the sample.
 * Conflict rule: when the decimal separator is a comma, "1,234.50" grouping
 * would be ambiguous — the sample falls back to space grouping instead.
 */
function formatNumberSample(
  numberFormat: UserPreferences["localization"]["numberFormat"],
  numberLocale: string,
  decimalSeparator: UserPreferences["localization"]["decimalSeparator"],
): string {
  const base = new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const decimalIsComma =
    decimalSeparator === "COMMA" ||
    (decimalSeparator === "LOCALE" && !base.formatToParts(1234.5).some((p) => p.type === "decimal" && p.value === "."));

  if (numberFormat === "COMMA" && !decimalIsComma) {
    // Force the "1,234.50" look regardless of the locale default.
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(1234.5);
  }

  return base
    .formatToParts(1234.5)
    .map((part) => {
      if (part.type !== "group") return part.value;
      if (numberFormat === "NONE") return "";
      // SPACE — and the COMMA-on-comma-decimal conflict fallback.
      if (numberFormat === "SPACE" || (numberFormat === "COMMA" && decimalIsComma)) return "\u202F";
      return part.value; // LOCALE (and COMMA when the locale already groups with commas)
    })
    .join("");
}

export function LocalizationCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("localization");
  const resetDomain = useResetPreferencesDomain();
  const updateProfile = useUpdateProfile();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.localization);
  const [resetOpen, setResetOpen] = React.useState(false);
  const { dict } = useI18n();
  const L = dict.settings.localization;

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
        onSuccess: () => toast.success(L.toastTimezoneSaved),
        onError: (error) => toast.error(apiErrorMessage(error, L.toastTimezoneFailed)),
      },
    );
  };

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => {
        toast.success(L.toastSaved);
      },
      onError: (error) => toast.error(apiErrorMessage(error, L.toastSaveFailed)),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "localization" },
      {
        onSuccess: () => {
          toast.success(L.toastReset);
        },
      },
    );
  };

  const preview = previewFor({ ...draft, timezone: prefs.localization.timezone });

  return (
    <SettingsCategoryCard
      icon={Globe2}
      title={L.title}
      description={L.description}
      testid="settings-localization"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <div
        className="grid gap-2 rounded-xl border border-border bg-background/60 p-4 font-mono text-sm tabular-nums"
        data-testid="settings-localization-preview"
        aria-label={L.previewAria}
      >
        <span className="text-[11px] font-sans font-medium uppercase tracking-wide text-muted-foreground">
          {L.preview}
        </span>
        <span>{preview.date}</span>
        <span>{preview.number}</span>
        <span>{preview.money}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow
          label={L.timezone}
          htmlFor="settings-localization-timezone"
          hint={L.timezoneHint}
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
        <SettingsRow label={L.dateFormat} htmlFor="settings-localization-date">
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
        <SettingsRow label={L.timeFormat} htmlFor="settings-localization-time">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label={L.decimalSeparator} htmlFor="settings-localization-decimal">
          <SettingsSelect
            value={draft.decimalSeparator}
            onChange={(value) =>
              patch({ decimalSeparator: value as UserPreferences["localization"]["decimalSeparator"] })
            }
            options={[
              { value: "LOCALE", label: L.optionLanguageDefault },
              { value: "COMMA", label: L.optionDecimalComma },
              { value: "DOT", label: L.optionDecimalDot },
            ]}
            testid="settings-localization-decimal"
          />
        </SettingsRow>
        <SettingsRow label={L.numberFormat} htmlFor="settings-localization-number">
          <SettingsSelect
            value={draft.numberFormat}
            onChange={(value) =>
              patch({ numberFormat: value as UserPreferences["localization"]["numberFormat"] })
            }
            options={[
              { value: "LOCALE", label: L.optionLanguageDefault },
              { value: "COMMA", label: "1,234.50" },
              { value: "SPACE", label: "1\u202F234.50" },
              { value: "NONE", label: "1234.50" },
            ]}
            testid="settings-localization-number"
          />
        </SettingsRow>
        <SettingsRow label={L.currencyDisplay} htmlFor="settings-localization-currency">
          <SettingsSelect
            value={draft.currencyDisplay}
            onChange={(value) =>
              patch({ currencyDisplay: value as UserPreferences["localization"]["currencyDisplay"] })
            }
            options={[
              { value: "CODE", label: L.optionCurrencyCode },
              { value: "SYMBOL", label: L.optionCurrencySymbol },
            ]}
            testid="settings-localization-currency"
          />
        </SettingsRow>
        <SettingsRow label={L.weekStart} htmlFor="settings-localization-week">
          <SettingsSelect
            value={draft.weekStart}
            onChange={(value) => patch({ weekStart: value as UserPreferences["localization"]["weekStart"] })}
            options={[
              { value: "MONDAY", label: L.optionMonday },
              { value: "SUNDAY", label: L.optionSunday },
            ]}
            testid="settings-localization-week"
          />
        </SettingsRow>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={L.resetTitle}
        description={L.resetBody}
        confirmLabel={L.resetConfirm}
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-localization-reset"
      />
    </SettingsCategoryCard>
  );
}

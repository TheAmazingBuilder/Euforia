"use client";

import * as React from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Palette } from "lucide-react";
import type { UserPreferences } from "@cosmoz/shared";

import {
  ConfirmDialog,
  SegmentedControl,
  SettingsCategoryCard,
  SettingsCardSkeleton,
  SettingsRow,
  SettingsSelect,
  useDomainDraft,
} from "@/components/settings/settings-primitives";
import { ThemePreviewMiniTradeCard } from "@/components/settings/theme-preview-card";
import {
  usePreferences,
  useResetPreferencesDomain,
  useUpdatePreferencesDomain,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Appearance - theme, density, dashboard arrangement and P&L display.
 * The theme choice writes to next-themes IMMEDIATELY (same store the
 * topbar toggle uses) and persists to the preferences document on save -
 * runtime stays next-themes (zero-flash), the document mirrors it for
 * multi-device sync when the real API ships.
 */

/** API SCREAMING_SNAKE ↔ next-themes kebab keys. */
const THEME_TO_NEXT = {
  DARK_BLUE: "dark",
  DARK: "dark",
  LIGHT: "light",
  SYSTEM: "system",
} as const;
const NEXT_TO_THEME: Record<string, UserPreferences["appearance"]["theme"]> = {
  "dark-blue": "DARK",
  dark: "DARK",
  light: "LIGHT",
  system: "SYSTEM",
};

export function AppearanceCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("appearance");
  const resetDomain = useResetPreferencesDomain();
  const { setTheme, theme } = useTheme();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.appearance);
  const [resetOpen, setResetOpen] = React.useState(false);
  const { dict } = useI18n();
  const L = dict.settings.appearance;
  const SH = dict.settings.shared;

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={4} />;
  }

  const patch = (changes: Partial<UserPreferences["appearance"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  const onThemeChange = (value: string) => {
    const nextTheme = value as UserPreferences["appearance"]["theme"];
    patch({ theme: nextTheme });
    // Instant visual feedback - the whole app follows immediately.
    setTheme(THEME_TO_NEXT[nextTheme]);
  };

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success(L.toastSaved),
      onError: (error) => toast.error(apiErrorMessage(error, L.toastSaveFailed)),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "appearance" },
      { onSuccess: () => toast.success(L.toastReset) },
    );
  };

  // The radio group reads the LIVE next-themes value so the topbar toggle
  // and this card can never disagree.
  const activeTheme = NEXT_TO_THEME[theme ?? "dark-blue"] ?? draft.theme;

  return (
    <SettingsCategoryCard
      icon={Palette}
      title={L.title}
      description={L.description}
      testid="settings-appearance"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <SettingsRow label={L.themeLabel} stacked>
        <SegmentedControl
          value={activeTheme}
          onChange={onThemeChange}
          options={[
            { value: "DARK", label: L.themeDark, hint: L.themeDarkHint },
            { value: "LIGHT", label: L.themeLight, hint: L.themeLightHint },
            { value: "SYSTEM", label: L.themeSystem, hint: L.themeSystemHint },
          ]}
          testid="settings-appearance-theme"
          ariaLabel={L.themeLabel}
        />
        {/* Live preview - a miniature trade card in the CURRENT theme. */}
        <div className="mt-3 max-w-72">
          <ThemePreviewMiniTradeCard />
        </div>
      </SettingsRow>

      <SettingsRow
        label={L.densityLabel}
        hint={L.densityHint}
        stacked
      >
        <SegmentedControl
          value={draft.density}
          onChange={(value) => patch({ density: value as UserPreferences["appearance"]["density"] })}
          options={[
            { value: "COMFORTABLE", label: L.densityComfortable, hint: L.densityComfortableHint },
            { value: "COMPACT", label: L.densityCompact, hint: L.densityCompactHint },
          ]}
          testid="settings-appearance-density"
          ariaLabel={L.densityLabel}
        />
      </SettingsRow>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <SettingsRow
          label={L.layoutLabel}
          htmlFor="settings-appearance-layout"
          hint={L.layoutHint}
        >
          <SettingsSelect
            value={draft.defaultDashboardLayout}
            onChange={(value) =>
              patch({ defaultDashboardLayout: value as UserPreferences["appearance"]["defaultDashboardLayout"] })
            }
            options={[
              { value: "COACH_FIRST", label: L.layoutCoachFirst },
              { value: "RISK_FIRST", label: L.layoutRiskFirst },
              { value: "PERFORMANCE_FIRST", label: L.layoutPerformanceFirst },
            ]}
            testid="settings-appearance-layout"
          />
        </SettingsRow>
        <SettingsRow
          label={L.pnlLabel}
          htmlFor="settings-appearance-pnl"
          hint={L.pnlHint}
        >
          <SettingsSelect
            value={draft.pnlDisplay}
            onChange={(value) => patch({ pnlDisplay: value as UserPreferences["appearance"]["pnlDisplay"] })}
            options={[
              { value: "CURRENCY", label: L.pnlCurrency },
              { value: "R_MULTIPLE", label: L.pnlRMultiple },
              { value: "PERCENT", label: L.pnlPercent },
            ]}
            testid="settings-appearance-pnl"
          />
        </SettingsRow>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {L.tradingNote}
      </p>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={SH.resetTitle}
        description={L.resetBody}
        confirmLabel={SH.resetConfirm}
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-appearance-reset"
      />
    </SettingsCategoryCard>
  );
}

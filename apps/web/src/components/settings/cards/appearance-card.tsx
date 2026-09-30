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
import {
  usePreferences,
  useResetPreferencesDomain,
  useUpdatePreferencesDomain,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";

/**
 * Appearance — theme, density, dashboard arrangement and P&L display.
 * The theme choice writes to next-themes IMMEDIATELY (same store the
 * topbar toggle uses) and persists to the preferences document on save —
 * runtime stays next-themes (zero-flash), the document mirrors it for
 * multi-device sync when the real API ships.
 */

/** API SCREAMING_SNAKE ↔ next-themes kebab keys. */
const THEME_TO_NEXT = {
  DARK_BLUE: "dark-blue",
  DARK: "dark",
  LIGHT: "light",
  SYSTEM: "system",
} as const;
const NEXT_TO_THEME: Record<string, UserPreferences["appearance"]["theme"]> = {
  "dark-blue": "DARK_BLUE",
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

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={4} />;
  }

  const patch = (changes: Partial<UserPreferences["appearance"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  const onThemeChange = (value: string) => {
    const nextTheme = value as UserPreferences["appearance"]["theme"];
    patch({ theme: nextTheme });
    // Instant visual feedback — the whole app follows immediately.
    setTheme(THEME_TO_NEXT[nextTheme]);
  };

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success("Appearance saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save appearance")),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "appearance" },
      { onSuccess: () => toast.success("Appearance reset to defaults") },
    );
  };

  // The radio group reads the LIVE next-themes value so the topbar toggle
  // and this card can never disagree.
  const activeTheme = NEXT_TO_THEME[theme ?? "dark-blue"] ?? draft.theme;

  return (
    <SettingsCategoryCard
      icon={Palette}
      title="Appearance"
      description="How Cosmoz looks and feels — theme, density and how P&L numbers are shown."
      testid="settings-appearance"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <SettingsRow label="Theme" stacked>
        <SegmentedControl
          value={activeTheme}
          onChange={onThemeChange}
          options={[
            { value: "DARK_BLUE", label: "Dark blue", hint: "Default night ocean" },
            { value: "DARK", label: "Dark", hint: "Pure black" },
            { value: "LIGHT", label: "Light", hint: "Daylight paper" },
            { value: "SYSTEM", label: "System", hint: "Follows your OS" },
          ]}
          testid="settings-appearance-theme"
          ariaLabel="Theme"
        />
      </SettingsRow>

      <SettingsRow
        label="Density"
        hint="Compact tightens spacing across cards and the page shell."
        stacked
      >
        <SegmentedControl
          value={draft.density}
          onChange={(value) => patch({ density: value as UserPreferences["appearance"]["density"] })}
          options={[
            { value: "COMFORTABLE", label: "Comfortable", hint: "Default rhythm" },
            { value: "COMPACT", label: "Compact", hint: "More on screen" },
          ]}
          testid="settings-appearance-density"
          ariaLabel="Density"
        />
      </SettingsRow>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <SettingsRow
          label="Dashboard layout"
          htmlFor="settings-appearance-layout"
          hint="Which block leads the dashboard."
        >
          <SettingsSelect
            value={draft.defaultDashboardLayout}
            onChange={(value) =>
              patch({ defaultDashboardLayout: value as UserPreferences["appearance"]["defaultDashboardLayout"] })
            }
            options={[
              { value: "COACH_FIRST", label: "Coach first" },
              { value: "RISK_FIRST", label: "Risk first" },
              { value: "PERFORMANCE_FIRST", label: "Performance first" },
            ]}
            testid="settings-appearance-layout"
          />
        </SettingsRow>
        <SettingsRow
          label="P&L display"
          htmlFor="settings-appearance-pnl"
          hint="Primary figure in dashboards and tables."
        >
          <SettingsSelect
            value={draft.pnlDisplay}
            onChange={(value) => patch({ pnlDisplay: value as UserPreferences["appearance"]["pnlDisplay"] })}
            options={[
              { value: "CURRENCY", label: "Currency" },
              { value: "R_MULTIPLE", label: "R multiple" },
              { value: "PERCENT", label: "Percent" },
            ]}
            testid="settings-appearance-pnl"
          />
        </SettingsRow>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Chart style and overlays live in Trading preferences — one source of truth per setting.
      </p>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to defaults?"
        description="Appearance returns to the dark-blue, comfortable default. This cannot be undone."
        confirmLabel="Reset card"
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-appearance-reset"
      />
    </SettingsCategoryCard>
  );
}

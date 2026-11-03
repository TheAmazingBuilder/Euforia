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
import { cn } from "@/lib/utils";

type ChoiceTileProps = {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
  children?: React.ReactNode;
};

function ChoiceTile({ selected, title, description, onSelect, children }: ChoiceTileProps) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "min-w-0 cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-accent bg-accent/5 ring-1 ring-accent/25" : "border-border bg-surface hover:border-foreground/30",
      )}
    >
      <span className="block text-sm font-semibold text-foreground">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      {children}
    </div>
  );
}

const PALETTES = [
  { value: "MONO", title: "Mono", description: "No colour at all." },
  { value: "WHISPER", title: "Whisper", description: "A faint tint on P&L." },
  { value: "CLASSIC", title: "Classic", description: "Euforia violet with green and red." },
  { value: "OCEAN", title: "Ocean", description: "Blue and orange." },
  { value: "VIOLET", title: "Violet", description: "Violet, cyan and coral." },
  { value: "LILAC", title: "Lilac", description: "Lilac, sky and terracotta." },
] as const;

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

  if (isLoading || !prefs || !draft) return <SettingsCardSkeleton rows={6} />;

  const patch = (changes: Partial<UserPreferences["appearance"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  // Legacy theme keys remain accepted by the shared schema for existing accounts.
  const selectedBaseTheme = theme === "light" || draft.theme === "LIGHT" ? "LIGHT" : "DARK";
  const onBaseThemeChange = (value: string) => {
    const nextTheme = value === "LIGHT" ? "LIGHT" : "DARK";
    patch({ theme: nextTheme });
    setTheme(nextTheme === "LIGHT" ? "light" : "dark");
  };

  const onSave = () => {
    const normalizedDraft = {
      ...draft,
      theme: draft.theme === "LIGHT" ? "LIGHT" as const : "DARK" as const,
    };
    save.mutate(normalizedDraft, {
      onSuccess: () => toast.success(L.toastSaved),
      onError: (error) => toast.error(apiErrorMessage(error, L.toastSaveFailed)),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate({ domain: "appearance" }, { onSuccess: () => toast.success(L.toastReset) });
  };

  return (
    <SettingsCategoryCard
      icon={Palette}
      title={L.title}
      description="Navigation, base theme and functional colors for the entire app."
      testid="settings-appearance"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <SettingsRow
        label="Page navigation"
        hint="Where your pages live on a computer. Phones always use the bar at the bottom."
        stacked
      >
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Desktop page navigation">
          <ChoiceTile selected={draft.desktopNavigation === "SIDEBAR"} title="Sidebar" description="Every page on the left, grouped." onSelect={() => patch({ desktopNavigation: "SIDEBAR" })}>
            <span data-base-preview="graphite" className="base-preview mt-3">
              <span className="base-preview-rail" /><span className="base-preview-content"><i /><i /><i /></span>
            </span>
          </ChoiceTile>
          <ChoiceTile selected={draft.desktopNavigation === "TOP_BAR"} title="Top bar" description="Main pages across the top, the rest under More." onSelect={() => patch({ desktopNavigation: "TOP_BAR" })}>
            <span data-base-preview="graphite" className="base-preview mt-3 flex-col">
              <span className="base-preview-top"><i /><i /><i /><i /></span><span className="base-preview-content"><i /><i /></span>
            </span>
          </ChoiceTile>
          <ChoiceTile selected={draft.desktopNavigation === "BOTTOM_DOCK"} title="Bottom dock" description="A dock at the bottom with New Trade in the middle." onSelect={() => patch({ desktopNavigation: "BOTTOM_DOCK" })}>
            <span data-base-preview="graphite" className="base-preview mt-3 flex-col justify-between">
              <span className="base-preview-content"><i /><i /></span><span className="base-preview-dock"><i /><i /><b /><i /><i /></span>
            </span>
          </ChoiceTile>
        </div>
      </SettingsRow>

      <div className="border-t border-border pt-4">
        <SettingsRow label="Base theme" hint="Background, cards, lines and text. Graphite and Chalk are the two Euforia base themes." stacked>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Base theme">
            <ChoiceTile selected={selectedBaseTheme === "DARK"} title="Graphite" description="Pure black background with quiet charcoal surfaces." onSelect={() => onBaseThemeChange("DARK")}>
              <span data-base-preview="graphite" className="base-preview mt-3"><span className="base-preview-card"><i /><i /></span><span className="base-preview-card"><i /><i /></span></span>
            </ChoiceTile>
            <ChoiceTile selected={selectedBaseTheme === "LIGHT"} title="Chalk" description="White background with soft grey cards and dark ink." onSelect={() => onBaseThemeChange("LIGHT")}>
              <span data-base-preview="chalk" className="base-preview mt-3"><span className="base-preview-card"><i /><i /></span><span className="base-preview-card"><i /><i /></span></span>
            </ChoiceTile>
          </div>
          <div className="mt-3 max-w-80"><ThemePreviewMiniTradeCard /></div>
        </SettingsRow>
      </div>

      <div className="border-t border-border pt-4">
        <SettingsRow label="Colors" hint="Button, gain, loss and warning. On a dark base Euforia uses the light version of each set." stacked>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Functional color palette">
            {PALETTES.map((palette) => (
              <ChoiceTile
                key={palette.value}
                selected={draft.colorPalette === palette.value}
                title={palette.title}
                description={palette.description}
                onSelect={() => patch({ colorPalette: palette.value })}
              >
                <div data-palette-preview={palette.value.toLowerCase()} className="palette-preview mt-3" aria-hidden="true">
                  <span className="palette-swatch palette-button" />
                  <span className="palette-swatch palette-gain" />
                  <span className="palette-swatch palette-loss" />
                  <span className="palette-swatch palette-warning" />
                </div>
              </ChoiceTile>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">The four swatches represent Button, Gain, Loss and Warning in that order.</p>
        </SettingsRow>
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <SettingsRow label={L.densityLabel} hint={L.densityHint} stacked>
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
        <SettingsRow label={L.pnlLabel} hint={L.pnlHint} stacked>
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

      <SettingsRow label="Dashboard layout" hint="Choose which information leads your Dashboard." stacked>
        <SettingsSelect
          value={draft.defaultDashboardLayout}
          onChange={(value) => patch({ defaultDashboardLayout: value as UserPreferences["appearance"]["defaultDashboardLayout"] })}
          options={[
            { value: "COACH_FIRST", label: L.layoutCoachFirst },
            { value: "RISK_FIRST", label: L.layoutRiskFirst },
            { value: "PERFORMANCE_FIRST", label: L.layoutPerformanceFirst },
          ]}
          testid="settings-appearance-layout"
        />
      </SettingsRow>

      <p className="text-xs leading-relaxed text-muted-foreground">{L.tradingNote}</p>
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

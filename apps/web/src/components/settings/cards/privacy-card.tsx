"use client";

import * as React from "react";
import { toast } from "sonner";
import { Eye, ShieldCheck } from "lucide-react";
import type { UserPreferences } from "@cosmoz/shared";

import {
  ConfirmDialog,
  SettingsCategoryCard,
  SettingsCardSkeleton,
  SettingsRow,
  SettingsSelect,
  ToggleRow,
  useDomainDraft,
} from "@/components/settings/settings-primitives";
import { BackupCard } from "@/components/settings/backup-card";
import { PreferencesBackupCard } from "@/components/settings/preferences-backup-card";
import {
  usePreferences,
  useResetPreferencesDomain,
  useUpdatePreferencesDomain,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";

/**
 * Privacy & data — analytics consents, visibility and data ownership
 * (export/import through the existing backup flow). Deliberately NO auth,
 * passwords or broker credentials here: those belong to Security.
 */
export function PrivacyCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("privacy");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.privacy);
  const [resetOpen, setResetOpen] = React.useState(false);

  if (isLoading || !prefs || !draft) {
    return (
      <div className="grid gap-4">
        <SettingsCardSkeleton rows={4} />
      </div>
    );
  }

  const patch = (changes: Partial<UserPreferences["privacy"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success("Privacy preferences saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save privacy preferences")),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "privacy" },
      { onSuccess: () => toast.success("Privacy preferences reset to defaults") },
    );
  };

  return (
    <div className="grid gap-4">
      <SettingsCategoryCard
        icon={Eye}
        title="Privacy"
        description="What Cosmoz may collect and who can see you — nothing about security lives here."
        testid="settings-privacy"
        dirty={dirty}
        saving={save.isPending}
        onSave={onSave}
        onReset={() => setResetOpen(true)}
      >
        <ToggleRow
          label="Usage analytics"
          hint="Anonymous product metrics — screens used, never trade content."
          checked={draft.usageAnalytics}
          onChange={(checked) => patch({ usageAnalytics: checked })}
          testid="settings-privacy-analytics"
        />
        <ToggleRow
          label="Crash diagnostics"
          hint="Error reports with technical context when something breaks."
          checked={draft.crashDiagnostics}
          onChange={(checked) => patch({ crashDiagnostics: checked })}
          testid="settings-privacy-crash"
        />
        <ToggleRow
          label="Share anonymous statistics"
          hint="Aggregated, de-identified discipline benchmarks for the community."
          checked={draft.shareAnonymousStats}
          onChange={(checked) => patch({ shareAnonymousStats: checked })}
          testid="settings-privacy-share"
        />
        <ToggleRow
          label="Product emails"
          hint="Occasional product news — never trade digests or marketing spam."
          checked={draft.productEmails}
          onChange={(checked) => patch({ productEmails: checked })}
          testid="settings-privacy-emails"
        />

        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <SettingsRow
            label="Profile visibility"
            htmlFor="settings-privacy-visibility"
            hint="Controls what shared views expose."
          >
            <SettingsSelect
              value={draft.profileVisibility}
              onChange={(value) =>
                patch({ profileVisibility: value as UserPreferences["privacy"]["profileVisibility"] })
              }
              options={[
                { value: "PRIVATE", label: "Private — only me" },
                { value: "ANONYMOUS", label: "Anonymous — handle only" },
                { value: "PUBLIC", label: "Public — profile page" },
              ]}
              testid="settings-privacy-visibility"
            />
          </SettingsRow>
          <SettingsRow
            label="Show email on profile"
            htmlFor="settings-privacy-email-display"
            hint="Never affects sign-in or security."
          >
            <SettingsSelect
              value={draft.showEmailOnProfile ? "SHOW" : "HIDE"}
              onChange={(value) => patch({ showEmailOnProfile: value === "SHOW" })}
              options={[
                { value: "HIDE", label: "Hidden" },
                { value: "SHOW", label: "Visible" },
              ]}
              testid="settings-privacy-email-display"
            />
          </SettingsRow>
        </div>

        <ConfirmDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          title="Reset to defaults?"
          description="Privacy consents return to the safe defaults. This cannot be undone."
          confirmLabel="Reset card"
          onConfirm={onReset}
          pending={resetDomain.isPending}
          testid="settings-privacy-reset"
        />
      </SettingsCategoryCard>

      {/* Data ownership — the existing export/import flow (Priorité 3). */}
      <BackupCard />

      {/* Preferences profile (module upgrade) — settings-only JSON backup. */}
      <PreferencesBackupCard />

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Sign-in, passwords and broker credentials are managed in Security — never in this tab.
      </p>
    </div>
  );
}

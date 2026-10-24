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
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Privacy & data - analytics consents, visibility and data ownership
 * (export/import through the existing backup flow). Deliberately NO auth,
 * passwords or broker credentials here: those belong to Security.
 */
export function PrivacyCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("privacy");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.privacy);
  const [resetOpen, setResetOpen] = React.useState(false);
  const { dict } = useI18n();
  const L = dict.settings.privacy;
  const SH = dict.settings.shared;

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
      onSuccess: () => toast.success(L.toastSaved),
      onError: (error) => toast.error(apiErrorMessage(error, L.toastSaveFailed)),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "privacy" },
      { onSuccess: () => toast.success(L.toastReset) },
    );
  };

  return (
    <div className="grid gap-4">
      <SettingsCategoryCard
        icon={Eye}
        title={L.title}
        description={L.description}
        testid="settings-privacy"
        dirty={dirty}
        saving={save.isPending}
        onSave={onSave}
        onReset={() => setResetOpen(true)}
      >
        <ToggleRow
          label={L.analyticsLabel}
          hint={L.analyticsHint}
          checked={draft.usageAnalytics}
          onChange={(checked) => patch({ usageAnalytics: checked })}
          testid="settings-privacy-analytics"
        />
        <ToggleRow
          label={L.crashLabel}
          hint={L.crashHint}
          checked={draft.crashDiagnostics}
          onChange={(checked) => patch({ crashDiagnostics: checked })}
          testid="settings-privacy-crash"
        />
        <ToggleRow
          label={L.shareLabel}
          hint={L.shareHint}
          checked={draft.shareAnonymousStats}
          onChange={(checked) => patch({ shareAnonymousStats: checked })}
          testid="settings-privacy-share"
        />
        <ToggleRow
          label={L.emailsLabel}
          hint={L.emailsHint}
          checked={draft.productEmails}
          onChange={(checked) => patch({ productEmails: checked })}
          testid="settings-privacy-emails"
        />

        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <SettingsRow
            label={L.visibilityLabel}
            htmlFor="settings-privacy-visibility"
            hint={L.visibilityHint}
          >
            <SettingsSelect
              value={draft.profileVisibility}
              onChange={(value) =>
                patch({ profileVisibility: value as UserPreferences["privacy"]["profileVisibility"] })
              }
              options={[
                { value: "PRIVATE", label: L.visibilityPrivate },
                { value: "ANONYMOUS", label: L.visibilityAnonymous },
                { value: "PUBLIC", label: L.visibilityPublic },
              ]}
              testid="settings-privacy-visibility"
            />
          </SettingsRow>
          <SettingsRow
            label={L.emailDisplayLabel}
            htmlFor="settings-privacy-email-display"
            hint={L.emailDisplayHint}
          >
            <SettingsSelect
              value={draft.showEmailOnProfile ? "SHOW" : "HIDE"}
              onChange={(value) => patch({ showEmailOnProfile: value === "SHOW" })}
              options={[
                { value: "HIDE", label: L.emailHidden },
                { value: "SHOW", label: L.emailVisible },
              ]}
              testid="settings-privacy-email-display"
            />
          </SettingsRow>
        </div>

        <ConfirmDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          title={SH.resetTitle}
          description={L.resetBody}
          confirmLabel={SH.resetConfirm}
          onConfirm={onReset}
          pending={resetDomain.isPending}
          testid="settings-privacy-reset"
        />
      </SettingsCategoryCard>

      {/* Data ownership - the existing export/import flow (Priorité 3). */}
      <BackupCard />

      {/* Preferences profile (module upgrade) - settings-only JSON backup. */}
      <PreferencesBackupCard />

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {L.securityNote}
      </p>
    </div>
  );
}

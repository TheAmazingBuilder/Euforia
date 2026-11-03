"use client";

import * as React from "react";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import type { UserPreferences } from "@cosmoz/shared";

import {
  ConfirmDialog,
  NumberField,
  SettingsCategoryCard,
  SettingsCardSkeleton,
  SettingsRow,
  SettingsSelect,
  ToggleRow,
  useDomainDraft,
} from "@/components/settings/settings-primitives";
import {
  usePreferences,
  useResetPreferencesDomain,
  useUpdatePreferencesDomain,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Academy preferences - provisioned ahead of the learning module (later
 * phase): difficulty, weekly goal, reminders and autoplay. Storing them
 * now means the module ships with a ready-made configuration center.
 */
export function AcademyCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("academy");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.academy);
  const [resetOpen, setResetOpen] = React.useState(false);
  const { dict } = useI18n();
  const L = dict.settings.academy;
  const SH = dict.settings.shared;

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={4} />;
  }

  const patch = (changes: Partial<UserPreferences["academy"]>) =>
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
      { domain: "academy" },
      { onSuccess: () => toast.success(L.toastReset) },
    );
  };

  return (
    <SettingsCategoryCard
      icon={GraduationCap}
      title={L.title}
      description={L.description}
      testid="settings-academy"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
      footerNote={L.footerNote}
    >
      <ToggleRow
        label={L.enableLabel}
        hint={L.enableHint}
        checked={draft.enabled}
        onChange={(checked) => patch({ enabled: checked })}
        testid="settings-academy-enabled"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label={L.difficultyLabel} htmlFor="settings-academy-difficulty">
          <SettingsSelect
            value={draft.difficulty}
            onChange={(value) => patch({ difficulty: value as UserPreferences["academy"]["difficulty"] })}
            options={[
              { value: "BEGINNER", label: L.difficultyBeginner },
              { value: "INTERMEDIATE", label: L.difficultyIntermediate },
              { value: "ADVANCED", label: L.difficultyAdvanced },
            ]}
            testid="settings-academy-difficulty"
          />
        </SettingsRow>
        <SettingsRow label={L.reminderLabel} htmlFor="settings-academy-reminder">
          <SettingsSelect
            value={draft.weeklyReminder}
            onChange={(value) => patch({ weeklyReminder: value as UserPreferences["academy"]["weeklyReminder"] })}
            options={[
              { value: "OFF", label: SH.off },
              { value: "DAILY", label: SH.daily },
              { value: "WEEKLY", label: SH.weekly },
            ]}
            testid="settings-academy-reminder"
          />
        </SettingsRow>
      </div>

      <SettingsRow
        label={L.goalLabel}
        htmlFor="settings-academy-goal"
        hint={L.goalHint}
      >
        <NumberField
          key={`goal-${draft.weeklyGoalMinutes}`}
          value={draft.weeklyGoalMinutes}
          onChange={(value) => patch({ weeklyGoalMinutes: Math.round(value) })}
          min={0}
          max={600}
          step={15}
          suffix="min"
          testid="settings-academy-goal"
        />
      </SettingsRow>

      <div className="grid gap-4 border-t border-border pt-4">
        <ToggleRow
          label={L.progressLabel}
          hint={L.progressHint}
          checked={draft.showProgressOnDashboard}
          onChange={(checked) => patch({ showProgressOnDashboard: checked })}
          testid="settings-academy-progress"
        />
        <ToggleRow
          label={L.notificationsLabel}
          hint={L.notificationsHint}
          checked={draft.newContentNotifications}
          onChange={(checked) => patch({ newContentNotifications: checked })}
          testid="settings-academy-new-content"
        />
        <ToggleRow
          label={L.autoplayLabel}
          hint={L.autoplayHint}
          checked={draft.autoplayLessons}
          onChange={(checked) => patch({ autoplayLessons: checked })}
          testid="settings-academy-autoplay"
        />
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={SH.resetTitle}
        description={L.resetBody}
        confirmLabel={SH.resetConfirm}
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-academy-reset"
      />
    </SettingsCategoryCard>
  );
}

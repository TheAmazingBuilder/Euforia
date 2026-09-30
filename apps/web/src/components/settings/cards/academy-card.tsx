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

/**
 * Academy preferences — provisioned ahead of the learning module (later
 * phase): difficulty, weekly goal, reminders and autoplay. Storing them
 * now means the module ships with a ready-made configuration center.
 */
export function AcademyCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("academy");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.academy);
  const [resetOpen, setResetOpen] = React.useState(false);

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={4} />;
  }

  const patch = (changes: Partial<UserPreferences["academy"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success("Academy preferences saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save academy preferences")),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "academy" },
      { onSuccess: () => toast.success("Academy preferences reset to defaults") },
    );
  };

  return (
    <SettingsCategoryCard
      icon={GraduationCap}
      title="Academy"
      description="How the coach teaches you — difficulty, rhythm and reminders."
      testid="settings-academy"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
      footerNote="The Academy module arrives in a later phase — your preferences are already wired for it."
    >
      <ToggleRow
        label="Enable Academy"
        hint="Lessons and drills woven into your journal."
        checked={draft.enabled}
        onChange={(checked) => patch({ enabled: checked })}
        testid="settings-academy-enabled"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label="Preferred difficulty" htmlFor="settings-academy-difficulty">
          <SettingsSelect
            value={draft.difficulty}
            onChange={(value) => patch({ difficulty: value as UserPreferences["academy"]["difficulty"] })}
            options={[
              { value: "BEGINNER", label: "Beginner" },
              { value: "INTERMEDIATE", label: "Intermediate" },
              { value: "ADVANCED", label: "Advanced" },
            ]}
            testid="settings-academy-difficulty"
          />
        </SettingsRow>
        <SettingsRow label="Weekly reminder" htmlFor="settings-academy-reminder">
          <SettingsSelect
            value={draft.weeklyReminder}
            onChange={(value) => patch({ weeklyReminder: value as UserPreferences["academy"]["weeklyReminder"] })}
            options={[
              { value: "OFF", label: "Off" },
              { value: "DAILY", label: "Daily" },
              { value: "WEEKLY", label: "Weekly" },
            ]}
            testid="settings-academy-reminder"
          />
        </SettingsRow>
      </div>

      <SettingsRow
        label="Weekly learning goal"
        htmlFor="settings-academy-goal"
        hint="Minutes of lessons per week."
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
          label="Show progress on dashboard"
          hint="A compact learning-progress card next to your KPIs."
          checked={draft.showProgressOnDashboard}
          onChange={(checked) => patch({ showProgressOnDashboard: checked })}
          testid="settings-academy-progress"
        />
        <ToggleRow
          label="Learning notifications"
          hint="Tell me in-app when new lessons or drills land."
          checked={draft.newContentNotifications}
          onChange={(checked) => patch({ newContentNotifications: checked })}
          testid="settings-academy-new-content"
        />
        <ToggleRow
          label="Autoplay lessons"
          hint="Start the next lesson video automatically."
          checked={draft.autoplayLessons}
          onChange={(checked) => patch({ autoplayLessons: checked })}
          testid="settings-academy-autoplay"
        />
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to defaults?"
        description="Academy preferences return to the safe defaults. This cannot be undone."
        confirmLabel="Reset card"
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-academy-reset"
      />
    </SettingsCategoryCard>
  );
}

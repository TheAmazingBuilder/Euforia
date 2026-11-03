"use client";

import * as React from "react";
import { toast } from "sonner";
import { NotebookPen } from "lucide-react";
import type { UserPreferences } from "@cosmoz/shared";

import {
  CheckboxChips,
  ConfirmDialog,
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
 * Journal preferences - what the capture flow ASKS for and how drafts
 * behave. Required fields map to the trade form's fields; behavioral
 * tracking toggles feed the psychology panel and analytics.
 * REQUIRED_FIELDS stays machine-only; labels resolve from
 * dict.settings.journal.fields at render time.
 */

const REQUIRED_FIELDS = ["STRATEGY", "STOP_LOSS", "TAKE_PROFIT", "PLANNED_RR", "TAGS"] as const;

export function JournalCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("journal");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.journal);
  const [resetOpen, setResetOpen] = React.useState(false);
  const { dict } = useI18n();
  const L = dict.settings.journal;
  const SH = dict.settings.shared;

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={5} />;
  }

  const patch = (changes: Partial<UserPreferences["journal"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  const toggleField = (value: string) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const has = previous.requiredFields.includes(value as UserPreferences["journal"]["requiredFields"][number]);
      return {
        ...previous,
        requiredFields: has
          ? previous.requiredFields.filter((field) => field !== value)
          : [...previous.requiredFields, value as UserPreferences["journal"]["requiredFields"][number]],
      };
    });
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
      { domain: "journal" },
      { onSuccess: () => toast.success(L.toastReset) },
    );
  };

  return (
    <SettingsCategoryCard
      icon={NotebookPen}
      title={L.title}
      description={L.description}
      testid="settings-journal"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <SettingsRow
        label={L.requiredLabel}
        hint={L.requiredHint}
        stacked
      >
        <CheckboxChips
          selected={draft.requiredFields}
          onToggle={toggleField}
          options={REQUIRED_FIELDS.map((value) => ({ value, label: L.fields[value] }))}
          testid="settings-journal-required"
          ariaLabel={L.requiredAria}
        />
      </SettingsRow>

      <div className="grid gap-4 border-t border-border pt-4">
        <ToggleRow
          label={L.screenshotLabel}
          hint={L.screenshotHint}
          checked={draft.requireScreenshot}
          onChange={(checked) => patch({ requireScreenshot: checked })}
          testid="settings-journal-screenshot"
        />
        <ToggleRow
          label={L.preTradeLabel}
          hint={L.preTradeHint}
          checked={draft.requirePreTradeJournal}
          onChange={(checked) => patch({ requirePreTradeJournal: checked })}
          testid="settings-journal-pretrade"
        />
        <ToggleRow
          label={L.postTradeLabel}
          hint={L.postTradeHint}
          checked={draft.requirePostTradeReview}
          onChange={(checked) => patch({ requirePostTradeReview: checked })}
          testid="settings-journal-posttrade"
        />
      </div>

      <div className="grid gap-4 border-t border-border pt-4">
        <ToggleRow
          label={L.emotionsLabel}
          hint={L.emotionsHint}
          checked={draft.trackEmotions}
          onChange={(checked) => patch({ trackEmotions: checked })}
          testid="settings-journal-emotions"
        />
        <ToggleRow
          label={L.confidenceLabel}
          hint={L.confidenceHint}
          checked={draft.trackConfidence}
          onChange={(checked) => patch({ trackConfidence: checked })}
          testid="settings-journal-confidence"
        />
        <ToggleRow
          label={L.stressLabel}
          hint={L.stressHint}
          checked={draft.trackStress}
          onChange={(checked) => patch({ trackStress: checked })}
          testid="settings-journal-stress"
        />
        <ToggleRow
          label={L.autoSaveLabel}
          hint={L.autoSaveHint}
          checked={draft.autoSaveDrafts}
          onChange={(checked) => patch({ autoSaveDrafts: checked })}
          testid="settings-journal-autosave"
        />
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <SettingsRow label={L.templateLabel} htmlFor="settings-journal-template">
          <SettingsSelect
            value={draft.defaultTemplate}
            onChange={(value) => patch({ defaultTemplate: value as UserPreferences["journal"]["defaultTemplate"] })}
            options={[
              { value: "MINIMAL", label: L.templateMinimal },
              { value: "STANDARD", label: L.templateStandard },
              { value: "DEEP_REVIEW", label: L.templateDeep },
            ]}
            testid="settings-journal-template"
          />
        </SettingsRow>
        <SettingsRow label={L.remindersLabel} htmlFor="settings-journal-reminders">
          <SettingsSelect
            value={draft.reviewReminders}
            onChange={(value) => patch({ reviewReminders: value as UserPreferences["journal"]["reviewReminders"] })}
            options={[
              { value: "OFF", label: SH.off },
              { value: "DAILY", label: SH.daily },
              { value: "WEEKLY", label: SH.weekly },
            ]}
            testid="settings-journal-reminders"
          />
        </SettingsRow>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={SH.resetTitle}
        description={SH.resetBodyGeneric}
        confirmLabel={SH.resetConfirm}
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-journal-reset"
      />
    </SettingsCategoryCard>
  );
}

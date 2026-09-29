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

/**
 * Journal preferences — what the capture flow ASKS for and how drafts
 * behave. Required fields map to the trade form's fields; behavioral
 * tracking toggles feed the psychology panel and analytics.
 */

const REQUIRED_FIELD_OPTIONS = [
  { value: "STRATEGY", label: "Strategy" },
  { value: "STOP_LOSS", label: "Stop loss" },
  { value: "TAKE_PROFIT", label: "Take profit" },
  { value: "PLANNED_RR", label: "Planned R:R" },
  { value: "TAGS", label: "Tags" },
] as const;

export function JournalCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("journal");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.journal);
  const [resetOpen, setResetOpen] = React.useState(false);

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
      onSuccess: () => toast.success("Journal preferences saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save journal preferences")),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "journal" },
      { onSuccess: () => toast.success("Journal preferences reset to defaults") },
    );
  };

  return (
    <SettingsCategoryCard
      icon={NotebookPen}
      title="Journal"
      description="What each entry asks of you — required fields, behavioral tracking and review discipline."
      testid="settings-journal"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <SettingsRow
        label="Required fields at capture"
        hint="The trade form blocks saving until these are set."
        stacked
      >
        <CheckboxChips
          selected={draft.requiredFields}
          onToggle={toggleField}
          options={REQUIRED_FIELD_OPTIONS.map((option) => ({ ...option }))}
          testid="settings-journal-required"
          ariaLabel="Required trade fields"
        />
      </SettingsRow>

      <div className="grid gap-4 border-t border-border pt-4">
        <ToggleRow
          label="Require chart screenshot"
          hint="Ask for a screenshot before the entry can be graded."
          checked={draft.requireScreenshot}
          onChange={(checked) => patch({ requireScreenshot: checked })}
          testid="settings-journal-screenshot"
        />
        <ToggleRow
          label="Require pre-trade journal"
          hint="A short plan note is mandatory before opening."
          checked={draft.requirePreTradeJournal}
          onChange={(checked) => patch({ requirePreTradeJournal: checked })}
          testid="settings-journal-pretrade"
        />
        <ToggleRow
          label="Require post-trade review"
          hint="Close flows end with the review step (Reflect)."
          checked={draft.requirePostTradeReview}
          onChange={(checked) => patch({ requirePostTradeReview: checked })}
          testid="settings-journal-posttrade"
        />
      </div>

      <div className="grid gap-4 border-t border-border pt-4">
        <ToggleRow
          label="Track emotions"
          hint="Emotion before/after pickers on capture and close."
          checked={draft.trackEmotions}
          onChange={(checked) => patch({ trackEmotions: checked })}
          testid="settings-journal-emotions"
        />
        <ToggleRow
          label="Track confidence"
          hint="1–5 confidence slider on entry."
          checked={draft.trackConfidence}
          onChange={(checked) => patch({ trackConfidence: checked })}
          testid="settings-journal-confidence"
        />
        <ToggleRow
          label="Track stress & sleep"
          hint="Daily context prompts in the session runner."
          checked={draft.trackStress}
          onChange={(checked) => patch({ trackStress: checked })}
          testid="settings-journal-stress"
        />
        <ToggleRow
          label="Auto-save drafts"
          hint="Unfinished capture forms survive a reload."
          checked={draft.autoSaveDrafts}
          onChange={(checked) => patch({ autoSaveDrafts: checked })}
          testid="settings-journal-autosave"
        />
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <SettingsRow label="Default journal template" htmlFor="settings-journal-template">
          <SettingsSelect
            value={draft.defaultTemplate}
            onChange={(value) => patch({ defaultTemplate: value as UserPreferences["journal"]["defaultTemplate"] })}
            options={[
              { value: "MINIMAL", label: "Minimal — note only" },
              { value: "STANDARD", label: "Standard — plan + review" },
              { value: "DEEP_REVIEW", label: "Deep review — full checklist" },
            ]}
            testid="settings-journal-template"
          />
        </SettingsRow>
        <SettingsRow label="Review reminders" htmlFor="settings-journal-reminders">
          <SettingsSelect
            value={draft.reviewReminders}
            onChange={(value) => patch({ reviewReminders: value as UserPreferences["journal"]["reviewReminders"] })}
            options={[
              { value: "OFF", label: "Off" },
              { value: "DAILY", label: "Daily" },
              { value: "WEEKLY", label: "Weekly" },
            ]}
            testid="settings-journal-reminders"
          />
        </SettingsRow>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to defaults?"
        description="Every preference in this card returns to the safe Cosmoz defaults. This cannot be undone."
        confirmLabel="Reset card"
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-journal-reset"
      />
    </SettingsCategoryCard>
  );
}

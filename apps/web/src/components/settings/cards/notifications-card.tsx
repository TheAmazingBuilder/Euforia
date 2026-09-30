"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NotificationChannels, NotificationPreferences } from "@cosmoz/shared";

import { Switch } from "@/components/ui/switch";
import {
  ConfirmDialog,
  SettingsCategoryCard,
  SettingsCardSkeleton,
  useDomainDraft,
} from "@/components/settings/settings-primitives";
import {
  usePreferences,
  useResetPreferencesDomain,
  useUpdatePreferencesDomain,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";

/**
 * Notification preferences — the fine-grained matrix: 7 categories ×
 * concrete events × 3 delivery channels. The in-app channel feeds the
 * existing alert inbox; email/push activate when the delivery service
 * ships (preferences are stored now, honored by the real API later).
 */

type CategoryKey = keyof NotificationPreferences;

/** Common envelope of every notification category — event key sets differ. */
type NotificationCategoryEnvelope = {
  enabled: boolean;
  events: Record<string, NotificationChannels>;
};

interface CategoryMeta {
  key: CategoryKey;
  label: string;
  description: string;
  icon: LucideIcon;
  events: { key: string; label: string }[];
}

const CHANNELS: { key: keyof NotificationChannels; label: string }[] = [
  { key: "inApp", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
];

const CATEGORY_META: CategoryMeta[] = [
  {
    key: "trading",
    label: "Trading",
    description: "Execution lifecycle — opens, closes, position updates.",
    icon: BellRing,
    events: [
      { key: "TRADE_OPENED", label: "Trade opened" },
      { key: "TRADE_CLOSED", label: "Trade closed" },
      { key: "POSITION_UPDATED", label: "Position updated" },
    ],
  },
  {
    key: "risk",
    label: "Risk",
    description: "Budget breaches and exposure thresholds.",
    icon: BellRing,
    events: [
      { key: "RISK_LIMIT_BREACH", label: "Risk limit breached" },
      { key: "DAILY_LOSS_LIMIT", label: "Daily loss limit hit" },
      { key: "DRAWDOWN_THRESHOLD", label: "Drawdown threshold reached" },
      { key: "EXPOSURE_THRESHOLD", label: "Exposure threshold reached" },
    ],
  },
  {
    key: "strategy",
    label: "Strategy",
    description: "Playbook adherence and checklists.",
    icon: BellRing,
    events: [
      { key: "STRATEGY_VIOLATION", label: "Strategy violation" },
      { key: "CHECKLIST_INCOMPLETE", label: "Checklist incomplete" },
      { key: "RULE_VIOLATION", label: "Rule violation" },
    ],
  },
  {
    key: "goals",
    label: "Goals",
    description: "Target pacing against real behavior — at-risk alerts, recoveries, achievements.",
    icon: Target,
    events: [
      { key: "GOAL_AT_RISK", label: "Goal slipping (at risk)" },
      { key: "GOAL_RECOVERED", label: "Goal back on track" },
      { key: "GOAL_ACHIEVED", label: "Goal achieved" },
    ],
  },
  {
    key: "economic",
    label: "Economic calendar",
    description: "High-impact events around your session.",
    icon: BellRing,
    events: [
      { key: "HIGH_IMPACT_EVENT", label: "High-impact event today" },
      { key: "EVENT_APPROACHING", label: "Event approaching (30 min)" },
      { key: "EVENT_RELEASED", label: "Event released" },
    ],
  },
  {
    key: "system",
    label: "System",
    description: "Connections and data health.",
    icon: BellRing,
    events: [
      { key: "BROKER_DISCONNECTED", label: "Broker disconnected" },
      { key: "MARKET_DATA_STALE", label: "Market data stale" },
      { key: "INTEGRATION_FAILURE", label: "Integration failure" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    description: "Scheduled summaries of your journal.",
    icon: BellRing,
    events: [
      { key: "DAILY_SUMMARY", label: "Daily summary" },
      { key: "WEEKLY_SUMMARY", label: "Weekly summary" },
      { key: "MONTHLY_SUMMARY", label: "Monthly summary" },
    ],
  },
];

export function NotificationsCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("notifications");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.notifications);
  const [resetOpen, setResetOpen] = React.useState(false);

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={6} />;
  }

  const patchCategory = (
    category: CategoryKey,
    updater: (current: NotificationCategoryEnvelope) => NotificationCategoryEnvelope,
  ) =>
    setDraft((previous) => {
      if (!previous) return previous;
      // All seven categories share the { enabled, events } envelope; only the
      // event key sets differ, and edits never move events across
      // categories — the envelope-level cast is therefore sound.
      const current = previous[category] as NotificationCategoryEnvelope;
      return { ...previous, [category]: updater(current) } as NotificationPreferences;
    });

  const setEnabled = (category: CategoryKey, enabled: boolean) =>
    patchCategory(category, (current) => ({ ...current, enabled }));

  const setEventChannel = (
    category: CategoryKey,
    event: string,
    channel: keyof NotificationChannels,
    value: boolean,
  ) =>
    patchCategory(category, (current) => {
      const existing = current.events[event] ?? { inApp: false, email: false, push: false };
      return {
        ...current,
        events: {
          ...current.events,
          [event]: { ...existing, [channel]: value },
        },
      };
    });

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success("Notification preferences saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save notification preferences")),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "notifications" },
      { onSuccess: () => toast.success("Notification preferences reset to defaults") },
    );
  };

  return (
    <SettingsCategoryCard
      icon={BellRing}
      title="Notifications"
      description="Choose exactly what reaches you, and where — per event, per channel."
      testid="settings-notifications"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
      footerNote="In-app alerts feed the topbar inbox. Email and push activate when the delivery service ships — your choices are stored now."
    >
      <div className="grid grid-cols-1 gap-5">
        {CATEGORY_META.map((category) => {
          const current = draft[category.key] as NotificationCategoryEnvelope;
          return (
            <section
              key={category.key}
              className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4"
              data-testid={`settings-notifications-${category.key}`}
              aria-label={`${category.label} notifications`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{category.label}</span>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                <Switch
                  checked={current.enabled}
                  onCheckedChange={(checked) => setEnabled(category.key, checked)}
                  aria-label={`${category.label} notifications enabled`}
                  data-testid={`settings-notifications-${category.key}-enabled`}
                  className="shrink-0"
                />
              </div>
              <div className={current.enabled ? "grid gap-2" : "grid gap-2 opacity-50"} aria-disabled={!current.enabled}>
                {/* Channel headers — same fixed lanes as the switches below. */}
                <div className="flex items-center justify-between gap-3 px-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Event
                  </span>
                  <span className="flex shrink-0 items-center">
                    {CHANNELS.map((channel) => (
                      <span
                        key={channel.key}
                        className="w-14 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {channel.label}
                      </span>
                    ))}
                  </span>
                </div>
                {category.events.map((event) => {
                  const channels: NotificationChannels = current.events[event.key];
                  return (
                    <div
                      key={event.key}
                      className="flex items-center justify-between gap-3 rounded-lg px-1 py-1"
                    >
                      <span className="min-w-0 truncate text-sm">{event.label}</span>
                      <span className="flex shrink-0 items-center">
                        {CHANNELS.map((channel) => (
                          <span key={channel.key} className="grid w-14 place-items-center">
                            <Switch
                              size="sm"
                              checked={channels[channel.key]}
                              onCheckedChange={(checked) =>
                                setEventChannel(category.key, event.key, channel.key, checked)
                              }
                              disabled={!current.enabled}
                              aria-label={`${event.label} — ${channel.label}`}
                              data-testid={`settings-notifications-${category.key}-${event.key}-${channel.key}`}
                            />
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to defaults?"
        description="The whole notification matrix returns to the safe Cosmoz defaults. This cannot be undone."
        confirmLabel="Reset card"
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-notifications-reset"
      />
    </SettingsCategoryCard>
  );
}

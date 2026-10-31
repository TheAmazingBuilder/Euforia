"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, BellOff, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NotificationChannels, NotificationPreferences } from "@cosmoz/shared";

import { Input } from "@/components/ui/input";
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
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Notification preferences - the fine-grained matrix: 7 categories ×
 * concrete events × 3 delivery channels. The in-app channel feeds the
 * existing alert inbox; email/push activate when the delivery service
 * ships (preferences are stored now, honored by the real API later).
 */

type CategoryKey = keyof NotificationPreferences;

/** Common envelope of every notification category - event key sets differ. */
type NotificationCategoryEnvelope = {
  enabled: boolean;
  events: Record<string, NotificationChannels>;
};

/**
 * Machine-only category metadata - labels, descriptions and event labels
 * resolve from dict.settings.notifications.categories[key] at render time
 * (de-labeled module map, per the dict.* contract).
 */
interface CategoryMeta {
  key: CategoryKey;
  icon: LucideIcon;
  events: readonly string[];
}

const CATEGORY_META: CategoryMeta[] = [
  {
    key: "trading",
    icon: BellRing,
    events: ["TRADE_OPENED", "TRADE_CLOSED", "POSITION_UPDATED"],
  },
  {
    key: "risk",
    icon: BellRing,
    events: ["RISK_LIMIT_BREACH", "DAILY_LOSS_LIMIT", "DRAWDOWN_THRESHOLD", "EXPOSURE_THRESHOLD"],
  },
  {
    key: "strategy",
    icon: BellRing,
    events: ["STRATEGY_VIOLATION", "CHECKLIST_INCOMPLETE", "RULE_VIOLATION"],
  },
  {
    key: "goals",
    icon: Target,
    events: ["GOAL_AT_RISK", "GOAL_RECOVERED", "GOAL_ACHIEVED"],
  },
  {
    key: "economic",
    icon: BellRing,
    events: ["HIGH_IMPACT_EVENT", "EVENT_APPROACHING", "EVENT_RELEASED"],
  },
  {
    key: "system",
    icon: BellRing,
    events: ["BROKER_DISCONNECTED", "MARKET_DATA_STALE", "INTEGRATION_FAILURE"],
  },
  {
    key: "reports",
    icon: BellRing,
    events: ["DAILY_SUMMARY", "WEEKLY_SUMMARY", "MONTHLY_SUMMARY"],
  },
];

const CHANNEL_KEYS = ["inApp", "email", "push"] as const;

export function NotificationsCard() {
  const { data: prefs, isLoading } = usePreferences();
  const save = useUpdatePreferencesDomain("notifications");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.notifications);
  const [resetOpen, setResetOpen] = React.useState(false);
  const { dict } = useI18n();
  const N = dict.settings.notifications;
  const SH = dict.settings.shared;

  /** Channel display labels from the dict, keyed by machine channel key. */
  const channelLabels: Record<(typeof CHANNEL_KEYS)[number], string> = {
    inApp: N.channelInApp,
    email: N.channelEmail,
    push: N.channelPush,
  };

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
      // categories - the envelope-level cast is therefore sound.
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
      onSuccess: () => toast.success(N.toastSaved),
      onError: (error) => toast.error(apiErrorMessage(error, N.toastSaveFailed)),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "notifications" },
      { onSuccess: () => toast.success(N.toastReset) },
    );
  };

  return (
    <SettingsCategoryCard
      icon={BellRing}
      title={N.title}
      description={N.description}
      testid="settings-notifications"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
      footerNote={N.footerNote}
    >
      <div className="grid grid-cols-1 gap-5">
        {CATEGORY_META.map((category) => {
          const current = draft[category.key] as NotificationCategoryEnvelope;
          const meta = N.categories[category.key];
          return (
            <section
              key={category.key}
              className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4"
              data-testid={`settings-notifications-${category.key}`}
              aria-label={`${meta.label} ${N.wordNotifications}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {meta.description}
                  </p>
                </div>
                <Switch
                  checked={current.enabled}
                  onCheckedChange={(checked) => setEnabled(category.key, checked)}
                  aria-label={`${meta.label} ${N.wordNotifications} ${N.wordEnabled}`}
                  data-testid={`settings-notifications-${category.key}-enabled`}
                  className="shrink-0"
                />
              </div>
              <div className={current.enabled ? "grid gap-2" : "grid gap-2 opacity-50"} aria-disabled={!current.enabled}>
                {/* Channel headers - same fixed lanes as the switches below. */}
                <div className="flex items-center justify-between gap-3 px-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {N.eventColumn}
                  </span>
                  <span className="flex shrink-0 items-center">
                    {CHANNEL_KEYS.map((key) => (
                      <span
                        key={key}
                        className="w-14 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {channelLabels[key]}
                      </span>
                    ))}
                  </span>
                </div>
                {category.events.map((eventKey) => {
                  const channels: NotificationChannels = current.events[eventKey];
                  return (
                    <div
                      key={eventKey}
                      className="flex items-center justify-between gap-3 rounded-lg px-1 py-1"
                    >
                      <span className="min-w-0 truncate text-sm">{meta.events[eventKey]}</span>
                      <span className="flex shrink-0 items-center">
                        {CHANNEL_KEYS.map((key) => (
                          <span key={key} className="grid w-14 place-items-center">
                            <Switch
                              size="sm"
                              checked={channels[key]}
                              onCheckedChange={(checked) =>
                                setEventChannel(category.key, eventKey, key, checked)
                              }
                              disabled={!current.enabled}
                              aria-label={`${meta.events[eventKey]} - ${channelLabels[key]}`}
                              data-testid={`settings-notifications-${category.key}-${eventKey}-${key}`}
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

        {/* Quiet hours - out-of-band channels only; the inbox is never muted. */}
        <section
          className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4"
          data-testid="settings-notifications-quiet-hours"
          aria-label={N.quietHoursTitle}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <BellOff className="size-4 text-muted-foreground" aria-hidden="true" />
                {N.quietHoursTitle}
              </span>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {N.quietHoursDescription}
              </p>
            </div>
            <Switch
              checked={draft.quietHours.enabled}
              onCheckedChange={(checked) =>
                setDraft((previous) =>
                  previous ? { ...previous, quietHours: { ...previous.quietHours, enabled: checked } } : previous,
                )
              }
              aria-label={N.quietHoursEnabledAria}
              data-testid="settings-notifications-quiet-hours-enabled"
              className="shrink-0"
            />
          </div>
          <div
            className={draft.quietHours.enabled ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2 opacity-50"}
            aria-disabled={!draft.quietHours.enabled}
          >
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground" htmlFor="quiet-hours-from">
                {N.quietHoursFrom}
              </label>
              <Input
                id="quiet-hours-from"
                type="time"
                value={draft.quietHours.from}
                disabled={!draft.quietHours.enabled}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous ? { ...previous, quietHours: { ...previous.quietHours, from: event.target.value } } : previous,
                  )
                }
                className="h-8 w-full font-mono text-xs"
                data-testid="settings-notifications-quiet-hours-from"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground" htmlFor="quiet-hours-to">
                {N.quietHoursTo}
              </label>
              <Input
                id="quiet-hours-to"
                type="time"
                value={draft.quietHours.to}
                disabled={!draft.quietHours.enabled}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous ? { ...previous, quietHours: { ...previous.quietHours, to: event.target.value } } : previous,
                  )
                }
                className="h-8 w-full font-mono text-xs"
                data-testid="settings-notifications-quiet-hours-to"
              />
            </div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <span className="text-sm">{N.quietHoursMuted}</span>
              <span className="flex shrink-0 items-center gap-4">
                {(["push", "email"] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {channelLabels[key]}
                    <Switch
                      size="sm"
                      checked={draft.quietHours.channels[key]}
                      disabled={!draft.quietHours.enabled}
                      onCheckedChange={(checked) =>
                        setDraft((previous) =>
                          previous
                            ? { ...previous, quietHours: { ...previous.quietHours, channels: { ...previous.quietHours.channels, [key]: checked } } }
                            : previous,
                        )
                      }
                      aria-label={`${N.quietHoursMuteAriaPrefix} ${channelLabels[key]}`}
                      data-testid={`settings-notifications-quiet-hours-${key}`}
                    />
                  </label>
                ))}
              </span>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={SH.resetTitle}
        description={N.resetBody}
        confirmLabel={SH.resetConfirm}
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-notifications-reset"
      />
    </SettingsCategoryCard>
  );
}

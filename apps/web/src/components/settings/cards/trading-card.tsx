"use client";

import * as React from "react";
import { toast } from "sonner";
import { CandlestickChart } from "lucide-react";
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
import {
  useAccounts,
  useInstruments,
  usePreferences,
  useResetPreferencesDomain,
  useUpdatePreferencesDomain,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";

/**
 * Trading preferences — DEFAULTS the trade form and session runner open
 * with, never hard limits (enforcement belongs to the Rules Engine).
 * One card = one domain save (PATCH /me/preferences/trading).
 */

const ASSET_CLASSES = ["FOREX", "CRYPTO", "SYNTHETIC", "INDEX", "METAL", "ENERGY"] as const;
const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as const;
const SESSIONS = [
  { value: "ASIA", label: "Asia (00–08 UTC)" },
  { value: "LONDON", label: "London (08–13 UTC)" },
  { value: "LONDON_NY_OVERLAP", label: "London/NY overlap (13–16 UTC)" },
  { value: "NEW_YORK", label: "New York (13–21 UTC)" },
] as const;
const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "NZD", "SGD"] as const;
const POSITION_TYPES = [
  { value: "MARKET", label: "Market" },
  { value: "LIMIT", label: "Limit" },
  { value: "STOP", label: "Stop" },
] as const;

function nullableOptions<T extends string>(values: readonly T[], labels?: Record<string, string>) {
  return [
    { value: "", label: "No default" },
    ...values.map((value) => ({ value, label: labels?.[value] ?? value })),
  ];
}

export function TradingCard() {
  const { data: prefs, isLoading } = usePreferences();
  const accounts = useAccounts();
  const instruments = useInstruments();
  const save = useUpdatePreferencesDomain("trading");
  const resetDomain = useResetPreferencesDomain();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.trading);
  const [resetOpen, setResetOpen] = React.useState(false);

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={5} />;
  }

  const accountOptions = [
    { value: "", label: "No default" },
    ...(accounts.data?.accounts ?? []).map((account) => ({
      value: account.id,
      label: `${account.name} (${account.type})`,
    })),
  ];
  const instrumentOptions = [
    { value: "", label: "No default" },
    ...(instruments.data?.instruments ?? []).map((instrument) => ({
      value: instrument.id,
      label: `${instrument.symbol} — ${instrument.assetClass}`,
    })),
  ];

  const patch = (changes: Partial<UserPreferences["trading"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success("Trading preferences saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save trading preferences")),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "trading" },
      { onSuccess: () => toast.success("Trading preferences reset to defaults") },
    );
  };

  return (
    <SettingsCategoryCard
      icon={CandlestickChart}
      title="Trading preferences"
      description="Pre-fills for the trade form and session runner — defaults, never hard limits."
      testid="settings-trading"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <SettingsRow label="Default account" htmlFor="settings-trading-account">
        <SettingsSelect
          value={draft.defaultAccountId ?? ""}
          onChange={(value) => patch({ defaultAccountId: value === "" ? null : value })}
          options={accountOptions}
          testid="settings-trading-account"
        />
      </SettingsRow>

      <SettingsRow label="Default market" htmlFor="settings-trading-market">
        <SettingsSelect
          value={draft.defaultAssetClass ?? ""}
          onChange={(value) =>
            patch({ defaultAssetClass: value === "" ? null : (value as UserPreferences["trading"]["defaultAssetClass"]) })
          }
          options={nullableOptions(ASSET_CLASSES)}
          testid="settings-trading-market"
        />
      </SettingsRow>

      <SettingsRow label="Default symbol" htmlFor="settings-trading-symbol">
        <SettingsSelect
          value={draft.defaultInstrumentId ?? ""}
          onChange={(value) => patch({ defaultInstrumentId: value === "" ? null : value })}
          options={instrumentOptions}
          testid="settings-trading-symbol"
        />
      </SettingsRow>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label="Timeframe" htmlFor="settings-trading-timeframe">
          <SettingsSelect
            value={draft.defaultTimeframe ?? ""}
            onChange={(value) =>
              patch({ defaultTimeframe: value === "" ? null : (value as UserPreferences["trading"]["defaultTimeframe"]) })
            }
            options={nullableOptions(TIMEFRAMES)}
            testid="settings-trading-timeframe"
          />
        </SettingsRow>
        <SettingsRow label="Session" htmlFor="settings-trading-session">
          <SettingsSelect
            value={draft.defaultSession ?? ""}
            onChange={(value) =>
              patch({ defaultSession: value === "" ? null : (value as UserPreferences["trading"]["defaultSession"]) })
            }
            options={nullableOptions(SESSIONS.map((s) => s.value), Object.fromEntries(SESSIONS.map((s) => [s.value, s.label])))}
            testid="settings-trading-session"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow
          label="Display currency"
          htmlFor="settings-trading-currency"
          hint="Converts P&L display when a trade is in another currency."
        >
          <SettingsSelect
            value={draft.displayCurrency}
            onChange={(value) => patch({ displayCurrency: value as UserPreferences["trading"]["displayCurrency"] })}
            options={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
            testid="settings-trading-currency"
          />
        </SettingsRow>
        <SettingsRow label="Default direction" htmlFor="settings-trading-direction">
          <SettingsSelect
            value={draft.defaultDirection ?? ""}
            onChange={(value) =>
              patch({ defaultDirection: value === "" ? null : (value as UserPreferences["trading"]["defaultDirection"]) })
            }
            options={nullableOptions(["BUY", "SELL"] as const)}
            testid="settings-trading-direction"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label="Default position type" htmlFor="settings-trading-position-type">
          <SettingsSelect
            value={draft.defaultPositionType ?? ""}
            onChange={(value) =>
              patch({ defaultPositionType: value === "" ? null : (value as UserPreferences["trading"]["defaultPositionType"]) })
            }
            options={nullableOptions(POSITION_TYPES.map((p) => p.value), Object.fromEntries(POSITION_TYPES.map((p) => [p.value, p.label])))}
            testid="settings-trading-position-type"
          />
        </SettingsRow>
        <SettingsRow label="Planned R:R display" htmlFor="settings-trading-rr">
          <SettingsSelect
            value={draft.rrDisplay}
            onChange={(value) => patch({ rrDisplay: value as UserPreferences["trading"]["rrDisplay"] })}
            options={[
              { value: "RATIO", label: "Ratio — 1 : 2" },
              { value: "PERCENT", label: "Percent — +100 %" },
            ]}
            testid="settings-trading-rr"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 border-t border-border pt-4">
        <SettingsRow label="Chart style" htmlFor="settings-trading-chart-style" stacked>
          <SettingsSelect
            value={draft.chart.style}
            onChange={(value) => patch({ chart: { ...draft.chart, style: value as UserPreferences["trading"]["chart"]["style"] } })}
            options={[
              { value: "CANDLES", label: "Candles" },
              { value: "LINE", label: "Line" },
              { value: "AREA", label: "Area" },
            ]}
            testid="settings-trading-chart-style"
          />
        </SettingsRow>
        <ToggleRow
          label="Show volume"
          hint="Volume bars under the entry chart."
          checked={draft.chart.showVolume}
          onChange={(checked) => patch({ chart: { ...draft.chart, showVolume: checked } })}
          testid="settings-trading-chart-volume"
        />
        <ToggleRow
          label="Show grid"
          hint="Price/time grid lines on charts."
          checked={draft.chart.showGrid}
          onChange={(checked) => patch({ chart: { ...draft.chart, showGrid: checked } })}
          testid="settings-trading-chart-grid"
        />
      </div>

      {/* Guardrail — soft-lock the capture form after N violations today */}
      <SettingsRow
        label="Capture guardrail"
        htmlFor="settings-trading-softlock"
        hint="Soft-locks the capture form after N rule violations today — an acknowledgment step, never a hard block."
        stacked
      >
        <SettingsSelect
          value={draft.softLockAfterViolations === null ? "" : String(draft.softLockAfterViolations)}
          onChange={(value) => patch({ softLockAfterViolations: value === "" ? null : Number(value) })}
          options={[
            { value: "", label: "Off" },
            ...[1, 2, 3, 4, 5, 6, 8, 10].map((count) => ({
              value: String(count),
              label: `After ${count} violation${count === 1 ? "" : "s"} today`,
            })),
          ]}
          testid="settings-trading-softlock"
        />
      </SettingsRow>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to defaults?"
        description="Every preference in this card returns to the safe Cosmoz defaults. This cannot be undone."
        confirmLabel="Reset card"
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-trading-reset"
      />
    </SettingsCategoryCard>
  );
}

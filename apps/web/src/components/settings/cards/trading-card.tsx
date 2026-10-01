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
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Trading preferences — DEFAULTS the trade form and session runner open
 * with, never hard limits (enforcement belongs to the Rules Engine).
 * One card = one domain save (PATCH /me/preferences/trading).
 * Machine values stay module-scope (ASSET_CLASSES/TIMEFRAMES/CURRENCIES are
 * rendered verbatim — format-like tokens identical across locales); the
 * SESSIONS/POSITION_TYPES labels live in dict.settings.trading and resolve
 * at render time.
 */

const ASSET_CLASSES = ["FOREX", "CRYPTO", "SYNTHETIC", "INDEX", "METAL", "ENERGY"] as const;
const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as const;
const SESSIONS = ["ASIA", "LONDON", "LONDON_NY_OVERLAP", "NEW_YORK"] as const;
const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "NZD", "SGD"] as const;
const POSITION_TYPES = ["MARKET", "LIMIT", "STOP"] as const;

function nullableOptions<T extends string>(
  values: readonly T[],
  labels: Record<string, string> | undefined,
  noDefaultLabel: string,
) {
  return [
    { value: "", label: noDefaultLabel },
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
  const { dict } = useI18n();
  const L = dict.settings.trading;
  const SH = dict.settings.shared;

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={5} />;
  }

  const accountOptions = [
    { value: "", label: L.noDefault },
    ...(accounts.data?.accounts ?? []).map((account) => ({
      value: account.id,
      label: `${account.name} (${account.type})`,
    })),
  ];
  const instrumentOptions = [
    { value: "", label: L.noDefault },
    ...(instruments.data?.instruments ?? []).map((instrument) => ({
      value: instrument.id,
      label: `${instrument.symbol} — ${instrument.assetClass}`,
    })),
  ];

  const patch = (changes: Partial<UserPreferences["trading"]>) =>
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
      { domain: "trading" },
      { onSuccess: () => toast.success(L.toastReset) },
    );
  };

  return (
    <SettingsCategoryCard
      icon={CandlestickChart}
      title={L.title}
      description={L.description}
      testid="settings-trading"
      dirty={dirty}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      <SettingsRow label={L.defaultAccountLabel} htmlFor="settings-trading-account">
        <SettingsSelect
          value={draft.defaultAccountId ?? ""}
          onChange={(value) => patch({ defaultAccountId: value === "" ? null : value })}
          options={accountOptions}
          testid="settings-trading-account"
        />
      </SettingsRow>

      <SettingsRow label={L.defaultMarketLabel} htmlFor="settings-trading-market">
        <SettingsSelect
          value={draft.defaultAssetClass ?? ""}
          onChange={(value) =>
            patch({ defaultAssetClass: value === "" ? null : (value as UserPreferences["trading"]["defaultAssetClass"]) })
          }
          options={nullableOptions(ASSET_CLASSES, undefined, L.noDefault)}
          testid="settings-trading-market"
        />
      </SettingsRow>

      <SettingsRow label={L.defaultSymbolLabel} htmlFor="settings-trading-symbol">
        <SettingsSelect
          value={draft.defaultInstrumentId ?? ""}
          onChange={(value) => patch({ defaultInstrumentId: value === "" ? null : value })}
          options={instrumentOptions}
          testid="settings-trading-symbol"
        />
      </SettingsRow>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label={L.timeframeLabel} htmlFor="settings-trading-timeframe">
          <SettingsSelect
            value={draft.defaultTimeframe ?? ""}
            onChange={(value) =>
              patch({ defaultTimeframe: value === "" ? null : (value as UserPreferences["trading"]["defaultTimeframe"]) })
            }
            options={nullableOptions(TIMEFRAMES, undefined, L.noDefault)}
            testid="settings-trading-timeframe"
          />
        </SettingsRow>
        <SettingsRow label={L.sessionLabel} htmlFor="settings-trading-session">
          <SettingsSelect
            value={draft.defaultSession ?? ""}
            onChange={(value) =>
              patch({ defaultSession: value === "" ? null : (value as UserPreferences["trading"]["defaultSession"]) })
            }
            options={nullableOptions(SESSIONS, L.sessions, L.noDefault)}
            testid="settings-trading-session"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow
          label={L.currencyLabel}
          htmlFor="settings-trading-currency"
          hint={L.currencyHint}
        >
          <SettingsSelect
            value={draft.displayCurrency}
            onChange={(value) => patch({ displayCurrency: value as UserPreferences["trading"]["displayCurrency"] })}
            options={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
            testid="settings-trading-currency"
          />
        </SettingsRow>
        <SettingsRow label={L.directionLabel} htmlFor="settings-trading-direction">
          <SettingsSelect
            value={draft.defaultDirection ?? ""}
            onChange={(value) =>
              patch({ defaultDirection: value === "" ? null : (value as UserPreferences["trading"]["defaultDirection"]) })
            }
            options={nullableOptions(["BUY", "SELL"] as const, undefined, L.noDefault)}
            testid="settings-trading-direction"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label={L.positionTypeLabel} htmlFor="settings-trading-position-type">
          <SettingsSelect
            value={draft.defaultPositionType ?? ""}
            onChange={(value) =>
              patch({ defaultPositionType: value === "" ? null : (value as UserPreferences["trading"]["defaultPositionType"]) })
            }
            options={nullableOptions(POSITION_TYPES, L.positionTypes, L.noDefault)}
            testid="settings-trading-position-type"
          />
        </SettingsRow>
        <SettingsRow label={L.rrLabel} htmlFor="settings-trading-rr">
          <SettingsSelect
            value={draft.rrDisplay}
            onChange={(value) => patch({ rrDisplay: value as UserPreferences["trading"]["rrDisplay"] })}
            options={[
              { value: "RATIO", label: L.rrRatio },
              { value: "PERCENT", label: L.rrPercent },
            ]}
            testid="settings-trading-rr"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 border-t border-border pt-4">
        <SettingsRow label={L.chartStyleLabel} htmlFor="settings-trading-chart-style" stacked>
          <SettingsSelect
            value={draft.chart.style}
            onChange={(value) => patch({ chart: { ...draft.chart, style: value as UserPreferences["trading"]["chart"]["style"] } })}
            options={[
              { value: "CANDLES", label: L.chartCandles },
              { value: "LINE", label: L.chartLine },
              { value: "AREA", label: L.chartArea },
            ]}
            testid="settings-trading-chart-style"
          />
        </SettingsRow>
        <ToggleRow
          label={L.showVolumeLabel}
          hint={L.showVolumeHint}
          checked={draft.chart.showVolume}
          onChange={(checked) => patch({ chart: { ...draft.chart, showVolume: checked } })}
          testid="settings-trading-chart-volume"
        />
        <ToggleRow
          label={L.showGridLabel}
          hint={L.showGridHint}
          checked={draft.chart.showGrid}
          onChange={(checked) => patch({ chart: { ...draft.chart, showGrid: checked } })}
          testid="settings-trading-chart-grid"
        />
      </div>

      {/* Guardrail — soft-lock the capture form after N violations today */}
      <SettingsRow
        label={L.guardrailLabel}
        htmlFor="settings-trading-softlock"
        hint={L.guardrailHint}
        stacked
      >
        <SettingsSelect
          value={draft.softLockAfterViolations === null ? "" : String(draft.softLockAfterViolations)}
          onChange={(value) => patch({ softLockAfterViolations: value === "" ? null : Number(value) })}
          options={[
            { value: "", label: SH.off },
            ...[1, 2, 3, 4, 5, 6, 8, 10].map((count) => ({
              value: String(count),
              label: `${L.guardrailAfterPrefix} ${count} ${count === 1 ? L.violationOne : L.violationMany} ${L.guardrailToday}`,
            })),
          ]}
          testid="settings-trading-softlock"
        />
      </SettingsRow>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={SH.resetTitle}
        description={SH.resetBodyGeneric}
        confirmLabel={SH.resetConfirm}
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-trading-reset"
      />
    </SettingsCategoryCard>
  );
}

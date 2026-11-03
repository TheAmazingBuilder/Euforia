"use client";

import * as React from "react";
import { toast } from "sonner";
import { Gauge, Link2, ShieldCheck } from "lucide-react";
import type { Rule, UserPreferences } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  useCreateRule,
  usePreferences,
  useResetPreferencesDomain,
  useRules,
  useUpdatePreferencesDomain,
  useUpdateRule,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Risk preferences - the NUMBERS the Rules Engine enforces. Saving the card
 * stores the defaults; "Apply limits to Rules Engine" upserts the matching
 * discipline rules (MAX_RISK_PCT_PER_TRADE / MAX_DAILY_LOSS_PCT /
 * MAX_OPEN_POSITIONS) so monitoring, alerts and locks follow instantly.
 * Flow: Settings → Rules Engine → Monitoring / Notifications.
 * Labels live in the dictionary (dict.settings.risk.rules) - the module
 * map stays machine-only (types, severities, units, value getters).
 */

const RISK_RULE_MAPPINGS = [
  {
    type: "MAX_RISK_PCT_PER_TRADE",
    severity: "LOCK",
    valueOf: (risk: UserPreferences["risk"]) => risk.maxRiskPerTradePct,
    unit: "%",
  },
  {
    type: "MAX_DAILY_LOSS_PCT",
    severity: "ALERT",
    valueOf: (risk: UserPreferences["risk"]) => risk.dailyLossLimitPct,
    unit: "%",
  },
  {
    type: "MAX_OPEN_POSITIONS",
    severity: "WARN",
    valueOf: (risk: UserPreferences["risk"]) => risk.maxOpenPositions,
    unit: "",
  },
] as const;

type RiskRuleType = (typeof RISK_RULE_MAPPINGS)[number]["type"];

function findRule(rules: Rule[], type: RiskRuleType): Rule | undefined {
  return rules.find((rule) => rule.type === type);
}

function ruleLimit(rule: Rule | undefined): string {
  const params = rule?.params;
  if (params !== null && typeof params === "object" && !Array.isArray(params) && "limit" in params) {
    const limit = (params as Record<string, unknown>).limit;
    if (typeof limit === "number") return String(limit);
  }
  return "-";
}

export function RiskCard() {
  const { data: prefs, isLoading } = usePreferences();
  const rulesQuery = useRules();
  const save = useUpdatePreferencesDomain("risk");
  const resetDomain = useResetPreferencesDomain();
  const updateRule = useUpdateRule();
  const createRule = useCreateRule();
  const { draft, setDraft, dirty } = useDomainDraft(prefs?.risk);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const { dict } = useI18n();
  const L = dict.settings.risk;
  const SH = dict.settings.shared;

  if (isLoading || !prefs || !draft) {
    return <SettingsCardSkeleton rows={6} />;
  }

  const patch = (changes: Partial<UserPreferences["risk"]>) =>
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));

  // Cross-field validation - mirrors the server-side zod refine.
  const maxBelowDefault = draft.maxRiskPerTradePct < draft.defaultRiskPerTradePct;

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => toast.success(L.toastSaved),
      onError: (error) => toast.error(apiErrorMessage(error, L.toastSaveFailed)),
    });
  };

  const onReset = () => {
    setResetOpen(false);
    resetDomain.mutate(
      { domain: "risk" },
      { onSuccess: () => toast.success(L.toastReset) },
    );
  };

  const rules = rulesQuery.data?.rules ?? [];
  const mappingState = RISK_RULE_MAPPINGS.map((mapping) => {
    const rule = findRule(rules, mapping.type);
    const wanted = String(mapping.valueOf(draft));
    return {
      mapping,
      rule,
      wanted,
      inSync: rule !== undefined && ruleLimit(rule) === wanted,
    };
  });
  const allInSync = mappingState.every((entry) => entry.inSync);

  const applyToRulesEngine = async () => {
    setSyncing(true);
    try {
      for (const { mapping, rule } of mappingState) {
        if (rule === undefined || ruleLimit(rule) !== String(mapping.valueOf(draft))) {
          const params = { limit: mapping.valueOf(draft) };
          if (rule) {
            await updateRule.mutateAsync({ ruleId: rule.id, input: { params } });
          } else {
            await createRule.mutateAsync({
              type: mapping.type,
              params,
              severity: mapping.severity,
              accountId: null,
              isActive: true,
            });
          }
        }
      }
      toast.success(L.toastRulesUpdated, {
        description: L.toastRulesUpdatedDescription,
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, L.toastRulesFailed));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SettingsCategoryCard
      icon={Gauge}
      title={L.title}
      description={L.description}
      testid="settings-risk"
      dirty={dirty && !maxBelowDefault}
      saving={save.isPending}
      onSave={onSave}
      onReset={() => setResetOpen(true)}
    >
      {maxBelowDefault ? (
        <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">
          {L.maxBelowDefault}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow
          label={L.defaultRiskLabel}
          hint={L.defaultRiskHint}
          htmlFor="settings-risk-default"
        >
          <NumberField
            key={`default-${draft.defaultRiskPerTradePct}`}
            value={draft.defaultRiskPerTradePct}
            onChange={(value) => patch({ defaultRiskPerTradePct: value })}
            min={0}
            max={100}
            step={0.25}
            suffix="%"
            testid="settings-risk-default"
          />
        </SettingsRow>
        <SettingsRow
          label={L.maxRiskLabel}
          hint={L.maxRiskHint}
          htmlFor="settings-risk-max"
        >
          <NumberField
            key={`max-${draft.maxRiskPerTradePct}`}
            value={draft.maxRiskPerTradePct}
            onChange={(value) => patch({ maxRiskPerTradePct: value })}
            min={0}
            max={100}
            step={0.25}
            suffix="%"
            testid="settings-risk-max"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SettingsRow label={L.dailyLossLabel} htmlFor="settings-risk-daily">
          <NumberField
            key={`daily-${draft.dailyLossLimitPct}`}
            value={draft.dailyLossLimitPct}
            onChange={(value) => patch({ dailyLossLimitPct: value })}
            min={0}
            max={100}
            step={0.5}
            suffix="%"
            testid="settings-risk-daily"
          />
        </SettingsRow>
        <SettingsRow label={L.weeklyLossLabel} htmlFor="settings-risk-weekly">
          <NumberField
            key={`weekly-${draft.weeklyLossLimitPct}`}
            value={draft.weeklyLossLimitPct}
            onChange={(value) => patch({ weeklyLossLimitPct: value })}
            min={0}
            max={100}
            step={0.5}
            suffix="%"
            testid="settings-risk-weekly"
          />
        </SettingsRow>
        <SettingsRow label={L.monthlyLossLabel} htmlFor="settings-risk-monthly">
          <NumberField
            key={`monthly-${draft.monthlyLossLimitPct}`}
            value={draft.monthlyLossLimitPct}
            onChange={(value) => patch({ monthlyLossLimitPct: value })}
            min={0}
            max={100}
            step={0.5}
            suffix="%"
            testid="settings-risk-monthly"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SettingsRow label={L.maxOpenPositionsLabel} htmlFor="settings-risk-positions">
          <NumberField
            key={`positions-${draft.maxOpenPositions}`}
            value={draft.maxOpenPositions}
            onChange={(value) => patch({ maxOpenPositions: Math.round(value) })}
            min={1}
            max={50}
            step={1}
            testid="settings-risk-positions"
          />
        </SettingsRow>
        <SettingsRow
          label={L.correlatedLabel}
          hint={L.correlatedHint}
          htmlFor="settings-risk-correlated"
        >
          <NumberField
            key={`corr-${draft.maxCorrelatedExposurePct}`}
            value={draft.maxCorrelatedExposurePct}
            onChange={(value) => patch({ maxCorrelatedExposurePct: value })}
            min={0}
            max={100}
            step={1}
            suffix="%"
            testid="settings-risk-correlated"
          />
        </SettingsRow>
        <SettingsRow label={L.exposureLabel} htmlFor="settings-risk-exposure">
          <NumberField
            key={`exp-${draft.maxAccountExposurePct}`}
            value={draft.maxAccountExposurePct}
            onChange={(value) => patch({ maxAccountExposurePct: value })}
            min={0}
            max={100}
            step={1}
            suffix="%"
            testid="settings-risk-exposure"
          />
        </SettingsRow>
      </div>

      <div className="grid gap-4 border-t border-border pt-4">
        <SettingsRow
          label={L.sizingLabel}
          htmlFor="settings-risk-sizing"
          hint={L.sizingHint}
        >
          <SettingsSelect
            value={draft.sizingMethod}
            onChange={(value) => patch({ sizingMethod: value as UserPreferences["risk"]["sizingMethod"] })}
            options={[
              { value: "PERCENT_RISK", label: L.sizingPercentRisk },
              { value: "FIXED_AMOUNT", label: L.sizingFixedAmount },
              { value: "R_BASED", label: L.sizingRBased },
              { value: "MANUAL", label: L.sizingManual },
            ]}
            testid="settings-risk-sizing"
          />
        </SettingsRow>
        {draft.sizingMethod === "FIXED_AMOUNT" ? (
          <SettingsRow
            label={L.fixedAmountLabel}
            htmlFor="settings-risk-fixed-amount"
            hint={L.fixedAmountHint}
          >
            <input
              id="settings-risk-fixed-amount"
              value={draft.fixedRiskAmount ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") return patch({ fixedRiskAmount: null });
                if (/^-?\d+(\.\d+)?$/.test(raw)) patch({ fixedRiskAmount: raw });
              }}
              inputMode="decimal"
              className="h-9 w-28 rounded-md border border-border bg-background px-3 font-mono tabular-nums text-sm text-foreground outline-none transition-colors focus:border-accent"
              data-testid="settings-risk-fixed-amount"
            />
          </SettingsRow>
        ) : null}
        <ToggleRow
          label={L.syncToggleLabel}
          hint={L.syncToggleHint}
          checked={draft.syncWithRulesEngine}
          onChange={(checked) => patch({ syncWithRulesEngine: checked })}
          testid="settings-risk-sync-toggle"
        />
      </div>

      {/* Rules Engine linkage - Settings → Rules → Monitoring/Notifications */}
      <div
        className="grid gap-3 rounded-xl border border-border bg-background/60 p-4"
        data-testid="settings-risk-rules-engine"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
            <span className="text-sm font-semibold">{L.linkageTitle}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void applyToRulesEngine()}
            disabled={!draft.syncWithRulesEngine || syncing || allInSync}
            data-testid="settings-risk-apply"
          >
            <Link2 className="size-3.5" aria-hidden="true" />
            {syncing ? L.applying : L.applyLimits}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {L.linkageNote}
        </p>
        <ul className="grid gap-2">
          {mappingState.map(({ mapping, rule, wanted, inSync }) => (
            <li key={mapping.type} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">{L.rules[mapping.type]}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {L.rulePrefix} {ruleLimit(rule)}
                  {mapping.unit}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[10px]",
                    inSync ? "border-profit/40 text-profit" : "border-warning/50 text-warning",
                  )}
                >
                  {inSync ? L.inSync : `${L.yoursPrefix} ${wanted}${mapping.unit}`}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={SH.resetTitle}
        description={L.resetBody}
        confirmLabel={SH.resetConfirm}
        onConfirm={onReset}
        pending={resetDomain.isPending}
        testid="settings-risk-reset"
      />
    </SettingsCategoryCard>
  );
}

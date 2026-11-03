"use client";

import * as React from "react";
import { toast } from "sonner";
import type {
  MarketCondition,
  PlaybookSession,
  StrategyGrade,
  StrategyStatus,
  Strategy,
  TradingDay,
} from "@cosmoz/shared";
import { PLAYBOOK_COLOR_PALETTE, assetClassSchema } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";
import {
  useCreateStrategy,
  useUpdateStrategy,
} from "@/lib/api/queries";
import {
  ChipToggle,
  dayLabels,
  marketConditionLabels,
  parseTags,
  sessionLabels,
  statusLabels,
  styleLabels,
  toggleInArray,
} from "@/components/playbook/playbook-labels";
/**
 * [New Strategy] / [Edit] dialog: identity (§6), the three markdown rule
 * bodies, grade, color, status - PLUS the professional structured blocks
 * (§7–§13): market profile, market conditions, risk frame and invalidations.
 * One component for both modes.
 */

/** Grade machine values - labels resolve through dict.playbook.strategyForm.grades. */
const GRADE_VALUES: StrategyGrade[] = ["A_PLUS", "A", "B", "C"];

const STATUS_OPTIONS: readonly StrategyStatus[] = ["ACTIVE", "DRAFT", "PAUSED", "RETIRED"];

const ASSET_CLASS_OPTIONS = assetClassSchema.options;

export interface StrategyFormValues {
  name: string;
  description: string;
  entryRules: string;
  exitRules: string;
  riskRules: string;
  grade: StrategyGrade | "none";
  status: StrategyStatus;
  color: string | null;
  // ── professional definition blocks (§6–§13) ──
  tags: string;
  detailedDescription: string;
  assetClass: string; // "" = unspecified
  tradingStyle: string; // "" = unspecified
  timeframe: string;
  symbols: string;
  sessions: PlaybookSession[];
  tradingDays: TradingDay[];
  marketConditions: MarketCondition[];
  defaultRiskPct: string;
  maxRiskPct: string;
  minRR: string;
  stopMethodology: string;
  targetMethodology: string;
  invalidations: string; // one per line
}

const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const orNullNumber = (value: string): number | null => {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

function valuesFromStrategy(strategy: Strategy | null): StrategyFormValues {
  const profile = strategy?.marketProfile ?? null;
  return {
    name: strategy?.name ?? "",
    description: strategy?.description ?? "",
    entryRules: strategy?.entryRules ?? "",
    exitRules: strategy?.exitRules ?? "",
    riskRules: strategy?.riskRules ?? "",
    grade: strategy?.grade ?? "none",
    status: strategy?.status ?? "ACTIVE",
    color: strategy?.color ?? PLAYBOOK_COLOR_PALETTE[0] ?? null,
    tags: (strategy?.tags ?? []).join(", "),
    detailedDescription: strategy?.detailedDescription ?? "",
    assetClass: profile?.assetClass ?? "",
    tradingStyle: profile?.tradingStyle ?? "",
    timeframe: profile?.timeframe ?? "",
    symbols: (profile?.symbols ?? []).join(", "),
    sessions: profile?.sessions ?? [],
    tradingDays: profile?.tradingDays ?? [],
    marketConditions: strategy?.marketConditions ?? [],
    defaultRiskPct: strategy?.risk?.defaultRiskPct !== null && strategy?.risk?.defaultRiskPct !== undefined ? String(strategy.risk.defaultRiskPct) : "",
    maxRiskPct: strategy?.risk?.maxRiskPct !== null && strategy?.risk?.maxRiskPct !== undefined ? String(strategy.risk.maxRiskPct) : "",
    minRR: strategy?.risk?.minRR !== null && strategy?.risk?.minRR !== undefined ? String(strategy.risk.minRR) : "",
    stopMethodology: strategy?.risk?.stopMethodology ?? "",
    targetMethodology: strategy?.risk?.targetMethodology ?? "",
    invalidations: (strategy?.invalidations ?? []).join("\n"),
  };
}

interface StrategyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode. */
  strategy: Strategy | null;
}

export function StrategyFormDialog({ open, onOpenChange, strategy }: StrategyFormDialogProps) {
  const { dict } = useI18n();
  const V = dict.playbook.strategyForm;
  const S = dict.playbook.shared;
  // Enum label maps - built from the dict fragments inside the component.
  const STATUS_LABELS = statusLabels(dict.playbook.labels.status);
  const STYLE_LABELS = styleLabels(dict.playbook.labels.style);
  const SESSION_LABELS = sessionLabels(dict.playbook.labels.session);
  const DAY_LABELS = dayLabels(dict.playbook.labels.day);
  const MARKET_CONDITION_LABELS = marketConditionLabels(dict.playbook.labels.marketCondition);
  const isEdit = strategy !== null;
  const createStrategy = useCreateStrategy();
  const updateStrategy = useUpdateStrategy();
  const [values, setValues] = React.useState<StrategyFormValues>(() => valuesFromStrategy(strategy));

  // Re-hydrate whenever the dialog opens (or the edit target swaps - the
  // caller also remounts by key). Guarded render-time adjustment per the
  // React docs "You might not need an effect" pattern.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(valuesFromStrategy(strategy));
  }

  const patch = (partial: Partial<StrategyFormValues>) =>
    setValues((previous) => ({ ...previous, ...partial }));

  const pending = createStrategy.isPending || updateStrategy.isPending;
  const nameError = values.name.trim() === "" ? V.nameRequired : null;

  const submit = async () => {
    if (nameError !== null) return;

    // Structured blocks are only sent when the trader defined something -
    // a half-empty profile must not erase data on a partial edit.
    const hasProfile =
      values.assetClass !== "" ||
      values.tradingStyle !== "" ||
      values.timeframe.trim() !== "" ||
      values.symbols.trim() !== "" ||
      values.sessions.length > 0 ||
      values.tradingDays.length > 0;
    const marketProfile = hasProfile
      ? {
          assetClass:
            values.assetClass === ""
              ? null
              : (values.assetClass as (typeof ASSET_CLASS_OPTIONS)[number]),
          symbols: values.symbols
            .split(",")
            .map((symbol) => symbol.trim())
            .filter((symbol) => symbol.length > 0),
          market: null,
          accountLabel: null,
          timeframe: orNull(values.timeframe),
          tradingStyle:
            values.tradingStyle === ""
              ? null
              : (values.tradingStyle as NonNullable<Strategy["marketProfile"]>["tradingStyle"]),
          sessions: values.sessions,
          tradingDays: values.tradingDays,
        }
      : null;
    const riskFields = {
      defaultRiskPct: orNullNumber(values.defaultRiskPct),
      maxRiskPct: orNullNumber(values.maxRiskPct),
      minRR: orNullNumber(values.minRR),
      stopMethodology: orNull(values.stopMethodology),
      targetMethodology: orNull(values.targetMethodology),
    };
    const hasRisk = Object.values(riskFields).some((value) => value !== null);
    const risk = hasRisk
      ? {
          defaultRiskPct: riskFields.defaultRiskPct,
          maxRiskPct: riskFields.maxRiskPct,
          fixedRiskAmount: null,
          stopMethodology: riskFields.stopMethodology,
          targetMethodology: riskFields.targetMethodology,
          minRR: riskFields.minRR,
          maxConcurrentTrades: null,
          maxCorrelatedExposure: null,
          dailyRiskRestriction: null,
          newsRestriction: null,
        }
      : null;

    const payload = {
      name: values.name.trim(),
      description: values.description.trim() === "" ? null : values.description,
      entryRules: values.entryRules.trim() === "" ? null : values.entryRules,
      exitRules: values.exitRules.trim() === "" ? null : values.exitRules,
      riskRules: values.riskRules.trim() === "" ? null : values.riskRules,
      grade: values.grade === "none" ? null : values.grade,
      status: values.status,
      color: values.color,
      tags: parseTags(values.tags),
      detailedDescription: orNull(values.detailedDescription),
      marketProfile,
      marketConditions: values.marketConditions,
      invalidations: values.invalidations
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
      risk,
    };
    try {
      if (isEdit && strategy !== null) {
        await updateStrategy.mutateAsync({ strategyId: strategy.id, input: payload });
        toast.success(V.toastUpdated, {
          description: V.toastUpdatedDesc,
        });
      } else {
        await createStrategy.mutateAsync(payload);
        toast.success(V.toastCreated, { description: payload.name });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(isEdit ? V.toastUpdateFailed : V.toastCreateFailed, {
        description: apiErrorMessage(error, S.unexpectedError),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-semibold">
            {isEdit ? V.editTitle : V.createTitle}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? V.editDesc : V.createDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="strategy-name">{V.nameLabel}</Label>
            <Input
              id="strategy-name"
              value={values.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder={V.namePlaceholder}
              aria-invalid={nameError !== null}
              autoFocus
            />
            {nameError !== null ? (
              <p className="text-xs text-loss">{nameError}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="strategy-description">{V.descriptionLabel}</Label>
            <Textarea
              id="strategy-description"
              value={values.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder={V.descriptionPlaceholder}
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="strategy-grade">{V.gradeLabel}</Label>
              <Select
                value={values.grade}
                onValueChange={(next) => patch({ grade: next as StrategyGrade | "none" })}
              >
                <SelectTrigger id="strategy-grade" aria-label={V.gradeAria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{V.ungraded}</SelectItem>
                  {GRADE_VALUES.map((grade) => (
                    <SelectItem key={grade} value={grade}>
                      {V.grades[grade]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="strategy-status">{V.statusLabel}</Label>
              <Select
                value={values.status}
                onValueChange={(next) => patch({ status: next as StrategyStatus })}
              >
                <SelectTrigger id="strategy-status" aria-label={V.statusAria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-foreground">{V.colorLegend}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={V.colorAria}>
              {PLAYBOOK_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={values.color === color}
                  aria-label={`${V.colorSwatchPrefix} ${color}`}
                  onClick={() => patch({ color })}
                  className={cn(
                    "size-7 rounded-full border-2 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring",
                    values.color === color
                      ? "scale-110 border-foreground"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </fieldset>

          {/* ── Professional definition (§6–§13) ─────────────────────────────── */}
          <fieldset className="space-y-3 rounded-lg border border-border bg-surface-raised/50 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {V.profileLegend}
            </legend>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="strategy-tags">{V.tagsLabel}</Label>
                <Input
                  id="strategy-tags"
                  value={values.tags}
                  onChange={(event) => patch({ tags: event.target.value })}
                  placeholder={V.tagsPlaceholder}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="strategy-timeframe">{V.timeframeLabel}</Label>
                <Input
                  id="strategy-timeframe"
                  value={values.timeframe}
                  onChange={(event) => patch({ timeframe: event.target.value })}
                  placeholder={V.timeframePlaceholder}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="strategy-asset-class">{V.assetClassLabel}</Label>
                <Select
                  value={values.assetClass}
                  onValueChange={(next) => patch({ assetClass: next })}
                >
                  <SelectTrigger id="strategy-asset-class" aria-label={V.assetClassAria}>
                    <SelectValue placeholder={V.assetClassAny} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{V.assetClassAny}</SelectItem>
                    {ASSET_CLASS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="strategy-style">{V.styleLabel}</Label>
                <Select
                  value={values.tradingStyle}
                  onValueChange={(next) => patch({ tradingStyle: next })}
                >
                  <SelectTrigger id="strategy-style" aria-label={V.styleAria}>
                    <SelectValue placeholder={V.styleAny} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{V.styleAny}</SelectItem>
                    {Object.entries(STYLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="strategy-symbols">{V.symbolsLabel}</Label>
                <Input
                  id="strategy-symbols"
                  value={values.symbols}
                  onChange={(event) => patch({ symbols: event.target.value })}
                  placeholder={V.symbolsPlaceholder}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{V.sessionsLabel}</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SESSION_LABELS).map(([value, label]) => (
                  <ChipToggle
                    key={value}
                    selected={values.sessions.includes(value as PlaybookSession)}
                    onClick={() =>
                      patch({
                        sessions: toggleInArray(values.sessions, value as PlaybookSession),
                      })
                    }
                  >
                    {label}
                  </ChipToggle>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{V.daysLabel}</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(DAY_LABELS).map(([value, label]) => (
                  <ChipToggle
                    key={value}
                    selected={values.tradingDays.includes(value as TradingDay)}
                    onClick={() =>
                      patch({
                        tradingDays: toggleInArray(values.tradingDays, value as TradingDay),
                      })
                    }
                  >
                    {label}
                  </ChipToggle>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{V.conditionsLabel}</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(MARKET_CONDITION_LABELS).map(([value, label]) => (
                  <ChipToggle
                    key={value}
                    selected={values.marketConditions.includes(value as MarketCondition)}
                    onClick={() =>
                      patch({
                        marketConditions: toggleInArray(
                          values.marketConditions,
                          value as MarketCondition,
                        ),
                      })
                    }
                  >
                    {label}
                  </ChipToggle>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="risk-default">{V.defaultRiskLabel}</Label>
                <Input
                  id="risk-default"
                  inputMode="decimal"
                  value={values.defaultRiskPct}
                  onChange={(event) => patch({ defaultRiskPct: event.target.value })}
                  placeholder={V.defaultRiskPlaceholder}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="risk-max">{V.maxRiskLabel}</Label>
                <Input
                  id="risk-max"
                  inputMode="decimal"
                  value={values.maxRiskPct}
                  onChange={(event) => patch({ maxRiskPct: event.target.value })}
                  placeholder={V.maxRiskPlaceholder}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="risk-minrr">{V.minRRLabel}</Label>
                <Input
                  id="risk-minrr"
                  inputMode="decimal"
                  value={values.minRR}
                  onChange={(event) => patch({ minRR: event.target.value })}
                  placeholder={V.minRRPlaceholder}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="risk-stop">{V.stopLabel}</Label>
                <Input
                  id="risk-stop"
                  value={values.stopMethodology}
                  onChange={(event) => patch({ stopMethodology: event.target.value })}
                  placeholder={V.stopPlaceholder}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="risk-target">{V.targetLabel}</Label>
                <Input
                  id="risk-target"
                  value={values.targetMethodology}
                  onChange={(event) => patch({ targetMethodology: event.target.value })}
                  placeholder={V.targetPlaceholder}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="strategy-invalidations">{V.invalidationsLabel}</Label>
              <Textarea
                id="strategy-invalidations"
                rows={3}
                value={values.invalidations}
                onChange={(event) => patch({ invalidations: event.target.value })}
                placeholder={V.invalidationsPlaceholder}
                className="border-loss/30 focus-visible:ring-loss/30"
              />
              <p className="text-[11px] text-muted-foreground">
                {V.invalidationsHint}
              </p>
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="strategy-detailed">{V.detailedLabel}</Label>
            <Textarea
              id="strategy-detailed"
              value={values.detailedDescription}
              onChange={(event) => patch({ detailedDescription: event.target.value })}
              placeholder={V.detailedPlaceholder}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="strategy-entry">{V.entryLabel}</Label>
            <Textarea
              id="strategy-entry"
              value={values.entryRules}
              onChange={(event) => patch({ entryRules: event.target.value })}
              placeholder={V.entryPlaceholder}
              rows={4}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-exit">{V.exitLabel}</Label>
            <Textarea
              id="strategy-exit"
              value={values.exitRules}
              onChange={(event) => patch({ exitRules: event.target.value })}
              placeholder={V.exitPlaceholder}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-risk">{V.riskLabel}</Label>
            <Textarea
              id="strategy-risk"
              value={values.riskRules}
              onChange={(event) => patch({ riskRules: event.target.value })}
              placeholder={V.riskPlaceholder}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {S.cancel}
          </Button>
          <Button onClick={() => void submit()} disabled={pending || nameError !== null}>
            {isEdit ? S.saveChanges : V.createBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

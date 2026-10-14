"use client";

import * as React from "react";
import { Info, RotateCcw } from "lucide-react";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
  RR_EXTRA_RATIOS,
  type Currency,
} from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  validateRiskRewardForm,
  type RiskRewardField,
  type RiskRewardFieldErrors,
  type RiskRewardFormValues,
  type RatioMode,
} from "./risk-reward-model";
import type { RRExpectancyResult } from "@cosmoz/shared";
import { CalculatorField, CopyButton, PresetChips, ToolCard } from "./calculator-shared";

/**
 * Risk/Reward Calculator & Win Rate Cheat Sheet (TOOLS section) — spec-driven
 * expectancy workspace. Everything computes LIVE on every input change (§9)
 * through the shared risk-reward engine: no Calculate button, no backend.
 *
 * Section A — reactive calculator (balance, % / fixed risk, R multiple or
 *   monetary SL/TP amounts, trade count) with a nine-metric live summary.
 * Section B — the color-coded win-rate matrix: rows = reward multiples,
 *   columns = win rates, every cell independently computed (classification +
 *   exact theoretical net result) with an accessible detail tooltip.
 *
 * Fixed-risk, non-compounding, cost-free model — stated in the UI, never
 * presented as a performance promise.
 */

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "NZD", "SGD"];
const BALANCE_PRESETS = ["100", "500", "1000", "5000", "10000"] as const;
const RISK_PERCENT_PRESETS = ["0.5", "1", "2", "3", "5"] as const;
const FIXED_RISK_PRESETS = ["10", "20", "50", "100", "200"] as const;
const RATIO_PRESETS = ["1", "2", "3", "4", "5"] as const;
const TRADES_PRESETS = ["10", "50", "100", "500", "1000"] as const;

const INITIAL_VALUES: RiskRewardFormValues = {
  balance: "1000",
  currency: "USD",
  riskMode: "percent",
  riskPercent: "2",
  fixedRisk: "20",
  ratioMode: "multiple",
  rewardMultiple: "3",
  stopLossAmount: "20",
  takeProfitAmount: "60",
  trades: "100",
};

/** Two-option segmented toggle — the risk / ratio mode switchers. */
function ModeToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  name,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="ledger-label">{label}</span>
      <div className="flex gap-1.5" role="group" aria-label={label} data-testid={`${name}-mode`}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One interactive matrix cell with its accessible detail tooltip (§7.5). */
function MatrixCell({
  winRatePercent,
  rewardMultiple,
  expectancy,
  currency,
  breakEvenWinRate,
  labels,
}: {
  winRatePercent: number;
  rewardMultiple: number;
  expectancy: RRExpectancyResult;
  currency: Currency;
  breakEvenWinRate: number;
  labels: {
    outcomes: Record<RRExpectancyResult["outcome"], string>;
    detail: {
      wins: string;
      losses: string;
      grossProfit: string;
      grossLoss: string;
      net: string;
      breakEven: string;
      delta: string;
      deltaPositive: string;
      deltaNegative: string;
      deltaZero: string;
    };
  };
}) {
  const { dict } = useI18n();
  const T = dict.tools.riskReward;
  const outcome = expectancy.outcome;
  const marginPoints = (winRatePercent / 100 - breakEvenWinRate) * 100;
  const deltaLabel =
    marginPoints > 0 ? labels.detail.deltaPositive : marginPoints < 0 ? labels.detail.deltaNegative : labels.detail.deltaZero;

  const detail = (
    <div className="min-w-56 space-y-1.5 text-left" data-testid={`rr-detail-${rewardMultiple}-${winRatePercent}`}>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide">
        {labels.detail.title} — {winRatePercent}% · 1:{formatNumber(rewardMultiple, rewardMultiple % 1 === 0 ? 0 : 2)}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
        <span className="text-muted-foreground">{labels.detail.wins}</span>
        <span className="text-right">{formatNumber(expectancy.wins, 1)}</span>
        <span className="text-muted-foreground">{labels.detail.losses}</span>
        <span className="text-right">{formatNumber(expectancy.losses, 1)}</span>
        <span className="text-muted-foreground">{labels.detail.grossProfit}</span>
        <span className="text-right text-profit">{formatSignedMoney(expectancy.grossProfit, currency)}</span>
        <span className="text-muted-foreground">{labels.detail.grossLoss}</span>
        <span className="text-right text-loss">-{formatMoney(Math.abs(expectancy.grossLoss), currency)}</span>
        <span className="text-muted-foreground">{labels.detail.net}</span>
        <span
          className={cn(
            "text-right font-semibold",
            outcome === "profit" && "text-profit",
            outcome === "loss" && "text-loss",
          )}
        >
          {outcome === "breakeven"
            ? formatMoney(expectancy.netDecimal, currency)
            : formatSignedMoney(expectancy.netDecimal, currency)}
        </span>
        <span className="text-muted-foreground">{labels.detail.breakEven}</span>
        <span className="text-right">{formatPercent(breakEvenWinRate, 2)}</span>
        <span className="text-muted-foreground">{labels.detail.delta}</span>
        <span className={cn("text-right", marginPoints > 0 && "text-profit", marginPoints < 0 && "text-loss")}>
          {marginPoints > 0 ? "+" : ""}
          {formatNumber(marginPoints, 1)} pts {deltaLabel}
        </span>
      </div>
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={`rr-cell-${rewardMultiple}-${winRatePercent}`}
          aria-label={`${T.detail.title}: ${T.matrix.winRate} ${winRatePercent}%, ${T.matrix.ratio} 1:${formatNumber(rewardMultiple, rewardMultiple % 1 === 0 ? 0 : 2)} — ${labels.outcomes[outcome]}`}
          className={cn("rr-cell w-full", `rr-cell-${outcome}`)}
        >
          <span className="rr-cell-label">{labels.outcomes[outcome]}</span>
          <span className="rr-cell-amount">
            {outcome === "breakeven"
              ? formatMoney(expectancy.netDecimal, currency)
              : formatSignedMoney(expectancy.netDecimal, currency)}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-surface-raised text-foreground shadow-lg">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}

/** Multi-select toggle chips for the optional matrix rows (1:6 / 1:8 / 1:10). */
function ExtraRatioToggles({
  label,
  ratios,
  selected,
  onToggle,
}: {
  label: string;
  ratios: readonly number[];
  selected: readonly number[];
  onToggle: (ratio: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="ledger-label">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {ratios.map((ratio) => {
          const active = selected.includes(ratio);
          return (
            <button
              key={ratio}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(ratio)}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              1:{ratio}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RiskRewardCalculator() {
  const { dict } = useI18n();
  const T = dict.tools.riskReward;

  const [values, setValues] = React.useState<RiskRewardFormValues>(INITIAL_VALUES);
  const [extraRatios, setExtraRatios] = React.useState<readonly number[]>([]);

  const set = (field: keyof RiskRewardFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  // Live derivation — every keystroke revalidates and recomputes (§9).
  const derived = React.useMemo(
    () => validateRiskRewardForm(values, extraRatios),
    [values, extraRatios],
  );
  const errors: RiskRewardFieldErrors = derived.ok ? {} : derived.errors;
  const data = derived.ok ? derived.data : null;
  const model = derived.ok ? derived.derived : null;
  const currency = values.currency;

  const errorFor = (field: RiskRewardField): string | null =>
    errors[field] ? T.validation[errors[field]!] : null;

  const toggleExtraRatio = (ratio: number) =>
    setExtraRatios((prev) =>
      prev.includes(ratio) ? prev.filter((r) => r !== ratio) : [...prev, ratio],
    );

  const ratioLabel = (ratio: number) => formatNumber(ratio, ratio % 1 === 0 ? 0 : 2);

  const copyPayload = React.useMemo(() => {
    if (!model || !data) return "";
    return [
      `Risk/Reward — ${formatMoney(data.balance, currency)} · risk ${formatMoney(model.riskAmount, currency)} · 1:${ratioLabel(model.rewardMultiple)} · ${model.trades} trades`,
      `Reward per winner: ${formatMoney(model.rewardAmount, currency)}`,
      `Break-even win rate: ${formatPercent(model.breakEvenWinRate, 2)}`,
      `Risk of balance: ${formatPercent(model.riskPercentOfBalance, 2)} · Reward of balance: ${formatPercent(model.rewardPercentOfBalance, 2)}`,
      T.matrix.assumption,
    ].join("\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, data, currency, T]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* ── Section A — inputs ─────────────────────────────────────── */}
        <ToolCard
          title={T.form.section}
          className="lg:col-span-5"
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setValues(INITIAL_VALUES);
                setExtraRatios([]);
              }}
              className="gap-1.5 text-muted-foreground"
              data-testid="rr-reset"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {T.form.reset}
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <CalculatorField
                id="rr-balance"
                label={T.form.balance}
                value={values.balance}
                onChange={set("balance")}
                error={errorFor("balance")}
                placeholder="1000"
                testId="rr-balance"
              />
              <div className="space-y-1.5">
                <label htmlFor="rr-currency" className="text-xs font-medium text-muted-foreground">
                  {T.form.currency}
                </label>
                <Select
                  value={currency}
                  onValueChange={(v) => setValues((prev) => ({ ...prev, currency: v as Currency }))}
                >
                  <SelectTrigger
                    id="rr-currency"
                    size="default"
                    aria-label={T.form.currency}
                    className="h-10 w-24 font-mono"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code} className="font-mono">
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ModeToggle
              name="rr-risk"
              label={T.form.riskMode}
              value={values.riskMode}
              onChange={(mode) => setValues((prev) => ({ ...prev, riskMode: mode }))}
              options={[
                { value: "percent", label: T.form.riskPercent },
                { value: "fixed", label: T.form.fixedRisk },
              ]}
            />

            {values.riskMode === "percent" ? (
              <>
                <CalculatorField
                  id="rr-risk-percent"
                  label={T.form.riskPercent}
                  value={values.riskPercent}
                  onChange={set("riskPercent")}
                  error={errorFor("riskPercent")}
                  placeholder="2"
                  suffix="%"
                  testId="rr-risk-percent"
                />
                <PresetChips
                  label={T.form.presetsRisk}
                  presets={RISK_PERCENT_PRESETS.map((value) => ({ label: `${value}%`, value }))}
                  activeValue={values.riskPercent}
                  onSelect={set("riskPercent")}
                  ariaLabel={T.form.presetsRisk}
                />
              </>
            ) : (
              <>
                <CalculatorField
                  id="rr-fixed-risk"
                  label={T.form.fixedRisk}
                  value={values.fixedRisk}
                  onChange={set("fixedRisk")}
                  error={errorFor("fixedRisk")}
                  placeholder="20"
                  testId="rr-fixed-risk"
                />
                <PresetChips
                  label={T.form.presetsRisk}
                  presets={FIXED_RISK_PRESETS.map((value) => ({ label: formatNumber(Number(value), 0), value }))}
                  activeValue={values.fixedRisk}
                  onSelect={set("fixedRisk")}
                  ariaLabel={T.form.presetsRisk}
                />
              </>
            )}

            <ModeToggle
              name="rr-ratio"
              label={T.form.ratioMode}
              value={values.ratioMode}
              onChange={(mode: RatioMode) => setValues((prev) => ({ ...prev, ratioMode: mode }))}
              options={[
                { value: "multiple", label: T.form.ratioModeMultiple },
                { value: "amounts", label: T.form.ratioModeAmounts },
              ]}
            />

            {values.ratioMode === "multiple" ? (
              <CalculatorField
                id="rr-multiple"
                label={T.form.rewardMultiple}
                value={values.rewardMultiple}
                onChange={set("rewardMultiple")}
                error={errorFor("rewardMultiple")}
                placeholder="3"
                hint={T.form.rewardMultipleHint}
                testId="rr-multiple"
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <CalculatorField
                  id="rr-stop-amount"
                  label={T.form.stopLossAmount}
                  value={values.stopLossAmount}
                  onChange={set("stopLossAmount")}
                  error={errorFor("stopLossAmount")}
                  placeholder="20"
                  hint={T.form.amountsHint}
                  testId="rr-stop-amount"
                />
                <CalculatorField
                  id="rr-target-amount"
                  label={T.form.takeProfitAmount}
                  value={values.takeProfitAmount}
                  onChange={set("takeProfitAmount")}
                  error={errorFor("takeProfitAmount")}
                  placeholder="60"
                  testId="rr-target-amount"
                />
              </div>
            )}
            {values.ratioMode === "multiple" ? (
              <PresetChips
                label={T.form.presetsRatio}
                presets={RATIO_PRESETS.map((value) => ({ label: `1:${value}`, value }))}
                activeValue={values.rewardMultiple}
                onSelect={set("rewardMultiple")}
                ariaLabel={T.form.presetsRatio}
              />
            ) : null}

            <CalculatorField
              id="rr-trades"
              label={T.form.trades}
              value={values.trades}
              onChange={set("trades")}
              error={errorFor("trades")}
              placeholder="100"
              hint={T.form.tradesHint}
              testId="rr-trades"
            />
            <PresetChips
              label={T.form.presetsTrades}
              presets={TRADES_PRESETS.map((value) => ({ label: formatNumber(Number(value), 0), value }))}
              activeValue={values.trades}
              onSelect={set("trades")}
              ariaLabel={T.form.presetsTrades}
            />
            <p className="text-[11px] text-muted-foreground/80">{T.form.presetsNote}</p>
          </div>
        </ToolCard>

        {/* ── Section A — live summary ───────────────────────────────── */}
        <section
          className="rounded-xl border border-border bg-surface lg:col-span-7"
          data-testid="rr-summary"
          aria-live="polite"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="ledger-label">{T.summary.kicker}</h2>
            {copyPayload ? (
              <CopyButton payload={copyPayload} labels={{ copy: T.copy.summary, copied: T.copy.copied }} testId="rr-copy" />
            ) : null}
          </header>
          {model && data ? (
            <div className="stat-strip rounded-none border-0">
              <div className="stat-cell stat-hero">
                <p className="ledger-label">{T.summary.riskPerTrade}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-loss sm:text-4xl">
                  -{formatMoney(model.riskAmount, currency)}
                </p>
                <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                  {data.riskMode === "percent"
                    ? `${formatPercent(Number(values.riskPercent) / 100, 2)} × ${formatMoney(data.balance, currency)}`
                    : T.form.fixedRisk}
                </p>
              </div>
              <div className="stat-cell stat-hero">
                <p className="ledger-label">{T.summary.rewardPerTrade}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-profit sm:text-4xl">
                  +{formatMoney(model.rewardAmount, currency)}
                </p>
                <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                  {T.summary.ratio} 1:{ratioLabel(model.rewardMultiple)}
                </p>
              </div>
              <div className="stat-cell stat-kpi">
                <p className="ledger-label">{T.summary.breakEven}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {formatPercent(model.breakEvenWinRate, 2)}
                </p>
              </div>
              <div className="stat-cell stat-kpi">
                <p className="ledger-label">{T.summary.ratio}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-foreground">
                  1:{ratioLabel(model.rewardMultiple)}
                </p>
              </div>
              <div className="stat-cell stat-kpi">
                <p className="ledger-label">{T.summary.riskOfBalance}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {formatPercent(model.riskPercentOfBalance, 2)}
                </p>
              </div>
              <div className="stat-cell stat-kpi">
                <p className="ledger-label">{T.summary.rewardOfBalance}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {formatPercent(model.rewardPercentOfBalance, 2)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-48 items-center justify-center px-6">
              <p className="max-w-xs text-center text-sm leading-relaxed text-muted-foreground">{T.matrix.empty}</p>
            </div>
          )}
        </section>
      </div>

      {/* ── Section B — Win Rate Cheat Sheet matrix ──────────────────── */}
      {model && data ? (
        <ToolCard
          title={T.matrix.title}
          action={
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              N = {formatNumber(model.trades, 0)} · {T.form.balance} {formatMoney(data.balance, currency)}
            </span>
          }
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{T.matrix.hint}</p>
            <ExtraRatioToggles
              label={T.form.extraRatios}
              ratios={RR_EXTRA_RATIOS}
              selected={extraRatios}
              onToggle={toggleExtraRatio}
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/70 bg-surface px-1.5 py-1.5" data-testid="rr-matrix">
            <TooltipProvider delayDuration={120}>
              <table className="rr-table">
                <caption className="sr-only">{T.matrix.title}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="rr-colhead rr-sticky" aria-label={T.matrix.ratio}>
                      {T.matrix.ratio}
                    </th>
                    {model.winRates.map((winRate) => (
                      <th key={winRate} scope="col" className="rr-colhead">
                        {winRate}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.matrix.map((row) => (
                    <tr key={row.rewardMultiple}>
                      <th scope="row" className="rr-rowhead rr-sticky">
                        <span className="rr-ratio">1:{ratioLabel(row.rewardMultiple)}</span>
                      </th>
                      {row.cells.map((cell) =>
                        cell.expectancy ? (
                          <td key={`${row.rewardMultiple}-${cell.winRatePercent}`}>
                            <MatrixCell
                              winRatePercent={cell.winRatePercent}
                              rewardMultiple={cell.rewardMultiple}
                              expectancy={cell.expectancy}
                              currency={currency}
                              breakEvenWinRate={model.breakEvenWinRate}
                              labels={{
                                outcomes: {
                                  loss: T.outcomes.loss,
                                  breakeven: T.outcomes.breakeven,
                                  profit: T.outcomes.profit,
                                },
                                detail: {
                                  title: T.detail.title,
                                  wins: T.detail.wins,
                                  losses: T.detail.losses,
                                  grossProfit: T.detail.grossProfit,
                                  grossLoss: T.detail.grossLoss,
                                  net: T.detail.net,
                                  breakEven: T.detail.breakEven,
                                  delta: T.detail.delta,
                                  deltaPositive: T.detail.deltaPositive,
                                  deltaNegative: T.detail.deltaNegative,
                                  deltaZero: T.detail.deltaZero,
                                },
                              }}
                            />
                          </td>
                        ) : (
                          <td key={`${row.rewardMultiple}-${cell.winRatePercent}`} className="rr-cell text-muted-foreground">
                            —
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TooltipProvider>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground/80">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {T.matrix.assumption}
          </p>
        </ToolCard>
      ) : (
        <ToolCard title={T.matrix.title}>
          <div className="flex min-h-40 items-center justify-center px-6">
            <p className="max-w-xs text-center text-sm leading-relaxed text-muted-foreground">{T.matrix.empty}</p>
          </div>
        </ToolCard>
      )}

      {/* ── How it works + disclaimer — compact, never dominant ──────── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ToolCard title={T.how.title}>
          <ol className="space-y-1.5">
            {[T.how.line1, T.how.line2, T.how.line3].map((line, index) => (
              <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                <span className="ledger-label mt-0.5">{index + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </ToolCard>
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground md:col-span-1">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {T.disclaimer}
        </p>
      </div>
    </div>
  );
}

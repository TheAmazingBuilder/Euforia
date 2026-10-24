"use client";

import * as React from "react";
import { ChevronDown, Info } from "lucide-react";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatPrice,
  type Currency,
} from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateLotSize,
  validateLotSizeForm,
  type LotSizeFieldErrors,
  type LotSizeField,
  type LotSizeFormValues,
  type LotSizeResult,
} from "./calculator-model";
import {
  CUSTOM_INSTRUMENT,
  INSTRUMENT_PRESETS,
  findInstrumentPreset,
} from "./instrument-presets";
import {
  BreakdownLedger,
  CalculatorField,
  CopyButton,
  PresetChips,
  ToolCard,
  type BreakdownRowData,
} from "./calculator-shared";

/**
 * Lot Size Calculator (TOOLS section) - risk-budget position sizing with the
 * broker-step model: balance × risk% → size floored to the volume step, with
 * the full breakdown (§16) and an explicit status (§17, nothing clamps
 * silently). Pure client math through calculator-model + shared risk utils -
 * no backend, no execution.
 */

const RISK_PRESETS = [
  { label: "0.25%", value: "0.25" },
  { label: "0.5%", value: "0.5" },
  { label: "1%", value: "1" },
  { label: "1.5%", value: "1.5" },
  { label: "2%", value: "2" },
] as const;

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "NZD", "SGD"];

const INITIAL_VALUES: LotSizeFormValues = {
  instrument: "XAUUSD",
  direction: "BUY",
  balance: "10000",
  riskPercent: "1",
  entryPrice: "",
  stopLoss: "",
  takeProfit: "",
  pipSize: "0.01",
  contractSize: "100",
  volumeStep: "0.01",
};

/** Price display digits: preset digits; custom derives from the pip size. */
function priceDigits(values: LotSizeFormValues): number {
  const preset = findInstrumentPreset(values.instrument);
  if (preset) return preset.digits;
  const frac = values.pipSize.includes(".") ? values.pipSize.split(".")[1]!.length : 0;
  return Math.min(8, Math.max(2, frac + 1));
}

export function LotSizeCalculator() {
  const { dict } = useI18n();
  const T = dict.tools.lotSize;

  const [values, setValues] = React.useState<LotSizeFormValues>(INITIAL_VALUES);
  const [currency, setCurrency] = React.useState<Currency>("USD");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  /** Gate for the explicit Calculate step (DoD): before it, field errors stay
   *  limited to non-empty content; the result panel shows the empty state. */
  const [attempted, setAttempted] = React.useState(false);

  const set = (field: LotSizeField) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const onInstrumentChange = (symbol: string) => {
    const preset = findInstrumentPreset(symbol);
    if (preset) {
      setValues((prev) => ({
        ...prev,
        instrument: preset.symbol,
        pipSize: preset.pipSize,
        contractSize: preset.contractSize,
        volumeStep: preset.volumeStep,
      }));
    } else {
      setValues((prev) => ({ ...prev, instrument: symbol }));
    }
  };

  const isCustom = values.instrument === CUSTOM_INSTRUMENT;
  const digits = priceDigits(values);
  const unitLabel = Number(values.contractSize) >= 100 ? T.result.lotsUnit : T.result.unitsUnit;

  // Live derivation - validation errors surface per-field once the field has
  // content or a calculate attempt happened (no aggressive empty-state noise).
  const derived = React.useMemo(() => {
    const validation = validateLotSizeForm(values);
    if (validation.ok) {
      return { validation, result: calculateLotSize(validation.data) };
    }
    return { validation, result: null as LotSizeResult | null };
  }, [values]);

  const errors: LotSizeFieldErrors = derived.validation.ok ? {} : derived.validation.errors;
  const errorFor = (field: LotSizeField): string | null => {
    const code = errors[field];
    if (!code) return null;
    if (code === "required" && !attempted) return null;
    return T.validation[code];
  };

  const hasBlockingErrors = Object.keys(errors).length > 0;
  const result = attempted && !hasBlockingErrors ? derived.result : null;

  const copyPayload = React.useMemo(() => {
    if (!result) return "";
    const lines = [
      `Lot Size - ${isCustom ? "Custom" : values.instrument} (${values.direction === "BUY" ? "Long" : "Short"})`,
      `Balance ${formatMoney(values.balance, currency)} · Risk ${formatPercent(Number(values.riskPercent) / 100, 2)} (${formatMoney(result.riskAmount, currency)})`,
      `Entry ${formatPrice(values.entryPrice, digits)} · Stop ${formatPrice(values.stopLoss, digits)}`,
      `Position size: ${result.positionSize} ${unitLabel}`,
      `Stop distance: ${result.stopDistance} (${result.stopPips} pips)`,
    ];
    if (result.riskReward !== null) {
      lines.push(`Risk/Reward: 1 : ${formatNumber(Math.abs(result.riskReward), 2)}${result.riskReward < 0 ? " (negative)" : ""}`);
    }
    lines.push(`Realized risk: ${formatMoney(result.realizedRisk, currency)}`);
    return lines.join("\n");
  }, [result, values, isCustom, currency, digits, unitLabel]);

  const copyLabels = React.useMemo(
    () => ({ copy: T.copy.result, copied: T.copy.copied }),
    [T.copy],
  );

  const breakdownRows = React.useMemo(() => {
    if (!result) return [] as BreakdownRowData[];
    const rows: BreakdownRowData[] = [
      { label: T.breakdown.balance, value: formatMoney(values.balance, currency) },
      { label: T.breakdown.risk, value: formatPercent(Number(values.riskPercent) / 100, 2) },
      { label: T.breakdown.riskAmount, value: formatMoney(result.riskAmount, currency) },
      {
        label: T.breakdown.stopDistance,
        value: `${formatPrice(result.stopDistance, digits)} · ${formatNumber(result.stopPips, 0)} pips`,
      },
      { label: T.breakdown.pipValue, value: formatMoney(result.riskPerLot, currency) },
      { label: T.breakdown.rawSize, value: `${formatNumber(result.rawPositionSize, 2)} ${unitLabel}` },
      { label: T.breakdown.volumeStep, value: formatNumber(values.volumeStep, 2) },
    ];
    rows.push({
      label: T.breakdown.finalSize,
      value: `${formatNumber(result.positionSize, 2)} ${unitLabel}`,
      final: true,
    });
    return rows;
  }, [result, values, currency, digits, unitLabel, T]);

  const equivalence = React.useMemo(() => {
    if (!result || result.status !== "VALID") return null;
    const size = Number(result.positionSize);
    const micro = Math.round(size / 0.01);
    if (!Number.isFinite(micro) || micro < 1) return null;
    const parts = [`${formatNumber(micro, 0)} micro`];
    if (micro % 10 === 0) parts.push(`${formatNumber(micro / 10, 0)} mini`);
    if (micro % 100 === 0) parts.push(`${formatNumber(micro / 100, 0)} standard`);
    return parts.join(" · ");
  }, [result]);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      {/* ── Inputs ─────────────────────────────────────────────────────── */}
      <ToolCard title={T.form.section} className="lg:col-span-5">
        <div className="space-y-4">
          {/* Instrument + account currency */}
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="lotsize-instrument" className="text-xs font-medium text-muted-foreground">
                {T.form.instrument}
              </label>
              <Select value={values.instrument} onValueChange={onInstrumentChange}>
                <SelectTrigger
                  id="lotsize-instrument"
                  size="default"
                  aria-label={T.form.instrument}
                  className="h-10 w-full"
                  data-testid="lotsize-instrument"
                >
                  <SelectValue placeholder={T.form.instrumentPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUMENT_PRESETS.map((preset) => (
                    <SelectItem key={preset.symbol} value={preset.symbol}>
                      <span className="font-mono">{preset.symbol}</span>
                      <span className="text-muted-foreground"> - {preset.name}</span>
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value={CUSTOM_INSTRUMENT}>{T.form.custom}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lotsize-currency" className="text-xs font-medium text-muted-foreground">
                {T.form.currency}
              </label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger
                  id="lotsize-currency"
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

          {/* Direction - segmented control (sizer pattern) */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{T.form.direction}</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={T.form.direction}>
              {(
                [
                  { value: "BUY", label: T.form.long },
                  { value: "SELL", label: T.form.short },
                ] as const
              ).map((option) => {
                const active = values.direction === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set("direction")(option.value)}
                    data-testid={`lotsize-direction-${option.value.toLowerCase()}`}
                    className={cn(
                      "h-10 rounded-md border text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
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

          <CalculatorField
            id="lotsize-balance"
            label={T.form.balance}
            value={values.balance}
            onChange={set("balance")}
            error={errorFor("balance")}
            placeholder="10000"
            testId="lotsize-balance"
          />

          <div className="space-y-2.5">
            <CalculatorField
              id="lotsize-risk"
              label={T.form.risk}
              value={values.riskPercent}
              onChange={set("riskPercent")}
              error={errorFor("riskPercent")}
              placeholder="1"
              suffix="%"
              testId="lotsize-risk"
            />
            <PresetChips
              label={T.form.presets}
              presets={RISK_PRESETS}
              activeValue={values.riskPercent}
              onSelect={set("riskPercent")}
              ariaLabel={T.form.presets}
            />
            <p className="text-[11px] text-muted-foreground/80">{T.form.presetsNote}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CalculatorField
              id="lotsize-entry"
              label={T.form.entry}
              value={values.entryPrice}
              onChange={set("entryPrice")}
              error={errorFor("entryPrice")}
              placeholder="2650.00"
              testId="lotsize-entry"
            />
            <CalculatorField
              id="lotsize-stop"
              label={T.form.stop}
              value={values.stopLoss}
              onChange={set("stopLoss")}
              error={errorFor("stopLoss")}
              placeholder="2640.00"
              testId="lotsize-stop"
            />
            <CalculatorField
              id="lotsize-tp"
              label={T.form.takeProfit}
              value={values.takeProfit}
              onChange={set("takeProfit")}
              error={errorFor("takeProfit")}
              placeholder="2673.50"
              hint={T.form.optionalSuffix}
              className="sm:col-span-2"
              testId="lotsize-tp"
            />
          </div>

          {/* Advanced parameters - collapsible */}
          <div className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              data-testid="lotsize-advanced-toggle"
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2">
                {T.form.advanced}
                {!advancedOpen ? (
                  <Info className="size-3.5 text-muted-foreground" aria-hidden="true" />
                ) : null}
              </span>
              <ChevronDown
                className={cn("size-4 text-muted-foreground transition-transform", advancedOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {advancedOpen ? (
              <div className="space-y-4 border-t border-border/70 px-3 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <CalculatorField
                    id="lotsize-pipsize"
                    label={T.form.pipSize}
                    value={values.pipSize}
                    onChange={set("pipSize")}
                    error={errorFor("pipSize")}
                    placeholder="0.01"
                    testId="lotsize-pipsize"
                  />
                  <CalculatorField
                    id="lotsize-contract"
                    label={T.form.contractSize}
                    value={values.contractSize}
                    onChange={set("contractSize")}
                    error={errorFor("contractSize")}
                    placeholder="100"
                    testId="lotsize-contract"
                  />
                  <CalculatorField
                    id="lotsize-step"
                    label={T.form.volumeStep}
                    value={values.volumeStep}
                    onChange={set("volumeStep")}
                    error={errorFor("volumeStep")}
                    placeholder="0.01"
                    testId="lotsize-step"
                  />
                </div>
                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  {T.form.advancedHint}
                </p>
              </div>
            ) : null}
          </div>

          {/* Calculate - the explicit sizing step; afterwards results stay live */}
          <button
            type="button"
            onClick={() => setAttempted(true)}
            data-testid="lotsize-calculate"
            className="h-11 w-full rounded-md bg-foreground text-sm font-semibold text-background outline-none transition-colors hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {T.form.calculate}
          </button>
        </div>
      </ToolCard>

      {/* ── Results ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 lg:col-span-7">
        {/* Hero result - announced politely to screen readers */}
        <section
          className="rounded-xl border border-border bg-surface"
          data-testid="lotsize-result"
          aria-live="polite"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="ledger-label">{T.result.title}</h2>
            {copyPayload ? <CopyButton payload={copyPayload} labels={copyLabels} testId="lotsize-copy" /> : null}
          </header>
          <div className="px-4 py-6 sm:px-5">
            {result ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-foreground sm:text-6xl">
                      {formatNumber(result.positionSize, 2)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{unitLabel}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={cn(
                        "stamp",
                        result.status === "VALID" ? "stamp-accent" : "stamp-warn",
                      )}
                      data-testid="lotsize-status"
                    >
                      {result.status === "VALID" ? T.result.statusValid : T.result.statusBelowStep}
                    </span>
                    {result.volumeAdjusted && result.status === "VALID" ? (
                      <p className="max-w-56 text-right text-[11px] leading-snug text-muted-foreground">
                        {T.result.volumeAdjusted}
                      </p>
                    ) : null}
                  </div>
                </div>

                {result.status === "BELOW_STEP" ? (
                  <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm leading-snug text-foreground">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {T.result.statusBelowStepBody}
                  </p>
                ) : null}

                {/* Stat band - the ruled 12-column ledger */}
                <div className="stat-strip">
                  <div className="stat-cell stat-kpi">
                    <p className="ledger-label">{T.result.riskAmount}</p>
                    <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-foreground">
                      {formatMoney(result.riskAmount, currency)}
                    </p>
                  </div>
                  <div className="stat-cell stat-kpi">
                    <p className="ledger-label">{T.result.realizedRisk}</p>
                    <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-foreground">
                      {formatMoney(result.realizedRisk, currency)}
                    </p>
                  </div>
                  <div className="stat-cell stat-kpi">
                    <p className="ledger-label">{T.result.stopDistance}</p>
                    <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-foreground">
                      {formatPrice(result.stopDistance, digits)}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatNumber(result.stopPips, 0)} pips
                    </p>
                  </div>
                  <div className="stat-cell stat-kpi">
                    <p className="ledger-label">{T.result.riskReward}</p>
                    {result.riskReward !== null ? (
                      <>
                        <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-foreground">
                          1 : {formatNumber(Math.abs(result.riskReward), 2)}
                        </p>
                        {result.riskReward < 0 ? (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] leading-snug text-warning">
                            <Info className="size-3 shrink-0" aria-hidden="true" />
                            {T.result.rrNegative}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-1.5 font-mono text-xl tabular-nums text-muted-foreground">-</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-36 items-center justify-center">
                <p className="max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
                  {T.result.empty}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Breakdown - how the result was obtained */}
        {result ? (
          <ToolCard title={T.breakdown.title}>
            <BreakdownLedger rows={breakdownRows} ariaLabel={T.breakdown.title} />
            {equivalence ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {T.breakdown.equivalent} - {equivalence}
              </p>
            ) : null}
          </ToolCard>
        ) : null}

        {/* Disclaimer - compact, factual */}
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {T.disclaimer}
        </p>
      </div>
    </div>
  );
}

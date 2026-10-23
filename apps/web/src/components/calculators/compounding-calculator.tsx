"use client";

import * as React from "react";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { useTheme } from "next-themes";
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatSignedMoney,
  type Currency,
} from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { useI18n } from "@/i18n/i18n-provider";
import { EChart } from "@/components/charts/echart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  validateCompoundingForm,
  type CompoundingField,
  type CompoundingFieldErrors,
  type CompoundingFormValues,
} from "./calculator-model";
import {
  CalculatorField,
  CopyButton,
  PresetChips,
  ToolCard,
} from "./calculator-shared";

/**
 * Compounding Calculator (TOOLS section) — period-by-period growth projection
 * (A = P × (1+r)ⁿ per period), computed LIVE on every input change (spec §19)
 * through the shared projection layer. Summary stat band → growth chart
 * (existing ECharts bridge, theme-token driven) → full results table.
 * A mathematical projection, never a performance promise.
 */

const BALANCE_PRESETS = ["100", "500", "1000", "5000", "10000"] as const;
const GAIN_PRESETS = ["1", "2", "3", "5", "10"] as const;
const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "NZD", "SGD"];

const INITIAL_VALUES: CompoundingFormValues = {
  startingBalance: "1000",
  periods: "20",
  gainPerPeriod: "5",
  currency: "USD",
};

export function CompoundingCalculator() {
  const { dict } = useI18n();
  const T = dict.tools.compounding;
  const { resolvedTheme } = useTheme();

  const [values, setValues] = React.useState<CompoundingFormValues>(INITIAL_VALUES);

  const set = (field: CompoundingField) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  // Live derivation — every keystroke revalidates and recomputes (§19).
  const derived = React.useMemo(() => validateCompoundingForm(values), [values]);
  const errors: CompoundingFieldErrors = derived.ok ? {} : derived.errors;
  const schedule = derived.ok ? derived.schedule : null;
  const currency = values.currency;

  const errorFor = (field: CompoundingField): string | null =>
    errors[field] ? T.validation[errors[field]!] : null;

  const totalGainRatio = schedule ? Number(schedule.totalGainPercent) / 100 : null;
  const isGrowth = schedule ? Number(schedule.totalProfit) >= 0 : true;

  const copyPayload = React.useMemo(() => {
    if (!schedule) return "";
    return [
      `Compounding - ${formatMoney(schedule.startingBalance, currency)} · ${schedule.periods} periods · ${formatPercent(Number(schedule.gainPerPeriodPercent) / 100, 2)} / period`,
      `Initial: ${formatMoney(schedule.startingBalance, currency)}`,
      `Final: ${formatMoney(schedule.finalBalance, currency)}`,
      `Total profit: ${formatSignedMoney(schedule.totalProfit, currency)}`,
      `Total gain: ${Number(schedule.totalGainPercent) >= 0 ? "+" : ""}${formatPercent(Number(schedule.totalGainPercent) / 100, 2)}`,
    ].join("\n");
  }, [schedule, currency]);

  // Chart option — rebuilt on schedule AND theme so canvas tokens stay fresh.
  const chartOption = React.useMemo(() => {
    if (!schedule) return null;
    const theme = getChartTheme();
    const labels = schedule.rows.map((row) => row.period);
    const balances = schedule.rows.map((row) => Number(row.endingBalance));
    const dense = schedule.rows.length > 60;
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "line" as const, lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number }[];
          const index = list[0]?.dataIndex ?? 0;
          const row = schedule.rows[index];
          if (!row) return "";
          return [
            `${T.chart.xLabel} ${row.period}`,
            `${T.table.endingBalance}: ${formatMoney(row.endingBalance, currency)}`,
            `${T.table.totalProfit}: ${formatSignedMoney(row.totalProfit, currency)}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category" as const,
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: {
          color: theme.textMuted,
          fontFamily: theme.monoFont,
          fontSize: 10,
          interval: dense ? Math.ceil(schedule.rows.length / 8) : 0,
        },
      },
      yAxis: {
        type: "value" as const,
        scale: true,
        splitLine: { lineStyle: { color: theme.border, opacity: 0.5 } },
        axisLabel: {
          color: theme.textMuted,
          fontFamily: theme.monoFont,
          fontSize: 10,
          formatter: (value: number) => formatMoneyCompact(value, currency),
        },
      },
      series: [
        {
          type: "line" as const,
          data: balances,
          showSymbol: !dense,
          symbolSize: dense ? 0 : 5,
          lineStyle: { color: theme.accent, width: 2 },
          itemStyle: { color: theme.accent },
          areaStyle: {
            color: theme.accent,
            opacity: 0.08,
          },
        },
      ],
    };
    // resolvedTheme is an intentional dependency — the canvas re-init needs
    // freshly resolved tokens (design-tokens.md §8), same as the dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, resolvedTheme, currency, T]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* ── Inputs ──────────────────────────────────────────────────── */}
        <ToolCard title={T.form.section} className="lg:col-span-5">
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <CalculatorField
                id="comp-balance"
                label={T.form.startingBalance}
                value={values.startingBalance}
                onChange={set("startingBalance")}
                error={errorFor("startingBalance")}
                placeholder="1000"
                testId="comp-balance"
              />
              <div className="space-y-1.5">
                <label htmlFor="comp-currency" className="text-xs font-medium text-muted-foreground">
                  {T.form.currency}
                </label>
                <Select value={currency} onValueChange={(v) => setValues((prev) => ({ ...prev, currency: v as Currency }))}>
                  <SelectTrigger
                    id="comp-currency"
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

            <CalculatorField
              id="comp-periods"
              label={T.form.periods}
              value={values.periods}
              onChange={set("periods")}
              error={errorFor("periods")}
              placeholder="20"
              hint={T.form.periodsHint}
              testId="comp-periods"
            />
            <CalculatorField
              id="comp-gain"
              label={T.form.gainPerPeriod}
              value={values.gainPerPeriod}
              onChange={set("gainPerPeriod")}
              error={errorFor("gainPerPeriod")}
              placeholder="5"
              suffix="%"
              hint={T.form.gainHint}
              testId="comp-gain"
            />

            <PresetChips
              label={T.form.presetsBalance}
              presets={BALANCE_PRESETS.map((value) => ({ label: formatNumber(Number(value), 0), value }))}
              activeValue={values.startingBalance}
              onSelect={set("startingBalance")}
              ariaLabel={T.form.presetsBalance}
            />
            <PresetChips
              label={T.form.presetsGain}
              presets={GAIN_PRESETS.map((value) => ({ label: `${value}%`, value }))}
              activeValue={values.gainPerPeriod}
              onSelect={set("gainPerPeriod")}
              ariaLabel={T.form.presetsGain}
            />
            <p className="text-[11px] text-muted-foreground/80">{T.form.presetsNote}</p>
          </div>
        </ToolCard>

        {/* ── Summary — the ruled stat band ────────────────────────────── */}
        <section
          className="rounded-xl border border-border bg-surface lg:col-span-7"
          data-testid="comp-summary"
          aria-live="polite"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="ledger-label">{T.overview.kicker}</h2>
            {copyPayload ? (
              <CopyButton
                payload={copyPayload}
                labels={{ copy: T.copy.summary, copied: T.copy.copied }}
                testId="comp-copy"
              />
            ) : null}
          </header>
          {schedule ? (
            <div className="stat-strip rounded-none border-0">
              <div className="stat-cell stat-hero">
                <p className="ledger-label">{T.summary.initialBalance}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
                  {formatMoney(schedule.startingBalance, currency)}
                </p>
              </div>
              <div className="stat-cell stat-hero">
                <p className="ledger-label">{T.summary.finalBalance}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
                  {formatMoney(schedule.finalBalance, currency)}
                </p>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {isGrowth ? (
                    <TrendingUp className="size-3.5 text-profit" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="size-3.5 text-loss" aria-hidden="true" />
                  )}
                  {formatNumber(schedule.periods, 0)} × {formatPercent(Number(schedule.gainPerPeriodPercent) / 100, 2)}
                </p>
              </div>
              {/* Row 2 opens at column 1 — drop the duplicated frame hairline */}
              <div className="stat-cell stat-hero !border-l-0">
                <p className="ledger-label">{T.summary.totalProfit}</p>
                <p
                  className={cn(
                    "mt-1.5 font-mono text-2xl font-semibold tabular-nums sm:text-3xl",
                    isGrowth ? "text-profit" : "text-loss",
                  )}
                >
                  {formatSignedMoney(schedule.totalProfit, currency)}
                </p>
              </div>
              <div className="stat-cell stat-hero">
                <p className="ledger-label">{T.summary.totalGain}</p>
                <p
                  className={cn(
                    "mt-1.5 font-mono text-2xl font-semibold tabular-nums sm:text-3xl",
                    isGrowth ? "text-profit" : "text-loss",
                  )}
                >
                  {totalGainRatio !== null && totalGainRatio >= 0 ? "+" : ""}
                  {totalGainRatio !== null ? formatPercent(totalGainRatio, 2) : "-"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-48 items-center justify-center px-6">
              <p className="max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
                {Object.keys(errors).length > 0 && errors.gainPerPeriod === "overflow"
                  ? T.validation.overflow
                  : T.table.empty}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Growth chart ───────────────────────────────────────────────── */}
      {schedule ? (
        <section className="rounded-xl border border-border bg-surface" data-testid="comp-chart">
          <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="ledger-label">{T.chart.title}</h2>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {T.chart.xLabel} 1–{schedule.rows.length}
            </span>
          </header>
          <div className="chart-paper px-2 py-4 sm:px-4">
            <EChart
              option={chartOption!}
              ariaLabel={`${T.chart.title} - ${T.chart.xLabel}: ${T.chart.yLabel}`}
              className="h-72 w-full sm:h-80"
            />
          </div>
        </section>
      ) : null}

      {/* ── Results table / mobile cards ──────────────────────────────── */}
      {schedule ? (
        <ToolCard
          title={T.table.title}
          action={
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {schedule.rows.length} {T.chart.xLabel.toLowerCase()}s
            </span>
          }
        >
          {/* Desktop: sticky-header scrollable ledger */}
          <div className="hidden max-h-[460px] overflow-auto rounded-lg border border-border/70 md:block" data-testid="comp-table">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{T.table.title}</caption>
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border">
                  {[
                    T.table.period,
                    T.table.startingBalance,
                    T.table.endingBalance,
                    T.table.totalProfit,
                    T.table.totalGain,
                  ].map((header, index) => (
                    <th
                      key={header}
                      scope="col"
                      className={cn(
                        "px-3 py-2.5 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground first:text-left last:text-right",
                        index === 0 && "text-left",
                      )}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((row) => {
                  const gain = Number(row.totalGainPercent) / 100;
                  const profitPositive = Number(row.totalProfit) >= 0;
                  return (
                    <tr key={row.period} className="border-b border-border/40 last:border-b-0 hover:bg-muted/40">
                      <td className="px-3 py-2 text-left font-mono tabular-nums text-muted-foreground">
                        {row.period}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                        {formatMoney(row.startingBalance, currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-medium text-foreground">
                        {formatMoney(row.endingBalance, currency)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono tabular-nums",
                          profitPositive ? "text-profit" : "text-loss",
                        )}
                      >
                        {formatSignedMoney(row.totalProfit, currency)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono tabular-nums",
                          profitPositive ? "text-profit" : "text-loss",
                        )}
                      >
                        {gain >= 0 ? "+" : ""}
                        {formatPercent(gain, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: period cards (§31) */}
          <div className="flex max-h-[520px] flex-col gap-2.5 overflow-auto md:hidden" data-testid="comp-cards">
            {schedule.rows.map((row) => {
              const gain = Number(row.totalGainPercent) / 100;
              const profitPositive = Number(row.totalProfit) >= 0;
              return (
                <div key={row.period} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="ledger-label !text-[10px]">{T.table.period}</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {row.period}
                    </span>
                  </div>
                  <dl className="mt-1.5 space-y-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-[11px] text-muted-foreground">{T.table.startingBalance}</dt>
                      <dd className="font-mono text-xs tabular-nums text-foreground">
                        {formatMoney(row.startingBalance, currency)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-[11px] text-muted-foreground">{T.table.endingBalance}</dt>
                      <dd className="font-mono text-xs tabular-nums font-medium text-foreground">
                        {formatMoney(row.endingBalance, currency)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-[11px] text-muted-foreground">{T.table.totalProfit}</dt>
                      <dd
                        className={cn(
                          "font-mono text-xs tabular-nums",
                          profitPositive ? "text-profit" : "text-loss",
                        )}
                      >
                        {formatSignedMoney(row.totalProfit, currency)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-[11px] text-muted-foreground">{T.table.totalGain}</dt>
                      <dd
                        className={cn(
                          "font-mono text-xs tabular-nums",
                          profitPositive ? "text-profit" : "text-loss",
                        )}
                      >
                        {gain >= 0 ? "+" : ""}
                        {formatPercent(gain, 2)}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </ToolCard>
      ) : null}

      {/* ── How it works + disclaimer — compact, never dominant ───────── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {schedule ? (
          <ToolCard title={T.how.title}>
            <ol className="space-y-1.5">
              {[T.how.line1, T.how.line2, T.how.line3].map((line, index) => (
                <li
                  key={line}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
                >
                  <span className="ledger-label mt-0.5">{index + 1}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </ToolCard>
        ) : null}
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground md:col-span-1">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {T.disclaimer}
        </p>
      </div>
    </div>
  );
}

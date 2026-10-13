"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import type { EChartsCoreOption } from "echarts/core";
import { Copy, Info, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EChart } from "@/components/charts/echart";
import { useI18n } from "@/i18n/i18n-provider";
import { usePreferences } from "@/lib/api/queries";
import { formatMoney, type Currency } from "@cosmoz/shared";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";
import {
  calculateCompounding,
  COMPOUNDING_LIMITS,
  type CompoundingResult,
} from "@/lib/utils/calculators/compounding";
import { cn } from "@/lib/utils";

/**
 * Compounding Calculator — Tools module. LIVE calculation (Tools brief §19:
 * no submit button unless UX demands it — every keystroke re-projects).
 * State persists in the URL (?balance=&periods=&gain=&currency=, §41) so a
 * projection can be shared; currency defaults to the account preference.
 */

// ── Local helpers ────────────────────────────────────────────────────────────

function parseField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "NZD", "SGD", "JPY"];

const BALANCE_PRESETS = [100, 500, 1000, 5000, 10000] as const;
const GAIN_PRESETS = [1, 2, 3, 5, 10] as const;

const money2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Signed display: "+$1,653.30" / "-$12.00". */
function signedMoney(value: number, currency: Currency): string {
  const formatted = formatMoney(Math.abs(value), currency, { locale: "en-US" });
  return `${value < 0 ? "−" : "+"}${formatted}`;
}

const signedPct = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ── Component ────────────────────────────────────────────────────────────────

export function CompoundingView() {
  const { dict } = useI18n();
  const V = dict.tools.compounding;
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferences = usePreferences();
  const { resolvedTheme } = useTheme();

  // URL-first state (§41) — falls back to the account's display currency.
  const preferredCurrency = preferences.data?.trading.displayCurrency ?? "USD";
  const urlCurrency = searchParams.get("currency");
  const currency: Currency = CURRENCIES.includes(urlCurrency as Currency)
    ? (urlCurrency as Currency)
    : preferredCurrency;

  const [balanceStr, setBalanceStr] = React.useState(() => searchParams.get("balance") ?? "1000");
  const [periodsStr, setPeriodsStr] = React.useState(() => searchParams.get("periods") ?? "20");
  const [gainStr, setGainStr] = React.useState(() => searchParams.get("gain") ?? "5");

  // Persist to the URL without polluting history (same convention as Nofy).
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (balanceStr !== "1000") params.set("balance", balanceStr);
    if (periodsStr !== "20") params.set("periods", periodsStr);
    if (gainStr !== "5") params.set("gain", gainStr);
    if (currency !== preferredCurrency) params.set("currency", currency);
    const query = params.toString();
    router.replace(`/compounding${query === "" ? "" : `?${query}`}`, { scroll: false });
  }, [balanceStr, periodsStr, gainStr, currency, preferredCurrency, router]);

  const balance = parseField(balanceStr);
  const periods = parseField(periodsStr);
  const gain = parseField(gainStr);

  const errors = React.useMemo(() => {
    const fieldErrors: Record<string, string> = {};
    if (balance === null || balance <= 0) fieldErrors.balance = V.errBalanceRequired;
    if (periods === null || !Number.isInteger(periods) || periods < 1)
      fieldErrors.periods = V.errPeriodsRequired;
    else if (periods > COMPOUNDING_LIMITS.maxPeriods) fieldErrors.periods = V.errPeriodsMax;
    if (gain === null || gain < COMPOUNDING_LIMITS.minGainPerPeriod)
      fieldErrors.gain = V.errGainMin;
    return fieldErrors;
  }, [balance, periods, gain, V]);

  const result: CompoundingResult | null = React.useMemo(() => {
    if (balance === null || periods === null || gain === null) return null;
    if (Object.keys(errors).length > 0) return null;
    return calculateCompounding({ startingBalance: balance, periods, gainPerPeriod: gain });
  }, [balance, periods, gain, errors]);

  const fmtMoney = React.useCallback(
    (value: number) => formatMoney(value, currency, { locale: "en-US" }),
    [currency],
  );

  const copySummary = React.useCallback(async () => {
    if (!result) return;
    const lines = [
      `${V.title}`,
      `${V.initialBalance}: ${fmtMoney(result.initialBalance)}`,
      `${V.periods}: ${result.schedule.length}`,
      `${V.gainPerPeriod}: ${signedPct.format(gain ?? 0)}%`,
      `${V.finalBalance}: ${fmtMoney(result.finalBalance)}`,
      `${V.totalProfit}: ${signedMoney(result.totalProfit, currency)}`,
      `${V.totalGain}: ${signedMoney(result.totalGain, currency).replace(currency === "JPY" ? "¥" : "$", "")}%`,
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success(V.copiedSummary);
  }, [result, gain, fmtMoney, currency, V]);

  // resolvedTheme is an intentional dependency even though tokens are read
  // via getChartTheme() — canvas can't resolve CSS vars (chart-theme §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ReturnType<typeof getChartTheme>>(() => getChartTheme(), [resolvedTheme]);

  // ── Chart option — rebuilt when data OR theme changes (chart-theme §8) ──
  const option = React.useMemo<EChartsCoreOption>(() => {
    const t = theme;
    const schedule = result?.schedule ?? [];
    const positive = (result?.totalGain ?? 0) >= 0;
    const lineColor = positive ? t.profit : t.loss;

    return {
      grid: { left: 6, right: 12, top: 18, bottom: 2, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: t.surfaceRaised,
        borderColor: t.border,
        textStyle: { color: t.textPrimary, fontFamily: t.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number }[];
          const row = schedule[list[0]?.dataIndex];
          if (!row) return "";
          return [
            `${V.colPeriod} ${row.period}`,
            `${V.colEnd}: ${fmtMoney(row.endingBalance)}`,
            `${V.colGain}: ${row.totalGain >= 0 ? "+" : "−"}${signedPct.format(Math.abs(row.totalGain))}%`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: schedule.map((row) => String(row.period)),
        boundaryGap: false,
        axisLine: { lineStyle: { color: t.border } },
        axisLabel: { color: t.textMuted, fontFamily: t.monoFont, fontSize: 10 },
        axisTick: { show: false },
        name: V.chartPeriod,
        nameTextStyle: { color: t.textMuted, fontSize: 10 },
        nameLocation: "end",
        nameGap: 8,
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: withAlpha(t.border, 0.6) } },
        axisLabel: {
          color: t.textMuted,
          fontFamily: t.monoFont,
          fontSize: 10,
          formatter: (value: number) =>
            new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value),
        },
        name: V.chartBalance,
        nameTextStyle: { color: t.textMuted, fontSize: 10, align: "left" },
      },
      series: [
        {
          type: "line",
          data: schedule.map((row) => Number(row.endingBalance.toFixed(2))),
          smooth: 0.25,
          showSymbol: schedule.length <= 40,
          symbolSize: 5,
          lineStyle: { color: lineColor, width: 2 },
          itemStyle: { color: lineColor },
          areaStyle: {
            color: withAlpha(lineColor, 0.14),
          },
        },
      ],
    };
  }, [result, theme, fmtMoney, V]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6" data-testid="compounding-view">
      {/* Identity band */}
      <header className="rounded-xl border bg-surface px-4 py-5 sm:px-6" data-testid="compounding-header">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <TrendingUp className="size-6 text-accent sm:size-7" aria-hidden="true" />
          {V.title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{V.subtitle}</p>
      </header>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
        {/* ── Inputs ── */}
        <Card className="lg:col-span-4" data-testid="compounding-inputs">
          <CardHeader>
            <CardTitle>{V.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cmp-balance">{V.startingBalance}</Label>
              <Input
                id="cmp-balance"
                inputMode="decimal"
                autoComplete="off"
                value={balanceStr}
                onChange={(event) => setBalanceStr(event.target.value)}
                aria-invalid={Boolean(errors.balance)}
                className={cn("font-mono", errors.balance && "border-destructive")}
                data-testid="compounding-balance"
              />
              {errors.balance ? (
                <p role="alert" className="text-xs text-destructive">{errors.balance}</p>
              ) : null}
              {/* Balance presets — convenience only (§29) */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {BALANCE_PRESETS.map((presetValue) => (
                  <button
                    key={presetValue}
                    type="button"
                    onClick={() => setBalanceStr(String(presetValue))}
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-mono text-xs transition-colors hover:bg-muted",
                      balanceStr === String(presetValue)
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "text-muted-foreground",
                    )}
                    data-testid={`compounding-balance-preset-${presetValue}`}
                  >
                    {money2.format(presetValue).replace(/\.00$/, "")}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cmp-periods">{V.periods}</Label>
              <Input
                id="cmp-periods"
                inputMode="numeric"
                autoComplete="off"
                value={periodsStr}
                onChange={(event) => setPeriodsStr(event.target.value)}
                aria-invalid={Boolean(errors.periods)}
                className={cn("font-mono", errors.periods && "border-destructive")}
                data-testid="compounding-periods"
              />
              {errors.periods ? (
                <p role="alert" className="text-xs text-destructive">{errors.periods}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cmp-gain">{V.gainPerPeriod} (%)</Label>
              <Input
                id="cmp-gain"
                inputMode="decimal"
                autoComplete="off"
                value={gainStr}
                onChange={(event) => setGainStr(event.target.value)}
                aria-invalid={Boolean(errors.gain)}
                className={cn("font-mono", errors.gain && "border-destructive")}
                data-testid="compounding-gain"
              />
              {errors.gain ? (
                <p role="alert" className="text-xs text-destructive">{errors.gain}</p>
              ) : null}
              {/* Gain presets (§29) */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {GAIN_PRESETS.map((presetValue) => (
                  <button
                    key={presetValue}
                    type="button"
                    onClick={() => setGainStr(String(presetValue))}
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-mono text-xs transition-colors hover:bg-muted",
                      gainStr === String(presetValue)
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "text-muted-foreground",
                    )}
                    data-testid={`compounding-gain-preset-${presetValue}`}
                  >
                    {presetValue}%
                  </button>
                ))}
              </div>
            </div>

            {/* Currency selector (§28) — defaults to the account preference */}
            <div className="space-y-1.5">
              <Label htmlFor="cmp-currency">{V.currency}</Label>
              <Select
                value={currency}
                onValueChange={(next) =>
                  router.replace(`/compounding?${withUrlParams(searchParams, "currency", next)}`, { scroll: false })
                }
              >
                <SelectTrigger id="cmp-currency" data-testid="compounding-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{V.currencyHint}</p>
            </div>

            {/* How it works (§30) — compact, never dominant */}
            <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Info className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {V.howTitle}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{V.howBody}</p>
            </div>
          </CardContent>
        </Card>

        {/* ── Summary + chart ── */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-8">
          {/* Summary cards (§23) */}
          <div data-testid="compounding-summary">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {V.summaryTitle}
              </h2>
              {result ? (
                <Button variant="outline" size="sm" onClick={copySummary} data-testid="compounding-copy">
                  <Copy className="size-3.5" aria-hidden="true" />
                  {V.copySummary}
                </Button>
              ) : null}
            </div>
            {result ? (
              <div aria-live="polite" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label={V.initialBalance} value={fmtMoney(result.initialBalance)} testid="compounding-initial" />
                <SummaryCard label={V.finalBalance} value={fmtMoney(result.finalBalance)} testid="compounding-final" accent />
                <SummaryCard
                  label={V.totalProfit}
                  value={signedMoney(result.totalProfit, currency)}
                  tone={result.totalProfit >= 0 ? "profit" : "loss"}
                  testid="compounding-profit"
                />
                <SummaryCard
                  label={V.totalGain}
                  value={`${result.totalGain >= 0 ? "+" : "−"}${signedPct.format(Math.abs(result.totalGain))}%`}
                  tone={result.totalGain >= 0 ? "profit" : "loss"}
                  testid="compounding-gain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
                <TrendingUp className="size-8 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm font-medium">{V.errBalanceRequired}</p>
                <p className="text-xs text-muted-foreground">{V.howBody}</p>
              </div>
            )}
          </div>

          {/* Growth chart (§24) — live with the inputs */}
          {result ? (
            <Card data-testid="compounding-chart">
              <CardHeader>
                <CardTitle>{V.chartTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <EChart
                  option={option}
                  ariaLabel={`${V.chartTitle} — ${V.chartPeriod} / ${V.chartBalance}`}
                  className="h-64 w-full sm:h-72"
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Results table (§22/§31) — sticky header, scrollable, mobile cards */}
      {result ? (
        <Card data-testid="compounding-table">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{V.tableTitle}</CardTitle>
            <span className="text-xs text-muted-foreground">{V.tableHint}</span>
          </CardHeader>
          <CardContent>
            {/* Desktop table */}
            <div className="max-h-[420px] overflow-auto rounded-lg border" data-testid="compounding-table-scroll">
              <table className="hidden w-full border-collapse text-sm md:table">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">{V.colPeriod}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{V.colStart}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{V.colEnd}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{V.colProfit}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{V.colGain}</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {result.schedule.map((row) => (
                    <tr key={row.period} className="border-t border-border/60">
                      <td className="px-3 py-2 text-muted-foreground">{row.period}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(row.startingBalance)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtMoney(row.endingBalance)}</td>
                      <td className={cn("px-3 py-2 text-right", row.totalProfit >= 0 ? "text-profit" : "text-loss")}>
                        {signedMoney(row.totalProfit, currency)}
                      </td>
                      <td className={cn("px-3 py-2 text-right", row.totalGain >= 0 ? "text-profit" : "text-loss")}>
                        {row.totalGain >= 0 ? "+" : "−"}
                        {signedPct.format(Math.abs(row.totalGain))}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards (§31) */}
            <div className="max-h-[480px] space-y-2 overflow-auto md:hidden">
              {result.schedule.map((row) => (
                <div key={row.period} className="rounded-lg border px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {V.colPeriod} {row.period}
                    </span>
                    <span className={cn("font-mono text-xs", row.totalGain >= 0 ? "text-profit" : "text-loss")}>
                      {row.totalGain >= 0 ? "+" : "−"}
                      {signedPct.format(Math.abs(row.totalGain))}%
                    </span>
                  </div>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <dt className="text-muted-foreground">{V.colStart}</dt>
                      <dd className="font-mono tabular-nums">{fmtMoney(row.startingBalance)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{V.colEnd}</dt>
                      <dd className="font-mono font-medium tabular-nums">{fmtMoney(row.endingBalance)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{V.colProfit}</dt>
                      <dd className={cn("font-mono tabular-nums", row.totalProfit >= 0 ? "text-profit" : "text-loss")}>
                        {signedMoney(row.totalProfit, currency)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Disclaimer (§37) — compact, factual, no performance promises (§52) */}
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {V.disclaimer}
      </p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Merge one param change into the current query string. */
function withUrlParams(
  searchParams: URLSearchParams,
  key: string,
  value: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set(key, value);
  return params.toString();
}

function SummaryCard({
  label,
  value,
  tone,
  accent,
  testid,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
  accent?: boolean;
  testid: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        accent && "bg-muted/30",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-bold tabular-nums",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
        )}
        data-testid={testid}
      >
        {value}
      </div>
    </div>
  );
}

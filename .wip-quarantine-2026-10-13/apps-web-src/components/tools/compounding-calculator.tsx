"use client";

import * as React from "react";
import type { EChartsCoreOption } from "echarts/core";
import {
  Check,
  ClipboardCopy,
  LineChart as LineChartIcon,
  Lightbulb,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalculatorField as Field } from "@/components/tools/calculator-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EChart } from "@/components/charts/echart";
import {
  calculateCompounding,
  COMPOUND_CURRENCIES,
  COMPOUNDING_LIMITS,
  type CompoundCurrency,
  type CompoundingField,
  type CompoundingIssue,
  type CompoundingResult,
} from "@/lib/calculations/compounding";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { cn } from "@/lib/utils";

/**
 * Compounding Calculator — project an equity curve from a steady per-period
 * gain. Frontend-only V1: all math lives in `lib/calculations/compounding.ts`
 * (deterministic, iterative per-period compounding, negative returns OK).
 */

// ── Formatting helpers ───────────────────────────────────────────────────────

function num(s: string): number | null {
  // Strip regular/thin spaces (thousand separators) before parsing, then
  // accept a decimal comma.
  const t = s
    .replace(/[\s\u00A0\u202F]/g, "")
    .replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function fmtMoney(value: number, currency: CompoundCurrency): string {
  const digits = currency === "JPY" ? 0 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtMoneyCompact(value: number, currency: CompoundCurrency): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B ${currency}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M ${currency}`;
  if (abs >= 1e5) return `${sign}${(abs / 1e3).toFixed(0)}k ${currency}`;
  return fmtMoney(value, currency);
}

function fmtSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

const PERIOD_CHIPS = [12, 24, 52, 100] as const;
const GAIN_CHIPS = [0.5, 1, 2, 5] as const;

// ── Main component ───────────────────────────────────────────────────────────

export function CompoundingCalculator() {
  const { resolvedTheme } = useTheme();
  const [balance, setBalance] = React.useState("10 000");
  const [periods, setPeriods] = React.useState("24");
  const [gain, setGain] = React.useState("2");
  const [currency, setCurrency] = React.useState<CompoundCurrency>("USD");
  const [copied, setCopied] = React.useState(false);

  const outcome = React.useMemo<
    | { status: "incomplete" }
    | { status: "valid"; result: CompoundingResult }
    | { status: "invalid"; issues: CompoundingIssue[] }
  >(() => {
    const b = num(balance);
    const p = num(periods);
    const g = num(gain);
    if (b == null || p == null || g == null) {
      return { status: "incomplete" as const };
    }
    const out = calculateCompounding({
      initialBalance: b,
      periods: p,
      gainPerPeriodPercent: g,
    });
    return out.ok
      ? { status: "valid" as const, result: out.result }
      : { status: "invalid" as const, issues: out.issues };
  }, [balance, periods, gain]);

  const fieldErrors = React.useMemo(() => {
    const map = new Map<CompoundingField, string>();
    if (outcome.status === "invalid") {
      for (const issue of outcome.issues) {
        if (!map.has(issue.field)) map.set(issue.field, issue.message);
      }
    }
    return map;
  }, [outcome]);

  const result: CompoundingResult | null =
    outcome.status === "valid" ? outcome.result : null;

  const option = React.useMemo<EChartsCoreOption | null>(() => {
    if (!result) return null;
    const theme = getChartTheme();
    const curveColor =
      result.totalGainPercent >= 0 ? theme.profit : theme.loss;
    const labels = result.rows.map((row) => String(row.period));
    const values = result.rows.map((row) =>
      Number(row.endingBalance.toFixed(currency === "JPY" ? 0 : 2)),
    );

    return {
      grid: { left: 8, right: 16, top: 18, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.border } },
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        textStyle: { color: theme.textPrimary, fontFamily: theme.monoFont, fontSize: 12 },
        formatter: (params: unknown) => {
          const typed = params as { name: string; data: number }[];
          const point = typed?.[0];
          if (!point) return "";
          const row = result.rows[Number(point.name) - 1];
          return `Period <b>${point.name}</b><br/>Balance <b>${fmtMoney(point.data, currency)}</b>${
            row ? `<br/><span style="opacity:.7">${fmtSignedPercent(row.totalGainPercent)} overall</span>` : ""
          }`;
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: {
          color: theme.textMuted,
          fontSize: 10,
          fontFamily: theme.monoFont,
          hideOverlap: true,
        },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
        axisLabel: {
          color: theme.textMuted,
          fontSize: 10,
          fontFamily: theme.monoFont,
          formatter: (value: number) => fmtMoneyCompact(value, currency),
        },
      },
      series: [
        {
          id: "equity",
          name: "Balance",
          type: "line",
          data: values,
          smooth: 0.25,
          showSymbol: result.rows.length <= 40,
          symbolSize: 5,
          lineStyle: { color: curveColor, width: 2.5 },
          itemStyle: { color: curveColor },
          areaStyle: {
            color: curveColor,
            opacity: 0.1,
          },
        },
      ],
    };
    // resolvedTheme is an intentional dependency: tokens are read from the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, currency, resolvedTheme]);

  async function copySummary() {
    if (!result) return;
    const lines = [
      "Compounding projection",
      `Start: ${fmtMoney(result.initialBalance, currency)} · ${result.rows.length} periods at ${fmtSignedPercent((num(gain) ?? 0))} per period`,
      `Final balance: ${fmtMoney(result.finalBalance, currency)}`,
      `Total profit: ${fmtMoney(result.totalProfit, currency)} (${fmtSignedPercent(result.totalGainPercent)})`,
      "Educational projection — not a performance promise.",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast.success("Projection copied to clipboard");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  }

  const err = (f: CompoundingField) => fieldErrors.get(f);
  const positive = (result?.totalGainPercent ?? 0) >= 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <TrendingUp className="size-6 text-accent" aria-hidden="true" />
            Compounding Calculator
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A steady gain per period, compounded — watch consistency turn into a
            curve you can aim at.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
          <LineChartIcon className="size-3.5" aria-hidden="true" />
          Per-period projection
        </Badge>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* ── Inputs ─────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="comp-setup"
          className="rounded-xl border bg-card p-5 sm:p-6"
        >
          <h2 id="comp-setup" className="font-heading text-base font-semibold">
            Projection setup
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One period = one day, week or month — your cadence, your choice.
          </p>

          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field
                id="initialBalance"
                label="Starting balance"
                error={err("initialBalance")}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="text"
                    inputMode="decimal"
                    placeholder="10 000"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                  />
                )}
              </Field>
              <Field id="currency" label="Currency">
                {({ id }) => (
                  <Select
                    value={currency}
                    onValueChange={(v) => setCurrency(v as CompoundCurrency)}
                  >
                    <SelectTrigger id={id} className="w-full font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPOUND_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c} className="font-mono">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <Field
              id="gainPerPeriod"
              label="Gain per period"
              hint="% — negative allowed"
              error={err("gainPerPeriodPercent")}
            >
              {(props) => (
                <div className="space-y-2">
                  <Input
                    {...props}
                    type="text"
                    inputMode="decimal"
                    placeholder="2"
                    value={gain}
                    onChange={(e) => setGain(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gain presets">
                    {GAIN_CHIPS.map((g) => {
                      const active = num(gain) === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setGain(String(g))}
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors",
                            active
                              ? "border-accent/60 bg-accent/10 text-accent"
                              : "border-border text-muted-foreground hover:bg-muted/40",
                          )}
                        >
                          +{g}%
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      aria-pressed={num(gain) === -5}
                      onClick={() => setGain("-5")}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors",
                        num(gain) === -5
                          ? "border-loss/60 bg-loss/10 text-loss"
                          : "border-border text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      −5% (drawdown)
                    </button>
                  </div>
                </div>
              )}
            </Field>

            <Field
              id="periods"
              label="Number of periods"
              hint={`1 – ${COMPOUNDING_LIMITS.maxPeriods}`}
              error={err("periods")}
            >
              {(props) => (
                <div className="space-y-2">
                  <Input
                    {...props}
                    type="text"
                    inputMode="numeric"
                    placeholder="24"
                    value={periods}
                    onChange={(e) => setPeriods(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period presets">
                    {PERIOD_CHIPS.map((p) => {
                      const active = num(periods) === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setPeriods(String(p))}
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors",
                            active
                              ? "border-accent/60 bg-accent/10 text-accent"
                              : "border-border text-muted-foreground hover:bg-muted/40",
                          )}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Field>
          </div>
        </section>

        {/* ── Results ────────────────────────────────────────────────────── */}
        <div className="space-y-6" aria-live="polite">
          <section
            aria-labelledby="comp-result"
            className="rounded-xl border bg-card p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="comp-result" className="font-heading text-base font-semibold">
                Projection
              </h2>
              {result ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copySummary}
                  className="gap-1.5"
                >
                  {copied ? (
                    <Check className="size-4 text-profit" aria-hidden="true" />
                  ) : (
                    <ClipboardCopy className="size-4" aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              ) : null}
            </div>

            {result ? (
              <>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3.5">
                    <dt className="text-xs text-muted-foreground">Initial balance</dt>
                    <dd className="mt-1 font-mono text-xl font-semibold">
                      {fmtMoney(result.initialBalance, currency)}
                    </dd>
                  </div>
                  <div className="rounded-lg border p-3.5">
                    <dt className="text-xs text-muted-foreground">Final balance</dt>
                    <dd className="mt-1 font-mono text-xl font-semibold">
                      {fmtMoney(result.finalBalance, currency)}
                    </dd>
                  </div>
                  <div className="rounded-lg border p-3.5">
                    <dt className="text-xs text-muted-foreground">Total profit</dt>
                    <dd
                      className={cn(
                        "mt-1 font-mono text-xl font-semibold",
                        positive ? "text-profit" : "text-loss",
                      )}
                    >
                      {result.totalProfit >= 0 ? "+" : ""}
                      {fmtMoney(result.totalProfit, currency)}
                    </dd>
                  </div>
                  <div className="rounded-lg border p-3.5">
                    <dt className="text-xs text-muted-foreground">Total gain</dt>
                    <dd
                      className={cn(
                        "mt-1 font-mono text-xl font-semibold",
                        positive ? "text-profit" : "text-loss",
                      )}
                    >
                      {fmtSignedPercent(result.totalGainPercent)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Period growth{" "}
                  <span className="font-mono">
                    ×{(1 + (num(gain) ?? 0) / 100).toFixed(2)}
                  </span>{" "}
                  applied{" "}
                  <span className="font-mono">{result.rows.length}</span> times →
                  overall{" "}
                  <span className="font-mono">
                    ×{(result.finalBalance / result.initialBalance).toFixed(2)}
                  </span>{" "}
                  the starting balance.
                </p>
                <div className="mt-4 h-56 sm:h-64">
                  {option ? (
                    <EChart
                      option={option}
                      className="h-full w-full"
                      ariaLabel={`Projected equity curve over ${result.rows.length} periods, from ${fmtMoney(result.initialBalance, currency)} to ${fmtMoney(result.finalBalance, currency)}`}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed p-6 text-center">
                <TrendingUp className="mx-auto size-8 text-muted-foreground/50" aria-hidden="true" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {outcome.status === "incomplete"
                    ? "Set your starting balance, gain per period and horizon — the curve renders live."
                    : outcome.status === "invalid"
                      ? outcome.issues.map((issue) => issue.message).join(" ")
                      : null}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Schedule table (desktop) / cards (mobile) ─────────────────────── */}
      {result ? (
        <section aria-labelledby="comp-table" className="rounded-xl border bg-card p-5 sm:p-6">
          <h2 id="comp-table" className="font-heading text-base font-semibold">
            Period-by-period schedule
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {result.rows.length} periods · starting from{" "}
            {fmtMoney(result.initialBalance, currency)}
          </p>

          {/* Desktop table */}
          <div className="mt-4 hidden max-h-96 overflow-auto rounded-lg border md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Compounding schedule: starting balance, ending balance, cumulative
                profit and cumulative gain for each period.
              </caption>
              <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">Period</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Starting</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Ending</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total profit</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total gain</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {result.rows.map((row) => (
                  <tr key={row.period} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-2 text-muted-foreground">{row.period}</td>
                    <td className="px-4 py-2 text-right">{fmtMoney(row.startingBalance, currency)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtMoney(row.endingBalance, currency)}</td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right",
                        row.totalProfit >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {row.totalProfit >= 0 ? "+" : ""}
                      {fmtMoney(row.totalProfit, currency)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right",
                        row.totalGainPercent >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {fmtSignedPercent(row.totalGainPercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto md:hidden">
            {result.rows.map((row) => (
              <div key={row.period} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Period {row.period}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs font-semibold",
                      row.totalGainPercent >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {fmtSignedPercent(row.totalGainPercent)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-sm">
                  <span className="text-muted-foreground">
                    {fmtMoney(row.startingBalance, currency)}
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">→</span>
                  <span className="font-semibold">{fmtMoney(row.endingBalance, currency)}</span>
                </div>
                <p
                  className={cn(
                    "mt-0.5 font-mono text-xs",
                    row.totalProfit >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {row.totalProfit >= 0 ? "+" : ""}
                  {fmtMoney(row.totalProfit, currency)} overall
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section aria-labelledby="comp-how" className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 id="comp-how" className="flex items-center gap-2 font-heading text-base font-semibold">
          <Lightbulb className="size-4 text-accent" aria-hidden="true" />
          How it works
        </h2>
        <div className="mt-3 grid gap-4 text-sm leading-relaxed text-muted-foreground sm:grid-cols-3">
          <div>
            <p className="font-medium text-foreground">Per-period, not annual</p>
            <p className="mt-1">
              Every period multiplies the balance by{" "}
              <span className="font-mono text-foreground">(1 + gain)</span>: after N
              periods,{" "}
              <span className="font-mono text-foreground">Balance × (1 + r)^N</span>.
              A period is a day, a week or a month — whatever cadence you trade.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Drawdowns compound too</p>
            <p className="mt-1">
              Negative per-period returns are fully supported: a −5% period
              multiplies by 0.95. Losing streaks shrink the base that future gains
              grow from — the math shows exactly why protecting capital matters.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Honest columns</p>
            <p className="mt-1">
              Total profit and total gain are always cumulative versus your{" "}
              <em>initial</em> balance — not period-over-period tricks — so the last
              row always matches the summary cards.
            </p>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-1.5 rounded-md bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Educational projection only. A hypothetical compounding schedule is not a
          forecast and not a promise of performance — real trading returns are
          uneven, and drawdowns change the path.
        </p>
      </section>
    </div>
  );
}

"use client";

import * as React from "react";
import { FileDown, Printer } from "lucide-react";
import type { AnalyticsSuiteResponse } from "@cosmoz/shared";
import { formatNumber, formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AnalyticsDict } from "@/i18n/dictionaries/en/analytics";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Quarterly report — the Analytics suite's 13 tabs condensed into ONE
 * printable sheet (browser print → "Save as PDF"). Everything renders from
 * the SAME filtered server dataset the tabs render (no recomputation), and
 * the print styling is scoped by a body class so a normal page print is
 * never hijacked (same mechanics as the monthly review journal).
 */

type Suite = AnalyticsSuiteResponse;

function quarterLabel(from: string, to: string): string {
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return `${from} → ${to}`;
  const quarter = Math.floor(end.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${end.getUTCFullYear()}`;
}

/** Equity curve as a dependency-free inline SVG (prints reliably). */
function EquitySvg({ suite, ariaLabel }: { suite: Suite; ariaLabel: string }) {
  const points = suite.equity;
  if (points.length < 2) return null;
  const values = points.map((point) => Number(point.equity));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 600;
  const height = 120;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((Number(point.equity) - min) / span) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-28 w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <path d={area} className="fill-primary/10" />
      <path d={path} fill="none" className="stroke-primary" strokeWidth="1.5" />
    </svg>
  );
}

export function QuarterlyReportDialog({
  open,
  onOpenChange,
  suite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suite: Suite;
}) {
  const { dict } = useI18n();
  const T: AnalyticsDict["report"] = dict.analytics.report;
  const SH: AnalyticsDict["shared"] = dict.analytics.shared;
  // Keep the body class in sync while the dialog is open so the @media print
  // rules only ever hijack a print that STARTED from this sheet.
  React.useEffect(() => {
    if (!open) return;
    document.body.classList.add("printing-quarterly");
    return () => document.body.classList.remove("printing-quarterly");
  }, [open]);

  const onPrint = () => {
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-quarterly"), 400);
  };

  const s = suite.summary;
  const money = suite.meta.singleCurrency;
  const currency = suite.currency;
  const monthly = suite.reports.monthly;
  const strategies = [...suite.strategies].sort((a, b) => b.trades - a.trades).slice(0, 6);
  const topMistakes = [...suite.mistakes.entries]
    .sort((a, b) => Math.abs(Number(b.rCost)) - Math.abs(Number(a.rCost)))
    .slice(0, 5);
  const topEmotions = [...suite.psychology.emotionsBefore].sort((a, b) => b.trades - a.trades).slice(0, 4);

  const kpis: { label: string; value: string; loss?: boolean }[] = [
    { label: T.kpis.closedTrades, value: String(s.trades) },
    { label: T.kpis.netPnl, value: money ? formatSignedMoney(s.netPnl, currency) : "—", loss: true },
    { label: T.kpis.winRate, value: s.winRate === null ? "—" : formatPercent(s.winRate, 0) },
    { label: T.kpis.profitFactor, value: s.profitFactor === null ? "—" : formatNumber(s.profitFactor, 2) },
    { label: T.kpis.expectancy, value: `${formatR(s.expectancyR)} ${T.perTradeSuffix}` },
    { label: T.kpis.maxDD, value: `${formatR(s.maxDrawdownR)} · ${s.maxDrawdownPct === null ? "—" : `${formatNumber(s.maxDrawdownPct, 1)} %`}`, loss: true },
    { label: T.kpis.sharpe, value: s.sharpe === null ? "—" : formatNumber(s.sharpe, 2) },
    { label: T.kpis.sqn, value: s.sqn === null ? "—" : formatNumber(s.sqn, 2) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" data-testid="quarterly-report-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <FileDown className="size-5 text-accent" aria-hidden="true" />
            {T.title}
          </DialogTitle>
          <DialogDescription>
            {T.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={onPrint}
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent-hover"
            data-testid="quarterly-report-print"
          >
            <Printer className="size-4" aria-hidden="true" />
            {T.printBtn}
          </Button>
        </div>

        {/* ── The printable sheet ─────────────────────────────────────────── */}
        <div className="print-sheet rounded-xl border border-border bg-background p-6" data-testid="quarterly-report-sheet">
          <header className="flex items-start justify-between border-b pb-3">
            <div>
              <p className="font-heading text-lg font-bold tracking-tight">{T.sheetHeader}</p>
              <p className="text-sm text-muted-foreground">
                {quarterLabel(suite.meta.resolvedFrom, suite.meta.resolvedTo)} · {suite.meta.resolvedFrom} → {suite.meta.resolvedTo}
              </p>
            </div>
            <div className="text-right text-[10px] leading-relaxed text-muted-foreground">
              <p className="font-mono">{suite.meta.closedTrades} {SH.closedTrades}</p>
              <p>{suite.meta.descriptor}</p>
              <p>{suite.meta.openTradesExcluded} {SH.openExcluded}</p>
            </div>
          </header>

          <div className="mt-4 space-y-5 text-[11px]">
            {/* KPI band — the Overview tab, condensed */}
            <section>
              <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                {T.sections.performance}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {kpis.map((kpi) => (
                  <div key={kpi.label} className="rounded-lg border px-2.5 py-2">
                    <p className="text-[9px] tracking-wider uppercase text-muted-foreground">{kpi.label}</p>
                    <p
                      className={cn(
                        "font-mono text-sm font-bold tabular-nums",
                        kpi.loss && "text-loss",
                      )}
                    >
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Equity curve */}
            {suite.equity.length >= 2 && (
              <section>
                <p className="mb-1 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {T.sections.equityCurve} ({currency})
                </p>
                <EquitySvg suite={suite} ariaLabel={T.equityAria} />
              </section>
            )}

            {/* Monthly rollup — the Reports tab, condensed */}
            {monthly.length > 0 && (
              <section>
                <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {T.sections.monthlyRollup}
                </p>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">{T.thMonth}</th>
                      <th className="py-1 pr-3 font-medium">{T.thTrades}</th>
                      <th className="py-1 pr-3 font-medium">{T.thWinRate}</th>
                      <th className="py-1 pr-3 font-medium">{T.thSumR}</th>
                      {money && <th className="py-1 font-medium">{T.thNetPnl}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((row) => (
                      <tr key={row.key} className="border-b border-dashed last:border-0">
                        <td className="py-1 pr-3 font-mono">{row.key}</td>
                        <td className="py-1 pr-3 font-mono tabular-nums">{row.trades}</td>
                        <td className="py-1 pr-3 font-mono tabular-nums">
                          {row.winRate === null ? "—" : formatPercent(row.winRate, 0)}
                        </td>
                        <td className={cn("py-1 pr-3 font-mono tabular-nums", Number(row.r) >= 0 ? "text-profit" : "text-loss")}>
                          {formatR(row.r)}
                        </td>
                        {money && (
                          <td className={cn("py-1 font-mono tabular-nums", Number(row.netPnl) >= 0 ? "text-profit" : "text-loss")}>
                            {row.netPnl === null ? "—" : formatSignedMoney(row.netPnl, currency)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Strategy rows — the Strategy tab, condensed */}
            {strategies.length > 0 && (
              <section>
                <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {T.sections.strategyBreakdown}
                </p>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">{T.thStrategy}</th>
                      <th className="py-1 pr-3 font-medium">{T.thTrades}</th>
                      <th className="py-1 pr-3 font-medium">{T.thWinRate}</th>
                      <th className="py-1 pr-3 font-medium">{T.thExpectancy}</th>
                      <th className="py-1 pr-3 font-medium">{T.thMaxDDR}</th>
                      {money && <th className="py-1 font-medium">{T.thNetPnl}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {strategies.map((row) => (
                      <tr key={row.strategyId ?? "none"} className="border-b border-dashed last:border-0">
                        <td className="py-1 pr-3">{row.name}</td>
                        <td className="py-1 pr-3 font-mono tabular-nums">{row.trades}</td>
                        <td className="py-1 pr-3 font-mono tabular-nums">
                          {row.winRate === null ? "—" : formatPercent(row.winRate, 0)}
                        </td>
                        <td className={cn("py-1 pr-3 font-mono tabular-nums", row.expectancyR === null ? "" : Number(row.expectancyR) >= 0 ? "text-profit" : "text-loss")}>
                          {row.expectancyR === null ? "—" : formatR(row.expectancyR)}
                        </td>
                        <td className="py-1 pr-3 font-mono tabular-nums text-loss">{formatR(row.maxDrawdownR)}</td>
                        {money && (
                          <td className={cn("py-1 font-mono tabular-nums", row.netPnl === null ? "" : Number(row.netPnl) >= 0 ? "text-profit" : "text-loss")}>
                            {row.netPnl === null ? "—" : formatSignedMoney(row.netPnl, currency)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Risk snapshot — the Risk tab, condensed */}
              <section>
                <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {T.sections.riskSnapshot}
                </p>
                <ul className="space-y-1">
                  {(
                    [
                      [T.riskRows.riskDeviation, suite.risk.riskDeviationPct === null ? "—" : `${formatNumber(suite.risk.riskDeviationPct, 1)} %`],
                      [T.riskRows.maxDailyRisk, money && suite.risk.maxDailyRisk !== null ? formatSignedMoney(suite.risk.maxDailyRisk, currency) : "—"],
                      [T.riskRows.maxConcurrent, String(suite.risk.maxConcurrentPositions)],
                      [T.riskRows.recoveryFactor, s.recoveryFactor === null ? "—" : formatNumber(s.recoveryFactor, 2)],
                    ] as const
                  ).map(([label, value]) => (
                    <li key={label} className="flex items-center justify-between border-b border-dashed pb-1">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-semibold tabular-nums">{value}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Psychology — the Psychology tab, condensed */}
              <section>
                <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {T.sections.topEmotions}
                </p>
                {topEmotions.length === 0 ? (
                  <p className="text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-1">
                    {topEmotions.map((bucket) => (
                      <li key={bucket.key} className="flex items-center justify-between border-b border-dashed pb-1">
                        <span className="text-muted-foreground">{bucket.label}</span>
                        <span className="font-mono font-semibold tabular-nums">{bucket.trades}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Mistakes — the Mistakes tab, condensed */}
            {topMistakes.length > 0 && (
              <section>
                <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {T.sections.expensiveMistakes} ({suite.mistakes.violatingTrades} {T.tradesConcerned})
                </p>
                <ul className="space-y-1">
                  {topMistakes.map((entry) => (
                    <li key={entry.mistakeId} className="flex items-center justify-between border-b border-dashed pb-1">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {entry.label} · ×{entry.count}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-loss">{formatR(entry.rCost)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Anomalies + dataset warnings — server-echoed truth */}
            {(suite.meta.anomalies.length > 0 || suite.meta.warnings.length > 0) && (
              <section>
                <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {T.sections.serverObservations}
                </p>
                <ul className="space-y-1">
                  {suite.meta.anomalies.map((anomaly) => (
                    <li key={anomaly.code} className="flex gap-2">
                      <span className="w-24 shrink-0 font-mono text-[9px] font-semibold uppercase text-warning">{anomaly.code}</span>
                      <span className="flex-1 leading-snug">{anomaly.message}</span>
                    </li>
                  ))}
                  {suite.meta.warnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <span className="w-24 shrink-0 font-mono text-[9px] font-semibold uppercase text-muted-foreground">{T.noteChip}</span>
                      <span className="flex-1 leading-snug text-muted-foreground">{warning}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <footer className="mt-5 border-t pt-2 text-center text-[9px] text-muted-foreground">
            {T.footer}
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

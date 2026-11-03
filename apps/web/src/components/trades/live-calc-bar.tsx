"use client";

import { formatMoney, type Currency } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Live calculation bar (spec §4): mono font, updated live -
 * "R:R 1:2.4 · Risk $104 (1.0%) · Est. P&L +$255".
 * Estimated P&L may use P&L color semantics; risk never does.
 */

export interface LiveCalcBarProps {
  rr: number | null;
  riskAmount: string | null;
  riskPct: number | null;
  estimatedPnl: string | null;
  currency: Currency;
}

export function LiveCalcBar({ rr, riskAmount, riskPct, estimatedPnl, currency }: LiveCalcBarProps) {
  const { dict } = useI18n();
  const T = dict.trades.liveCalc;
  const rrLabel = rr !== null ? `1:${rr >= 10 ? rr.toFixed(0) : rr.toFixed(1)}` : "-";
  const riskLabel =
    riskAmount !== null
      ? `${formatMoney(riskAmount, currency, { digits: riskPct !== null && riskPct < 1 ? 2 : 0 })}${
          riskPct !== null ? ` (${formatPercentLabel(riskPct)})` : ""
        }`
      : "-";
  const pnlLabel = estimatedPnl !== null ? formatMoney(estimatedPnl, currency, { digits: 0 }) : null;

  return (
    <div
      role="status"
      aria-label={T.aria}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground"
    >
      <span>
        {T.rr} <span className="text-foreground">{rrLabel}</span>
      </span>
      <span className="text-border" aria-hidden="true">
        ·
      </span>
      <span>
        {T.risk} <span className="text-foreground">{riskLabel}</span>
      </span>
      {pnlLabel !== null ? (
        <>
          <span className="text-border" aria-hidden="true">
            ·
          </span>
          <span>
            {T.estPnl}{" "}
            <span
              className={cn(
                Number(estimatedPnl) >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {Number(estimatedPnl) >= 0 ? "+" : ""}
              {pnlLabel}
            </span>
          </span>
        </>
      ) : null}
    </div>
  );
}

function formatPercentLabel(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

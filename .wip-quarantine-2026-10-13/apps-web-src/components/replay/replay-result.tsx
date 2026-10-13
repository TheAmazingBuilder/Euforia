"use client";

import { formatMoney, formatNumber } from "@cosmoz/shared";
import type { ReplaySession } from "@cosmoz/shared";

import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Replay result (REPLAY MASTER PROMPT §30/§31) — the completed-session
 * summary. Only metrics backed by recorded data (the shared
 * computeReplayResult output); every figure is SIMULATED-labeled and never
 * mixed with live trading performance.
 */

function hours(ms: number): string {
  if (ms <= 0) return "—";
  const totalMinutes = Math.round(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hoursPart = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hoursPart}h`;
  if (hoursPart > 0) return `${hoursPart}h ${minutes}m`;
  return `${minutes}m`;
}

function ResultCell({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-2.5" data-testid="replay-result-cell">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-sm font-semibold tabular-nums",
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ReplayResultPanel({ session }: { session: ReplaySession }) {
  const { dict } = useI18n();
  const T = dict.replay;
  const result = session.result;
  const currency = "USD";

  if (!result) return null;

  return (
    <section className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4" data-testid="replay-result">
      <header>
        <p className="font-heading text-sm font-semibold text-foreground">{T.result.title}</p>
        <p className="text-[11px] text-muted-foreground">{T.result.subtitle}</p>
      </header>
      {result.closedTrades === 0 ? (
        <p className="text-sm text-muted-foreground">{T.result.noTrades}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <ResultCell label={T.result.duration} value={hours(result.durationMs)} />
          <ResultCell label={T.result.trades} value={String(result.simulatedTrades)} />
          <ResultCell label={T.result.winners} value={String(result.winningTrades)} tone="profit" />
          <ResultCell label={T.result.losers} value={String(result.losingTrades)} tone="loss" />
          <ResultCell
            label={T.result.winRate}
            value={result.winRatePct !== null ? `${formatNumber(result.winRatePct, 0)}%` : "—"}
          />
          <ResultCell
            label={T.result.netPnl}
            value={result.netPnl !== null ? formatMoney(result.netPnl, currency) : "—"}
            tone={result.netPnl != null ? (result.netPnl >= 0 ? "profit" : "loss") : undefined}
          />
          <ResultCell label={T.result.avgR} value={result.avgR !== null ? `${formatNumber(result.avgR, 2)}R` : "—"} />
          <ResultCell
            label={T.result.drawdown}
            value={result.maxDrawdown !== null ? formatMoney(result.maxDrawdown, currency) : "—"}
            tone="loss"
          />
          <ResultCell
            label={T.result.riskUsed}
            value={result.riskUsed !== null ? formatMoney(result.riskUsed, currency) : "—"}
          />
          <ResultCell label={T.result.decisions} value={String(result.decisionCount)} />
        </div>
      )}
    </section>
  );
}

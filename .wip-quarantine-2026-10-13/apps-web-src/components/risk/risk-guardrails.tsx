"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import type { RiskLevel, RiskOverviewResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, parseDecimal } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Guardrail cells for the Risk Command Center (one per .ledger-band cell):
 * label + edit affordance → big limit value + level pill → usage bar →
 * mono stat rows. Token-driven per design-tokens.md — accent = safe,
 * warning = approaching, loss = breach.
 */

export const LEVEL_PILL: Record<RiskLevel, { label: string; className: string }> = {
  SAFE: { label: "Safe", className: "border-accent/30 bg-accent/10 text-accent" },
  CAUTION: { label: "Caution", className: "border-warning/30 bg-warning/10 text-warning" },
  WARNING: { label: "Warning", className: "border-warning/40 bg-warning/20 text-warning" },
  BREACH: { label: "Limit hit", className: "border-loss/40 bg-loss/10 text-loss" },
};

/** Fill color for a usage ratio (0–1+): accent → warning → loss. */
export function ratioFillClass(ratio: number): string {
  if (!Number.isFinite(ratio)) return "bg-muted-foreground";
  if (ratio >= 1) return "bg-loss";
  if (ratio >= 0.5) return "bg-warning";
  return "bg-accent";
}

export function LevelPill({ level, className }: { level: RiskLevel; className?: string }) {
  const pill = LEVEL_PILL[level];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold leading-none",
        pill.className,
        className,
      )}
      role="status"
    >
      {pill.label}
    </span>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: "loss" | "profit" | "warning" }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <span
        className={cn(
          "whitespace-nowrap font-mono font-medium tabular-nums",
          tone === "loss" && "text-loss",
          tone === "profit" && "text-profit",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function UsageBar({ ratio, testId }: { ratio: number; testId: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return (
    <div className="goal-track" role="img" aria-label={`Usage ${formatPercent(clamped, 0)} of the limit`}>
      <div
        className="goal-fill"
        data-testid={testId}
        style={{
          width: `${clamped * 100}%`,
          backgroundColor:
            ratio >= 1
              ? "var(--loss)"
              : ratio >= 0.5
                ? "var(--warning)"
                : "var(--accent)",
        }}
      />
    </div>
  );
}

function EditIconButton({ label, onClick, testId }: { label: string; onClick: () => void; testId: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
    >
      <Pencil className="size-3" aria-hidden="true" />
    </Button>
  );
}

interface GuardrailProps {
  data: RiskOverviewResponse;
  onEdit: () => void;
}

/** Guardrail 1 — Risque max journalier (daily-loss cap). */
export function GuardrailDaily({ data, onEdit }: GuardrailProps) {
  const { daily } = data;
  const limitPct = parseDecimal(daily.limitPct);
  const spentPct = parseDecimal(daily.spentPct) ?? 0;
  const ratio = limitPct !== null && limitPct > 0 ? spentPct / limitPct : 0;
  const level: RiskLevel = ratio >= 1 ? "BREACH" : ratio >= 0.75 ? "WARNING" : ratio >= 0.5 ? "CAUTION" : "SAFE";
  const balanceValue = parseDecimal(data.balance) ?? 0;
  const budgetLeft =
    limitPct !== null
      ? formatMoney(Math.max(0, ((limitPct - spentPct) / 100) * balanceValue), data.currency, { digits: 0 })
      : "—";

  return (
    <div className="flex flex-col gap-2.5 sm:col-span-3" data-testid="risk-guardrail-daily">
      <div className="flex items-center justify-between gap-2">
        <span className="ledger-label">Daily loss cap</span>
        <EditIconButton label="Edit the daily loss cap" onClick={onEdit} testId="risk-edit-daily" />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {limitPct !== null ? `${formatNumber(limitPct, limitPct % 1 === 0 ? 0 : 1)}%` : "—"}
        </span>
        <LevelPill level={level} />
      </div>
      {limitPct !== null ? (
        <UsageBar ratio={ratio} testId="risk-bar-daily" />
      ) : (
        <p className="text-[11px] text-muted-foreground">No active rule — create one to arm the cap.</p>
      )}
      <div className="space-y-1">
        <StatRow
          label="Lost today"
          value={`${formatNumber(daily.spentPct, 2)}% · ${formatMoney(daily.spentAmount, data.currency, { digits: 0 })}`}
          tone={spentPct > 0 ? "loss" : undefined}
        />
        <StatRow label="Budget left" value={budgetLeft} />
      </div>
    </div>
  );
}

/** Guardrail 2 — Risque par trade (per-trade risk cap). */
export function GuardrailPerTrade({ data, onEdit }: GuardrailProps) {
  const { perTrade } = data;
  const limitPct = parseDecimal(perTrade.limitPct);
  const worst = parseDecimal(perTrade.worstRiskPct) ?? 0;
  const ratio = limitPct !== null && limitPct > 0 ? worst / limitPct : 0;
  const level: RiskLevel = ratio >= 1 ? "BREACH" : ratio >= 0.75 ? "WARNING" : ratio >= 0.5 ? "CAUTION" : "SAFE";

  return (
    <div className="flex flex-col gap-2.5 sm:col-span-3" data-testid="risk-guardrail-per-trade">
      <div className="flex items-center justify-between gap-2">
        <span className="ledger-label">Risk per trade</span>
        <EditIconButton label="Edit the per-trade risk cap" onClick={onEdit} testId="risk-edit-per-trade" />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {limitPct !== null ? `${formatNumber(limitPct, limitPct % 1 === 0 ? 0 : 1)}%` : "—"}
        </span>
        <LevelPill level={level} />
      </div>
      {limitPct !== null ? (
        <UsageBar ratio={ratio} testId="risk-bar-per-trade" />
      ) : (
        <p className="text-[11px] text-muted-foreground">No active rule — create one to arm the cap.</p>
      )}
      <div className="space-y-1">
        <StatRow label="Worst entry today" value={`${formatNumber(perTrade.worstRiskPct, 2)}%`} tone={ratio >= 1 ? "loss" : undefined} />
        <StatRow label="Average today" value={`${formatNumber(perTrade.avgRiskPct, 2)}%`} />
        <StatRow
          label="Over-cap entries"
          value={String(perTrade.breachesToday)}
          tone={perTrade.breachesToday > 0 ? "loss" : undefined}
        />
      </div>
    </div>
  );
}

/** Guardrail 3 — Limites pertes (daily loss / trade counters + streaks). */
export function GuardrailLosses({
  data,
  onEditLosses,
  onEditTrades,
}: {
  data: RiskOverviewResponse;
  onEditLosses: () => void;
  onEditTrades: () => void;
}) {
  const { losses } = data;
  const lossRatio =
    losses.maxLossesPerDay !== null && losses.maxLossesPerDay > 0
      ? losses.lossesToday / losses.maxLossesPerDay
      : 0;
  const tradeRatio =
    losses.maxTradesPerDay !== null && losses.maxTradesPerDay > 0
      ? losses.tradesToday / losses.maxTradesPerDay
      : 0;
  const worstRatio = Math.max(lossRatio, tradeRatio);
  const level: RiskLevel =
    worstRatio >= 1 ? "BREACH" : worstRatio >= 0.75 ? "WARNING" : worstRatio >= 0.5 ? "CAUTION" : "SAFE";

  return (
    <div className="flex flex-col gap-2.5 sm:col-span-3" data-testid="risk-guardrail-losses">
      <div className="flex items-center justify-between gap-2">
        <span className="ledger-label">Loss limits</span>
        <span className="flex items-center gap-1">
          <EditIconButton label="Edit the max losses per day" onClick={onEditLosses} testId="risk-edit-losses" />
          <EditIconButton label="Edit the max trades per day" onClick={onEditTrades} testId="risk-edit-trades" />
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {losses.maxLossesPerDay !== null ? `${losses.lossesToday}/${losses.maxLossesPerDay}` : String(losses.lossesToday)}
        </span>
        <LevelPill level={level} />
      </div>
      <UsageBar ratio={lossRatio} testId="risk-bar-losses" />
      <div className="space-y-1">
        <StatRow
          label="Trades today"
          value={
            losses.maxTradesPerDay !== null
              ? `${losses.tradesToday}/${losses.maxTradesPerDay}`
              : String(losses.tradesToday)
          }
          tone={tradeRatio >= 1 ? "warning" : undefined}
        />
        <StatRow
          label="Loss streak"
          value={`${losses.lossStreakCurrent} now · worst ${losses.lossStreakWorst}`}
          tone={losses.lossStreakCurrent >= 2 ? "warning" : undefined}
        />
      </div>
    </div>
  );
}

/** Guardrail 4 — Alertes drawdown (drawdown budget + escalation ladder). */
export function GuardrailDrawdown({ data, onEdit }: GuardrailProps) {
  const { drawdown } = data;
  const limitPct = parseDecimal(drawdown.limitPct);
  const currentPct = parseDecimal(drawdown.currentPct) ?? 0;
  const ratio =
    limitPct !== null && limitPct > 0 ? Math.abs(Math.min(0, currentPct)) / limitPct : 0;
  const level: RiskLevel = ratio >= 1 ? "BREACH" : ratio >= 0.75 ? "WARNING" : ratio >= 0.5 ? "CAUTION" : "SAFE";
  const triggeredCount = drawdown.thresholds.filter((step) => step.triggered).length;

  return (
    <div className="flex flex-col gap-2.5 sm:col-span-3" data-testid="risk-guardrail-drawdown">
      <div className="flex items-center justify-between gap-2">
        <span className="ledger-label">Drawdown alerts</span>
        <EditIconButton label="Edit the max drawdown" onClick={onEdit} testId="risk-edit-drawdown" />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {limitPct !== null ? `${formatNumber(limitPct, limitPct % 1 === 0 ? 0 : 1)}%` : "—"}
        </span>
        <LevelPill level={level} />
      </div>
      {limitPct !== null ? (
        <UsageBar ratio={ratio} testId="risk-bar-drawdown" />
      ) : (
        <p className="text-[11px] text-muted-foreground">No active rule — create one to arm the ladder.</p>
      )}
      <div className="space-y-1">
        <StatRow
          label="Current DD"
          value={`${formatNumber(currentPct, 2)}% · ${formatMoney(drawdown.currentAmount, data.currency, { digits: 0 })}`}
          tone={currentPct < 0 ? "warning" : undefined}
        />
        <StatRow label="Peak equity" value={formatMoney(drawdown.peakEquity, data.currency, { digits: 0 })} />
        <StatRow
          label="Ladder fired"
          value={`${triggeredCount}/3 thresholds`}
          tone={triggeredCount > 0 ? "warning" : undefined}
        />
      </div>
    </div>
  );
}

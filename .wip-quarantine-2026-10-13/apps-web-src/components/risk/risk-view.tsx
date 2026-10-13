"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, RefreshCcw, Siren, ShieldAlert, ShieldCheck, Stars } from "lucide-react";
import type { RiskLevel, RiskOverviewResponse, Rule, RuleType } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, parseDecimal } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EditLimitDialog } from "@/components/risk/edit-limit-dialog";
import {
  ExposureBreakdown,
  OpenRiskPanel,
  PositionSizerCard,
  RecoveryPanel,
  RiskBudgetPanel,
} from "@/components/risk/risk-ops";
import {
  GuardrailDaily,
  GuardrailDrawdown,
  GuardrailLosses,
  GuardrailPerTrade,
  LevelPill,
  LEVEL_PILL,
  ratioFillClass,
} from "@/components/risk/risk-guardrails";
import { DailyRiskChart, UnderwaterDrawdownChart } from "@/components/risk/risk-charts";
import { useAcknowledgeViolation, useRiskOverview, useRules } from "@/lib/api/queries";
import { getChartTheme, type ChartTheme } from "@/lib/utils/chart-theme";
import { cn } from "@/lib/utils";

/**
 * Risk Command Center (/risk): the four account guardrails — daily-loss
 * cap, per-trade risk cap, loss limits, drawdown alerts — each with a
 * live usage bar and an inline limit editor, plus the posture ring, the
 * underwater chart with its escalation ladder, the daily risk-commitment
 * series and the risk event feed. All aggregates come from
 * GET /risk/overview; edits hit the rules engine (PATCH /rules/:id).
 */

/** Compact relative time — "now", "12m", "3h", "5d" (same idiom as the bell). */
function relativeTime(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** CSS ring color per posture level (tokens + one allowed color-mix). */
const RING_COLOR: Record<RiskLevel, string> = {
  SAFE: "var(--accent)",
  CAUTION: "var(--warning)",
  WARNING: "color-mix(in srgb, var(--warning) 55%, var(--loss))",
  BREACH: "var(--loss)",
};

const POSTURE_SENTENCE: Record<RiskLevel, string> = {
  SAFE: "All guardrails are comfortable.",
  CAUTION: "A guardrail is half spent — stay deliberate.",
  WARNING: "A guardrail is close to its limit — tighten up.",
  BREACH: "A limit is hit — stop, review, reset before re-entering.",
};

function RiskSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading risk">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-7 w-64" />
        </div>
        <Skeleton className="h-8 w-36 rounded-full" />
      </div>
      <div className="ledger-band">
        {["daily", "per-trade", "losses", "drawdown"].map((key) => (
          <div key={key} className="col-span-1 space-y-3 sm:col-span-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="ledger-band">
        <div className="col-span-2 sm:col-span-8">
          <Skeleton className="h-52 w-full" />
        </div>
        <div className="col-span-2 sm:col-span-4">
          <Skeleton className="h-52 w-full" />
        </div>
      </div>
    </div>
  );
}

function ErrorRisk({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-md bg-surface">
      <CardContent className="flex flex-col items-center py-14 text-center">
        <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-lg font-semibold">Risk data unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your guardrails could not be loaded. Check your connection, then retry.
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

/** Posture cell — CSS conic ring at the worst guardrail usage + per-guardrail bars. */
function PosturePanel({ data }: { data: RiskOverviewResponse }) {
  const ratios = React.useMemo(() => {
    const dailyLimit = parseDecimal(data.daily.limitPct);
    const perTradeLimit = parseDecimal(data.perTrade.limitPct);
    const ddLimit = parseDecimal(data.drawdown.limitPct);
    const currentDd = parseDecimal(data.drawdown.currentPct) ?? 0;
    return [
      {
        key: "daily",
        label: "Daily loss",
        ratio:
          dailyLimit !== null && dailyLimit > 0
            ? (parseDecimal(data.daily.spentPct) ?? 0) / dailyLimit
            : 0,
      },
      {
        key: "perTrade",
        label: "Risk / trade",
        ratio:
          perTradeLimit !== null && perTradeLimit > 0
            ? (parseDecimal(data.perTrade.worstRiskPct) ?? 0) / perTradeLimit
            : 0,
      },
      {
        key: "losses",
        label: "Loss caps",
        ratio: Math.max(
          data.losses.maxLossesPerDay !== null && data.losses.maxLossesPerDay > 0
            ? data.losses.lossesToday / data.losses.maxLossesPerDay
            : 0,
          data.losses.maxTradesPerDay !== null && data.losses.maxTradesPerDay > 0
            ? data.losses.tradesToday / data.losses.maxTradesPerDay
            : 0,
        ),
      },
      {
        key: "drawdown",
        label: "Drawdown",
        ratio:
          ddLimit !== null && ddLimit > 0 ? Math.abs(Math.min(0, currentDd)) / ddLimit : 0,
      },
    ];
  }, [data]);

  const postureRatio = parseDecimal(data.postureRatio) ?? 0;
  const ringPct = Math.max(0, Math.min(1, postureRatio)) * 100;

  return (
    <div className="flex h-full flex-col gap-4" data-testid="risk-posture">
      <span className="ledger-label">Posture</span>
      <div className="flex items-center gap-4">
        <div
          className="relative size-24 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${RING_COLOR[data.posture]} ${ringPct}%, color-mix(in srgb, var(--border) 55%, transparent) 0)`,
          }}
          role="img"
          aria-label={`Posture: ${data.posture}, worst guardrail at ${formatPercent(postureRatio, 0)} of its limit`}
        >
          <div className="absolute inset-[7px] rounded-full bg-surface" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-lg font-semibold tabular-nums">
              {formatPercent(postureRatio, 0)}
            </span>
          </div>
        </div>
        <div className="min-w-0 space-y-1.5">
          <LevelPill level={data.posture} />
          <p className="text-xs leading-relaxed text-muted-foreground">{POSTURE_SENTENCE[data.posture]}</p>
        </div>
      </div>
      <div className="mt-auto space-y-2.5">
        {ratios.map((row) => (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-mono font-medium tabular-nums">
                {formatPercent(Math.min(1, Math.max(0, row.ratio)), 0)}
              </span>
            </div>
            <div className="goal-track">
              <div
                className={cn("goal-fill", ratioFillClass(row.ratio))}
                style={{ width: `${Math.max(0, Math.min(1, row.ratio)) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Risk event feed — violations (acknowledgeable) + drawdown/risk alerts. */
function EventsFeed({ data }: { data: RiskOverviewResponse }) {
  const acknowledge = useAcknowledgeViolation();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (data.events.length === 0) {
    return (
      <div className="flex h-full flex-col" data-testid="risk-events">
        <div className="flex items-baseline justify-between gap-2">
          <span className="ledger-label">Risk events</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">0</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <ShieldCheck className="size-6 text-profit" aria-hidden="true" />
          <p className="text-sm font-medium">All guardrails quiet</p>
          <p className="text-xs text-muted-foreground">No violations or risk alerts in the log.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3" data-testid="risk-events">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ledger-label">Risk events</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          last {data.events.length}
        </span>
      </div>
      <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
        {data.events.map((event) => {
          const acknowledged = event.acknowledgedAt !== null;
          return (
            <li
              key={`${event.kind}-${event.id}`}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-2.5 py-2",
                acknowledged ? "border-border/60 opacity-60" : "border-border",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  event.severity === "LOCK" ? "bg-loss" : event.severity === "ALERT" ? "bg-accent" : "bg-warning",
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {event.kind === "VIOLATION" ? (
                    <ShieldAlert className="size-3 shrink-0 text-loss" aria-label="Violation" />
                  ) : (
                    <Siren className="size-3 shrink-0 text-warning" aria-label="Risk alert" />
                  )}
                  <span className="truncate text-xs font-semibold">{event.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {relativeTime(event.createdAt, now)}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {event.message}
                </p>
              </div>
              {event.kind === "VIOLATION" && !acknowledged ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground hover:text-accent"
                  aria-label={`Acknowledge: ${event.title}`}
                  data-testid="risk-event-ack"
                  disabled={acknowledge.isPending}
                  onClick={() =>
                    acknowledge.mutate({ violationId: event.id, input: {} })
                  }
                >
                  <Check className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface EditTarget {
  rule: Rule | null;
  type: RuleType;
  limitLabel: string;
  step: number;
  max: number;
}

const DAILY_TARGET: EditTarget = { rule: null, type: "MAX_DAILY_LOSS_PCT", limitLabel: "Daily loss cap", step: 0.5, max: 100 };
const PER_TRADE_TARGET: EditTarget = { rule: null, type: "MAX_RISK_PCT_PER_TRADE", limitLabel: "Risk per trade cap", step: 0.1, max: 100 };
const LOSSES_TARGET: EditTarget = { rule: null, type: "MAX_LOSSES_PER_DAY", limitLabel: "Max losses per day", step: 1, max: 50 };
const TRADES_TARGET: EditTarget = { rule: null, type: "MAX_TRADES_PER_DAY", limitLabel: "Max trades per day", step: 1, max: 50 };
const DRAWDOWN_TARGET: EditTarget = { rule: null, type: "MAX_DRAWDOWN_PCT", limitLabel: "Max drawdown", step: 0.5, max: 100 };

export function RiskView() {
  const { data, isLoading, isError, refetch } = useRiskOverview();
  const rulesQuery = useRules();
  const { resolvedTheme } = useTheme();

  // resolvedTheme is an intentional dependency even though tokens are read
  // from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo<ChartTheme>(() => getChartTheme(), [resolvedTheme]);

  const ruleByType = React.useCallback(
    (type: RuleType): Rule | null => {
      const rules = rulesQuery.data?.rules ?? [];
      return (
        rules.find((rule) => rule.type === type && rule.isActive) ??
        rules.find((rule) => rule.type === type) ??
        null
      );
    },
    [rulesQuery.data],
  );

  const [editTarget, setEditTarget] = React.useState<EditTarget | null>(null);
  const openEdit = (base: EditTarget, rule: Rule | null) =>
    setEditTarget({ ...base, rule });

  if (isLoading) return <RiskSkeleton />;
  if (isError || data === undefined) return <ErrorRisk onRetry={() => void refetch()} />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6" data-testid="risk-view">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ledger-label">Risk — the four guardrails</p>
          <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
            Risk Command Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily-loss cap, per-trade risk, loss limits and drawdown alerts — live against your
            account.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="ledger-label">Balance</p>
            <p className="font-mono text-lg font-semibold tabular-nums">
              {formatMoney(data.balance, data.currency)}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-xs font-semibold",
              LEVEL_PILL[data.posture].className,
            )}
            role="status"
            data-testid="risk-posture-badge"
          >
            {data.posture === "SAFE" ? (
              <ShieldCheck className="size-3.5" aria-hidden="true" />
            ) : (
              <ShieldAlert className="size-3.5" aria-hidden="true" />
            )}
            {LEVEL_PILL[data.posture].label} · {formatPercent(parseDecimal(data.postureRatio) ?? 0, 0)}
          </span>
        </div>
      </div>

      {/* Command strip — the operational read: budget, open risk, recovery */}
      <section aria-label="Operational risk read" className="ledger-band">
        <RiskBudgetPanel data={data} />
        <OpenRiskPanel data={data} />
        <RecoveryPanel data={data} />
      </section>

      {/* Guardrails band */}
      <section aria-label="The four risk guardrails" className="ledger-band">
        <GuardrailDaily data={data} onEdit={() => openEdit(DAILY_TARGET, ruleByType("MAX_DAILY_LOSS_PCT"))} />
        <GuardrailPerTrade data={data} onEdit={() => openEdit(PER_TRADE_TARGET, ruleByType("MAX_RISK_PCT_PER_TRADE"))} />
        <GuardrailLosses
          data={data}
          onEditLosses={() => openEdit(LOSSES_TARGET, ruleByType("MAX_LOSSES_PER_DAY"))}
          onEditTrades={() => openEdit(TRADES_TARGET, ruleByType("MAX_TRADES_PER_DAY"))}
        />
        <GuardrailDrawdown data={data} onEdit={() => openEdit(DRAWDOWN_TARGET, ruleByType("MAX_DRAWDOWN_PCT"))} />
      </section>

      {/* Underwater + posture band */}
      <section aria-label="Drawdown detail and posture" className="ledger-band">
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-8">
          <div className="flex items-baseline justify-between gap-2">
            <span className="ledger-label">Underwater — drawdown from peak</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {data.drawdown.limitPct !== null
                ? `limit −${formatNumber(data.drawdown.limitPct, Number(data.drawdown.limitPct) % 1 === 0 ? 0 : 1)}% · worst ${formatNumber(data.drawdown.maxRecordedPct, 2)}%`
                : "no active drawdown rule"}
            </span>
          </div>
          <UnderwaterDrawdownChart data={data} theme={theme} />
        </div>
        <div className="col-span-2 sm:col-span-4">
          <PosturePanel data={data} />
        </div>
      </section>

      {/* Daily risk + events band */}
      <section aria-label="Daily risk commitment and risk events" className="ledger-band">
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-7">
          <div className="flex items-baseline justify-between gap-2">
            <span className="ledger-label">Risk committed — last 21 trading days</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">% of balance</span>
          </div>
          <DailyRiskChart data={data} theme={theme} />
        </div>
        <div className="col-span-2 sm:col-span-5">
          <EventsFeed data={data} />
        </div>
      </section>

      {/* Sizing + exposure band — the pre-entry desk */}
      <section aria-label="Position sizing and open exposure" className="ledger-band">
        <PositionSizerCard data={data} />
        <ExposureBreakdown data={data} />
      </section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Bases: daily loss = realized P&amp;L of today&apos;s closed trades vs current balance ·
        per-trade risk = risk committed per entry vs balance · drawdown = distance from the
        running equity peak · thresholds fire at 50 / 75 / 100% of the drawdown limit and reach
        the notification bell · open risk sums the planned risk of live positions · the sizer
        suggests a size floored to 0.01 and never validates above the per-trade cap. Limits are
        editable in place and re-run the risk engine on save.
      </p>

      {/* Limit editor (single dialog driven by editTarget) */}
      <EditLimitDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        rule={editTarget?.rule ?? null}
        type={editTarget?.type ?? "MAX_DAILY_LOSS_PCT"}
        limitLabel={editTarget?.limitLabel ?? DAILY_TARGET.limitLabel}
        step={editTarget?.step ?? 0.5}
        max={editTarget?.max ?? 100}
      />
    </div>
  );
}

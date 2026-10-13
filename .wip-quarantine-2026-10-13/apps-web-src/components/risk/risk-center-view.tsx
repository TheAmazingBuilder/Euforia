"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Gauge,
  Layers,
  RefreshCcw,
  ShieldAlert,
  Stars,
} from "lucide-react";
import type { RiskCenterResponse, RiskLimitUsage } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatSignedMoney } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, usePreferences, useRiskCenter } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Risk Command Center (/risk) — the consolidated risk surface fed by ONE
 * server aggregate (GET /risk/center): loss-limit consumption for the
 * day / week / month windows, open exposure vs the caps from Settings →
 * Risk, and the live Rules Engine status those defaults feed.
 * Stream: Settings: Daily Loss Limit = X → Rules Engine → this status.
 */

const CAUTION_PCT = 70;

type RiskLevel = "safe" | "caution" | "limit";

const LEVEL_FILL: Record<RiskLevel, string> = {
  safe: "bg-accent",
  caution: "bg-warning",
  limit: "bg-loss",
};

const LEVEL_BADGE: Record<RiskLevel, string> = {
  safe: "bg-accent/10 text-accent",
  caution: "bg-warning/10 text-warning",
  limit: "bg-loss/10 text-loss",
};

const LEVEL_LABEL: Record<RiskLevel, string> = {
  safe: "Safe zone",
  caution: "Near limit",
  limit: "Limit reached",
};

function parsePct(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function levelOf(usedPct: number, breached: boolean): RiskLevel {
  if (breached || usedPct >= 100) return "limit";
  if (usedPct >= CAUTION_PCT) return "caution";
  return "safe";
}

function clampPct(pct: number): number {
  return Math.min(Math.max(pct, 0), 100);
}

/** Overall status from the worst window / exposure breach. */
function overallLevel(center: RiskCenterResponse): RiskLevel {
  const windows = [center.daily, center.weekly, center.monthly];
  const overCaps =
    center.exposure.count > center.exposure.cap ||
    (center.exposure.count > 0 &&
      parsePct(center.exposure.exposurePct) >= parsePct(center.exposure.capPct)) ||
    (center.exposure.count > 0 &&
      parsePct(center.exposure.correlatedPct) >= parsePct(center.exposure.correlatedCapPct));
  if (windows.some((w) => w.breached) || overCaps) return "limit";
  const nearLimits =
    windows.some((w) => parsePct(w.usedPct) >= CAUTION_PCT) ||
    (center.exposure.count > 0 &&
      (parsePct(center.exposure.exposurePct) >= CAUTION_PCT ||
        parsePct(center.exposure.correlatedPct) >= CAUTION_PCT));
  return nearLimits ? "caution" : "safe";
}

/** Horizontal consumption meter with the caution tick (discipline palette). */
function Meter({
  usedPct,
  breached,
  label,
}: {
  usedPct: number;
  breached: boolean;
  label: string;
}) {
  const level = levelOf(usedPct, breached);
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-surface-raised"
      role="img"
      aria-label={label}
    >
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL_FILL[level])}
        style={{ width: `${clampPct(usedPct)}%` }}
      />
      <div
        className="absolute inset-y-[-2px] w-px bg-warning"
        style={{ left: `${CAUTION_PCT}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

function LimitCard({
  title,
  hint,
  usage,
  currency,
}: {
  title: string;
  hint: string;
  usage: RiskLimitUsage;
  currency: RiskCenterResponse["currency"];
}) {
  const used = parsePct(usage.usedPct);
  const level = levelOf(used, usage.breached);
  return (
    <Card className="bg-surface" data-testid={`risk-limit-${title.toLowerCase()}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between gap-2 font-heading text-sm font-semibold">
          {title}
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium",
              LEVEL_BADGE[level],
            )}
          >
            {LEVEL_LABEL[level]}
          </span>
        </CardTitle>
        <CardDescription className="text-xs">{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-xl font-semibold tabular-nums">
            {formatNumber(usage.usedPct, 1)}&nbsp;%
          </span>
          <span
            className={cn(
              "font-mono text-xs font-medium tabular-nums",
              parsePct(usage.pnlNet) < 0 ? "text-loss" : "text-profit",
            )}
          >
            {formatSignedMoney(usage.pnlNet, currency, { digits: 0 })}
          </span>
        </div>
        <Meter
          usedPct={used}
          breached={usage.breached}
          label={`${title} loss limit: ${formatNumber(usage.usedPct, 1)} percent consumed`}
        />
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatMoney(usage.lossAmount, currency, { digits: 0 })} /{" "}
          {formatMoney(usage.lossBudget, currency, { digits: 0 })} · limit{" "}
          {formatNumber(usage.limitPct, 1)}&nbsp;%
        </p>
      </CardContent>
    </Card>
  );
}

function ExposureRow({
  label,
  value,
  cap,
  suffix,
  breached,
}: {
  label: string;
  value: string;
  cap: string;
  suffix: string;
  breached: boolean;
}) {
  const meterPct =
    parsePct(cap) > 0 ? Math.min((parsePct(value) / parsePct(cap)) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium tabular-nums">
          {value}
          {suffix} <span className="text-muted-foreground">/ {cap}{suffix}</span>
          {breached ? <span className="ml-1.5 text-loss">over cap</span> : null}
        </span>
      </div>
      <Meter
        usedPct={meterPct}
        breached={breached}
        label={`${label}: ${value} of ${cap}${suffix}`}
      />
    </div>
  );
}

function EngineRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

function RiskCenterSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading risk center">
      <Skeleton className="h-[104px] rounded-xl" />
      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <Skeleton className="h-[196px] rounded-xl" />
        <Skeleton className="h-[196px] rounded-xl" />
        <Skeleton className="h-[196px] rounded-xl" />
      </div>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}

export function RiskCenterView({ title, description }: { title: string; description: string }) {
  const center = useRiskCenter();
  const { data: preferences } = usePreferences();
  const { data: alertsData } = useAlerts();
  const queryClient = useQueryClient();

  const retry = React.useCallback(() => {
    void queryClient.refetchQueries({ type: "active" });
  }, [queryClient]);

  if (center.isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </header>
        <RiskCenterSkeleton />
      </div>
    );
  }

  if (center.isError || !center.data) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </header>
        <Card className="mx-auto max-w-md bg-surface">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Stars className="size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-4 font-heading text-lg font-semibold">The gauge went dark</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The risk center could not load your aggregates. Check your connection, then retry.
            </p>
            <Button variant="outline" className="mt-6" onClick={retry}>
              <RefreshCcw className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = center.data;
  const level = overallLevel(data);
  const riskPrefs = preferences?.risk;
  const riskAlerts = (alertsData?.alerts ?? [])
    .filter((alert) => alert.type === "RISK_BUDGET" && alert.dismissedAt === null)
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      {/* ── Status band: balance + overall state ─────────────────────────── */}
      <Card className="bg-surface" data-testid="risk-status-band">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
          <div className="min-w-0">
            <p className="ledger-label">Current balance</p>
            <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
              {formatMoney(data.balance, data.currency)}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2.5 py-1 font-mono text-xs font-medium",
              LEVEL_BADGE[level],
            )}
            role="status"
          >
            <Gauge className="mr-1.5 size-3.5" aria-hidden="true" />
            {LEVEL_LABEL[level]}
          </span>
          <p className="ml-auto max-w-xs text-xs leading-relaxed text-muted-foreground">
            Limits come from{" "}
            <Link href="/settings#risk" className="text-accent underline-offset-4 hover:underline">
              Settings → Risk
            </Link>{" "}
            and feed the Rules Engine; breaches raise alerts automatically.
          </p>
        </CardContent>
      </Card>

      {/* ── Loss limits: day / week / month ──────────────────────────────── */}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <LimitCard
          title="Daily"
          hint="Loss consumed today vs the daily stop."
          usage={data.daily}
          currency={data.currency}
        />
        <LimitCard
          title="Weekly"
          hint="Loss consumed this week vs the weekly stop."
          usage={data.weekly}
          currency={data.currency}
        />
        <LimitCard
          title="Monthly"
          hint="Loss consumed this month vs the monthly stop."
          usage={data.monthly}
          currency={data.currency}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {/* ── Open exposure vs caps ──────────────────────────────────── */}
        <Card className="bg-surface" data-testid="risk-exposure-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <Layers className="size-4 text-accent" aria-hidden="true" />
              Open exposure
            </CardTitle>
            <CardDescription>
              {data.exposure.count} open position{data.exposure.count === 1 ? "" : "s"} · committed
              risk vs the caps
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ExposureRow
              label="Open positions"
              value={String(data.exposure.count)}
              cap={String(data.exposure.cap)}
              suffix=""
              breached={data.exposure.count > data.exposure.cap}
            />
            <ExposureRow
              label="Account exposure"
              value={formatNumber(data.exposure.exposurePct, 1)}
              cap={formatNumber(data.exposure.capPct, 1)}
              suffix=" %"
              breached={
                data.exposure.count > 0 &&
                parsePct(data.exposure.exposurePct) >= parsePct(data.exposure.capPct)
              }
            />
            <ExposureRow
              label="Correlated exposure"
              value={formatNumber(data.exposure.correlatedPct, 1)}
              cap={formatNumber(data.exposure.correlatedCapPct, 1)}
              suffix=" %"
              breached={
                data.exposure.count > 0 &&
                parsePct(data.exposure.correlatedPct) >= parsePct(data.exposure.correlatedCapPct)
              }
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Correlated = the worst same-market, same-direction group of open positions.
            </p>
          </CardContent>
        </Card>

        {/* ── Rules Engine linkage ───────────────────────────────────── */}
        <Card className="bg-surface" data-testid="risk-engine-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <ShieldAlert className="size-4 text-accent" aria-hidden="true" />
              Rules Engine linkage
            </CardTitle>
            <CardDescription>
              Your risk defaults as enforced today
              {riskPrefs?.syncWithRulesEngine === false ? " · sync OFF" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {riskPrefs ? (
              <div className="space-y-2">
                <EngineRow
                  label="Sizing method"
                  value={
                    riskPrefs.sizingMethod === "FIXED_AMOUNT"
                      ? `Fixed ${formatMoney(riskPrefs.fixedRiskAmount ?? "0", data.currency, { digits: 0 })}`
                      : riskPrefs.sizingMethod === "PERCENT_RISK"
                        ? "Percent risk"
                        : riskPrefs.sizingMethod === "R_BASED"
                          ? "R-based"
                          : "Manual"
                  }
                />
                <EngineRow
                  label="Default / max risk per trade"
                  value={`${formatNumber(riskPrefs.defaultRiskPerTradePct, 1)} % / ${formatNumber(riskPrefs.maxRiskPerTradePct, 1)} %`}
                />
                <EngineRow
                  label="Engine sync"
                  value={riskPrefs.syncWithRulesEngine ? "On save" : "Manual"}
                />
              </div>
            ) : (
              <Skeleton className="h-16 rounded-lg" />
            )}
            <div className="space-y-2 border-t border-border pt-3">
              {data.engine.limits.map((limit) => (
                <EngineRow
                  key={limit.ruleId}
                  label={limit.type.replaceAll("_", " ").toLowerCase()}
                  value={
                    <>
                      {formatNumber(limit.current, limit.type === "MAX_RISK_PCT_PER_TRADE" ? 2 : 0)}
                      {" / "}
                      {formatNumber(limit.limit, limit.type === "MAX_RISK_PCT_PER_TRADE" ? 1 : 0)}
                    </>
                  }
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" variant="outline">
                <Link href="/settings#risk">
                  Edit risk defaults
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="text-accent hover:text-accent">
                <Link href="/discipline">Open discipline</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Risk alerts strip ───────────────────────────────────────────── */}
      <Card className="bg-surface" data-testid="risk-alerts-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
            Risk alerts
          </CardTitle>
          <CardDescription>Budget and limit warnings from the engine.</CardDescription>
        </CardHeader>
        <CardContent>
          {riskAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No risk alerts — the engine is quiet.
            </p>
          ) : (
            <ul className="space-y-2">
              {riskAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      alert.severity === "LOCK" || alert.severity === "ALERT"
                        ? "bg-loss"
                        : "bg-warning",
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{alert.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {alert.message}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

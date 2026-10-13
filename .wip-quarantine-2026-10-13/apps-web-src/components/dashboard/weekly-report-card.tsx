"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  Equal,
  FileDown,
  Flame,
  Loader2,
  Snowflake,
} from "lucide-react";
import type { Currency, Trade } from "@cosmoz/shared";
import { formatPercent, formatR, formatSignedMoney } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccounts, useInstruments, useStrategies, useTrades } from "@/lib/api/queries";
import { buildWeeklyInput } from "@/lib/pdf/export-inputs";
import { downloadPdf, rasterizeBrandMark } from "@/lib/pdf/journal-pdf";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** UTC date key ("YYYY-MM-DD") shifted `days` back from today. */
function dateKeyDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

interface WeekSummary {
  closed: number;
  netPnl: number;
  wins: number;
  totalR: number;
  /** Plan-following rate over closed trades with a self-report (null = no data). */
  planFollowedPct: number | null;
  bestSymbol: string | null;
  bestR: number | null;
  worstSymbol: string | null;
  worstR: number | null;
}

/** Aggregates the closed trades whose tradingDate falls in [fromKey..toKey]. */
function summarizeWeek(
  trades: Trade[],
  fromKey: string,
  toKey: string,
  symbolOf: (trade: Trade) => string,
): WeekSummary {
  let netPnl = 0;
  let wins = 0;
  let totalR = 0;
  let planTotal = 0;
  let planFollowed = 0;
  let bestSymbol: string | null = null;
  let bestR: number | null = null;
  let worstSymbol: string | null = null;
  let worstR: number | null = null;
  let closed = 0;

  for (const trade of trades) {
    if (trade.status !== "CLOSED") continue;
    if (trade.tradingDate < fromKey || trade.tradingDate > toKey) continue;
    closed += 1;

    const pnl = Number(trade.pnlNet ?? 0);
    netPnl += pnl;
    if (pnl >= 0) wins += 1;

    const r = trade.rMultiple === null ? 0 : Number(trade.rMultiple);
    totalR += r;
    if (bestR === null || r > bestR) {
      bestR = r;
      bestSymbol = symbolOf(trade);
    }
    if (worstR === null || r < worstR) {
      worstR = r;
      worstSymbol = symbolOf(trade);
    }

    if (trade.followedPlan !== null) {
      planTotal += 1;
      if (trade.followedPlan) planFollowed += 1;
    }
  }

  return {
    closed,
    netPnl,
    wins,
    totalR,
    planFollowedPct: planTotal > 0 ? planFollowed / planTotal : null,
    bestSymbol,
    bestR,
    worstSymbol,
    worstR,
  };
}

/** Short human window label, e.g. "Sep 15 – Sep 21". */
function formatWindow(fromKey: string, toKey: string): string {
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const keyParts = (key: string) => ({
    month: monthFmt.format(new Date(`${key}T00:00:00Z`)),
    day: Number(key.slice(8, 10)),
  });
  const from = keyParts(fromKey);
  const to = keyParts(toKey);
  return `${from.month} ${from.day} – ${to.month} ${to.day}`;
}

function DeltaPill({ label, delta, format }: { label: string; delta: number | null; format: (value: number) => string }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
        <Equal className="size-3.5" aria-hidden="true" />
        {label}: —
      </span>
    );
  }
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Equal;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums",
        delta > 0 ? "text-profit" : delta < 0 ? "text-loss" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}: {format(delta)}
    </span>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3" data-testid={`weekly-stat-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-base font-bold tabular-nums",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          (!tone || tone === "muted") && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Weekly report — the auto-written résumé of the last 7 trading days:
 * one sentence, the week's key numbers, and the honest comparison with the
 * previous week. Computed client-side from the trade log (CLOSED trades,
 * UTC trading dates), same sources as the dashboard's other cards.
 */
export function WeeklyReportCard() {
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const { data: accountsData } = useAccounts();

  const trades = React.useMemo(() => tradesData?.trades ?? [], [tradesData]);
  const instruments = React.useMemo(() => instrumentsData?.instruments ?? [], [instrumentsData]);
  const strategies = React.useMemo(() => strategiesData?.strategies ?? [], [strategiesData]);
  const currency: Currency =
    accountsData?.accounts.find((account) => account.isDefault)?.currency ??
    accountsData?.accounts[0]?.currency ??
    "USD";

  const thisFrom = dateKeyDaysAgo(6);
  const thisTo = dateKeyDaysAgo(0);
  const prevFrom = dateKeyDaysAgo(13);
  const prevTo = dateKeyDaysAgo(7);

  const symbolOf = React.useCallback(
    (trade: Trade) => instruments.find((item) => item.id === trade.instrumentId)?.symbol ?? "—",
    [instruments],
  );

  const week = React.useMemo(
    () => summarizeWeek(trades, thisFrom, thisTo, symbolOf),
    [trades, thisFrom, thisTo, symbolOf],
  );
  const previous = React.useMemo(
    () => summarizeWeek(trades, prevFrom, prevTo, symbolOf),
    [trades, prevFrom, prevTo, symbolOf],
  );

  const winRate = week.closed > 0 ? week.wins / week.closed : null;
  const prevWinRate = previous.closed > 0 ? previous.wins / previous.closed : null;
  const winRateDelta = winRate !== null && prevWinRate !== null ? winRate - prevWinRate : null;

  const hasData = week.closed > 0 || previous.closed > 0;
  const pnlDelta = hasData ? week.netPnl - previous.netPnl : null;

  const [pdfPending, setPdfPending] = React.useState(false);
  const exportPdf = React.useCallback(async () => {
    setPdfPending(true);
    try {
      const logoDataUrl = await rasterizeBrandMark().catch(() => undefined);
      await downloadPdf(
        buildWeeklyInput({ trades, instruments, strategies, currency, logoDataUrl }),
      );
      toast.success("Weekly report exported");
    } catch (error) {
      console.error("[weekly-report] PDF export failed:", error);
      toast.error("PDF export failed", { description: "Please try again." });
    } finally {
      setPdfPending(false);
    }
  }, [trades, instruments, strategies, currency]);

  return (
    <Card className="bg-surface" data-testid="weekly-report-card">
      <CardHeader className="gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
              <CalendarRange className="size-4 text-accent" aria-hidden="true" />
              Weekly report
            </CardTitle>
            <CardDescription className="text-xs">
              {formatWindow(thisFrom, thisTo)} · auto-written from your trade log
            </CardDescription>
          </div>
          {hasData ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void exportPdf()}
              disabled={pdfPending}
              data-testid="weekly-report-export"
            >
              {pdfPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="size-3.5" aria-hidden="true" />
              )}
              Export PDF
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {week.closed === 0 && previous.closed === 0 ? (
          <p className="py-2 text-sm text-muted-foreground" data-testid="weekly-report-empty">
            No closed trade in the last two weeks — this report fills in as you journal.
          </p>
        ) : (
          <>
            {/* The auto-written sentence */}
            <p className="text-sm leading-relaxed text-foreground" data-testid="weekly-report-summary">
              You closed{" "}
              <span className="font-mono font-bold tabular-nums">{week.closed}</span> trade
              {week.closed === 1 ? "" : "s"} this week for{" "}
              <span
                className={cn(
                  "font-mono font-bold tabular-nums",
                  week.netPnl > 0 ? "text-profit" : week.netPnl < 0 ? "text-loss" : "text-foreground",
                )}
              >
                {formatSignedMoney(week.netPnl, currency)}
              </span>{" "}
              {winRate !== null && (
                <>
                  with a win rate of{" "}
                  <span className="font-mono font-bold tabular-nums">{formatPercent(winRate)}</span>
                </>
              )}
              . {week.bestSymbol !== null && week.bestR !== null && (
                <>
                  Best execution:{" "}
                  <span className="font-mono font-bold text-profit tabular-nums">
                    {week.bestSymbol} {formatR(week.bestR)}
                  </span>
                  .{" "}
                </>
              )}
              {week.worstSymbol !== null && week.worstR !== null && week.worstR < 0 && (
                <>
                  Costliest:{" "}
                  <span className="font-mono font-bold text-loss tabular-nums">
                    {week.worstSymbol} {formatR(week.worstR)}
                  </span>
                  .{" "}
                </>
              )}
              {week.planFollowedPct !== null && (
                <>
                  Plan followed on{" "}
                  <span className="font-mono font-bold tabular-nums">
                    {formatPercent(week.planFollowedPct)}
                  </span>{" "}
                  of entries.
                </>
              )}
            </p>

            {/* The week's register */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat
                label="Net P&L"
                value={formatSignedMoney(week.netPnl, currency)}
                tone={week.netPnl > 0 ? "profit" : week.netPnl < 0 ? "loss" : "muted"}
              />
              <MiniStat label="Win rate" value={winRate === null ? "—" : formatPercent(winRate)} />
              <MiniStat label="Closed trades" value={String(week.closed)} />
              <MiniStat
                label="Total R"
                value={formatR(week.totalR)}
                tone={week.totalR > 0 ? "profit" : week.totalR < 0 ? "loss" : "muted"}
              />
            </div>

            {/* Honest comparison with the previous week */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-background/40 px-3 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                {week.netPnl >= previous.netPnl ? (
                  <Flame className="size-3.5 text-profit" aria-hidden="true" />
                ) : (
                  <Snowflake className="size-3.5 text-loss" aria-hidden="true" />
                )}
                vs previous week
              </span>
              <DeltaPill label="Net P&L" delta={pnlDelta} format={(value) => formatSignedMoney(value, currency)} />
              <DeltaPill
                label="Win rate"
                delta={winRateDelta}
                format={(value) => `${value > 0 ? "+" : ""}${formatPercent(value)}`}
              />
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                prev: {previous.closed} trades,{" "}
                <span className={previous.netPnl >= 0 ? "text-profit" : "text-loss"}>
                  {formatSignedMoney(previous.netPnl, currency)}
                </span>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

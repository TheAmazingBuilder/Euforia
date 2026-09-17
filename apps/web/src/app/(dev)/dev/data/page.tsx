"use client";

import { formatMoney, formatPercent, formatR } from "@cosmoz/shared";

import {
  useAccounts,
  useAlerts,
  useInstruments,
  useRulesStatus,
  useSkippedTrades,
  useStatsOverview,
  useStrategies,
  useTrades,
} from "@/lib/api/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/**
 * TEMPORARY dev page (Phase 3 verification): renders raw counts and headline
 * aggregates straight from the typed hooks + MSW backend.
 * It will be deleted in a later phase.
 */
export default function DevDataPage() {
  const { data: allTrades } = useTrades();
  const { data: openTrades } = useTrades({ status: "OPEN" });
  const { data: ungraded } = useTrades({ graded: "false" });
  const { data: alerts } = useAlerts();
  const { data: ghosts } = useSkippedTrades();
  const { data: accounts } = useAccounts();
  const { data: instruments } = useInstruments();
  const { data: strategies } = useStrategies();
  const { data: rules } = useRulesStatus();
  const { data: stats } = useStatsOverview();

  const settledGhosts = ghosts?.skippedTrades.filter((g) => g.outcomeGuess !== null).length ?? 0;
  const pendingGhosts = (ghosts?.skippedTrades.length ?? 0) - settledGhosts;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-medium tracking-wide text-warning uppercase">
        Temporary dev page — deleted in a later phase
      </p>
      <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-foreground">
        DEV — Data layer smoke test
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Raw counts served by the MSW mock backend through the typed API client and
        react-query hooks. Everything below comes from the seeded fixtures.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Store counts</CardTitle>
            <CardDescription>useTrades / useAlerts / useSkippedTrades / catalogs</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Trades (total)" value={allTrades?.total ?? "…"} />
            <Row label="Open trades" value={openTrades?.total ?? "…"} />
            <Row label="Ungraded (to-grade queue)" value={ungraded?.total ?? "…"} />
            <Row label="Alerts" value={alerts?.alerts.length ?? "…"} />
            <Row label="Alerts unread" value={alerts?.unreadCount ?? "…"} />
            <Row label="Ghost trades" value={ghosts?.skippedTrades.length ?? "…"} />
            <Row label="Ghosts settled / pending" value={`${settledGhosts} / ${pendingGhosts}`} />
            <Row label="Accounts" value={accounts?.accounts.length ?? "…"} />
            <Row label="Instruments" value={instruments?.instruments.length ?? "…"} />
            <Row label="Strategies" value={strategies?.strategies.length ?? "…"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rules status (today)</CardTitle>
            <CardDescription>useRulesStatus — discipline banner fuel</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Date" value={rules?.date ?? "…"} />
            <Row label="Trades today" value={rules?.tradesToday ?? "…"} />
            <Row label="Losses today" value={rules?.lossesToday ?? "…"} />
            <Row label="Risk budget spent" value={rules ? `${rules.riskBudgetSpentPct}%` : "…"} />
            {rules?.limits.map((limit) => (
              <Row
                key={limit.ruleId}
                label={`${limit.type} (${limit.severity})`}
                value={`${limit.current} / ${limit.limit}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Stats overview</CardTitle>
            <CardDescription>
              useStatsOverview — KPIs + {stats?.equityCurve.length ?? "…"} equity points +{" "}
              {stats?.dailyPnl.length ?? "…"} daily P&L entries (calendar map)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Currency" value={stats?.currency ?? "…"} />
            <Row label="Net P&L" value={stats ? formatMoney(stats.netPnl, stats.currency) : "…"} />
            <Row label="Win rate" value={stats ? formatPercent(stats.winRate) : "…"} />
            <Row label="Profit factor" value={stats?.profitFactor ?? "…"} />
            <Row label="Expectancy" value={stats ? formatR(stats.expectancy) : "…"} />
            <Row label="Discipline score (avg)" value={stats?.disciplineScore ?? "…"} />
            <Row
              label="Equity first / last"
              value={
                stats && stats.equityCurve.length > 0
                  ? `${formatMoney(stats.equityCurve[0]?.equity, stats.currency)} → ${formatMoney(
                      stats.equityCurve[stats.equityCurve.length - 1]?.equity,
                      stats.currency,
                    )}`
                  : "…"
              }
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

import type { AnalyticsCards } from "@cosmoz/shared";
import { formatNumber, formatPercent, formatR } from "@cosmoz/shared";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Overview summary band (Phase 9): the five ratios that define an edge,
 * rendered big in mono with their qualifying sub-lines. All values are
 * server-computed — the client only formats.
 */

interface SummaryCardsProps {
  cards: AnalyticsCards;
}

interface CardSpec {
  label: string;
  value: string;
  valueClassName?: string;
  subs: { label: string; value: string; valueClassName?: string }[];
}

function buildCards(cards: AnalyticsCards): CardSpec[] {
  return [
    {
      label: "Win rate",
      value: formatPercent(cards.winRate, 1),
      subs: [
        { label: "Sample", value: `${cards.sampleTrades} trades` },
      ],
    },
    {
      label: "Profit factor",
      value: cards.profitFactor === null ? "—" : formatNumber(cards.profitFactor, 2),
      valueClassName:
        cards.profitFactor !== null && Number(cards.profitFactor) >= 1.5 ? "text-profit" : undefined,
      subs: [{ label: "Healthy", value: "≥ 1.50" }, { label: "Optimal", value: "≥ 2.00" }],
    },
    {
      label: "Expectancy",
      value: formatR(cards.expectancy),
      valueClassName: Number(cards.expectancy) >= 0 ? "text-profit" : "text-loss",
      subs: [{ label: "Per trade", value: "closed only" }],
    },
    {
      label: "Payoff ratio",
      value: cards.payoffRatio === null ? "—" : formatNumber(cards.payoffRatio, 2),
      subs: [{ label: "Avg win R /", value: "avg loss R" }],
    },
    {
      label: "Max drawdown",
      value: formatR(cards.maxDrawdownR),
      valueClassName: "text-loss",
      subs: [
        cards.recoveryTrades === null
          ? { label: "Recovery", value: "not recovered yet", valueClassName: "text-warning" }
          : { label: "Recovered in", value: `${cards.recoveryTrades} trades · ${cards.recoveryDays ?? 0}d` },
      ],
    },
  ];
}

export function SummaryCards({ cards }: SummaryCardsProps) {
  const specs = buildCards(cards);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
      {specs.map((spec) => (
        <Card key={spec.label} className="bg-surface">
          <CardContent className="space-y-2 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {spec.label}
            </p>
            <p
              className={cn(
                "font-mono text-3xl font-semibold tabular-nums tracking-tight",
                spec.valueClassName,
              )}
            >
              {spec.value}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {spec.subs.map((sub) => (
                <span key={sub.label} className="text-[11px] text-muted-foreground">
                  {sub.label}{" "}
                  <span className={cn("font-mono tabular-nums", sub.valueClassName)}>{sub.value}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

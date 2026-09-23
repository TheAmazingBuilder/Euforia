"use client";

import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { Alert } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CoachInsightsProps {
  /** STRATEGY_DECAY alerts — the coach's behavioral readings. */
  insights: Alert[];
}

/**
 * "Coach insights" — two behavioral pattern cards picked by the discipline
 * engine, each linking to the full analysis on /analytics.
 */
export function CoachInsights({ insights }: CoachInsightsProps) {
  const cards = insights.slice(0, 2);

  return (
    <Card className="bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Lightbulb className="size-4 text-accent" aria-hidden="true" />
          Coach insights
        </CardTitle>
        <CardDescription>Patterns detected in your recent executions.</CardDescription>
      </CardHeader>
      <CardContent className="py-0">
        {cards.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No insights yet — the coach needs a few more trades to spot patterns.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {cards.map((insight) => (
              <li key={insight.id} className="py-3 first:pt-0 last:pb-0">
                <h3 className="text-sm font-medium">{insight.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {insight.message}
                </p>
                <Link
                  href="/analytics"
                  className="mt-1.5 inline-flex items-center gap-1 rounded text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View analysis
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

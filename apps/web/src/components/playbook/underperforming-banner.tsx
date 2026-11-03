"use client";

import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { formatR } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n-provider";
import type { StrategiesStatsResponse } from "@cosmoz/shared";

/**
 * Strategy-decay coach banner (Phase 8). The target strategy is COMPUTED
 * server-side (most negative last-20 expectancy, minimum sample) and read
 * from the API payload - this component never knows the name in advance.
 */
export function UnderperformingBanner({
  underperforming,
}: {
  underperforming: StrategiesStatsResponse["underperforming"];
}) {
  const { dict } = useI18n();
  const V = dict.playbook.banner;

  if (underperforming === null) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <TrendingDown className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {V.titleA}
            {underperforming.name}
            {V.titleB}
          </p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            {formatR(underperforming.last20Expectancy)} {V.avgOver} {underperforming.sampleSize} {V.tradesSuffix}
          </p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0 border-warning/50 text-warning hover:bg-warning/10 hover:text-warning">
        <Link href="/analytics">{V.reviewLink}</Link>
      </Button>
    </div>
  );
}

"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Analytics KPI card - every metric travels with its DEFINITION (MASTER
 * PROMPT §6: "Do not hide metric definitions") and, when the sample cannot
 * support the ratio, an honest insufficient-data note instead of a fake zero
 * (§34). Values are pre-formatted server strings; this card never computes.
 */

export type MetricTone = "neutral" | "profit" | "loss" | "warning";

interface MetricCardProps {
  label: string;
  value: string;
  definition: string;
  /** Supporting line under the value (sample size, methodology chip…). */
  sub?: string;
  tone?: MetricTone;
  /** Flagged by the server when the sample is too small / data missing. */
  insufficient?: boolean;
  className?: string;
}

const toneClass: Record<MetricTone, string> = {
  neutral: "text-foreground",
  profit: "text-profit",
  loss: "text-loss",
  warning: "text-warning",
};

export function MetricCard({
  label,
  value,
  definition,
  sub,
  tone = "neutral",
  insufficient = false,
  className,
}: MetricCardProps) {
  const { dict } = useI18n();
  const M = dict.analytics.metricCard;
  return (
    <Card className={cn("bg-surface", className)}>
      <CardContent className="space-y-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${label} ${M.definitionTail}`}
                  className="shrink-0 rounded-sm text-muted-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
                {definition}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {insufficient ? (
          <div>
            <p className="font-mono text-2xl font-semibold tabular-nums text-muted-foreground/40">-</p>
            <p className="mt-1 text-[11px] italic leading-snug text-muted-foreground">
              {M.insufficient}
            </p>
          </div>
        ) : (
          <p
            className={cn(
              "font-mono text-2xl font-semibold tabular-nums tracking-tight",
              toneClass[tone],
            )}
          >
            {value}
          </p>
        )}
        {sub !== undefined && !insufficient && (
          <p className="text-[11px] leading-snug text-muted-foreground">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Small methodology footnote under a section (§24 transparency). */
export function MethodNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
      <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

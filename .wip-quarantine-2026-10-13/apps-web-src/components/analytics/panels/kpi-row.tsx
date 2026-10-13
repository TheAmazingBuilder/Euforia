import type { PanelKpi } from "@cosmoz/shared";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { formatPanelValue } from "./panel-format";

/**
 * A section's KPI band — the same strip-and-dot grammar the Overview cards
 * wear, sized for section headers. Honest at zero: a null value renders as
 * "—" in muted ink with no color claims; the hint line carries the context
 * (sample size, comparison window, unit qualifier).
 */

const INK_STRIP = {
  accent: "bg-accent",
  profit: "bg-profit",
  warning: "bg-warning",
  loss: "bg-loss",
} as const;

const INK_TEXT = {
  accent: "text-accent",
  profit: "text-profit",
  warning: "text-warning",
  loss: "text-loss",
} as const;

interface KpiRowProps {
  kpis: PanelKpi[];
  currency: string;
}

export function KpiRow({ kpis, currency }: KpiRowProps) {
  if (kpis.length === 0) return null;

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      data-testid="analytics-section-kpis"
    >
      {kpis.map((kpi) => {
        const value = kpi.value === null ? null : Number(kpi.value);
        const inked = value !== null ? INK_TEXT[kpi.ink] : undefined;
        return (
          <Card key={kpi.key} className="relative overflow-hidden bg-surface">
            <span
              aria-hidden="true"
              className={cn("absolute inset-x-0 top-0 h-0.5", INK_STRIP[kpi.ink])}
            />
            <CardContent className="space-y-1.5 p-3.5 pt-4 sm:p-4 sm:pt-5">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", INK_STRIP[kpi.ink])} />
                <span className="truncate">{kpi.label}</span>
              </p>
              <p
                className={cn(
                  "font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
                  inked,
                )}
              >
                {value === null ? "—" : formatPanelValue(value, kpi.unit, currency)}
              </p>
              {kpi.hint ? (
                <p className="truncate text-[11px] text-muted-foreground">{kpi.hint}</p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

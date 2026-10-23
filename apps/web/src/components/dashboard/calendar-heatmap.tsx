"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "next-themes";
import type { Currency, DailyPnlPoint } from "@cosmoz/shared";
import { formatMoneyCompact, formatSignedMoney, parseDecimal } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getChartTheme } from "@/lib/utils/chart-theme";
import { withAlpha } from "@/lib/utils/color";
import { cn } from "@/lib/utils";

/**
 * Monthly P&L heatmap — a CUSTOM CSS grid (not ECharts): day cells tinted
 * profit/loss by the day's net P&L with intensity by magnitude, mono P&L in
 * each cell, month navigation and per-day tooltips. Colors come from theme
 * tokens (getChartTheme) and rebuild on theme switch.
 */

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

interface DayCell {
  day: number;
  dateKey: string;
}

const monthLabelFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dayLabelFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function shiftMonth(cursor: { year: number; month: number }, offset: number) {
  const shifted = new Date(Date.UTC(cursor.year, cursor.month + offset, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

interface CalendarHeatmapProps {
  dailyPnl: DailyPnlPoint[];
  currency: Currency;
  /** Phase 02 widget config — hide the per-day P&L text for compact spans. */
  showCellValues?: boolean;
}

export function CalendarHeatmap({ dailyPnl, currency, showCellValues = true }: CalendarHeatmapProps) {
  const { resolvedTheme } = useTheme();
  const [cursor, setCursor] = React.useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });

  const byDate = React.useMemo(
    () => new Map(dailyPnl.map((point) => [point.date, point])),
    [dailyPnl],
  );

  // resolvedTheme is an intentional dependency even though the tokens are
  // read from the DOM: the memo re-runs on theme switch (design-tokens.md §8).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = React.useMemo(() => getChartTheme(), [resolvedTheme]);

  const { cells, monthPoints } = React.useMemo(() => {
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const leading = (new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay() + 6) % 7;
    const built: Array<DayCell | null> = [];
    for (let i = 0; i < leading; i += 1) built.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      built.push({ day, dateKey });
    }
    while (built.length % 7 !== 0) built.push(null);
    const points = built
      .map((cell) => (cell ? byDate.get(cell.dateKey) : undefined))
      .filter((point): point is DailyPnlPoint => point !== undefined);
    return { cells: built, monthPoints: points };
  }, [cursor, byDate]);

  const maxAbsPnl = Math.max(
    1,
    ...monthPoints.map((point) => Math.abs(parseDecimal(point.pnlNet) ?? 0)),
  );
  const profitableDays = monthPoints.filter((p) => (parseDecimal(p.pnlNet) ?? 0) > 0).length;
  const lossDays = monthPoints.filter((p) => (parseDecimal(p.pnlNet) ?? 0) < 0).length;

  return (
    <Card className="bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <CalendarDays className="size-4 text-accent" aria-hidden="true" />
          Performance heatmap
        </CardTitle>
        <CardDescription>
          Daily net P&L - intensity follows magnitude.{" "}
          <span className="font-mono tabular-nums">
            {profitableDays} profit · {lossDays} loss
          </span>{" "}
          days this month.
        </CardDescription>
        <div className="mt-1 flex items-center gap-1 justify-self-end">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setCursor((current) => shiftMonth(current, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span
            className="min-w-32 text-center font-mono text-xs capitalize tabular-nums"
            aria-live="polite"
          >
            {monthLabelFormatter.format(new Date(Date.UTC(cursor.year, cursor.month, 1)))}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setCursor((current) => shiftMonth(current, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[640px]">
            <div className="mb-1.5 grid grid-cols-7 gap-1.5" aria-hidden="true">
              {WEEKDAYS.map((weekday) => (
                <span
                  key={weekday}
                  className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {weekday}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((cell, index) => {
                if (cell === null) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="min-h-[62px] rounded-md border border-dashed border-border/50"
                      aria-hidden="true"
                    />
                  );
                }
                const point = byDate.get(cell.dateKey);
                const column = index % 7;
                return (
                  <div
                    key={cell.dateKey}
                    className={cn(
                      "group relative min-h-[62px] rounded-md border p-1.5",
                      point ? "" : "border-border/60 bg-surface-raised/30",
                    )}
                    style={
                      point
                        ? {
                            backgroundColor: withAlpha(
                              (parseDecimal(point.pnlNet) ?? 0) >= 0 ? theme.profit : theme.loss,
                              0.1 +
                                0.38 *
                                  (Math.abs(parseDecimal(point.pnlNet) ?? 0) / maxAbsPnl),
                            ),
                            borderColor: withAlpha(
                              (parseDecimal(point.pnlNet) ?? 0) >= 0 ? theme.profit : theme.loss,
                              0.55,
                            ),
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {cell.day}
                      </span>
                      {point ? (
                        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                          {point.tradesCount} tr
                        </span>
                      ) : null}
                    </div>
                    {point && showCellValues ? (
                      <p
                        className="mt-1 truncate font-mono text-[11px] font-semibold tabular-nums"
                        style={{
                          color:
                            (parseDecimal(point.pnlNet) ?? 0) > 0
                              ? theme.profit
                              : (parseDecimal(point.pnlNet) ?? 0) < 0
                                ? theme.loss
                                : theme.textMuted,
                        }}
                        data-testid="heatmap-cell-value"
                      >
                        {formatMoneyCompact(point.pnlNet, currency)}
                      </p>
                    ) : null}
                    {point ? (
                      <div
                        className={cn(
                          "pointer-events-none absolute bottom-full z-20 mb-1 hidden w-max max-w-44 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 shadow-lg group-hover:block",
                          column >= 5 ? "right-0" : "left-1/2 -translate-x-1/2",
                        )}
                        role="tooltip"
                      >
                        <p className="text-[10px] capitalize text-muted-foreground">
                          {dayLabelFormatter.format(new Date(`${cell.dateKey}T00:00:00Z`))}
                        </p>
                        <p className="font-mono text-xs font-medium tabular-nums">
                          {formatSignedMoney(point.pnlNet, currency)}
                        </p>
                        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {point.tradesCount} {point.tradesCount === 1 ? "trade" : "trades"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

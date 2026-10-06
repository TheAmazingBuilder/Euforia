"use client";

import * as React from "react";
import { CalendarRange, FileDown, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReviews } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { GRADE_STYLES } from "@/components/trade-review/trade-review-shared";

const GRADE_ORDER = ["A", "B", "C", "D", "F"] as const;

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Monthly review journal — a ONE-PAGE printable report (browser print →
 * "Save as PDF"). The sheet aggregates the month's reviews client-side from
 * the SAME server rows the module already renders (no new aggregation
 * contract): KPIs, grade distribution, quality averages, the month's lessons
 * and next-time commitments. Print styling is scoped by a body class so a
 * normal page print is never hijacked.
 */
export function MonthlyReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: reviewsData } = useReviews();
  const reviews = React.useMemo(() => reviewsData?.reviews ?? [], [reviewsData]);

  // Months that actually carry reviews, newest first (current month always offered).
  const months = React.useMemo(() => {
    const keys = new Set<string>([monthKey(new Date())]);
    for (const row of reviews) {
      const stamp = row.reviewedAt ?? `${row.tradingDate}T00:00:00Z`;
      keys.add(stamp.slice(0, 7));
    }
    return [...keys].sort().reverse();
  }, [reviews]);

  const [selected, setSelected] = React.useState<string | null>(null);
  const month = selected ?? months[0] ?? monthKey(new Date());

  const monthRows = React.useMemo(
    () =>
      reviews.filter(
        (row) =>
          row.reviewStatus === "REVIEWED" &&
          (row.reviewedAt ?? `${row.tradingDate}T00:00:00Z`).slice(0, 7) === month,
      ),
    [reviews, month],
  );

  const summary = React.useMemo(() => {
    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let rSum = 0;
    let wins = 0;
    let followed = 0;
    let followedKnown = 0;
    let entry = 0;
    let exit = 0;
    let risk = 0;
    let qualityKnown = 0;
    for (const row of monthRows) {
      if (row.executionGrade !== null) distribution[row.executionGrade] += 1;
      rSum += row.rMultiple ?? 0;
      if ((row.pnlNet ?? 0) > 0) wins += 1;
      if (typeof row.followedPlan === "boolean") {
        followedKnown += 1;
        if (row.followedPlan) followed += 1;
      }
      if (row.entryQuality !== null && row.exitQuality !== null && row.riskManagement !== null) {
        entry += row.entryQuality;
        exit += row.exitQuality;
        risk += row.riskManagement;
        qualityKnown += 1;
      }
    }
    return {
      distribution,
      rSum,
      wins,
      followedPct: followedKnown > 0 ? Math.round((followed / followedKnown) * 100) : null,
      avgQuality:
        qualityKnown > 0
          ? { entry: entry / qualityKnown, exit: exit / qualityKnown, risk: risk / qualityKnown }
          : null,
    };
  }, [monthRows]);

  const monthLessons = monthRows
    .filter((row) => (row.lesson ?? "").trim() !== "")
    .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))
    .slice(0, 5);
  const monthCommitments = monthRows
    .filter((row) => (row.improvementNote ?? "").trim() !== "")
    .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))
    .slice(0, 3);

  // Keep the body class in sync while the dialog is open so the @media print
  // rules only ever hijack a print that STARTED from this sheet.
  React.useEffect(() => {
    if (!open) return;
    document.body.classList.add("printing-review");
    return () => document.body.classList.remove("printing-review");
  }, [open]);

  const onPrint = () => {
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-review"), 400);
  };

  const label = MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" data-testid="review-report-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <FileDown className="size-5 text-violet-400" aria-hidden="true" />
            Monthly review journal
          </DialogTitle>
          <DialogDescription>
            One printable page — grades, qualities, lessons and commitments. Print it or save it
            as PDF from the browser dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
            <Select value={month} onValueChange={setSelected}>
              <SelectTrigger className="h-9 w-48 text-sm" data-testid="review-report-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((key) => (
                  <SelectItem key={key} value={key}>
                    {MONTH_LABEL.format(new Date(`${key}-01T00:00:00Z`))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={onPrint}
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent-hover"
            data-testid="review-report-print"
          >
            <Printer className="size-4" aria-hidden="true" />
            Print / Save as PDF
          </Button>
        </div>

        {/* ── The printable sheet (one A4 page) ─────────────────────────────── */}
        <div className="print-sheet rounded-xl border border-border bg-background p-6" data-testid="review-report-sheet">
          <header className="flex items-start justify-between border-b pb-3">
            <div>
              <p className="font-heading text-lg font-bold tracking-tight">Euforia — Trade Review</p>
              <p className="text-sm text-muted-foreground">Monthly journal · {label}</p>
            </div>
            <div className="text-right text-[10px] leading-relaxed text-muted-foreground">
              <p className="font-mono">{monthRows.length} review{monthRows.length === 1 ? "" : "s"}</p>
              <p>honest numbers · server rows</p>
            </div>
          </header>

          {monthRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No reviewed trades this month yet — the page fills itself as the queue clears.
            </p>
          ) : (
            <div className="mt-4 space-y-5 text-[11px]">
              {/* KPI band */}
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { label: "Reviews", value: String(monthRows.length) },
                    { label: "Total R", value: `${summary.rSum >= 0 ? "+" : ""}${summary.rSum.toFixed(1)}R` },
                    { label: "Win rate", value: `${Math.round((summary.wins / monthRows.length) * 100)}%` },
                    { label: "Plan followed", value: summary.followedPct === null ? "—" : `${summary.followedPct}%` },
                  ] as const
                ).map((kpi) => (
                  <div key={kpi.label} className="rounded-lg border px-2.5 py-2">
                    <p className="text-[9px] tracking-wider uppercase text-muted-foreground">{kpi.label}</p>
                    <p className="font-mono text-base font-bold tabular-nums">{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Grades + qualities */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Execution grades
                  </p>
                  <div className="space-y-1">
                    {GRADE_ORDER.map((grade) => (
                      <div key={grade} className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-block w-5 rounded-sm border px-0.5 text-center font-mono text-[10px] font-bold",
                            GRADE_STYLES[grade],
                          )}
                        >
                          {grade}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-foreground/70"
                            style={{ width: `${(summary.distribution[grade] / monthRows.length) * 100}%` }}
                          />
                        </div>
                        <span className="w-5 text-right font-mono tabular-nums text-muted-foreground">
                          {summary.distribution[grade]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Quality averages (1–5)
                  </p>
                  {summary.avgQuality === null ? (
                    <p className="text-muted-foreground">—</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(
                        [
                          { label: "Entry", value: summary.avgQuality.entry },
                          { label: "Exit", value: summary.avgQuality.exit },
                          { label: "Risk", value: summary.avgQuality.risk },
                        ] as const
                      ).map((quality) => (
                        <div key={quality.label} className="flex items-center justify-between border-b border-dashed pb-1">
                          <span className="text-muted-foreground">{quality.label}</span>
                          <span className="font-mono font-semibold tabular-nums">{quality.value.toFixed(1)}/5</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Lessons */}
              {monthLessons.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Lessons kept this month
                  </p>
                  <ul className="space-y-1.5">
                    {monthLessons.map((row) => (
                      <li key={row.tradeId} className="flex gap-2 border-b border-dashed pb-1.5 last:border-0">
                        <span className="w-14 shrink-0 font-mono text-muted-foreground">{row.tradingDate.slice(5)}</span>
                        <span className="w-16 shrink-0 font-mono font-semibold">{row.symbol}</span>
                        <span className="line-clamp-2 flex-1 leading-snug">{row.lesson}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Next-time commitments */}
              {monthCommitments.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-[9px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Carry forward — next time I will
                  </p>
                  <ol className="list-decimal space-y-1 pl-4">
                    {monthCommitments.map((row) => (
                      <li key={`commit-${row.tradeId}`} className="leading-snug">
                        {row.improvementNote}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          )}

          <footer className="mt-5 border-t pt-2 text-center text-[9px] text-muted-foreground">
            Generated with Euforia · grades are self-verified against the playbook · results recomputed server-side
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import type { GradeOutcomeRow } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Decision grade × outcome matrix (Phase 9): the poker-logic proof. Grades
 * are assigned BEFORE the reveal, so a row's average R must not predict the
 * outcome better than chance — if A rows don't outrun F rows, the grader
 * saw the result instead of the decision. Grade chips step through the
 * register (A emerald → F carmin); every cell shows avg R with its n.
 */

const GRADE_INK: Record<GradeOutcomeRow["grade"], { chip: string; dot: string }> = {
  A: { chip: "text-profit", dot: "bg-profit" },
  B: { chip: "text-accent", dot: "bg-accent" },
  C: { chip: "text-warning", dot: "bg-warning" },
  D: { chip: "text-loss", dot: "bg-loss" },
  F: { chip: "text-loss", dot: "bg-loss" },
};

function OutcomeCell({ cell, kind }: { cell: GradeOutcomeRow["win"]; kind: "win" | "loss" }) {
  if (cell === null || cell.count === 0) {
    return <span className="font-mono text-xs text-muted-foreground">—</span>;
  }
  const r = Number(cell.avgR);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("font-mono text-sm font-semibold tabular-nums", r >= 0 ? "text-profit" : "text-loss")}>
        {formatR(cell.avgR)}
      </span>
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          kind === "win" ? "text-profit/70" : "text-loss/70",
        )}
      >
        ×{cell.count}
      </span>
    </span>
  );
}

export function GradeMatrix({ rows }: { rows: GradeOutcomeRow[] }) {
  const totalGraded = rows.reduce(
    (sum, row) => sum + (row.win?.count ?? 0) + (row.loss?.count ?? 0),
    0,
  );

  if (totalGraded === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No graded trades yet — grade decisions before the reveal and this matrix will judge the grader.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <caption className="sr-only">Decision grade versus outcome, average R with trade counts</caption>
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Grade</th>
              <th scope="col" className="px-3 py-2 font-medium text-profit">Wins</th>
              <th scope="col" className="px-3 py-2 font-medium text-loss">Losses</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.grade} data-testid={`grade-row-${row.grade}`} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className={cn("size-2 rounded-full", GRADE_INK[row.grade].dot)} />
                    <span className={cn("font-mono text-sm font-bold", GRADE_INK[row.grade].chip)}>
                      {row.grade}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <OutcomeCell cell={row.win} kind="win" />
                </td>
                <td className="px-3 py-2.5">
                  <OutcomeCell cell={row.loss} kind="loss" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Grades are assigned before the outcome is revealed. If the A row doesn&apos;t out-earn the F row,
        the grader is reading the result, not the decision — the matrix is the hindsight test.
      </p>
    </div>
  );
}

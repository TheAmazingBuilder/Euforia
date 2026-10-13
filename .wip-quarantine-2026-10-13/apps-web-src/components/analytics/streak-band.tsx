import type { DisciplineStreaks } from "@cosmoz/shared";
import { formatNumber } from "@cosmoz/shared";

/**
 * Process streak band (Phase 9 Overview) — gamify the PROCESS, never the
 * P&L: grading coverage and violation-free trading days. Quiet ruled strip,
 * mono numerals; the current run is the hero, the best run is the context.
 */
export function StreakBand({ streaks }: { streaks: DisciplineStreaks }) {
  const graded = streaks.gradedCurrent;
  const cleanDays = streaks.cleanDaysCurrent;
  return (
    <div className="stat-strip grid-cols-2 lg:grid-cols-4" role="group" aria-label="Process streaks">
      <div className="stat-cell">
        <p className="ledger-label">Grading streak</p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
          {formatNumber(graded, 0)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {graded === 1 ? "trade" : "trades"}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Best <span className="font-mono tabular-nums">{formatNumber(streaks.gradedLongest, 0)}</span>{" "}
          · every closed trade carries a grade
        </p>
      </div>
      <div className="stat-cell">
        <p className="ledger-label">Violation-free days</p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
          {formatNumber(cleanDays, 0)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {cleanDays === 1 ? "day" : "days"}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Best <span className="font-mono tabular-nums">{formatNumber(streaks.cleanDaysLongest, 0)}</span>{" "}
          · trading days with zero rule breaches
        </p>
      </div>
      <div className="stat-cell">
        <p className="ledger-label">Trading days logged</p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
          {formatNumber(streaks.tradingDays, 0)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          The sample every streak is measured against
        </p>
      </div>
      <div className="stat-cell">
        <p className="ledger-label">House rule</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Streaks track habits — grading, planning, rule-keeping. Profits are outcomes; the
          process is what you control.
        </p>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "motion/react";
import { ChevronDown, NotebookPen } from "lucide-react";
import type { JournalHistoryRow } from "@cosmoz/shared";
import { EMOTION_LABELS } from "@cosmoz/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Journal history — a ledger, not a card grid (Le Registre): one row per
 * past day, hairline rules between rows, exactly ONE colored numeral per
 * row (the day P&L). Rows expand in place to reveal the entry's texts.
 * Expand/collapse is animated with motion (height auto) and collapses to a
 * plain CSS render when the user prefers reduced motion.
 */

const signedMoney = (value: string): string => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const pnlClass = (value: string): string => {
  const amount = Number(value);
  if (Number.isNaN(amount) || amount === 0) return "text-muted-foreground";
  return amount > 0 ? "text-profit" : "text-loss";
};

const shortDate = (dateKey: string): string => {
  const parsed = new Date(`${dateKey}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? dateKey
    : new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(parsed);
};

function MoodMark({ emotion }: { emotion: string | null }) {
  if (emotion === null) return null;
  return (
    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
      {EMOTION_LABELS[emotion] ?? emotion}
    </span>
  );
}

function HistoryRow({ row }: { row: JournalHistoryRow }) {
  const [open, setOpen] = React.useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const { journal } = row;
  const hasBody =
    journal.planText !== null || journal.reviewText !== null || journal.lessons !== null;

  const body = (
    <div className="space-y-3 border-t border-border/60 bg-surface-raised/40 px-4 py-4 sm:px-5">
      {journal.planText !== null ? (
        <div>
          <p className="ledger-label mb-1">Plan</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{journal.planText}</p>
        </div>
      ) : null}
      {journal.reviewText !== null ? (
        <div>
          <p className="ledger-label mb-1">Review</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{journal.reviewText}</p>
        </div>
      ) : null}
      {journal.lessons !== null ? (
        <div>
          <p className="ledger-label mb-1">Lesson</p>
          <p className="whitespace-pre-wrap text-sm italic leading-relaxed text-foreground">
            “{journal.lessons}”
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 pt-1 font-mono text-xs tabular-nums text-muted-foreground">
        <span>Sleep {journal.sleepHours !== null ? `${journal.sleepHours}h` : "—"}</span>
        <span>Energy {journal.energy !== null ? `${journal.energy}/5` : "—"}</span>
        <span>Focus {journal.focus !== null ? `${journal.focus}/5` : "—"}</span>
      </div>
    </div>
  );

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => hasBody && setOpen((previous) => !previous)}
        aria-expanded={open}
        className={cn(
          "grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-left transition-colors sm:grid-cols-[7rem_1fr_auto_auto] sm:px-5",
          hasBody ? "hover:bg-surface-raised/60" : "cursor-default",
        )}
      >
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{shortDate(journal.date)}</span>

        <span className="order-3 col-span-2 flex flex-wrap items-center gap-2 sm:order-none sm:col-span-1">
          <MoodMark emotion={journal.moodPre} />
          {journal.moodPost !== null && journal.moodPost !== journal.moodPre ? (
            <MoodMark emotion={journal.moodPost} />
          ) : null}
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {row.closed > 0 ? `${row.wins}W·${row.losses}L` : row.trades > 0 ? `${row.trades} open` : "flat"}
          </span>
          {journal.lessons !== null ? (
            <span className="hidden max-w-[22rem] truncate text-xs text-muted-foreground lg:inline">
              “{journal.lessons}”
            </span>
          ) : null}
        </span>

        <span className={cn("order-2 text-right font-mono text-sm font-semibold tabular-nums sm:order-none", pnlClass(row.pnlNet))}>
          {signedMoney(row.pnlNet)}
        </span>

        {hasBody ? (
          <ChevronDown
            aria-hidden="true"
            className={cn("order-1 size-4 shrink-0 text-muted-foreground transition-transform sm:order-none", open && "rotate-180")}
          />
        ) : (
          <span className="order-1 inline-block size-4 shrink-0 sm:order-none" />
        )}
      </button>

      {hasBody ? (
        reduceMotion ? (
          open ? (
            body
          ) : null
        ) : (
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                {body}
              </motion.div>
            ) : null}
          </AnimatePresence>
        )
      ) : null}
    </li>
  );
}

export function JournalHistory({ rows, loading }: { rows: JournalHistoryRow[]; loading: boolean }) {
  return (
    <section aria-label="Journal history" className="rounded-xl border border-border bg-surface">
      <header className="border-b border-border px-4 py-3 sm:px-5">
        <h2 className="font-heading text-base font-semibold text-foreground">History</h2>
        <p className="text-xs text-muted-foreground">
          One row per journaled day — click to reopen the full entry.
        </p>
      </header>
      {loading ? (
        <div className="space-y-2 p-4 sm:p-5" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-9 w-full rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-12 text-center">
          <NotebookPen className="size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 font-heading text-base font-semibold">No entries yet</h3>
          <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Your past days will line up here as you write them — plans, reviews, lessons.
          </p>
        </div>
      ) : (
        <ul>
          {rows.map((row) => (
            <HistoryRow key={row.journal.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

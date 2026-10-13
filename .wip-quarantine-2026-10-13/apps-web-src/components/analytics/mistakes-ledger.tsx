import type { MistakeLedgerEntry } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * All-time mistake ledger: each catalog mistake with its frequency, severity
 * and R cost — sorted worst-cost first. The ledger is the mirror of the
 * discipline system: what you repeat, and what it costs.
 */

const CATEGORY_LABELS: Record<string, string> = {
  ENTRY: "Entry",
  RISK: "Risk",
  EXIT: "Exit",
  PROCESS: "Process",
  EMOTIONAL: "Emotional",
};

interface MistakesLedgerProps {
  entries: MistakeLedgerEntry[];
}

function SeverityDots({ severity }: { severity: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Severity ${severity} of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            index < severity ? "bg-loss/80" : "bg-muted-foreground/25",
          )}
        />
      ))}
    </span>
  );
}

export function MistakesLedger({ entries }: MistakesLedgerProps) {
  const rows = [...entries].sort(
    (a, b) => Number(a.rCost) - Number(b.rCost) || b.count - a.count,
  );

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        The ledger is clean — no catalogued mistakes on record. Keep grading honestly.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <caption className="sr-only">Mistake ledger ordered by R cost</caption>
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">Mistake</th>
            <th scope="col" className="px-3 py-2 font-medium">Category</th>
            <th scope="col" className="px-3 py-2 font-medium">Severity</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Count</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">R cost</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.mistakeId} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2.5 font-medium">{entry.label}</td>
              <td className="px-3 py-2.5">
                <span className="rounded-md border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <SeverityDots severity={entry.severity} />
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{entry.count}</td>
              <td className="px-3 py-2.5 text-right font-mono font-medium tabular-nums text-loss">
                {formatR(entry.rCost)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {entry.lastSeenAt === null
                  ? "—"
                  : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
                      new Date(entry.lastSeenAt),
                    )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Sorted by R cost — the top row is the most expensive habit in the book. R cost sums the
        result of every trade carrying the mistake (a mistake can survive on a lucky win; the
        ledger averages that out over time).
      </p>
    </div>
  );
}

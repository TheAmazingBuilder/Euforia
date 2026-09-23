"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  formatSignedMoney,
  formatR,
  type Currency,
  type Instrument,
  type Trade,
} from "@cosmoz/shared";

import { useAccounts, useInstruments, useTrades } from "@/lib/api/queries";
import { isoToLocalInput } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import { openGate } from "@/lib/hooks/use-judgment-flow";

/**
 * The /trades page — the whole CAPTURE → JUDGE → REFLECT loop made observable:
 * date, instrument, direction, R and P&L (mono), the decision grade and the
 * status. Ungraded rows carry an inline "grade" action into the same Gate.
 */

// Ledger grade marks: bordered ink text, no tinted fills. A/B carry ink,
// C recedes, D/F take the warning ink — outcomes stay quiet in the record.
const GRADE_COLORS: Record<string, string> = {
  A: "border-foreground/40 text-foreground",
  B: "border-foreground/30 text-foreground/90",
  C: "border-border text-muted-foreground",
  D: "border-warning/50 text-warning",
  F: "border-warning/60 text-warning",
};

export function TradesTable() {
  const { data: tradesData, isLoading } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const { data: accountsData } = useAccounts();

  const instruments: Instrument[] = instrumentsData?.instruments ?? [];
  const currency: Currency =
    accountsData?.accounts.find((account) => account.isDefault)?.currency ??
    accountsData?.accounts[0]?.currency ??
    "USD";
  const trades: Trade[] = tradesData?.trades ?? [];

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Trades</h1>
        <p className="text-sm text-muted-foreground">
          Every execution with its result and the decision grade you locked before seeing it.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border" data-testid="trades-table">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-3 py-2.5 font-medium">Date</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Instrument</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Direction</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">R</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">P&amp;L</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Grade</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">Loading…</td>
              </tr>
            ) : trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  No trades yet — press <kbd className="rounded-sm bg-muted px-1 font-mono text-[10px]">N</kbd> to capture your first one.
                </td>
              </tr>
            ) : (
              trades.map((trade) => {
                const instrument = instruments.find((item) => item.id === trade.instrumentId);
                const win = (Number(trade.rMultiple) ?? 0) >= 0 && trade.rMultiple !== null;
                return (
                  <tr
                    key={trade.id}
                    className="border-b border-border/60 last:border-0 hover:bg-surface/60"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {isoToLocalInput(trade.entryAt).slice(0, 10)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-foreground">
                      {instrument?.symbol ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {trade.direction === "SELL" ? (
                          <ArrowDownRight className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        )}
                        {trade.direction}
                      </span>
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-foreground"
                    >
                      {trade.rMultiple === null ? "—" : formatR(trade.rMultiple)}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-right font-mono font-medium tabular-nums",
                        trade.pnlNet === null
                          ? "text-muted-foreground"
                          : win
                            ? "text-profit"
                            : "text-loss",
                      )}
                    >
                      {trade.pnlNet === null ? "—" : formatSignedMoney(trade.pnlNet, currency, { digits: 2 })}
                    </td>
                    <td className="px-3 py-2.5">
                      {trade.decisionGrade !== null ? (
                        <span
                          className={cn(
                            "inline-block min-w-6 rounded-sm border px-1 py-0.5 text-center font-heading text-xs font-bold",
                            GRADE_COLORS[trade.decisionGrade] ?? "border-border text-muted-foreground",
                          )}
                        >
                          {trade.decisionGrade}
                        </span>
                      ) : trade.status === "CLOSED" ? (
                        <button
                          type="button"
                          onClick={() => openGate(trade.id)}
                          data-testid={`grade-now-${trade.id}`}
                          className="rounded-sm border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          grade
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {trade.status === "OPEN" ? (
                        <span className="stamp stamp-accent">Open</span>
                      ) : (
                        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/70">
                          Closed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

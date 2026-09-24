"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Currency, Trade } from "@cosmoz/shared";
import { formatR, formatSignedMoney } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TradesFilters,
  useTradesUrlPatch,
  useTradesUrlState,
  type SortKey,
} from "@/components/trades/trades-filters";
import { TradeDetailDrawer } from "@/components/trades/trade-detail-drawer";
import { TradeEditDialog } from "@/components/trades/trade-edit-dialog";
import { useDeleteTrade, useInstruments, useStrategies, useTags, useTrades } from "@/lib/api/queries";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { cn } from "@/lib/utils";

// Ledger grade marks: bordered ink text, no tinted fills.
const GRADE_COLORS: Record<string, string> = {
  A: "border-foreground/40 text-foreground",
  B: "border-foreground/30 text-foreground/90",
  C: "border-border text-muted-foreground",
  D: "border-warning/50 text-warning",
  F: "border-warning/60 text-warning",
};

/** Compact duration from two ISO stamps ("2h 15m", "3d 4h", "18m"). */
function formatDuration(fromIso: string, toIso: string): string {
  const ms = Math.max(0, Date.parse(toIso) - Date.parse(fromIso));
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function SortIcon({ column, state }: { column: SortKey; state: { sortKey: SortKey; sortDir: "asc" | "desc" } }) {
  if (state.sortKey !== column) {
    return <ArrowDown className="size-3 opacity-0 transition-opacity group-hover:opacity-40" aria-hidden="true" />;
  }
  return state.sortDir === "asc" ? (
    <ArrowUp className="size-3" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-3" aria-hidden="true" />
  );
}

function CSVCell(value: string | number | null): string {
  const raw = value === null ? "" : String(value);
  return raw.includes(",") || raw.includes("\"") || raw.includes("\n")
    ? `"${raw.replace(/"/g, "\"\"")}"`
    : raw;
}

/**
 * THE TRADE MODULE (/trades):
 * header + accent capture button, URL-persisted filters, sortable ledger
 * table (tags, duration, grades), bulk select with delete, pagination,
 * row detail drawer (notes / tags / screenshots / close) and edit dialog.
 */
export function TradesTable() {
  return (
    <React.Suspense fallback={<TradesSkeleton />}>
      <TradesModule />
    </React.Suspense>
  );
}

function TradesSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading trades">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-14 rounded-lg" />
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}

function TradesModule() {
  const state = useTradesUrlState();
  const patch = useTradesUrlPatch();
  const { data: tradesData, isLoading } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const { data: tagsData } = useTags();
  const deleteTrade = useDeleteTrade();

  const trades = React.useMemo(() => tradesData?.trades ?? [], [tradesData]);
  const instruments = React.useMemo(() => instrumentsData?.instruments ?? [], [instrumentsData]);
  const strategies = React.useMemo(() => strategiesData?.strategies ?? [], [strategiesData]);
  const tags = React.useMemo(() => tagsData?.tags ?? [], [tagsData]);
  const currency: Currency = "USD";

  const symbolOf = React.useMemo(() => {
    const map = new Map(instruments.map((instrument) => [instrument.id, instrument.symbol]));
    return (id: string) => map.get(id) ?? "—";
  }, [instruments]);
  const strategyNameOf = React.useMemo(() => {
    const map = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));
    return (id: string | null) => (id === null ? null : map.get(id) ?? null);
  }, [strategies]);
  const tagNameOf = React.useMemo(() => {
    const map = new Map(tags.map((tag) => [tag.id, tag.name]));
    return (id: string) => map.get(id) ?? null;
  }, [tags]);

  // ── Filter → sort → paginate (client-side; the dataset is a journal) ────
  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    let rows = trades;
    if (q !== "") {
      rows = rows.filter((trade) => {
        const symbol = symbolOf(trade.instrumentId).toLowerCase();
        const notes = (trade.notes ?? "").toLowerCase();
        return symbol.includes(q) || notes.includes(q);
      });
    }
    if (state.status !== "all") rows = rows.filter((trade) => trade.status === state.status);
    if (state.direction !== "all") rows = rows.filter((trade) => trade.direction === state.direction);
    if (state.instrumentId !== "") rows = rows.filter((trade) => trade.instrumentId === state.instrumentId);
    if (state.strategyId !== "") {
      rows = rows.filter((trade) =>
        state.strategyId === "none" ? trade.strategyId === null : trade.strategyId === state.strategyId,
      );
    }
    if (state.outcome !== "all") {
      rows = rows.filter((trade) => {
        const pnl = Number(trade.pnlNet) ?? 0;
        return state.outcome === "win" ? pnl > 0 : pnl < 0;
      });
    }
    if (state.tagId !== "") {
      rows = rows.filter((trade) => (trade.tagIds ?? []).includes(state.tagId));
    }
    if (state.from !== "") rows = rows.filter((trade) => trade.tradingDate >= state.from);
    if (state.to !== "") rows = rows.filter((trade) => trade.tradingDate <= state.to);
    return rows;
  }, [trades, state, symbolOf]);

  const sorted = React.useMemo(() => {
    const rows = [...filtered];
    const factor = state.sortDir === "asc" ? 1 : -1;
    const value = (trade: Trade): number | null => {
      if (state.sortKey === "r") return trade.rMultiple === null ? null : Number(trade.rMultiple);
      if (state.sortKey === "pnl") return trade.pnlNet === null ? null : Number(trade.pnlNet);
      return null;
    };
    rows.sort((a, b) => {
      if (state.sortKey === "date") {
        const aKey = a.exitAt ?? a.entryAt;
        const bKey = b.exitAt ?? b.entryAt;
        return aKey.localeCompare(bKey) * factor;
      }
      const aVal = value(a);
      const bVal = value(b);
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1; // nulls always sink regardless of direction
      if (bVal === null) return -1;
      return (aVal - bVal) * factor;
    });
    return rows;
  }, [filtered, state.sortKey, state.sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
  const safePage = Math.min(state.page, totalPages);
  const pageRows = React.useMemo(
    () => sorted.slice((safePage - 1) * state.pageSize, safePage * state.pageSize),
    [sorted, safePage, state.pageSize],
  );

  // ── Selection ────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const selectedOnPage = pageRows.filter((trade) => selectedIds.has(trade.id));
  const allOnPageSelected = pageRows.length > 0 && selectedOnPage.length === pageRows.length;

  const toggleAll = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allOnPageSelected) {
        for (const trade of pageRows) next.delete(trade.id);
      } else {
        for (const trade of pageRows) next.add(trade.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    for (const id of ids) deleteTrade.mutate(id);
    setSelectedIds(new Set());
    toast.success(`${ids.length} trade${ids.length === 1 ? "" : "s"} deleted`);
  };

  // ── Detail + edit ────────────────────────────────────────────────────────
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [editTrade, setEditTrade] = React.useState<Trade | null>(null);

  // Deep link: /trades?trade=<id> opens the drawer (palette search target).
  // State adjustment happens during render; the URL strip is an external
  // system write and belongs in an effect.
  const deepLinkId = useDeepLinkId();
  const [handledDeepLink, setHandledDeepLink] = React.useState<string | null>(null);
  if (deepLinkId !== null && deepLinkId !== handledDeepLink) {
    setHandledDeepLink(deepLinkId);
    setDetailId(deepLinkId);
  }
  React.useEffect(() => {
    if (deepLinkId === null) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("trade")) {
      params.delete("trade");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    }
  }, [deepLinkId]);

  const detailTrade = trades.find((trade) => trade.id === detailId) ?? null;

  const exportCsv = () => {
    const header = [
      "date", "instrument", "direction", "quantity", "entry", "exit",
      "r", "pnl_net", "grade", "status", "strategy", "duration", "tags", "notes",
    ];
    const lines = [header.join(",")];
    for (const trade of sorted) {
      lines.push([
        CSVCell(trade.tradingDate),
        CSVCell(symbolOf(trade.instrumentId)),
        CSVCell(trade.direction),
        CSVCell(trade.quantity),
        CSVCell(trade.entryPrice),
        CSVCell(trade.exitPrice),
        CSVCell(trade.rMultiple),
        CSVCell(trade.pnlNet),
        CSVCell(trade.decisionGrade),
        CSVCell(trade.status),
        CSVCell(strategyNameOf(trade.strategyId)),
        CSVCell(trade.exitAt ? formatDuration(trade.entryAt, trade.exitAt) : ""),
        CSVCell((trade.tagIds ?? []).map(tagNameOf).filter(Boolean).join("|")),
        CSVCell(trade.notes ?? ""),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cosmoz-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported", { description: `${sorted.length} rows` });
  };

  return (
    <div className="space-y-4">
      {/* Header — identity + primary capture action */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Trades
          </h1>
          <p className="text-sm text-muted-foreground">
            The complete trade log — filter, correct, annotate. Every execution with its result and grade.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={exportCsv}
            data-testid="trades-export"
            disabled={sorted.length === 0}
          >
            <Download className="size-3.5" aria-hidden="true" />
            Export CSV
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent-hover"
            onClick={() => openTradeModal()}
            data-testid="trades-new"
          >
            <Plus className="size-4" aria-hidden="true" />
            New trade
          </Button>
        </div>
      </header>

      <TradesFilters state={state} patch={patch} />

      {/* Bulk bar */}
      {selectedIds.size > 0 ? (
        <div
          data-testid="trades-bulk-bar"
          className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2"
        >
          <span className="font-mono text-sm font-semibold tabular-nums text-accent">
            {selectedIds.size} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={bulkDelete}
            disabled={deleteTrade.isPending}
            data-testid="trades-bulk-delete"
          >
            {deleteTrade.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
            Delete selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
            data-testid="trades-bulk-clear"
          >
            Clear
          </Button>
        </div>
      ) : null}

      {/* The ledger */}
      <div
        className="overflow-x-auto rounded-lg border border-border bg-surface"
        data-testid="trades-table"
      >
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="w-9 px-3 py-2.5">
                <Checkbox
                  checked={pageRows.length > 0 && allOnPageSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all on page"
                  data-testid="trades-select-all"
                />
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                <button
                  type="button"
                  onClick={() =>
                    patch({ sort: "date", dirn: state.sortKey === "date" && state.sortDir === "desc" ? "asc" : "desc" })
                  }
                  className="group flex items-center gap-1 outline-none hover:text-foreground"
                >
                  Date <SortIcon column="date" state={state} />
                </button>
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">Instrument</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Side</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Strategy</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Duration</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                <button
                  type="button"
                  onClick={() =>
                    patch({ sort: "r", dirn: state.sortKey === "r" && state.sortDir === "desc" ? "asc" : "desc" })
                  }
                  className="group ml-auto flex items-center gap-1 outline-none hover:text-foreground"
                >
                  R <SortIcon column="r" state={state} />
                </button>
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                <button
                  type="button"
                  onClick={() =>
                    patch({ sort: "pnl", dirn: state.sortKey === "pnl" && state.sortDir === "desc" ? "asc" : "desc" })
                  }
                  className="group ml-auto flex items-center gap-1 outline-none hover:text-foreground"
                >
                  P&amp;L <SortIcon column="pnl" state={state} />
                </button>
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">Grade</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Tags</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-muted-foreground">Loading…</td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-muted-foreground" data-testid="trades-empty">
                  {trades.length === 0 ? (
                    <>
                      No trades yet — press{" "}
                      <kbd className="rounded-sm bg-muted px-1 font-mono text-[10px]">N</kbd> or use{" "}
                      <button
                        type="button"
                        className="text-accent underline-offset-4 hover:underline"
                        onClick={() => openTradeModal()}
                      >
                        New trade
                      </button>
                      .
                    </>
                  ) : (
                    "No trades match these filters."
                  )}
                </td>
              </tr>
            ) : (
              pageRows.map((trade) => {
                const win = trade.pnlNet !== null && (Number(trade.pnlNet) ?? 0) >= 0;
                const duration =
                  trade.exitAt !== null ? formatDuration(trade.entryAt, trade.exitAt) : "—";
                const tradeTags = (trade.tagIds ?? [])
                  .map(tagNameOf)
                  .filter((name): name is string => name !== null);
                return (
                  <tr
                    key={trade.id}
                    data-testid="trades-row"
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
                    onClick={() => setDetailId(trade.id)}
                  >
                    <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(trade.id)}
                        onCheckedChange={() => toggleOne(trade.id)}
                        aria-label={`Select trade ${trade.tradingDate}`}
                        data-testid={`trades-row-checkbox-${trade.id}`}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {trade.tradingDate}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-foreground">
                      {symbolOf(trade.instrumentId)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-mono text-xs font-semibold",
                          trade.direction === "SELL" ? "text-loss" : "text-profit",
                        )}
                      >
                        {trade.direction === "SELL" ? (
                          <ArrowDownRight className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        )}
                        {trade.direction}
                      </span>
                    </td>
                    <td className="max-w-36 truncate px-3 py-2.5 text-muted-foreground">
                      {strategyNameOf(trade.strategyId) ?? (
                        <span className="italic opacity-70">Out of playbook</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {duration}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-foreground">
                      {trade.rMultiple === null ? "—" : formatR(trade.rMultiple)}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-right font-mono font-medium tabular-nums",
                        trade.pnlNet === null ? "text-muted-foreground" : win ? "text-profit" : "text-loss",
                      )}
                    >
                      {trade.pnlNet === null
                        ? "—"
                        : formatSignedMoney(trade.pnlNet, currency, { digits: 2 })}
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
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex max-w-32 flex-wrap gap-1">
                        {tradeTags.slice(0, 2).map((name) => (
                          <span
                            key={name}
                            className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {name}
                          </span>
                        ))}
                        {tradeTags.length > 2 ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            +{tradeTags.length - 2}
                          </span>
                        ) : null}
                      </div>
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
                    <td className="px-2 py-2.5" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Actions for ${symbolOf(trade.instrumentId)} ${trade.tradingDate}`}
                          >
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-40">
                          <DropdownMenuItem onClick={() => setDetailId(trade.id)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditTrade(trade)} data-testid="trades-row-edit">
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-loss focus:text-loss"
                            onClick={() => deleteTrade.mutate(trade.id)}
                            data-testid="trades-row-delete"
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-testid="trades-pagination"
      >
        <p className="text-xs text-muted-foreground">
          Showing{" "}
          <span className="font-mono tabular-nums text-foreground">
            {sorted.length === 0 ? 0 : (safePage - 1) * state.pageSize + 1}–
            {Math.min(safePage * state.pageSize, sorted.length)}
          </span>{" "}
          of{" "}
          <span className="font-mono tabular-nums text-foreground">{sorted.length}</span> trades
          <span className="mx-1.5 opacity-40">·</span>
          <Link href="/analytics" className="underline-offset-4 hover:underline">
            open analytics
          </Link>
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Rows
            <select
              value={state.pageSize}
              onChange={(event) => patch({ size: event.target.value })}
              className="h-7 rounded-md border border-border bg-background px-1.5 font-mono text-xs outline-none"
              data-testid="trades-page-size"
              aria-label="Rows per page"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 font-mono text-xs"
              disabled={safePage <= 1}
              onClick={() => patch({ page: safePage - 1 }, false)}
              aria-label="Previous page"
            >
              ‹
            </Button>
            <span className="min-w-14 text-center font-mono text-xs tabular-nums text-muted-foreground">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 font-mono text-xs"
              disabled={safePage >= totalPages}
              onClick={() => patch({ page: safePage + 1 }, false)}
              aria-label="Next page"
            >
              ›
            </Button>
          </div>
        </div>
      </div>

      {/* Detail drawer + edit dialog (module overlays) */}
      <TradeDetailDrawer
        trade={detailTrade}
        open={detailTrade !== null}
        onOpenChange={(next) => {
          if (!next) setDetailId(null);
        }}
        onEdit={(trade) => setEditTrade(trade)}
        onDeleted={() => setDetailId(null)}
      />
      <TradeEditDialog
        trade={editTrade}
        open={editTrade !== null}
        onOpenChange={(next) => {
          if (!next) setEditTrade(null);
        }}
      />
    </div>
  );
}

/** Reads ?trade=<id> for the palette deep link (null when absent). */
function useDeepLinkId(): string | null {
  const searchParams = useSearchParams();
  return searchParams.get("trade");
}

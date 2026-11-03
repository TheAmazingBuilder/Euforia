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
  Award,
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  Columns3,
  Download,
  Loader2,
  MoreHorizontal,
  ImageIcon,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import type { Currency, Grade, SavedTradeView, SavedTradeViewFilters, Trade, TradeColumnKey } from "@cosmoz/shared";
import { csvCell, formatR, formatSignedMoney } from "@cosmoz/shared";
import { formatInstrumentSymbol } from "@/lib/utils/instrument";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TradesFilters,
  useTradesUrlPatch,
  useTradesUrlState,
  type SortKey,
} from "@/components/trades/trades-filters";
import { CsvImportDialog } from "@/components/trades/csv-import-dialog";
import { TradeDetailDrawer } from "@/components/trades/trade-detail-drawer";
import { TradeEditDialog } from "@/components/trades/trade-edit-dialog";
import {
  useBulkTrades,
  useCreateTradeView,
  useDeleteTrade,
  useDeleteTradeView,
  useInstruments,
  useStrategies,
  useTags,
  useTrades,
  useScreenshots,
  useTradeViews,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";
import { useAccounts } from "@/lib/api/queries/catalogs";

// Ledger grade marks: bordered ink text, no tinted fills.
const GRADE_COLORS: Record<string, string> = {
  A: "border-foreground/40 text-foreground",
  B: "border-foreground/30 text-foreground/90",
  C: "border-border text-muted-foreground",
  D: "border-warning/50 text-warning",
  F: "border-warning/60 text-warning",
};

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

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
  // Shared definition (Phase 12): structural escape + CSV formula-injection
  // guard for user-controlled text (notes/strategies/tags), numbers exempt.
  return csvCell(value);
}

// ── Ledger column registry (saved views persist the visible subset) ─────────

interface LedgerColumn {
  key: TradeColumnKey;
  label: string;
  /** Extra <th> classes (alignment). */
  headerClass?: string;
  cellClass: string;
}

// Key + class definitions stay static at module scope; the user-facing labels
// resolve through the active dictionary inside the component (i18n - hooks
// cannot run at module scope).
const LEDGER_COLUMN_DEFS: readonly Omit<LedgerColumn, "label">[] = [
  { key: "date", cellClass: "whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground" },
  { key: "instrument", cellClass: "whitespace-nowrap px-3 py-2.5 font-medium text-foreground" },
  { key: "side", cellClass: "px-3 py-2.5" },
  { key: "strategy", cellClass: "max-w-36 truncate px-3 py-2.5 text-muted-foreground" },
  { key: "duration", cellClass: "whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground" },
  { key: "r", headerClass: "text-right", cellClass: "whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-foreground" },
  { key: "pnl", headerClass: "text-right", cellClass: "whitespace-nowrap px-3 py-2.5 text-right font-mono font-medium tabular-nums" },
  { key: "grade", cellClass: "px-3 py-2.5" },
  { key: "tags", cellClass: "px-3 py-2.5" },
  { key: "status", cellClass: "px-3 py-2.5" },
];

const ALL_COLUMN_KEYS = LEDGER_COLUMN_DEFS.map((column) => column.key);

/** Number of non-default filters a saved view captures (for the menu subtitle). */
function filterCount(view: SavedTradeView): number {
  const filters = view.filters;
  return [
    filters.q !== "",
    filters.status !== "all",
    filters.direction !== "all",
    filters.instrumentId !== "",
    filters.strategyId !== "",
    filters.outcome !== "all",
    filters.tagId !== "",
    filters.from !== "",
    filters.to !== "",
  ].filter(Boolean).length;
}

/**
 * THE TRADE MODULE (/trades):
 * header + capture/import actions, saved (filters + columns) views, URL-
 * persisted filters, sortable ledger table with toggleable columns, bulk
 * select (tag / grade / delete), pagination, row detail drawer (notes /
 * tags / screenshots / session projection chart / close) and edit dialog.
 */
export function TradesTable() {
  return (
    <React.Suspense fallback={<TradesSkeleton />}>
      <TradesModule />
    </React.Suspense>
  );
}

function TradesSkeleton() {
  const { dict } = useI18n();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={dict.trades.table.loadingAria}>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-14 rounded-lg" />
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}

type TradesDisplayMode = "list" | "cards";

const TRADES_DISPLAY_MODE_KEY = "euforia.trades.display-mode.v1";

type TradesDisplayModeListener = () => void;
const tradesDisplayModeListeners = new Set<TradesDisplayModeListener>();
let tradesDisplayModeMemory: TradesDisplayMode | null = null;

function getTradesDisplayModeSnapshot(): TradesDisplayMode {
  if (tradesDisplayModeMemory !== null) return tradesDisplayModeMemory;
  try {
    const stored = window.localStorage.getItem(TRADES_DISPLAY_MODE_KEY);
    return stored === "list" || stored === "cards" ? stored : "cards";
  } catch {
    return "cards";
  }
}

function subscribeTradesDisplayMode(listener: TradesDisplayModeListener): () => void {
  tradesDisplayModeListeners.add(listener);
  const onStorage = () => {
    tradesDisplayModeMemory = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    tradesDisplayModeListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getTradesDisplayModeServerSnapshot(): TradesDisplayMode {
  return "cards";
}

function setTradesDisplayMode(mode: TradesDisplayMode): void {
  tradesDisplayModeMemory = mode;
  try {
    window.localStorage.setItem(TRADES_DISPLAY_MODE_KEY, mode);
  } catch {
    // Keep the in-memory preference active when storage is unavailable.
  }
  for (const listener of tradesDisplayModeListeners) listener();
}

/** One journal entry rendered as a screenshot-first card (MRT-inspired). */
function TradeCard({
  trade,
  symbol,
  accountName,
  tags,
  selected,
  onToggleSelected,
  onOpen,
  onEdit,
  onDelete,
}: {
  trade: Trade;
  symbol: string;
  accountName: string;
  tags: string[];
  selected: boolean;
  onToggleSelected: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const previewRef = React.useRef<HTMLButtonElement>(null);
  const [screenshotsRequested, setScreenshotsRequested] = React.useState(false);
  React.useEffect(() => {
    const target = previewRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setScreenshotsRequested(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setScreenshotsRequested(true);
          observer.disconnect();
        }
      },
      { rootMargin: "180px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const { data: screenshotData, isLoading: screenshotsLoading } = useScreenshots(
    trade.id,
    screenshotsRequested,
  );
  const screenshots = screenshotData?.screenshots ?? [];
  const screenshot =
    screenshots.find((item) => item.kind === "CHART" && item.storageKey.startsWith("data:image/")) ??
    screenshots.find((item) => item.storageKey.startsWith("data:image/"));
  const pnl = trade.pnlNet === null ? null : Number(trade.pnlNet);
  const isProfit = pnl !== null && pnl > 0;
  const isLoss = pnl !== null && pnl < 0;
  const outcomeLabel =
    trade.status === "OPEN" ? "OPEN" : isProfit ? "WIN" : isLoss ? "LOSS" : "FLAT";
  const date = new Date(`${trade.tradingDate}T12:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? trade.tradingDate
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", year: "numeric" }).format(date);
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-surface transition-colors",
        selected ? "border-accent/70 ring-1 ring-accent/30" : "border-border hover:border-foreground/25",
      )}
      data-testid="trades-card"
      data-trade-id={trade.id}
    >
      <div className="relative">
        <button
          ref={previewRef}
          type="button"
          onClick={onOpen}
          className="block aspect-[16/9] w-full overflow-hidden bg-background text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`Open ${symbol} trade details`}
        >
          {screenshot ? (
            // The API resolves stored evidence to a data URL; no remote image URL is trusted here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={screenshot.storageKey}
              alt={screenshot.caption ?? `${symbol} trade chart`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-2 text-[11px]">
              <ImageIcon className="size-4 opacity-50" aria-hidden="true" />
              {!screenshotsRequested || screenshotsLoading ? "Loading screenshot…" : "No screenshot"}
            </span>
          )}
        </button>

        <div
          className="absolute top-2 left-2 rounded-md border border-border/70 bg-background/90 p-1 shadow-sm"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select ${symbol} trade from ${dateLabel}`}
          />
        </div>

        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-7 border-border/70 bg-background/90 shadow-sm"
                aria-label={`Actions for ${symbol} trade`}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpen}>Details</DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-loss focus:text-loss" onClick={onDelete}>
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="block w-full space-y-2.5 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {formatInstrumentSymbol(symbol)} <span className="text-muted-foreground">·</span>{" "}
              <span className={trade.direction === "SELL" ? "text-loss" : "text-profit"}>
                {trade.direction === "SELL" ? "Sell" : "Buy"}
              </span>
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{dateLabel}</p>
          </div>
          <p
            className={cn(
              "shrink-0 font-mono text-sm font-semibold tabular-nums",
              pnl === null ? "text-muted-foreground" : isProfit ? "text-profit" : isLoss ? "text-loss" : "text-foreground",
            )}
          >
            {pnl === null ? "—" : formatSignedMoney(trade.pnlNet!, "USD", { digits: 2 })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
              isProfit ? "border-profit/30 bg-profit/10 text-profit" :
                isLoss ? "border-loss/30 bg-loss/10 text-loss" :
                  "border-border bg-background text-muted-foreground",
            )}
          >
            {outcomeLabel}
          </span>
          {trade.decisionGrade ? (
            <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold", GRADE_COLORS[trade.decisionGrade] ?? "border-border text-muted-foreground")}>
              {trade.decisionGrade}
            </span>
          ) : null}
          {trade.rMultiple !== null ? (
            <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatR(trade.rMultiple)}
            </span>
          ) : null}
        </div>

        <div className="flex min-h-5 items-end justify-between gap-2 border-t border-border/70 pt-2">
          <div className="flex min-w-0 flex-wrap gap-1">
            {tags.slice(0, 2).map((tag) => (
              <span key={tag} className="max-w-24 truncate rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tag}
              </span>
            ))}
            {tags.length > 2 ? (
              <span className="font-mono text-[10px] text-muted-foreground">+{tags.length - 2}</span>
            ) : null}
          </div>
          <span className="max-w-28 truncate text-[10px] text-muted-foreground" title={accountName}>
            {accountName}
          </span>
        </div>
      </button>
    </article>
  );
}

function TradesModule() {
  const { dict } = useI18n();
  const T = dict.trades;
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
  const { data: accountsData } = useAccounts();
  const accounts = React.useMemo(() => accountsData?.accounts ?? [], [accountsData]);

  const displayMode = React.useSyncExternalStore(
    subscribeTradesDisplayMode,
    getTradesDisplayModeSnapshot,
    getTradesDisplayModeServerSnapshot,
  );

  const ledgerColumns = React.useMemo<LedgerColumn[]>(
    () => LEDGER_COLUMN_DEFS.map((column) => ({ ...column, label: T.table.columns[column.key] })),
    [T],
  );

  const symbolOf = React.useMemo(() => {
    const map = new Map(instruments.map((instrument) => [instrument.id, instrument.symbol]));
    return (id: string) => map.get(id) ?? "-";
  }, [instruments]);
  const strategyNameOf = React.useMemo(() => {
    const map = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));
    return (id: string | null) => (id === null ? null : map.get(id) ?? null);
  }, [strategies]);
  const accountNameOf = React.useMemo(() => {
    const map = new Map(accounts.map((account) => [account.id, account.name]));
    return (id: string) => map.get(id) ?? "Account";
  }, [accounts]);
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

  // ── Selection + bulk operations (one round-trip per action) ──────────────
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const selectedOnPage = pageRows.filter((trade) => selectedIds.has(trade.id));
  const allOnPageSelected = pageRows.length > 0 && selectedOnPage.length === pageRows.length;
  const bulk = useBulkTrades();

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
    if (selectedIds.size === 0) return;
    bulk.mutate(
      { op: "DELETE", tradeIds: [...selectedIds] },
      {
        onSuccess: (result) => {
          setSelectedIds(new Set());
          toast.success(
            result.affected === 1
              ? T.table.bulk.deleteOne
              : `${result.affected} ${T.table.bulk.deleteManyUnit}`,
          );
        },
        onError: (error) => toast.error(apiErrorMessage(error, T.errors.bulkDelete)),
      },
    );
  };

  const bulkTag = (tagId: string, mode: "add" | "remove") => {
    const tagName = tagNameOf(tagId) ?? T.table.bulk.tagFallback;
    bulk.mutate(
      { op: "TAG", tradeIds: [...selectedIds], tagId, mode },
      {
        onSuccess: (result) =>
          toast.success(
            result.affected === 1
              ? `${T.table.bulk.tagOne} “${tagName}”`
              : `${result.affected} ${T.table.bulk.tagManyUnit} “${tagName}”`,
            {
              description:
                result.skipped > 0
                  ? `${result.skipped} ${mode === "add" ? T.table.bulk.skippedTagged : T.table.bulk.skippedUntagged}`
                  : undefined,
            },
          ),
        onError: (error) => toast.error(apiErrorMessage(error, T.errors.bulkTag)),
      },
    );
  };

  const bulkGrade = (grade: Grade) => {
    bulk.mutate(
      { op: "GRADE", tradeIds: [...selectedIds], grade },
      {
        onSuccess: (result) =>
          toast.success(
            result.affected === 1
              ? `${T.table.bulk.gradeOne} ${grade}`
              : `${result.affected} ${T.table.bulk.gradeManyUnit} ${grade}`,
            {
              description:
                result.skipped > 0
                  ? `${result.skipped} ${T.table.bulk.skippedOpen}`
                  : undefined,
            },
          ),
        onError: (error) => toast.error(apiErrorMessage(error, T.errors.bulkGrade)),
      },
    );
  };

  // ── Column visibility (saved views persist the subset) ───────────────────
  const [visibleColumns, setVisibleColumns] = React.useState<Set<TradeColumnKey>>(
    () => new Set(ALL_COLUMN_KEYS),
  );
  const visibleOrder = React.useMemo(
    () => ALL_COLUMN_KEYS.filter((key) => visibleColumns.has(key)),
    [visibleColumns],
  );
  const toggleColumn = (key: TradeColumnKey) => {
    setVisibleColumns((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // the ledger never renders bare
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // ── Saved views (named filters + columns + sort) - TRADES scope of the
  // unified preset library (ANALYTICS presets live in the same store) ────────
  const { data: viewsData } = useTradeViews();
  const createView = useCreateTradeView();
  const deleteView = useDeleteTradeView();
  const views = React.useMemo(
    () => (viewsData?.views ?? []).filter((view) => view.scope === "TRADES"),
    [viewsData],
  );

  const currentFilters = React.useMemo<SavedTradeViewFilters>(
    () => ({
      q: state.q,
      status: state.status,
      direction: state.direction,
      instrumentId: state.instrumentId,
      strategyId: state.strategyId,
      outcome: state.outcome,
      tagId: state.tagId,
      from: state.from,
      to: state.to,
    }),
    [state.q, state.status, state.direction, state.instrumentId, state.strategyId, state.outcome, state.tagId, state.from, state.to],
  );

  const activeView = React.useMemo(
    () =>
      views.find(
        (view) =>
          view.sortKey === state.sortKey &&
          view.sortDir === state.sortDir &&
          JSON.stringify(view.columns) === JSON.stringify(visibleOrder) &&
          JSON.stringify(view.filters) === JSON.stringify(currentFilters),
      ) ?? null,
    [views, state.sortKey, state.sortDir, visibleOrder, currentFilters],
  );

  const applyView = (view: SavedTradeView) => {
    patch({
      q: view.filters.q,
      status: view.filters.status === "all" ? "" : view.filters.status,
      dir: view.filters.direction === "all" ? "" : view.filters.direction,
      inst: view.filters.instrumentId,
      strat: view.filters.strategyId,
      out: view.filters.outcome === "all" ? "" : view.filters.outcome,
      tag: view.filters.tagId,
      from: view.filters.from,
      to: view.filters.to,
      sort: view.sortKey === "date" ? "" : view.sortKey,
      dirn: view.sortDir === "desc" ? "" : view.sortDir,
    });
    setVisibleColumns(new Set(view.columns));
  };

  const [viewDialogOpen, setViewDialogOpen] = React.useState(false);
  const [viewName, setViewName] = React.useState("");

  const onSaveView = () => {
    const name = viewName.trim();
    if (name === "") return;
    createView.mutate(
      { name, filters: currentFilters, columns: visibleOrder, sortKey: state.sortKey, sortDir: state.sortDir },
      {
        onSuccess: (result) => {
          toast.success(`${T.table.views.view} “${result.view.name}” ${T.table.views.saved}`, {
            description: T.table.views.savedDescription,
          });
          setViewDialogOpen(false);
          setViewName("");
        },
        onError: (error) => toast.error(apiErrorMessage(error, T.errors.viewSave)),
      },
    );
  };

  // ── CSV import ─────────────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = React.useState(false);

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
        CSVCell(formatInstrumentSymbol(symbolOf(trade.instrumentId))),
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
    toast.success(T.table.csvExported, { description: `${sorted.length} ${T.table.rowsUnit}` });
  };

  return (
    <div className="space-y-4">
      {/* Header - identity + capture / import / views actions */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="page-title text-foreground">
            {T.table.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {T.table.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Saved views - named filters + columns + sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("gap-1.5", activeView !== null && "border-accent/50 text-accent")}
                data-testid="trades-views-trigger"
              >
                <Bookmark className="size-3.5" aria-hidden="true" />
                {activeView !== null ? activeView.name : T.table.views.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              <DropdownMenuItem
                onClick={() => setViewDialogOpen(true)}
                className="gap-2"
                data-testid="trades-view-save"
              >
                <BookmarkPlus className="size-3.5 text-accent" aria-hidden="true" />
                {T.table.views.saveCurrent}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {views.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {T.table.views.empty}
                </p>
              ) : (
                views.map((view) => (
                  <DropdownMenuItem
                    key={view.id}
                    className="items-center gap-2"
                    onClick={() => applyView(view)}
                    data-testid={`trades-view-item-${view.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                  >
                    <Bookmark className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{view.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {filterCount(view)}{T.table.views.filtersShort} · {view.columns.length}{T.table.views.columnsShort}
                    </span>
                    <button
                      type="button"
                      aria-label={`${T.table.views.deleteViewAria} ${view.name}`}
                      className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-loss"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteView.mutate(view.id, {
                          onSuccess: () => toast.success(`${T.table.views.view} “${view.name}” ${T.table.views.deleted}`),
                        });
                      }}
                      data-testid={`trades-view-delete-${view.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                    >
                      <Trash2 className="size-3" aria-hidden="true" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Columns3 className="size-3.5" aria-hidden="true" />
                  {T.table.views.columns}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent data-testid="trades-columns-menu">
                  {ledgerColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={visibleColumns.has(column.key)}
                      onCheckedChange={() => toggleColumn(column.key)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <div
            className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
            role="group"
            aria-label="Trade display mode"
          >
            <Button
              type="button"
              variant={displayMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="size-7"
              aria-label="List view"
              aria-pressed={displayMode === "list"}
              data-testid="trades-view-list"
              onClick={() => setTradesDisplayMode("list")}
            >
              <List className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant={displayMode === "cards" ? "secondary" : "ghost"}
              size="icon"
              className="size-7"
              aria-label="Card view"
              aria-pressed={displayMode === "cards"}
              data-testid="trades-view-cards"
              onClick={() => setTradesDisplayMode("cards")}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={exportCsv}
            data-testid="trades-export"
            disabled={sorted.length === 0}
          >
            <Download className="size-3.5" aria-hidden="true" />
            {T.table.actions.exportCsv}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setImportOpen(true)}
            data-testid="trades-import-open"
          >
            <Upload className="size-3.5" aria-hidden="true" />
            {T.table.actions.importCsv}
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-action-success text-action-success-foreground hover:bg-action-success-hover"
            onClick={() => openTradeModal()}
            data-testid="trades-new"
          >
            <Plus className="size-4" aria-hidden="true" />
            {T.shared.newTrade}
          </Button>
        </div>
      </header>

      <TradesFilters state={state} patch={patch} />

      {/* Bulk bar - tag / grade / delete in one round-trip */}
      {selectedIds.size > 0 ? (
        <div
          data-testid="trades-bulk-bar"
          className="flex flex-wrap items-center gap-2.5 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2"
        >
          <span className="font-mono text-sm font-semibold tabular-nums text-accent">
            {selectedIds.size} {T.table.bulk.selected}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="trades-bulk-tag">
                <Tag className="size-3.5" aria-hidden="true" />
                {T.table.bulk.tag}
                <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{T.table.bulk.addTag}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                  {tags.map((tag) => (
                    <DropdownMenuItem
                      key={tag.id}
                      onClick={() => bulkTag(tag.id, "add")}
                      data-testid={`trades-bulk-tag-${tag.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                    >
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{T.table.bulk.removeTag}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                  {tags.map((tag) => (
                    <DropdownMenuItem key={tag.id} onClick={() => bulkTag(tag.id, "remove")}>
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="trades-bulk-grade">
                <Award className="size-3.5" aria-hidden="true" />
                {T.table.bulk.grade}
                <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              {GRADES.map((grade) => (
                <DropdownMenuItem
                  key={grade}
                  className="gap-2.5"
                  onClick={() => bulkGrade(grade)}
                  data-testid={`trades-bulk-grade-${grade}`}
                >
                  <span
                    className={cn(
                      "inline-block min-w-6 rounded-sm border px-1 py-0.5 text-center font-heading text-xs font-bold",
                      GRADE_COLORS[grade],
                    )}
                  >
                    {grade}
                  </span>
                  {T.table.bulk.grade} {grade}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <p className="px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
                {T.table.bulk.gradeHint}
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={bulkDelete}
            disabled={bulk.isPending}
            data-testid="trades-bulk-delete"
          >
            {bulk.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
            {T.table.bulk.deleteSelected}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
            data-testid="trades-bulk-clear"
          >
            {T.table.bulk.clear}
          </Button>
        </div>
      ) : null}

      {displayMode === "cards" ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-testid="trades-cards"
        >
          {isLoading ? (
            Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-xl border border-border bg-surface">
                <Skeleton className="aspect-[16/9] w-full rounded-none" />
                <div className="space-y-3 p-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))
          ) : pageRows.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted-foreground" data-testid="trades-empty">
              {trades.length === 0 ? (
                <>
                  {T.table.emptyHint}{" "}
                  <kbd className="rounded-sm bg-muted px-1 font-mono text-[10px]">N</kbd>{" "}
                  {T.table.emptyOrUse}{" "}
                  <button
                    type="button"
                    className="text-accent underline-offset-4 hover:underline"
                    onClick={() => openTradeModal()}
                  >
                    {T.shared.newTrade}
                  </button>
                  .
                </>
              ) : (
                T.table.emptyFiltered
              )}
            </div>
          ) : (
            pageRows.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                symbol={formatInstrumentSymbol(symbolOf(trade.instrumentId))}
                accountName={accountNameOf(trade.accountId)}
                tags={(trade.tagIds ?? []).map(tagNameOf).filter((name): name is string => name !== null)}
                selected={selectedIds.has(trade.id)}
                onToggleSelected={() => toggleOne(trade.id)}
                onOpen={() => setDetailId(trade.id)}
                onEdit={() => setEditTrade(trade)}
                onDelete={() => deleteTrade.mutate(trade.id)}
              />
            ))
          )}
        </div>
      ) : (
        <>
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
                  aria-label={T.table.selectAllPage}
                  data-testid="trades-select-all"
                />
              </th>
              {visibleOrder.map((key) => {
                const column = ledgerColumns.find((candidate) => candidate.key === key)!;
                const sortable = key === "date" || key === "r" || key === "pnl";
                const alignClass = column.headerClass ?? "";
                return (
                  <th key={key} scope="col" className={cn("px-3 py-2.5 font-medium", alignClass)}>
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            sort: key === "date" ? "" : key,
                            dirn: state.sortKey === key && state.sortDir === "desc" ? "asc" : "desc",
                          })
                        }
                        className={cn(
                          "group flex items-center gap-1 outline-none hover:text-foreground",
                          (key === "r" || key === "pnl") && "ml-auto",
                        )}
                      >
                        {column.label} <SortIcon column={key as SortKey} state={state} />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
              <th scope="col" className="relative w-10 px-2 py-2.5"><span className="sr-only">{T.table.actionsSr}</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={visibleOrder.length + 2} className="px-3 py-10 text-center text-muted-foreground">{dict.common.loading}</td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleOrder.length + 2} className="px-3 py-10 text-center text-muted-foreground" data-testid="trades-empty">
                  {trades.length === 0 ? (
                    <>
                      {T.table.emptyHint}{" "}
                      <kbd className="rounded-sm bg-muted px-1 font-mono text-[10px]">N</kbd>{" "}
                      {T.table.emptyOrUse}{" "}
                      <button
                        type="button"
                        className="text-accent underline-offset-4 hover:underline"
                        onClick={() => openTradeModal()}
                      >
                        {T.shared.newTrade}
                      </button>
                      .
                    </>
                  ) : (
                    T.table.emptyFiltered
                  )}
                </td>
              </tr>
            ) : (
              pageRows.map((trade) => {
                const win = trade.pnlNet !== null && (Number(trade.pnlNet) ?? 0) >= 0;
                const duration =
                  trade.exitAt !== null ? formatDuration(trade.entryAt, trade.exitAt) : "-";
                const tradeTags = (trade.tagIds ?? [])
                  .map(tagNameOf)
                  .filter((name): name is string => name !== null);
                const cells: Record<TradeColumnKey, React.ReactNode> = {
                  date: trade.tradingDate,
                  instrument: formatInstrumentSymbol(symbolOf(trade.instrumentId)),
                  side: (
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
                  ),
                  strategy: strategyNameOf(trade.strategyId) ?? (
                    <span className="italic opacity-70">{T.shared.outOfPlaybook}</span>
                  ),
                  duration,
                  r: trade.rMultiple === null ? "-" : formatR(trade.rMultiple),
                  pnl: (
                    <span
                      className={cn(
                        trade.pnlNet === null ? "text-muted-foreground" : win ? "text-profit" : "text-loss",
                      )}
                    >
                      {trade.pnlNet === null
                        ? "-"
                        : formatSignedMoney(trade.pnlNet, currency, { digits: 2 })}
                    </span>
                  ),
                  grade:
                    trade.decisionGrade !== null ? (
                      <span
                        className={cn(
                          "inline-block min-w-6 rounded-sm border px-1 py-0.5 text-center font-heading text-xs font-bold",
                          GRADE_COLORS[trade.decisionGrade] ?? "border-border text-muted-foreground",
                        )}
                      >
                        {trade.decisionGrade}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    ),
                  tags: (
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
                  ),
                  status:
                    trade.status === "OPEN" ? (
                      <span className="stamp stamp-accent">{T.table.statusOpen}</span>
                    ) : (
                      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/70">
                        {T.table.statusClosed}
                      </span>
                    ),
                };
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
                        aria-label={`${T.table.rowActions.selectTrade} ${trade.tradingDate}`}
                        data-testid={`trades-row-checkbox-${trade.id}`}
                      />
                    </td>
                    {visibleOrder.map((key) => (
                      <td
                        key={key}
                        className={ledgerColumns.find((candidate) => candidate.key === key)!.cellClass}
                      >
                        {cells[key]}
                      </td>
                    ))}
                    <td className="px-2 py-2.5" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`${T.table.rowActions.actionsFor} ${formatInstrumentSymbol(symbolOf(trade.instrumentId))} ${trade.tradingDate}`}
                          >
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-40">
                          <DropdownMenuItem onClick={() => setDetailId(trade.id)}>
                            {T.table.rowActions.details}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-action-edit focus:text-action-edit" onClick={() => setEditTrade(trade)} data-testid="trades-row-edit">
                            <Pencil className="size-3.5" aria-hidden="true" />
                            {T.shared.edit}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-loss focus:text-loss"
                            onClick={() => deleteTrade.mutate(trade.id)}
                            data-testid="trades-row-delete"
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            {T.shared.delete}
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
        </>
      )}

      {/* Pagination footer */}
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-testid="trades-pagination"
      >
        <p className="text-xs text-muted-foreground">
          {T.table.showing}{" "}
          <span className="font-mono tabular-nums text-foreground">
            {sorted.length === 0 ? 0 : (safePage - 1) * state.pageSize + 1}–
            {Math.min(safePage * state.pageSize, sorted.length)}
          </span>{" "}
          {T.table.of}{" "}
          <span className="font-mono tabular-nums text-foreground">{sorted.length}</span> {T.table.tradesUnit}
          <span className="mx-1.5 opacity-40">·</span>
          <Link href="/analytics" className="underline-offset-4 hover:underline">
            {T.table.openAnalytics}
          </Link>
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {T.table.rowsLabel}
            <select
              value={state.pageSize}
              onChange={(event) => patch({ size: event.target.value })}
              className="h-7 rounded-md border border-border bg-background px-1.5 font-mono text-xs outline-none"
              data-testid="trades-page-size"
              aria-label={T.table.rowsPerPage}
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
              aria-label={T.table.prevPage}
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
              aria-label={T.table.nextPage}
            >
              ›
            </Button>
          </div>
        </div>
      </div>

      {/* Save view dialog - snapshots current filters + columns + sort */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="trades-view-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{T.table.views.dialogTitle}</DialogTitle>
            <DialogDescription>
              {T.table.views.dialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trade-view-name">{T.table.views.nameLabel}</Label>
              <Input
                id="trade-view-name"
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                placeholder={T.table.views.namePlaceholder}
                autoFocus
                data-testid="trades-view-name-input"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                {filterCount({
                  id: "", name: "", createdAt: "", sortKey: state.sortKey, sortDir: state.sortDir,
                  scope: "TRADES", analyticsFilters: null,
                  columns: [], filters: currentFilters,
                })} {T.table.views.filtersUnit}
              </span>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                {visibleOrder.length} {T.table.views.columnsUnit}
              </span>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                {T.table.views.sortPrefix} {state.sortKey} {state.sortDir}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setViewDialogOpen(false)} data-testid="trades-view-save-cancel">
              {dict.common.cancel}
            </Button>
            <Button
              onClick={onSaveView}
              disabled={viewName.trim() === "" || createView.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent-hover"
              data-testid="trades-view-save-confirm"
            >
              {createView.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <BookmarkPlus className="size-4" aria-hidden="true" />
              )}
              {T.table.views.saveAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV import (column mapping) */}
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />

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

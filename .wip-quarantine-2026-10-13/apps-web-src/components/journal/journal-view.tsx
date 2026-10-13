"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileDown,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { JournalEntry, Trade } from "@cosmoz/shared";
import { formatR, formatSignedMoney } from "@cosmoz/shared";
import { toast } from "sonner";

import { exportJournalPdf, type JournalExportItem } from "@/lib/journal-export";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  JournalEntryDialog,
  type JournalDraft,
} from "@/components/journal/journal-entry-dialog";
import { JournalGoals } from "@/components/journal/journal-goals";
import {
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useInstruments,
  useJournalEntries,
  useTrades,
  useUpdateJournalEntry,
} from "@/lib/api/queries";
import { getNavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const nav = getNavItem("/journal");

/** Toronto trading-date key for "today" (en-CA gives YYYY-MM-DD). */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { day: "2-digit", timeZone: "UTC" });
const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

function dateParts(dateKey: string) {
  const asUtc = new Date(`${dateKey}T00:00:00Z`);
  return {
    day: DAY_FORMAT.format(asUtc),
    month: MONTH_FORMAT.format(asUtc).toUpperCase(),
    weekday: WEEKDAY_FORMAT.format(asUtc),
  };
}

function EntryActions({
  entry,
  busy,
  confirming,
  onEdit,
  onDelete,
  onConfirmDelete,
}: {
  entry: JournalEntry;
  busy: boolean;
  confirming: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
}) {
  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onConfirmDelete}
          className="rounded-md px-2 py-1 text-xs font-semibold text-loss outline-none hover:bg-loss/10 focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`journal-confirm-delete-${entry.id}`}
        >
          Delete forever
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Keep
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Edit ${entry.title}`}
        onClick={onEdit}
        disabled={busy}
        className="size-7 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${entry.title}`}
        onClick={onConfirmDelete}
        disabled={busy}
        className="size-7 text-muted-foreground hover:text-loss"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * Linked-trade chip — the entry's execution reference, mono on a hairline:
 * symbol, side, and the honest outcome (net P&L + R, or "open").
 */
function LinkedTradeChip({ trade, symbol }: { trade: Trade; symbol: string }) {
  const closed = trade.status === "CLOSED";
  const positive = (Number(trade.pnlNet) ?? 0) >= 0;
  const outcomeClass = closed ? (positive ? "text-profit" : "text-loss") : "text-warning";
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-0.5 font-mono text-[11px] leading-5"
      data-testid="journal-linked-trade"
      title={
        closed
          ? `Linked trade — ${symbol} ${trade.direction === "BUY" ? "long" : "short"}, net ${formatSignedMoney(trade.pnlNet, "USD")}, ${formatR(trade.rMultiple)}`
          : `Linked trade — ${symbol} ${trade.direction === "BUY" ? "long" : "short"}, still open`
      }
    >
      <Link2 className="size-3 shrink-0 text-accent" aria-hidden="true" />
      <span className="font-semibold text-foreground">{symbol}</span>
      {trade.direction === "BUY" ? (
        <ArrowUpRight className="size-3 shrink-0 text-profit" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="size-3 shrink-0 text-loss" aria-hidden="true" />
      )}
      {closed ? (
        <>
          <span className={outcomeClass}>{formatSignedMoney(trade.pnlNet, "USD")}</span>
          <span className={outcomeClass}>{formatR(trade.rMultiple)}</span>
        </>
      ) : (
        <span className={outcomeClass}>open</span>
      )}
    </span>
  );
}

/**
 * Filter chip — the single filter grammar of the log: mono annotation on a
 * hairline, active = ink block. Used by tags, moods and the linkage row.
 */
function FilterChip({
  active,
  upper,
  onClick,
  children,
}: {
  active: boolean;
  upper?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2 py-1 font-mono text-[11px] tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        upper ? "uppercase" : "lowercase",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The Journal — the trader's written log as a ruled document: a date margin,
 * honest entries separated by hairlines, annotations in mono. Search, tag,
 * linkage and mood filters re-ask the server; the page never pretends a hit
 * it does not have.
 */
export function JournalView() {
  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  const [linked, setLinked] = React.useState<"any" | "true" | "false">("any");
  const [mood, setMood] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState("newest");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<JournalEntry | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const { data, isPending, isError } = useJournalEntries({
    q: query || undefined,
    tag: tag ?? undefined,
    linked: linked === "any" ? undefined : linked,
    mood: mood ?? undefined,
    sort,
  });
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

  const busy = createEntry.isPending || updateEntry.isPending || deleteEntry.isPending;

  // Tag chips read the UNfiltered log (cheap second query) so the row stays
  // stable no matter what the search box is doing.
  const { data: allData } = useJournalEntries({});
  const availableTags = React.useMemo(
    () => [...new Set((allData?.entries ?? []).flatMap((entry) => entry.tags))].sort(),
    [allData],
  );
  const availableMoods = React.useMemo(
    () =>
      [
        ...new Set(
          (allData?.entries ?? [])
            .map((entry) => entry.mood)
            .filter((value): value is NonNullable<JournalEntry["mood"]> => value !== null),
        ),
      ].sort(),
    [allData],
  );

  // Linked-trade resolution — trade symbol and outcome for the chips.
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const tradeById = React.useMemo(
    () => new Map((tradesData?.trades ?? []).map((trade) => [trade.id, trade])),
    [tradesData],
  );
  const symbolByInstrument = React.useMemo(
    () =>
      new Map(
        (instrumentsData?.instruments ?? []).map((instrument) => [
          instrument.id,
          instrument.symbol,
        ]),
      ),
    [instrumentsData],
  );

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setEditing(entry);
    setDialogOpen(true);
  };

  function handleSave(draft: JournalDraft) {
    if (editing) {
      updateEntry.mutate(
        { entryId: editing.id, input: draft },
        {
          onSuccess: () => {
            toast.success("Entry revised");
            setDialogOpen(false);
          },
          onError: () => toast.error("The revision could not be saved"),
        },
      );
    } else {
      createEntry.mutate(draft, {
        onSuccess: () => {
          toast.success("Entry written");
          setDialogOpen(false);
        },
        onError: () => toast.error("The entry could not be saved"),
      });
    }
  }

  function handleDelete(entry: JournalEntry) {
    deleteEntry.mutate(entry.id, {
      onSuccess: () => {
        toast.success("Entry deleted");
        setConfirmId(null);
      },
      onError: () => toast.error("The entry could not be deleted"),
    });
  }

  const isFiltered =
    query.trim() !== "" || tag !== null || linked !== "any" || mood !== null;

  // Export payload — mirrors the current filtered view, chips resolved.
  const exportItems = React.useMemo<JournalExportItem[]>(
    () =>
      (data?.entries ?? []).map((entry) => {
        const trade = entry.relatedTradeId
          ? tradeById.get(entry.relatedTradeId)
          : undefined;
        return {
          date: entry.date,
          title: entry.title,
          body: entry.body,
          tags: entry.tags,
          mood: entry.mood ? entry.mood.toLowerCase() : null,
          linked: trade
            ? {
                symbol: symbolByInstrument.get(trade.instrumentId) ?? "—",
                side: trade.direction === "BUY" ? "long" : "short",
                outcome:
                  trade.status === "CLOSED" && trade.rMultiple !== null
                    ? formatR(trade.rMultiple)
                    : trade.status.toLowerCase(),
              }
            : null,
        };
      }),
    [data, tradeById, symbolByInstrument],
  );

  async function handleExport() {
    if (exportItems.length === 0) return;
    setExporting(true);
    try {
      const filterParts = [
        query.trim() ? `search \u201c${query.trim()}\u201d` : null,
        tag ? `tag #${tag}` : null,
        mood ? `mood ${mood.toLowerCase()}` : null,
        linked === "true" ? "linked to trade" : linked === "false" ? "not linked" : null,
      ].filter((part): part is string => part !== null);
      const pages = await exportJournalPdf(exportItems, {
        fileName: `cosmoz-journal-${todayKey()}.pdf`,
        filtersNote: filterParts.length > 0 ? filterParts.join(" \u00b7 ") : undefined,
      });
      toast.success(
        `Journal exported \u2014 ${exportItems.length} ${exportItems.length === 1 ? "entry" : "entries"} on ${pages} ${pages === 1 ? "page" : "pages"}`,
      );
    } catch {
      toast.error("The export could not be generated");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="journal-view">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {nav.label}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">{nav.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isPending || !data || data.entries.length === 0 || exporting}
            data-testid="journal-export"
          >
            {exporting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="size-4" aria-hidden="true" />
            )}
            Export PDF
          </Button>
          <Button onClick={openNew} data-testid="journal-new">
            <Plus className="size-4" aria-hidden="true" />
            New entry
          </Button>
        </div>
      </header>

      {/* Goals — the writing cadence against the plan (reads the FULL log). */}
      <JournalGoals entries={allData?.entries ?? []} />

      {/* Filters — one grammar: mono chips, active = ink block. Server-side. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the log…"
              aria-label="Search journal entries"
              data-testid="journal-search"
              className="h-9 pl-8"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger
              aria-label="Sort order"
              data-testid="journal-sort"
              className="h-9 w-full shrink-0 font-mono text-xs sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="journal-link-filter">
          <FilterChip active={linked === "any"} upper onClick={() => setLinked("any")}>
            All
          </FilterChip>
          <FilterChip
            active={linked === "true"}
            upper
            onClick={() => setLinked(linked === "true" ? "any" : "true")}
          >
            Linked
          </FilterChip>
          <FilterChip
            active={linked === "false"}
            upper
            onClick={() => setLinked(linked === "false" ? "any" : "false")}
          >
            Unlinked
          </FilterChip>
        </div>
        {availableTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="journal-tags">
            <FilterChip active={tag === null} upper onClick={() => setTag(null)}>
              All
            </FilterChip>
            {availableTags.map((item) => (
              <FilterChip
                key={item}
                active={tag === item}
                onClick={() => setTag((current) => (current === item ? null : item))}
              >
                {item}
              </FilterChip>
            ))}
          </div>
        ) : null}
        {availableMoods.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="journal-mood-filter">
            <FilterChip active={mood === null} upper onClick={() => setMood(null)}>
              All
            </FilterChip>
            {availableMoods.map((item) => (
              <FilterChip
                key={item}
                active={mood === item}
                onClick={() => setMood((current) => (current === item ? null : item))}
              >
                {item}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      {/* Counter annotation */}
      {data ? (
        <p className="ledger-label" data-testid="journal-count">
          {isFiltered
            ? `${data.entries.length} of ${data.total} entries`
            : `${data.total} ${data.total === 1 ? "entry" : "entries"}`}
        </p>
      ) : null}

      {isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          The log could not be opened. Try again in a moment.
        </p>
      ) : isPending || !data ? (
        <div className="space-y-6">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex gap-5">
              <Skeleton className="h-10 w-16 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : data.entries.length === 0 ? (
        <div className="border-y border-border py-14 text-center" data-testid="journal-empty">
          <p className="font-heading text-base font-semibold text-foreground">
            {isFiltered ? "Nothing in the log matches." : "The log is blank."}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {isFiltered
              ? "Loosen the search or clear the tag filter to see the rest of the record."
              : "The first entry is usually the hardest — write what today's session actually felt like."}
          </p>
          {!isFiltered ? (
            <Button onClick={openNew} variant="outline" className="mt-4">
              <Plus className="size-4" aria-hidden="true" />
              Write the first entry
            </Button>
          ) : null}
        </div>
      ) : (
        <ol
          className="reveal-stagger divide-y divide-border border-y border-border"
          data-testid="journal-list"
        >
          {data.entries.map((entry) => {
            const parts = dateParts(entry.date);
            return (
              <li
                key={entry.id}
                className="group flex gap-4 px-1 py-5 transition-colors hover:bg-surface-raised/40 sm:gap-6"
                data-testid="journal-entry"
              >
                {/* Date margin — the ledger column */}
                <div className="w-14 shrink-0 text-right sm:w-16" aria-hidden="true">
                  <p className="font-mono text-lg font-semibold leading-none tabular-nums text-foreground">
                    {parts.day}
                  </p>
                  <p className="ledger-label mt-1">{parts.month}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">{parts.weekday}</p>
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <h2 className="font-heading text-base font-semibold leading-snug text-foreground">
                    {entry.title}
                  </h2>
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {entry.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                    {entry.relatedTradeId && tradeById.has(entry.relatedTradeId) ? (
                      <LinkedTradeChip
                        trade={tradeById.get(entry.relatedTradeId)!}
                        symbol={symbolByInstrument.get(tradeById.get(entry.relatedTradeId)!.instrumentId) ?? "—"}
                      />
                    ) : null}
                    {entry.tags.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setTag(item)}
                        className="font-mono text-[11px] text-muted-foreground/80 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        #{item}
                      </button>
                    ))}
                    {entry.mood ? (
                      <button
                        type="button"
                        onClick={() => setMood(entry.mood)}
                        className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/60 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        mood · {entry.mood.toLowerCase()}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end justify-between gap-2 sm:flex-row sm:items-start">
                  {busy && (editing?.id === entry.id || confirmId === entry.id) ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <EntryActions
                      entry={entry}
                      busy={busy}
                      confirming={confirmId === entry.id}
                      onEdit={() => openEdit(entry)}
                      onDelete={() => setConfirmId(null)}
                      onConfirmDelete={() => {
                        if (confirmId === entry.id) {
                          handleDelete(entry);
                        } else {
                          setConfirmId(entry.id);
                        }
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <JournalEntryDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setConfirmId(null);
        }}
        entry={editing}
        onSave={handleSave}
        isSaving={busy}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import type { Instrument } from "@cosmoz/shared";

import { useInstruments } from "@/lib/api/queries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { assetClassBadge } from "@/lib/utils/instrument";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Search-first instrument combobox (spec §4): matches symbol AND name
 * ("eur" → EURUSD, "vol75" → VOL75(1s)), recents chips persisted in
 * localStorage (max 5). Search goes through GET /instruments?q= like the
 * future API - the component never filters a private copy of the catalog.
 */

const RECENTS_KEY = "cosmoz.recent-instruments.v1";
const RECENTS_MAX = 5;

function loadRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(ids: string[], instrumentId: string): string[] {
  return [instrumentId, ...ids.filter((id) => id !== instrumentId)].slice(0, RECENTS_MAX);
}

export interface InstrumentComboboxProps {
  value: string | null;
  onChange: (instrument: Instrument) => void;
}

export function InstrumentCombobox({ value, onChange }: InstrumentComboboxProps) {
  const { dict } = useI18n();
  const T = dict.trades.combobox;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  // Client-only mount (inside the modal) - localStorage is safe to read here.
  const [recents, setRecents] = React.useState<string[]>(() => loadRecents());

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Full catalog (recents resolution + fallback list) and the server search.
  const { data: allData } = useInstruments();
  const { data: searchData, isFetching } = useInstruments(debouncedQuery);
  const instruments = React.useMemo(() => {
    if (debouncedQuery === "") return allData?.instruments ?? [];
    return searchData?.instruments ?? [];
  }, [allData, searchData, debouncedQuery]);

  const allById = React.useMemo(
    () => new Map((allData?.instruments ?? []).map((instrument) => [instrument.id, instrument])),
    [allData],
  );

  const selected = value !== null ? (allById.get(value) ?? null) : null;
  const recentInstruments = recents
    .map((id) => allById.get(id))
    .filter((instrument): instrument is Instrument => instrument !== undefined);

  const select = (instrument: Instrument) => {
    const nextRecents = pushRecent(loadRecents(), instrument.id);
    setRecents(nextRecents);
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(nextRecents));
    } catch {
      // Best-effort persistence.
    }
    onChange(instrument);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {selected !== null ? (
          <>
            <span className="font-mono text-sm font-semibold tracking-wide">{selected.symbol}</span>
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {assetClassBadge(selected.assetClass)}
            </span>
            <span className="truncate text-xs text-muted-foreground">{selected.name}</span>
          </>
        ) : (
          <span className="text-sm">{T.triggerPlaceholder}</span>
        )}
        <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[calc(var(--radix-popover-trigger-width))] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="eur, boom, vol75…"
            aria-label={T.searchAria}
            autoComplete="off"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {recentInstruments.length > 0 && debouncedQuery === "" ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {T.recents}
            </span>
            {recentInstruments.map((instrument) => (
              <button
                key={instrument.id}
                type="button"
                onClick={() => select(instrument)}
                className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-xs tabular-nums outline-none transition-colors hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                {instrument.symbol}
              </button>
            ))}
          </div>
        ) : null}

        <div className="max-h-56 overflow-y-auto p-1" role="listbox" aria-label={T.listboxAria}>
          {instruments.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {isFetching ? T.searching : T.noMatch}
            </p>
          ) : (
            instruments.map((instrument) => (
              <button
                key={instrument.id}
                type="button"
                role="option"
                aria-selected={instrument.id === value}
                onClick={() => select(instrument)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="font-mono text-sm font-semibold tracking-wide">{instrument.symbol}</span>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {assetClassBadge(instrument.assetClass)}
                </span>
                <span className="truncate text-xs text-muted-foreground">{instrument.name}</span>
                {instrument.id === value ? (
                  <Check className="ml-auto size-4 shrink-0 text-accent" aria-hidden="true" />
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Instrument } from "@cosmoz/shared";
import { cn } from "@/lib/utils";

/**
 * Symbol picker (§11): searchable instrument list with favorites + recent
 * symbols (both persisted in localStorage — user-owned, not market data).
 * The instrument universe comes from the /instruments catalog.
 */

const STORE_KEY = "cosmoz.session-live.symbols.v1";

function loadStore(): { favorites: string[]; recents: string[] } {
  if (typeof window === "undefined") return { favorites: [], recents: [] };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { favorites: [], recents: [] };
    const parsed = JSON.parse(raw) as { favorites?: string[]; recents?: string[] };
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.slice(0, 12) : [],
      recents: Array.isArray(parsed.recents) ? parsed.recents.slice(0, 6) : [],
    };
  } catch {
    return { favorites: [], recents: [] };
  }
}

const ASSET_CLASS_LABEL: Record<string, string> = {
  FOREX: "Forex",
  CRYPTO: "Crypto",
  METAL: "Metals",
  INDEX: "Indices",
  STOCK: "Stocks",
  COMMODITY: "Commodities",
  SYNTHETIC: "Synthetic",
};

interface SymbolPickerProps {
  instruments: Instrument[];
  value: string;
  onChange: (symbol: string) => void;
}

export function SymbolPicker({ instruments, value, onChange }: SymbolPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [store, setStore] = React.useState(loadStore);

  const persist = React.useCallback((next: { favorites: string[]; recents: string[] }) => {
    setStore(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode) — favorites stay session-only.
    }
  }, []);

  const selected = instruments.find((item) => item.symbol === value) ?? null;

  const commit = React.useCallback(
    (symbol: string) => {
      onChange(symbol);
      setOpen(false);
      setQuery("");
      const recents = [symbol, ...store.recents.filter((item) => item !== symbol)].slice(0, 6);
      persist({ ...store, recents });
    },
    [onChange, store, persist],
  );

  const toggleFavorite = React.useCallback(
    (symbol: string) => {
      const favorites = store.favorites.includes(symbol)
        ? store.favorites.filter((item) => item !== symbol)
        : [symbol, ...store.favorites].slice(0, 12);
      persist({ ...store, favorites });
    },
    [store, persist],
  );

  const normalized = query.trim().toUpperCase();
  const matches = React.useMemo(() => {
    if (normalized === "") return instruments;
    return instruments.filter(
      (item) => item.symbol.toUpperCase().includes(normalized) || item.name.toUpperCase().includes(normalized),
    );
  }, [instruments, normalized]);

  const favoriteRows = matches.filter((item) => store.favorites.includes(item.symbol));
  const recentRows = matches.filter((item) => !store.favorites.includes(item.symbol) && store.recents.includes(item.symbol));
  const restRows = matches.filter((item) => !store.favorites.includes(item.symbol) && !store.recents.includes(item.symbol));

  const renderRow = (item: Instrument) => (
    <div key={item.id} className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => commit(item.symbol)}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/10"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">{item.symbol}</span>
          <span className="truncate text-xs text-muted-foreground">{item.name}</span>
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {ASSET_CLASS_LABEL[item.assetClass] ?? item.assetClass}
        </span>
        {value === item.symbol ? <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" /> : null}
      </button>
      <button
        type="button"
        onClick={() => toggleFavorite(item.symbol)}
        aria-label={store.favorites.includes(item.symbol) ? `Remove ${item.symbol} from favorites` : `Add ${item.symbol} to favorites`}
        aria-pressed={store.favorites.includes(item.symbol)}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-warning"
      >
        <Star className={cn("size-3.5", store.favorites.includes(item.symbol) && "fill-warning text-warning")} aria-hidden="true" />
      </button>
    </div>
  );

  const section = (title: string, rows: Instrument[]) =>
    rows.length > 0 ? (
      <div className="space-y-0.5">
        <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        {rows.slice(0, title === "All instruments" ? 40 : 6).map(renderRow)}
      </div>
    ) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Select symbol"
          data-testid="symbol-picker-trigger"
          className="w-full justify-between font-mono font-semibold"
        >
          <span className="truncate">{selected ? selected.symbol : "Symbol"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search symbol or name…"
            aria-label="Search instruments"
            data-testid="symbol-search"
            className="w-full rounded-md border border-border bg-surface-raised py-1.5 pl-8 pr-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
          />
        </div>
        <div className="mt-1 max-h-[300px] overflow-y-auto" data-testid="symbol-picker-list">
          {matches.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">No instrument matches “{query}”.</p>
          ) : (
            <>
              {section("Favorites", favoriteRows)}
              {section("Recent", recentRows)}
              {section("All instruments", restRows)}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

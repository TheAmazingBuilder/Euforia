"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";

import type { Instrument } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useInstruments } from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";

interface InstrumentSearchProps {
  /** Controlled open state — the workspace owns ⌘K / Escape. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSymbol: string | null;
  onSelect: (instrument: Instrument) => void;
}

/**
 * Instrument selector — the smallest coherent search palette built on the
 * EXISTING instrument search contract (`GET /instruments?q=` via
 * `useInstruments`, docs/specs/oryon-prd.md §6.2). The app shell's
 * CommandPalette is not available outside the shell, so Oryon embeds its
 * own; the workspace wires ⌘K / Ctrl+K to it.
 */
export function InstrumentSearch({
  open,
  onOpenChange,
  selectedSymbol,
  onSelect,
}: InstrumentSearchProps) {
  const dict = useDict().oryon;
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  // Tiny debounce so typing does not hammer the catalog query per keystroke.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  const instrumentsQuery = useInstruments(debounced);
  const instruments = instrumentsQuery.data?.instruments ?? [];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 max-w-[15rem] gap-2 px-2.5 font-mono"
          aria-label={dict.toolbar.instrument}
          data-testid="oryon-instrument-trigger"
        >
          <Search className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="truncate font-semibold">
            {selectedSymbol ?? dict.toolbar.instrument}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 overflow-hidden p-0"
        data-testid="oryon-instrument-palette"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dict.toolbar.searchPlaceholder}
            className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            aria-label={dict.toolbar.instrument}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1" role="listbox">
          {instrumentsQuery.isPending ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {dict.toolbar.searchLoading}
            </p>
          ) : instruments.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {dict.toolbar.searchEmpty}
            </p>
          ) : (
            instruments.map((instrument) => {
              const selected = instrument.symbol === selectedSymbol;
              return (
                <button
                  key={instrument.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onSelect(instrument);
                    onOpenChange(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${
                    selected ? "bg-muted" : ""
                  }`}
                  data-testid={`oryon-instrument-option-${instrument.symbol}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm font-semibold">
                      {instrument.symbol}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {instrument.name}
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
                    {instrument.assetClass}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {instrumentsQuery.isFetching ? (
          <div className="flex items-center justify-center border-t border-border py-1.5 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

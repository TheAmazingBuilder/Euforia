"use client";

import * as React from "react";

import { ChevronDown, Search } from "lucide-react";

import type { AssetClass, Instrument } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDict } from "@/i18n/i18n-provider";
import { assetClassBadge, formatInstrumentSymbol } from "@/lib/utils/instrument";

/**
 * Oryon instrument selector. The catalog comes from useInstruments() (the
 * app's /instruments surface) - nothing is hardcoded. Feed coverage comes
 * from the market service's own health list: instruments the feed does not
 * serve stay visible but disabled with an honest "No feed" chip.
 */
export function OryonInstrumentSelector({
  instruments,
  selected,
  feedSymbols,
  feedKnown,
  onSelect,
  /** Optional testid namespace - panel headers use `oryon-panel-{index}`
   *  so their controls never collide with the toolbar's canonical ids
   *  (Playwright strict mode). */
  idPrefix = "oryon",
}: {
  instruments: readonly Instrument[];
  selected: Instrument | null;
  feedSymbols: ReadonlySet<string>;
  feedKnown: boolean;
  onSelect: (id: string) => void;
  idPrefix?: string;
}) {
  const dict = useDict();
  const S = dict.oryon.toolbar;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return instruments;
    return instruments.filter(
      (i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
    );
  }, [instruments, query]);

  const groups = React.useMemo(() => {
    const order: readonly AssetClass[] = ["FOREX", "CRYPTO", "METAL", "INDEX", "ENERGY", "SYNTHETIC"];
    const labels: Record<AssetClass, string> = {
      FOREX: "Forex",
      CRYPTO: "Crypto",
      METAL: "Metals",
      INDEX: "Indices",
      ENERGY: "Energy",
      SYNTHETIC: "Synthetic indices",
    };
    return order
      .map((assetClass) => ({
        assetClass,
        label: labels[assetClass],
        items: filtered.filter((item) => item.assetClass === assetClass),
      }))
      .filter((group) => group.items.length > 0);
  }, [filtered]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid={`${idPrefix}-instrument-trigger`}
          aria-label={S.instrument}
          aria-expanded={open}
          className="h-8 gap-1.5 px-2.5 font-mono text-xs font-semibold"
        >
          {selected !== null ? formatInstrumentSymbol(selected.symbol, selected.assetClass) : "-"}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={S.searchPlaceholder}
              aria-label={S.instrument}
              data-testid={`${idPrefix}-instrument-search`}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div
          role="listbox"
          aria-label={S.instrument}
          className="max-h-72 overflow-y-auto p-1"
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {S.noMatch}
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <section key={group.assetClass} aria-label={group.label}>
                  <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isSelected = selected !== null && item.id === selected.id;
                      const hasFeed = !feedKnown || feedSymbols.has(item.symbol);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          disabled={!hasFeed}
                          data-testid={`${idPrefix}-instrument-option-${item.symbol}`}
                          onClick={() => {
                            onSelect(item.id);
                            close();
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-xs font-semibold text-foreground">
                              {formatInstrumentSymbol(item.symbol, item.assetClass)}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.name}
                            </span>
                          </span>
                          <span
                            className={
                              hasFeed
                                ? "shrink-0 rounded-sm bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                : "shrink-0 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning"
                            }
                          >
                            {hasFeed ? assetClassBadge(item.assetClass) : S.noFeed}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

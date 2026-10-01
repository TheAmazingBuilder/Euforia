"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInstruments, useStrategies, useTags } from "@/lib/api/queries";
import type { Direction, TradeStatus } from "@cosmoz/shared";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Trade module filters — every filter lives in the URL (?q=&status=&…), so a
 * filtered view is shareable and the back button works. Sorting + pagination
 * ride the same param bag.
 */

export type OutcomeFilter = "all" | "win" | "loss";
export type SortKey = "date" | "r" | "pnl";
export type SortDir = "asc" | "desc";

export interface TradesUrlState {
  q: string;
  status: "all" | TradeStatus;
  direction: "all" | Direction;
  instrumentId: string;
  strategyId: string;
  outcome: OutcomeFilter;
  tagId: string;
  from: string;
  to: string;
  sortKey: SortKey;
  sortDir: SortDir;
  page: number;
  pageSize: number;
}

export const DEFAULT_TRADES_STATE: Omit<TradesUrlState, "page"> = {
  q: "",
  status: "all",
  direction: "all",
  instrumentId: "",
  strategyId: "",
  outcome: "all",
  tagId: "",
  from: "",
  to: "",
  sortKey: "date",
  sortDir: "desc",
  pageSize: 10,
};

/** Read the full filter/sort/pagination state from the current URL. */
export function useTradesUrlState(): TradesUrlState {
  const searchParams = useSearchParams();

  return React.useMemo(() => {
    const get = (key: string) => searchParams.get(key) ?? "";
    const page = Number(get("page"));
    const pageSize = Number(get("size"));
    const sortKey = get("sort");
    return {
      q: get("q"),
      status: (["OPEN", "CLOSED"].includes(get("status")) ? get("status") : "all") as TradesUrlState["status"],
      direction: (["BUY", "SELL"].includes(get("dir")) ? get("dir") : "all") as TradesUrlState["direction"],
      instrumentId: get("inst"),
      strategyId: get("strat"),
      outcome: (["win", "loss"].includes(get("out")) ? get("out") : "all") as OutcomeFilter,
      tagId: get("tag"),
      from: get("from"),
      to: get("to"),
      sortKey: (["r", "pnl"].includes(sortKey) ? sortKey : "date") as SortKey,
      sortDir: (get("dirn") === "asc" ? "asc" : "desc") as SortDir,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: [10, 25, 50].includes(pageSize) ? pageSize : 10,
    };
  }, [searchParams]);
}

/** Write-side: patch URL params ("" deletes), reset page automatically.
 * Keys are the RAW URL keys (dir, inst, strat, out, tag, sort, dirn, size…). */
export function useTradesUrlPatch() {
  const searchParams = useSearchParams();
  const router = useRouter();

  return React.useCallback(
    (patch: Record<string, string | number>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        const stringValue = String(value);
        if (stringValue === "") params.delete(key);
        else params.set(key, stringValue);
      }
      if (resetPage && !("page" in patch)) params.delete("page");
      router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
    },
    [router, searchParams],
  );
}

/**
 * The filter bar — one ruled row (wraps on mobile). All selects render
 * neutral until touched; "Reset" strips every filter param at once.
 */
export function TradesFilters({
  state,
  patch,
}: {
  state: TradesUrlState;
  patch: ReturnType<typeof useTradesUrlPatch>;
}) {
  const { dict } = useI18n();
  const T = dict.trades.filters;
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const { data: tagsData } = useTags();

  const instruments = instrumentsData?.instruments ?? [];
  const strategies = strategiesData?.strategies ?? [];
  const tags = tagsData?.tags ?? [];

  const isFiltered =
    state.q !== "" ||
    state.status !== "all" ||
    state.direction !== "all" ||
    state.instrumentId !== "" ||
    state.strategyId !== "" ||
    state.outcome !== "all" ||
    state.tagId !== "" ||
    state.from !== "" ||
    state.to !== "";

  return (
    <section
      aria-label={T.aria}
      data-testid="trades-filters"
      className="rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-end gap-2.5">
        {/* Free text — symbol or notes */}
        <div className="min-w-44 flex-1 space-y-1 sm:max-w-64">
          <Label htmlFor="trades-filter-q" className="text-[11px] text-muted-foreground">
            {T.search}
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="trades-filter-q"
              value={state.q}
              onChange={(event) => patch({ q: event.target.value })}
              placeholder={T.searchPlaceholder}
              data-testid="trades-filter-q"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{T.status}</Label>
          <Select
            value={state.status}
            onValueChange={(value) => patch({ status: value === "all" ? "" : value })}
          >
            <SelectTrigger className="h-8 w-28 text-sm" data-testid="trades-filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.all}</SelectItem>
              <SelectItem value="OPEN">{T.open}</SelectItem>
              <SelectItem value="CLOSED">{T.closed}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Direction */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{T.direction}</Label>
          <Select
            value={state.direction}
            onValueChange={(value) => patch({ dir: value === "all" ? "" : value })}
          >
            <SelectTrigger className="h-8 w-24 text-sm" data-testid="trades-filter-direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.all}</SelectItem>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Instrument */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{T.instrument}</Label>
          <Select
            value={state.instrumentId || "all"}
            onValueChange={(value) => patch({ inst: value === "all" ? "" : value })}
          >
            <SelectTrigger className="h-8 w-32 text-sm" data-testid="trades-filter-instrument">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.all}</SelectItem>
              {instruments.map((instrument) => (
                <SelectItem key={instrument.id} value={instrument.id}>
                  {instrument.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Strategy */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{T.strategy}</Label>
          <Select
            value={state.strategyId || "all"}
            onValueChange={(value) => patch({ strat: value === "all" ? "" : value })}
          >
            <SelectTrigger className="h-8 w-36 text-sm" data-testid="trades-filter-strategy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.all}</SelectItem>
              {strategies.map((strategy) => (
                <SelectItem key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </SelectItem>
              ))}
              <SelectItem value="none">{dict.trades.shared.outOfPlaybook}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Outcome */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{T.outcome}</Label>
          <Select
            value={state.outcome}
            onValueChange={(value) => patch({ out: value === "all" ? "" : value })}
          >
            <SelectTrigger className="h-8 w-24 text-sm" data-testid="trades-filter-outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.all}</SelectItem>
              <SelectItem value="win">{T.wins}</SelectItem>
              <SelectItem value="loss">{T.losses}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tag */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{T.tag}</Label>
          <Select
            value={state.tagId || "all"}
            onValueChange={(value) => patch({ tag: value === "all" ? "" : value })}
          >
            <SelectTrigger className="h-8 w-32 text-sm" data-testid="trades-filter-tag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.all}</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date range */}
        <div className="space-y-1">
          <Label htmlFor="trades-filter-from" className="text-[11px] text-muted-foreground">
            {T.from}
          </Label>
          <Input
            id="trades-filter-from"
            type="date"
            value={state.from}
            onChange={(event) => patch({ from: event.target.value })}
            data-testid="trades-filter-from"
            className="h-8 w-32 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="trades-filter-to" className="text-[11px] text-muted-foreground">
            {T.to}
          </Label>
          <Input
            id="trades-filter-to"
            type="date"
            value={state.to}
            onChange={(event) => patch({ to: event.target.value })}
            data-testid="trades-filter-to"
            className="h-8 w-32 text-sm"
          />
        </div>

        {isFiltered ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            onClick={() =>
              patch({
                q: "", status: "", dir: "", inst: "", strat: "", out: "", tag: "", from: "", to: "",
              })
            }
            data-testid="trades-filter-reset"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {dict.common.reset}
          </Button>
        ) : (
          <span className="flex h-8 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Filter className="size-3" aria-hidden="true" />
            {state.sortKey === "date" ? T.newestFirst : T.sortedView}
          </span>
        )}
      </div>
    </section>
  );
}

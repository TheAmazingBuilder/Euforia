"use client";

import * as React from "react";
import { Newspaper } from "lucide-react";
import type { NewsCategory, NewsItem, NewsResponse } from "@cosmoz/shared";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Market news tape (§10) — strictly separate from the economic calendar.
 * Headlines carry source, category, related symbols/currencies and
 * importance; the provider's licensing note is always rendered next to the
 * content (§29) — redistribution rules travel with the data.
 */

const CATEGORIES: { value: NewsCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "FOREX", label: "Forex" },
  { value: "GOLD", label: "Gold" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "INDICES", label: "Indices" },
  { value: "CENTRAL_BANKS", label: "Central banks" },
  { value: "MACRO", label: "Macro" },
  { value: "EQUITIES", label: "Equities" },
];

const IMPORTANCES: { value: NewsItem["importance"] | "ALL"; label: string }[] = [
  { value: "ALL", label: "Any importance" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function ImportanceMark({ importance }: { importance: NewsItem["importance"] }) {
  return (
    <span
      className={cn(
        "inline-flex w-14 shrink-0 justify-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        importance === "HIGH"
          ? "border-warning/40 bg-warning/10 text-warning"
          : importance === "MEDIUM"
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border text-muted-foreground",
      )}
      aria-label={`Importance ${importance.toLowerCase()}`}
    >
      {importance}
    </span>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <article className="flex flex-col gap-2 py-4 sm:flex-row sm:gap-4" data-testid="news-item">
      <div className="flex shrink-0 items-center gap-3 sm:w-32 sm:flex-col sm:items-start sm:gap-1">
        <time className="font-mono text-[11px] tabular-nums text-muted-foreground" dateTime={item.publishedAt}>
          {TIME_FORMAT.format(new Date(item.publishedAt))}
        </time>
        <ImportanceMark importance={item.importance} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-sm font-medium leading-snug text-foreground">{item.headline}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {item.source}
          </span>
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {item.category}
          </span>
          {item.symbols.map((symbol) => (
            <span
              key={symbol}
              className="rounded-md border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-foreground"
            >
              {symbol}
            </span>
          ))}
          {item.currencies.map((currency) => (
            <span
              key={currency}
              className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {currency}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function NewsTape({ news }: { news: NewsResponse }) {
  const [category, setCategory] = React.useState<NewsCategory | "ALL">("ALL");
  const [importance, setImportance] = React.useState<NewsItem["importance"] | "ALL">("ALL");
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return news.items.filter((item) => {
      if (category !== "ALL" && item.category !== category) return false;
      if (importance !== "ALL" && item.importance !== importance) return false;
      if (needle === "") return true;
      return (
        item.headline.toLowerCase().includes(needle) ||
        item.summary.toLowerCase().includes(needle) ||
        item.source.toLowerCase().includes(needle) ||
        item.symbols.some((symbol) => symbol.toLowerCase().includes(needle)) ||
        item.currencies.some((currency) => currency.toLowerCase().includes(needle))
      );
    });
  }, [news.items, category, importance, query]);

  return (
    <div className="space-y-4" data-testid="news-tape">
      {/* Filters — chips + select + search, all client-side over the tape. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
          {CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategory(option.value)}
              aria-pressed={category === option.value}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[11px] tracking-wide transition-colors",
                category === option.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by importance">
            {IMPORTANCES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setImportance(option.value)}
                aria-pressed={importance === option.value}
                title={option.label}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[11px] tracking-wide transition-colors",
                  importance === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {option.value === "ALL" ? "Any" : option.value.slice(0, 1) + option.value.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search headlines, symbols…"
            aria-label="Search news"
            className="w-full sm:w-56"
          />
        </div>
      </div>

      {/* Tape — ruled rows, newest first. */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-y border-border py-12 text-center">
          <Newspaper className="size-5 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No headlines match the current filters.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border" data-testid="news-list">
          {filtered.map((item) => (
            <NewsRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* §29 — licensing/attribution always travels with the content. */}
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        {news.licensingNote} · Provider <span data-testid="news-provider">{news.providerId}</span> ·
        tape generated {TIME_FORMAT.format(new Date(news.generatedAt))} · headlines are retained 7
        days and are not redistributed outside the workspace.
      </p>
    </div>
  );
}

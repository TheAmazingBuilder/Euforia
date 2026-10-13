"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";

import { InkRibbon, inkSpineOf } from "@/components/academy/ink-ribbon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcademyGlossary } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Glossary — the register's dictionary. Server-side search across term,
 * simple and professional readings plus related concepts; rows fold open to
 * the full entry. The simple line answers in one sentence, the professional
 * line adds the working definition.
 */

export function GlossaryView() {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Debounce the server round-trip; the input stays immediate.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const glossary = useAcademyGlossary(debounced);
  const terms = glossary.data?.terms ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5" data-testid="academy-glossary">
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Academy
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Glossary
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every term in one ledger: a one-sentence reading, the working
          definition, an example and the concepts it travels with.
        </p>
        <InkRibbon />
      </header>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search terms, definitions, related…"
          aria-label="Search the glossary"
          data-testid="glossary-search"
          className="pl-9"
        />
      </div>

      {glossary.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : glossary.isError ? (
        <div className="rounded-xl border border-loss/40 bg-surface p-6 text-sm text-muted-foreground">
          The glossary could not be loaded. Check your connection and retry.
        </div>
      ) : (
        <>
          <p className="font-mono text-xs tabular-nums text-muted-foreground" data-testid="glossary-count">
            {terms.length} term{terms.length === 1 ? "" : "s"}
            {debounced.trim() ? " matching" : ""}
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {terms.map((term, index) => {
              const open = openId === term.id;
              return (
                <div key={term.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : term.id)}
                    aria-expanded={open}
                    data-testid="glossary-row"
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 sm:px-5"
                  >
                    {/* the register's four inks cycle down the ledger */}
                    <span
                      aria-hidden="true"
                      data-testid="glossary-ink-dot"
                      className={cn("size-1.5 shrink-0 rounded-full", inkSpineOf(index))}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold tracking-tight text-foreground">
                        {term.term}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {term.simple}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-all duration-200",
                        open && "rotate-180 text-accent",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {open ? (
                    <div
                      className="space-y-3 border-t border-border border-l-2 border-l-accent px-4 py-4 sm:px-5"
                      data-testid="glossary-entry"
                    >
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                          Professional
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                          {term.professional}
                        </p>
                      </div>
                      {term.example ? (
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                            Example
                          </p>
                          <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
                            {term.example}
                          </p>
                        </div>
                      ) : null}
                      {term.related.length > 0 ? (
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                            Related
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {term.related.map((rel) => (
                              <span
                                key={rel}
                                className="rounded-md border border-border bg-background/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                              >
                                {rel}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {terms.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="font-heading text-lg font-semibold">No term matches</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a shorter query — the search reads terms, definitions and related concepts.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

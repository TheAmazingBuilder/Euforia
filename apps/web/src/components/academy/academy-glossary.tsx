"use client";

import * as React from "react";
import { Bookmark, BookmarkCheck, Library, Search, X } from "lucide-react";

import type { AcademyGlossaryTerm } from "@cosmoz/shared";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAcademyGlossary, useAcademySearch, useToggleBookmark } from "@/lib/api/queries";

/**
 * Glossary panel — the searchable vocabulary (spec §19, §31). Server-side
 * search across term + simple + professional + related; each entry shows the
 * layered explanation (SIMPLE / PROFESSIONAL / EXAMPLE / RELATED) and can be
 * bookmarked. A bookmarked-term strip appears when ?term= deep-links in.
 */

export function AcademyGlossaryPanel({ initialTerm }: { initialTerm: string | null }) {
  const [input, setInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [openTerm, setOpenTerm] = React.useState<string | null>(initialTerm);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [input]);

  const { data, isLoading } = useAcademyGlossary(query);

  // Deep-linked term: fetch it even when it does not match the query.
  const { data: search } = useAcademySearch(initialTerm ?? "");
  const linkedTerm = React.useMemo(() => {
    if (!initialTerm) return null;
    return data?.terms.find((term) => term.id === initialTerm) ?? search?.glossary.find((term) => term.id === initialTerm) ?? null;
  }, [initialTerm, data, search]);

  const terms = data?.terms ?? [];

  return (
    <div className="space-y-4" data-testid="academy-glossary">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search the vocabulary — term, definition or related concept…"
          className="pl-9 pr-8"
          aria-label="Search the glossary"
          data-testid="academy-glossary-search"
        />
        {input ? (
          <button
            type="button"
            onClick={() => setInput("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear glossary search"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{data?.total ?? "…"}</span> terms · layered definitions: simple first, professional second.
      </p>

      {linkedTerm ? (
        <div className="rounded-lg border border-accent/40 bg-accent/5">
          <GlossaryEntry term={linkedTerm} defaultOpen />
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : terms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No term matches “{query}”. Try a broader word — or the Courses search, which also covers lessons.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="academy-glossary-list">
          {terms.map((term) => (
            <li key={term.id}>
              <GlossaryEntry term={term} open={openTerm === term.id} onToggle={() => setOpenTerm(openTerm === term.id ? null : term.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GlossaryEntry({
  term,
  open = false,
  defaultOpen = false,
  onToggle,
}: {
  term: AcademyGlossaryTerm;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(defaultOpen || open);
  const toggleBookmark = useToggleBookmark();
  const [bookmarked, setBookmarked] = React.useState(false);
  const isOpen = defaultOpen || open || expanded;

  return (
    <div className={cn("px-4 py-3", isOpen && "bg-surface-raised/40")}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setExpanded((prev) => !prev);
            onToggle?.();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={isOpen}
          data-testid={`academy-glossary-term-${term.id}`}
        >
          <Library className={cn("size-3.5 shrink-0", isOpen ? "text-accent" : "text-muted-foreground")} aria-hidden="true" />
          <span className="truncate text-sm font-medium text-foreground">{term.term}</span>
          {!isOpen ? <span className="truncate text-xs text-muted-foreground">{term.simple}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => {
            toggleBookmark.mutate({ kind: "GLOSSARY", refId: term.id });
            setBookmarked((prev) => !prev);
          }}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? `Remove bookmark for ${term.term}` : `Bookmark ${term.term}`}
          className={cn("shrink-0", bookmarked ? "text-accent" : "text-muted-foreground hover:text-foreground")}
        >
          {bookmarked ? <BookmarkCheck className="size-4" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
        </button>
      </div>

      {isOpen ? (
        <dl className="mt-2.5 space-y-2 border-t border-border pt-2.5 text-sm leading-relaxed">
          <div>
            <dt className="ledger-label">Simple</dt>
            <dd className="mt-0.5 text-foreground/90">{term.simple}</dd>
          </div>
          <div>
            <dt className="ledger-label">Professional</dt>
            <dd className="mt-0.5 text-foreground/90">{term.professional}</dd>
          </div>
          {term.example ? (
            <div>
              <dt className="ledger-label">Example</dt>
              <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground/85">{term.example}</dd>
            </div>
          ) : null}
          {term.related.length > 0 ? (
            <div>
              <dt className="ledger-label">Related</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {term.related.map((related) => (
                  <span key={related} className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {related}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

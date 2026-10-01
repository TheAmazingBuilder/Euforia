"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookmarkCheck, BookOpen, Library } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { AcademySectionTitle, HueChip } from "@/components/academy/academy-shared";
import { useAcademyBookmarks, useToggleBookmark } from "@/lib/api/queries";

/**
 * Bookmarks panel — the dedicated shelf for starred lessons and glossary
 * terms. Rows deep-link into the reader/glossary; the trailing button
 * removes the bookmark in place. Hue follows the bookmarked item's track.
 */

const KIND_HUE: Record<string, string> = {
  LESSON: "var(--cat-ta)",
  GLOSSARY: "var(--cat-fund)",
};

export function AcademyBookmarksPanel() {
  const router = useRouter();
  const { data, isLoading } = useAcademyBookmarks();
  const toggle = useToggleBookmark();

  const bookmarks = data?.bookmarks ?? [];
  const lessons = bookmarks.filter((mark) => mark.kind === "LESSON");
  const terms = bookmarks.filter((mark) => mark.kind === "GLOSSARY");

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="academy-bookmarks-panel">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border px-6 py-12 text-center"
        data-testid="academy-bookmarks-panel"
      >
        <BookmarkCheck className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-foreground">Nothing bookmarked yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Star any lesson from its reader, or any glossary term from the vocabulary — your saved spots line up here.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/academy?tab=courses")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <BookOpen className="size-3.5" aria-hidden="true" />
            Browse courses
          </button>
          <button
            type="button"
            onClick={() => router.push("/academy?tab=glossary")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <Library className="size-3.5" aria-hidden="true" />
            Open the glossary
          </button>
        </div>
      </div>
    );
  }

  const renderRow = (mark: (typeof bookmarks)[number]) => {
    const hue = KIND_HUE[mark.kind] ?? "var(--accent)";
    return (
      <li key={mark.id} className="group">
        <div className="flex items-center gap-3 px-4 py-2.5 transition-colors group-hover:bg-muted" data-testid="academy-bookmark-row">
          <HueChip hue={hue} icon={mark.kind === "LESSON" ? BookOpen : Library} />
          <button
            type="button"
            onClick={() => router.push(mark.href)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
            data-testid="academy-bookmark-link"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{mark.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{mark.subtitle}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => toggle.mutate({ kind: mark.kind, refId: mark.refId })}
            aria-label={`Remove bookmark: ${mark.title}`}
            className="shrink-0 text-muted-foreground opacity-60 transition-opacity hover:text-loss hover:opacity-100"
            data-testid="academy-bookmark-remove"
          >
            <BookmarkCheck className="size-4" aria-hidden="true" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6" data-testid="academy-bookmarks-panel">
      {lessons.length > 0 ? (
        <section aria-label="Bookmarked lessons">
          <AcademySectionTitle className="mb-2">Lessons</AcademySectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">{lessons.map(renderRow)}</ul>
        </section>
      ) : null}

      {terms.length > 0 ? (
        <section aria-label="Bookmarked glossary terms">
          <AcademySectionTitle className="mb-2">Glossary terms</AcademySectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">{terms.map(renderRow)}</ul>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{bookmarks.length}</span> saved · bookmarks stay on this account only.
      </p>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, CheckCircle2, Circle, Clock, X } from "lucide-react";
import { toast } from "sonner";

import { InkRibbon } from "@/components/academy/ink-ribbon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcademyBookmarks,
  useToggleAcademyBookmark,
} from "@/lib/api/queries";

/**
 * Bookmarks — the reader's shelf (§33). Lessons flagged from the lesson
 * header live here: newest first, each row a direct way back into the
 * page. Removing is one tap and never touches completion state — the shelf
 * is a reading aid, not the record.
 */

function savedOn(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function BookmarksView() {
  const bookmarks = useAcademyBookmarks();
  const toggle = useToggleAcademyBookmark();
  const rows = bookmarks.data?.bookmarks ?? [];

  const remove = (lessonId: string, title: string) => {
    toggle.mutate(lessonId, {
      onSuccess: () =>
        toast.success(`Removed from bookmarks — ${title}`),
      onError: () => toast.error("The bookmark could not be removed"),
    });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5" data-testid="academy-bookmarks">
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Academy
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Bookmarks
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The pages you flagged from the lesson header, newest first. The
          shelf is a reading aid — removing a bookmark never touches your
          completion record.
        </p>
        <InkRibbon />
      </header>

      {bookmarks.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : bookmarks.isError ? (
        <div className="rounded-xl border border-loss/40 bg-surface p-6 text-sm text-muted-foreground">
          The bookmark shelf could not be loaded. Check your connection and retry.
        </div>
      ) : rows.length === 0 ? (
        <div
          className="rounded-xl border border-border bg-surface px-4 py-10 text-center"
          data-testid="bookmark-empty"
        >
          <Bookmark
            className="mx-auto size-6 text-muted-foreground/50"
            aria-hidden="true"
          />
          <p className="mt-3 font-heading text-lg font-semibold">
            Nothing saved yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The bookmark icon in a lesson header keeps the pages you want
            within reach.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/academy/courses">Browse the courses</Link>
          </Button>
        </div>
      ) : (
        <>
          <p
            className="font-mono text-xs tabular-nums text-muted-foreground"
            data-testid="bookmark-count"
          >
            <span className="text-warning">{rows.length}</span> saved lesson{rows.length === 1 ? "" : "s"}
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {rows.map((row) => (
              <div
                key={row.id}
                data-testid="bookmark-row"
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5"
              >
                <Bookmark
                  className="size-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/academy/courses/${row.courseId}/${row.lessonId}`}
                    className="block truncate font-mono text-sm font-semibold tracking-tight text-foreground hover:text-accent"
                  >
                    {row.lessonTitle}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.courseTitle} · {row.moduleTitle}
                  </p>
                </div>
                <span className="hidden items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground sm:flex">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {row.durationMin} min
                </span>
                {row.completed ? (
                  <span
                    className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-profit"
                    title="Lesson completed"
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    <span className="hidden lg:inline">done</span>
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                    title="Not completed yet"
                  >
                    <Circle className="size-4" aria-hidden="true" />
                    <span className="hidden lg:inline">open</span>
                  </span>
                )}
                <span className="hidden w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70 md:inline">
                  {savedOn(row.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(row.lessonId, row.lessonTitle)}
                  disabled={toggle.isPending}
                  aria-label={`Remove ${row.lessonTitle} from bookmarks`}
                  data-testid="bookmark-remove"
                  className="size-8 shrink-0 text-muted-foreground hover:text-loss"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

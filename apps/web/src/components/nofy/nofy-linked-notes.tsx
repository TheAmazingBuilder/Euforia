"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, NotebookText, StickyNote } from "lucide-react";

import type { NofyNoteRow, NofyRefKind } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNofyLinkedNotes } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";
import { NOFY_REF_META, nofyRelativeTime } from "./nofy-shared";

/**
 * The entity side of the Nofy integrations — rendered INSIDE Playbook
 * (strategy detail) and Trade Review (review dialog). Lists the notes
 * whose ref blocks point at this entity and offers "Take notes", which
 * creates a linked note in Nofy and deep-links into its editor. Notes
 * open via SPA navigation so the host module's state survives.
 */
export function NofyLinkedNotesSection({
  kind,
  id,
  onCreateNote,
  creating = false,
  testidPrefix,
  className,
}: {
  kind: NofyRefKind;
  id: string;
  onCreateNote: () => void;
  creating?: boolean;
  testidPrefix: string;
  className?: string;
}) {
  const router = useRouter();
  const { dict } = useI18n();
  const N = dict.nofy;
  const { data, isLoading } = useNofyLinkedNotes(kind, id);
  const notes: NofyNoteRow[] = data?.notes ?? [];

  return (
    <section
      className={cn("rounded-lg border border-border bg-surface-raised p-3", className)}
      data-testid={`${testidPrefix}-nofy-section`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <NotebookText className="size-3.5 shrink-0" style={{ color: NOFY_REF_META[kind].hue }} aria-hidden="true" />
          {N.linked.title}
          <span className="rounded-full border border-border bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground" data-testid={`${testidPrefix}-nofy-count`}>
            {notes.length}
          </span>
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={onCreateNote}
          disabled={creating}
          data-testid={`${testidPrefix}-take-notes`}
        >
          <StickyNote className="size-3.5" aria-hidden="true" />
          {N.linked.takeNotes}
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-3/4 rounded-md" />
        </div>
      ) : notes.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {N.linked.emptyPrefix} {NOFY_REF_META[kind].label.toLowerCase()}{N.linked.emptySuffix}
        </p>
      ) : (
        <ul className="mt-2 space-y-1" data-testid={`${testidPrefix}-nofy-list`}>
          {notes.slice(0, 5).map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => router.push(`/nofy?tab=notes&note=${note.id}`)}
                className="group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`${testidPrefix}-nofy-row`}
              >
                <span className="shrink-0 text-sm" aria-hidden="true">
                  {note.icon ?? "📝"}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {note.title === "" ? N.shared.untitledNote : note.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {nofyRelativeTime(note.updatedAt, N.time)}
                </span>
                <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-accent" aria-hidden="true" />
              </button>
            </li>
          ))}
          {notes.length > 5 ? (
            <li>
              <button
                type="button"
                onClick={() => router.push("/nofy?tab=notes")}
                className="w-full px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:text-accent"
              >
                + {notes.length - 5} {N.linked.moreInNofy}
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

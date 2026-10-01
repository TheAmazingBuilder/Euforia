"use client";

import * as React from "react";
import { NotebookPen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/i18n-provider";
import { useCreateSessionNote, useDeleteSessionNote, useSessionNotes } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/** "14:32:07 UTC" style stamp — the logbook is a wall-clock transcript. */
function timeOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Session logbook — timestamped notes logged WHILE trading: the level
 * watched, the why behind an entry, a hesitation moment. One flat list per
 * trading day (server-stamped), sitting in the session sidebar next to the
 * timeline so the post-market review has the running commentary.
 */
export function SessionLogbook() {
  const { dict } = useI18n();
  const S = dict.session;
  const notesQuery = useSessionNotes();
  const createNote = useCreateSessionNote();
  const deleteNote = useDeleteSessionNote();
  const [text, setText] = React.useState("");

  const submit = React.useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || createNote.isPending) return;
    createNote.mutate(
      { text: trimmed },
      {
        onSuccess: () => setText(""),
        onError: () => {
          // The toast layer surfaces API errors; keep the draft so nothing is lost.
        },
      },
    );
  }, [text, createNote]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  const notes = notesQuery.data?.notes ?? [];

  return (
    <section className="rounded-xl border border-border bg-surface" data-testid="session-logbook">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold text-foreground">
          <NotebookPen className="size-4 text-accent" aria-hidden="true" />
          {S.logbook.title}
        </h2>
        <p className="text-xs text-muted-foreground">
          {S.logbook.subtitle}
        </p>
      </header>
      <div className="space-y-3 p-4">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={S.logbook.inputPlaceholder}
          rows={2}
          className="min-h-[60px] resize-none text-sm"
          aria-label={S.logbook.inputAria}
          data-testid="session-logbook-input"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {`${notes.length} ${notes.length === 1 ? S.logbook.noteOne : S.logbook.noteMany} ${S.logbook.today}`}
          </p>
          <Button size="sm" onClick={submit} disabled={text.trim().length === 0 || createNote.isPending} data-testid="session-logbook-submit">
            {S.logbook.submit}
          </Button>
        </div>

        {notesQuery.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : notesQuery.isError ? (
          <p className="text-sm text-muted-foreground">{S.logbook.loadFailed}</p>
        ) : notes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            {S.logbook.empty}
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="session-logbook-list">
            {[...notes].reverse().map((note) => (
              <li
                key={note.id}
                className={cn(
                  "group flex items-start gap-2.5 rounded-lg border border-border/70 bg-surface-raised px-2.5 py-2",
                  deleteNote.isPending && "opacity-60",
                )}
                data-testid="session-logbook-note"
              >
                <span className="shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {timeOf(note.at)}
                </span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-snug text-foreground">
                  {note.text}
                </p>
                <button
                  type="button"
                  aria-label={S.logbook.deleteAria}
                  data-testid="session-logbook-delete"
                  disabled={deleteNote.isPending}
                  onClick={() => deleteNote.mutate(note.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-loss focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

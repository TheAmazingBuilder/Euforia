"use client";

import * as React from "react";
import type { Emotion, JournalEntry, Trade } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useInstruments, useTrades } from "@/lib/api/queries";

const EMOTION_OPTIONS = [
  "CALM",
  "CONFIDENT",
  "ANXIOUS",
  "FOMO",
  "TIRED",
  "FRUSTRATED",
  "REVENGE",
  "EUPHORIC",
  "RELIEVED",
  "BORED",
] as const;

export interface JournalDraft {
  date: string;
  title: string;
  body: string;
  tags: string[];
  mood: Emotion | null;
  /** Execution the entry reviews — null = not tied to a trade. */
  relatedTradeId: string | null;
}

/** Toronto trading-date key for "today" (en-CA gives YYYY-MM-DD). */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Write / revise a journal entry. A modal is earned here: writing a lesson
 * wants protected focus, and the dialog returns the trader exactly where
 * they were in the log.
 */
export function JournalEntryDialog({
  open,
  onOpenChange,
  entry,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: JournalEntry | null;
  onSave: (draft: JournalDraft) => void;
  isSaving: boolean;
}) {
  const [date, setDate] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [mood, setMood] = React.useState<Emotion | null>(null);
  const [relatedTradeId, setRelatedTradeId] = React.useState<string>("none");

  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const symbolByInstrument = React.useMemo(
    () =>
      new Map(
        (instrumentsData?.instruments ?? []).map((instrument) => [
          instrument.id,
          instrument.symbol,
        ]),
      ),
    [instrumentsData],
  );
  /** Newest executions first — the entry usually reviews the last session. */
  const tradeOptions = React.useMemo(
    () =>
      [...(tradesData?.trades ?? [])].sort((a, b) =>
        (b.exitAt ?? b.entryAt).localeCompare(a.exitAt ?? a.entryAt),
      ),
    [tradesData],
  );
  const tradeLabel = (trade: Trade): string => {
    const symbol = symbolByInstrument.get(trade.instrumentId) ?? "—";
    const side = trade.direction === "BUY" ? "long" : "short";
    const outcome =
      trade.status === "CLOSED" && trade.rMultiple !== null
        ? formatR(trade.rMultiple)
        : trade.status.toLowerCase();
    return `${symbol} · ${side} · ${trade.tradingDate} · ${outcome}`;
  };

  // Re-seed on open — the documented "adjust state during render" pattern
  // (no cascading effect: the form resets exactly when `open` flips).
  const [lastOpen, setLastOpen] = React.useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDate(entry?.date ?? todayKey());
      setTitle(entry?.title ?? "");
      setBody(entry?.body ?? "");
      setTagsInput(entry?.tags.join(", ") ?? "");
      setMood(entry?.mood ?? null);
      setRelatedTradeId(entry?.relatedTradeId ?? "none");
    }
  }

  const canSave = title.trim() !== "" && body.trim() !== "" && date !== "";

  function handleSave() {
    if (!canSave) return;
    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter((tag) => tag !== "")
      .slice(0, 6);
    onSave({
      date,
      title: title.trim(),
      body: body.trim(),
      tags,
      mood,
      relatedTradeId: relatedTradeId === "none" ? null : relatedTradeId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-semibold">
            {entry ? "Revise entry" : "New journal entry"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {entry
              ? "Correct the record — the entry keeps its place in the log."
              : "Write it while it is honest: the context, the feeling, the lesson."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="journal-date">Date</Label>
              <Input
                id="journal-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-9 w-full font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="journal-mood">Mood before</Label>
              <Select
                value={mood ?? "none"}
                onValueChange={(value) => setMood(value === "none" ? null : (value as Emotion))}
              >
                <SelectTrigger id="journal-mood" className="h-9 w-full" aria-label="Mood before">
                  <SelectValue placeholder="Not recorded" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not recorded</SelectItem>
                  {EMOTION_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0) + option.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="journal-trade">Linked trade</Label>
            <Select value={relatedTradeId} onValueChange={setRelatedTradeId}>
              <SelectTrigger
                id="journal-trade"
                className="h-9 w-full font-mono text-sm"
                aria-label="Linked trade"
              >
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {tradeOptions.map((trade) => (
                  <SelectItem key={trade.id} value={trade.id}>
                    {tradeLabel(trade)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Tie the note to the execution it reviews.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="journal-title">Title</Label>
            <Input
              id="journal-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What did the session teach you?"
              maxLength={120}
              className="h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="journal-body">Entry</Label>
            <Textarea
              id="journal-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="The context, the decision, the outcome — and what you would repeat or refuse next time."
              rows={6}
              maxLength={5000}
              className="resize-y"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="journal-tags">Tags</Label>
            <Input
              id="journal-tags"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="lesson, patience, xauusd"
              className="h-9 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Comma separated — up to 6.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isSaving} data-testid="journal-save">
            {isSaving ? "Saving…" : entry ? "Save changes" : "Write entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

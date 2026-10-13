"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { Emotion, JournalDayResponse } from "@cosmoz/shared";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmotionPicker } from "@/components/trades/emotion-picker";
import { apiErrorMessage } from "@/lib/api/client";
import { useUpsertJournal } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Today's journal editor (Phase 10) — pre-market columns (sleep, energy,
 * focus, mood, plan) and post-market review (mood, review, lessons, best &
 * worst trade). Every field is optional and saveable independently: the
 * morning fills pre-market, the evening closes the review. The form never
 * blocks on required fields — a journal that nags stops being written.
 */

// ── 1–5 rating scale (keyboard accessible) ──────────────────────────────────

function RatingScale({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((level) => {
        const selected = value === level;
        const filled = value !== null && level <= value;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${level} of 5`}
            onClick={() => onChange(selected ? null : level)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md border font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : filled
                  ? "border-accent/40 bg-accent/10 text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-accent/50 hover:text-foreground",
            )}
          >
            {level}
          </button>
        );
      })}
      {value !== null ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

// ── Field scaffolding ───────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label
          htmlFor={htmlFor}
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground"
        >
          {label}
        </Label>
        {hint !== undefined ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

// ── Editor state (initialized from the server's day payload) ────────────────

interface EditorState {
  sleepHours: string;
  energy: number | null;
  focus: number | null;
  moodPre: Emotion | null;
  planText: string;
  moodPost: Emotion | null;
  reviewText: string;
  lessons: string;
  bestTradeId: string;
  worstTradeId: string;
}

const EMPTY_STATE: EditorState = {
  sleepHours: "",
  energy: null,
  focus: null,
  moodPre: null,
  planText: "",
  moodPost: null,
  reviewText: "",
  lessons: "",
  bestTradeId: "",
  worstTradeId: "",
};

function stateFromDay(day: JournalDayResponse | undefined): EditorState {
  const journal = day?.journal ?? null;
  if (journal === null) return { ...EMPTY_STATE };
  return {
    sleepHours: journal.sleepHours ?? "",
    energy: journal.energy,
    focus: journal.focus,
    moodPre: journal.moodPre,
    planText: journal.planText ?? "",
    moodPost: journal.moodPost,
    reviewText: journal.reviewText ?? "",
    lessons: journal.lessons ?? "",
    bestTradeId: journal.bestTradeId ?? "",
    worstTradeId: journal.worstTradeId ?? "",
  };
}

export function JournalEditor({
  date,
  day,
  loading,
}: {
  date: string;
  day?: JournalDayResponse;
  loading?: boolean;
}) {
  const upsert = useUpsertJournal(date);
  const [state, setState] = React.useState<EditorState>(() => stateFromDay(day));

  // Re-sync local state when the day payload arrives (server truth) —
  // "adjusting state during render", the React-docs pattern that avoids a
  // cascading render from an effect.
  const [lastSyncedDay, setLastSyncedDay] = React.useState<JournalDayResponse | undefined>(day);
  if (day !== lastSyncedDay) {
    setLastSyncedDay(day);
    setState(stateFromDay(day));
  }

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  const dayTrades = React.useMemo(
    () => (day !== undefined ? day.trades.filter((trade) => trade.status === "CLOSED") : []),
    [day],
  );

  const dirty = React.useMemo(() => {
    const initial = stateFromDay(day);
    return (Object.keys(initial) as (keyof EditorState)[]).some(
      (key) => initial[key] !== state[key],
    );
  }, [day, state]);

  const onSave = async () => {
    try {
      await upsert.mutateAsync({
        sleepHours: state.sleepHours.trim() !== "" ? state.sleepHours.trim() : null,
        energy: state.energy,
        focus: state.focus,
        moodPre: state.moodPre,
        planText: state.planText.trim() !== "" ? state.planText.trim() : null,
        moodPost: state.moodPost,
        reviewText: state.reviewText.trim() !== "" ? state.reviewText.trim() : null,
        lessons: state.lessons.trim() !== "" ? state.lessons.trim() : null,
        bestTradeId: state.bestTradeId !== "" ? state.bestTradeId : null,
        worstTradeId: state.worstTradeId !== "" ? state.worstTradeId : null,
      });
      toast.success("Journal saved", {
        description: `Entry recorded for ${date}. Close the review tonight.`,
      });
    } catch (error) {
      toast.error("Could not save the entry", {
        description: apiErrorMessage(error, "Check your connection and retry."),
      });
    }
  };

  if (loading === true) {
    return (
      <section aria-label="Journal editor" className="space-y-5 rounded-xl border border-border bg-surface p-5">
        <Skeleton className="h-6 w-40 rounded-md" />
        <div className="grid gap-5 sm:grid-cols-3">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
        </div>
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </section>
    );
  }

  const tradeKey = (trade: { id: string; symbol: string; direction: string }): string =>
    `${trade.symbol} · ${trade.direction}`;

  return (
    <section aria-label="Journal editor" className="rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">Today — {date}</h2>
          <p className="text-xs text-muted-foreground">
            Write the plan before the open; close the review after. Partial entries are fine.
          </p>
        </div>
        <Button onClick={onSave} disabled={!dirty || upsert.isPending} className="gap-2">
          {upsert.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {upsert.isPending ? "Saving…" : dirty ? "Save entry" : "Saved"}
        </Button>
      </header>

      <div className="space-y-6 px-5 py-5">
        {/* ── Pre-market ── */}
        <div className="space-y-4">
          <h3 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Pre-market
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </h3>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Sleep (h)" htmlFor="journal-sleep">
              <Input
                id="journal-sleep"
                inputMode="decimal"
                placeholder="7.5"
                value={state.sleepHours}
                onChange={(event) => set("sleepHours", event.target.value)}
                className="font-mono"
              />
            </Field>
            <Field label="Energy" hint="1–5">
              <RatingScale value={state.energy} onChange={(value) => set("energy", value)} ariaLabel="Energy level" />
            </Field>
            <Field label="Focus" hint="1–5">
              <RatingScale value={state.focus} onChange={(value) => set("focus", value)} ariaLabel="Focus level" />
            </Field>
          </div>
          <Field label="Mood before" hint="1 tap, optional">
            <EmotionPicker
              value={state.moodPre}
              onChange={(emotion) => set("moodPre", emotion)}
              ariaLabel="Mood before the session"
            />
          </Field>
          <Field label="Session plan" htmlFor="journal-plan" hint="Intentions, levels, limits">
            <Textarea
              id="journal-plan"
              rows={3}
              placeholder="What is allowed today? Which setups, which levels, how many trades?"
              value={state.planText}
              onChange={(event) => set("planText", event.target.value)}
            />
          </Field>
        </div>

        {/* ── Post-market ── */}
        <div className="space-y-4">
          <h3 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Post-market
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </h3>
          <Field label="Mood after" hint="1 tap, optional">
            <EmotionPicker
              value={state.moodPost}
              onChange={(emotion) => set("moodPost", emotion)}
              ariaLabel="Mood after the session"
            />
          </Field>
          <Field label="Review" htmlFor="journal-review" hint="What actually happened">
            <Textarea
              id="journal-review"
              rows={4}
              placeholder="How did the session unfold? Where did you follow the plan, where did you drift?"
              value={state.reviewText}
              onChange={(event) => set("reviewText", event.target.value)}
            />
          </Field>
          <Field label="Lessons" htmlFor="journal-lessons" hint="One sentence is enough">
            <Textarea
              id="journal-lessons"
              rows={2}
              placeholder="The one thing today taught you."
              value={state.lessons}
              onChange={(event) => set("lessons", event.target.value)}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Best trade" hint={dayTrades.length === 0 ? "no closed trades yet" : undefined}>
              <Select
                value={
                  state.bestTradeId !== ""
                    ? (dayTrades.find((t) => t.id === state.bestTradeId) !== undefined
                      ? tradeKey(dayTrades.find((t) => t.id === state.bestTradeId)!)
                      : undefined)
                    : undefined
                }
                onValueChange={(key) => {
                  const trade = dayTrades.find((candidate) => tradeKey(candidate) === key);
                  set("bestTradeId", trade?.id ?? "");
                }}
              >
                <SelectTrigger className="w-full" aria-label="Best trade of the day">
                  <SelectValue placeholder="Pick a trade" />
                </SelectTrigger>
                <SelectContent>
                  {dayTrades.map((trade) => (
                    <SelectItem key={trade.id} value={tradeKey(trade)}>
                      <span className="font-mono">{trade.symbol}</span> · {trade.direction}
                      {trade.pnlNet !== null ? (
                        <span className="ml-2 font-mono tabular-nums text-muted-foreground">{trade.pnlNet}</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Worst trade">
              <Select
                value={
                  state.worstTradeId !== ""
                    ? (dayTrades.find((t) => t.id === state.worstTradeId) !== undefined
                      ? tradeKey(dayTrades.find((t) => t.id === state.worstTradeId)!)
                      : undefined)
                    : undefined
                }
                onValueChange={(key) => {
                  const trade = dayTrades.find((candidate) => tradeKey(candidate) === key);
                  set("worstTradeId", trade?.id ?? "");
                }}
              >
                <SelectTrigger className="w-full" aria-label="Worst trade of the day">
                  <SelectValue placeholder="Pick a trade" />
                </SelectTrigger>
                <SelectContent>
                  {dayTrades.map((trade) => (
                    <SelectItem key={trade.id} value={tradeKey(trade)}>
                      <span className="font-mono">{trade.symbol}</span> · {trade.direction}
                      {trade.pnlNet !== null ? (
                        <span className="ml-2 font-mono tabular-nums text-muted-foreground">{trade.pnlNet}</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import type { Emotion, Instrument, ReviewResponse, Tag, Trade } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateTag,
  useInstruments,
  useResolveMistake,
  useReview,
  useTags,
  useUpdatePsychology,
  useUpdateReview,
} from "@/lib/api/queries";
import { ScreenshotPicker, type DraftScreenshot } from "@/components/trades/screenshot-picker";
import { EMOTION_OPTIONS } from "@/components/trades/emotion-picker";
import { cn } from "@/lib/utils";
import { closeJudgmentFlow } from "@/lib/hooks/use-judgment-flow";

/**
 * ACT 3 — Reflect (trade-entry-ux.md §6): optional, one minute, ALL skippable.
 * Detected mistakes (confirm/dismiss via PATCH), emotion-after (1-tap),
 * MFE/MAE user-observed prices, tags (+ inline creation), the lesson and
 * screenshots. The flow ends with [Finish] — or Esc at any time.
 */

const LESSON_PLACEHOLDERS: readonly string[] = [
  "What would you do differently?",
  "What did the market teach you here?",
  "Which habit deserves a reward — or a fix?",
];

function rotatePlaceholder(): string {
  const slot = Math.floor(Date.now() / 3_600_000);
  return LESSON_PLACEHOLDERS[slot % LESSON_PLACEHOLDERS.length] ?? LESSON_PLACEHOLDERS[0]!;
}

function normalizeDecimalInput(raw: string): string {
  return raw.replace(",", ".").replace(/\s/g, "");
}

export interface ReflectProps {
  tradeId: string;
}

export function Reflect({ tradeId }: ReflectProps) {
  const review = useReview(tradeId);
  const { data: tagsData } = useTags();
  const { data: instrumentsData } = useInstruments();
  const resolveMistake = useResolveMistake();
  const updatePsychology = useUpdatePsychology();
  const updateReview = useUpdateReview();
  const createTag = useCreateTag();

  const data: ReviewResponse | undefined = review.data;
  const trade: Trade | null = data?.trade ?? null;
  const instrument: Instrument | undefined = instrumentsData?.instruments.find(
    (item) => item.id === trade?.instrumentId,
  );
  const digits = instrument?.digits ?? 5;
  const pricePlaceholder = digits > 2 ? "1.08xxx" : "98xx.xx";

  // ── Local field state — hydrated from the review payload when it arrives.
  const [hydrated, setHydrated] = React.useState(false);
  const [mfePrice, setMfePrice] = React.useState("");
  const [maePrice, setMaePrice] = React.useState("");
  const [lesson, setLesson] = React.useState("");
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [newTagName, setNewTagName] = React.useState("");
  const [emotion, setEmotion] = React.useState<Emotion | null>(null);
  const [screenshots, setScreenshots] = React.useState<DraftScreenshot[]>([]);
  const [savedNote, setSavedNote] = React.useState<"idle" | "saving" | "saved">("idle");

  React.useEffect(() => {
    if (data === undefined || hydrated) return;
    setHydrated(true);
    setMfePrice(data.trade.mfePrice ?? "");
    setMaePrice(data.trade.maePrice ?? "");
    setLesson(data.trade.lessons ?? "");
    setSelectedTagIds(data.tagIds);
    setEmotion(data.trade.emotionAfter);
  }, [data, hydrated]);

  const tags: Tag[] = tagsData?.tags ?? [];
  const mistakes = data?.detectedMistakes ?? [];

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((previous) =>
      previous.includes(tagId) ? previous.filter((id) => id !== tagId) : [...previous, tagId],
    );
  };

  const submitInlineTag = () => {
    const name = newTagName.trim();
    if (name === "" || createTag.isPending) return;
    createTag.mutate(
      { name },
      {
        onSuccess: (tag) => {
          setSelectedTagIds((previous) => [...previous, tag.id]);
          setNewTagName("");
        },
      },
    );
  };

  const finish = () => {
    const fields: Record<string, string | string[]> = {};
    if (mfePrice.trim() !== "" && Number(normalizeDecimalInput(mfePrice)) > 0) {
      fields.mfePrice = normalizeDecimalInput(mfePrice);
    }
    if (maePrice.trim() !== "" && Number(normalizeDecimalInput(maePrice)) > 0) {
      fields.maePrice = normalizeDecimalInput(maePrice);
    }
    if (lesson.trim() !== "") fields.lesson = lesson.trim();
    if (JSON.stringify(selectedTagIds) !== JSON.stringify(data?.tagIds ?? [])) {
      fields.tagIds = selectedTagIds;
    }
    if (Object.keys(fields).length === 0) {
      closeJudgmentFlow();
      return;
    }
    setSavedNote("saving");
    updateReview.mutate(
      { tradeId, input: fields },
      {
        onSuccess: () => {
          setSavedNote("saved");
          closeJudgmentFlow();
        },
        onError: () => setSavedNote("idle"),
      },
    );
  };

  return (
    <div className="space-y-5" data-testid="reflect">
      <p className="text-sm text-muted-foreground">
        Optional — one minute. Everything here is skippable; it trains your detector and
        feeds the analytics.
      </p>

      {/* Detected mistakes — confirm/dismiss in 1 tap (spec §6) */}
      {mistakes.length > 0 ? (
        <section className="space-y-2" aria-labelledby="reflect-mistakes">
          <h3 id="reflect-mistakes" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Detected mistakes
          </h3>
          <ul className="space-y-2">
            {mistakes.map((mistake) => (
              <li
                key={mistake.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                data-testid={`mistake-${mistake.id}`}
              >
                <span className="text-sm text-foreground">
                  {mistake.detectedBy === "AUTO" ? "⚠ " : "• "}
                  {mistake.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {mistake.userConfirmed === true ? (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      confirmed
                    </span>
                  ) : mistake.userConfirmed === false ? (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      dismissed
                    </span>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={resolveMistake.isPending}
                        onClick={() =>
                          resolveMistake.mutate({
                            tradeId,
                            mistakeId: mistake.id,
                            input: { confirmed: true },
                          })
                        }
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={resolveMistake.isPending}
                        onClick={() =>
                          resolveMistake.mutate({
                            tradeId,
                            mistakeId: mistake.id,
                            input: { confirmed: false },
                          })
                        }
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        Dismiss
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Emotion after — the reaction to the result, 1 tap */}
      <section className="space-y-2" aria-labelledby="reflect-emotion">
        <div className="flex items-baseline justify-between">
          <h3 id="reflect-emotion" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Emotion after
          </h3>
          <span className="text-[11px] text-muted-foreground">optional — single tap</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="reflect-emotion">
          {EMOTION_OPTIONS.map((option) => {
            const selected = emotion === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  const next: Emotion | null = selected ? null : option;
                  setEmotion(next);
                  // The schema requires at least one field — only PATCH on
                  // selection (deselect is a local undo, no round-trip).
                  if (next !== null) {
                    updatePsychology.mutate({ tradeId, input: { emotionAfter: next } });
                  }
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-accent/60 hover:text-foreground",
                )}
              >
                {option.charAt(0) + option.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      </section>

      {/* MFE / MAE — user-observed prices; R is recomputed server-side */}
      <section className="space-y-2" aria-labelledby="reflect-excursion">
        <h3 id="reflect-excursion" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          MFE / MAE — how far it went for / against you
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reflect-mfe">MFE price (max favorable)</Label>
            <input
              id="reflect-mfe"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={mfePrice}
              onChange={(event) => setMfePrice(event.target.value)}
              placeholder={pricePlaceholder}
              className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reflect-mae">MAE price (max adverse)</Label>
            <input
              id="reflect-mae"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={maePrice}
              onChange={(event) => setMaePrice(event.target.value)}
              placeholder={pricePlaceholder}
              className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </section>

      {/* Tags — existing chips + inline creation */}
      <section className="space-y-2" aria-labelledby="reflect-tags">
        <h3 id="reflect-tags" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tags
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-accent/60 hover:text-foreground",
                )}
              >
                {tag.name}
              </button>
            );
          })}
          <span className="flex items-center gap-1">
            <input
              type="text"
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitInlineTag();
                }
              }}
              placeholder="new tag…"
              aria-label="New tag name"
              className="h-7 w-28 rounded-full border border-dashed border-border bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label="Create tag"
              disabled={newTagName.trim() === "" || createTag.isPending}
              onClick={submitInlineTag}
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </Button>
          </span>
        </div>
      </section>

      {/* Note / lesson — one textarea, rotating placeholder */}
      <section className="space-y-2" aria-labelledby="reflect-lesson">
        <h3 id="reflect-lesson" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Note / lesson
        </h3>
        <Textarea
          id="reflect-lesson-field"
          aria-labelledby="reflect-lesson"
          value={lesson}
          onChange={(event) => setLesson(event.target.value)}
          placeholder={rotatePlaceholder()}
          rows={3}
          className="resize-none text-sm"
        />
      </section>

      {/* Screenshots — same client-only picker as capture (uploads come later) */}
      <section className="space-y-2" aria-labelledby="reflect-screenshots">
        <h3 id="reflect-screenshots" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Screenshots
        </h3>
        <ScreenshotPicker screenshots={screenshots} onChange={setScreenshots} />
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] text-muted-foreground" data-testid="reflect-save-state">
          {savedNote === "saving" ? "Saving…" : savedNote === "saved" ? "Saved" : "Everything optional — Esc to skip"}
        </p>
        <Button type="button" onClick={finish} className="h-11 px-6" disabled={updateReview.isPending}>
          <Check className="size-4" aria-hidden="true" />
          Finish
        </Button>
      </div>
    </div>
  );
}

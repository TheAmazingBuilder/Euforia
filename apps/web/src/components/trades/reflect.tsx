"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, CircleSmall, Plus, TriangleAlert, X } from "lucide-react";
import type {
  Emotion,
  Instrument,
  PsychologyUpdateInput,
  ReviewResponse,
  Tag,
  Trade,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddScreenshot,
  useCreateTag,
  useInstruments,
  useResolveMistake,
  useReview,
  useTags,
  useUpdatePsychology,
  useUpdateReview,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { ScreenshotPicker, type DraftScreenshot } from "@/components/trades/screenshot-picker";
import { ConfidencePicker } from "@/components/trades/confidence-picker";
import { EMOTION_OPTIONS } from "@/components/trades/emotion-picker";
import { uploadDraftsSequentially } from "@/lib/utils/screenshot-upload";
import { cn } from "@/lib/utils";
import { closeJudgmentFlow } from "@/lib/hooks/use-judgment-flow";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * ACT 3 — Reflect (trade-entry-ux.md §6): optional, one minute, ALL skippable.
 * Detected mistakes (confirm/dismiss via PATCH), emotion-after (1-tap),
 * confidence (1–5), MFE/MAE user-observed prices, tags (+ inline creation),
 * the lesson and screenshots. The flow ends with [Finish] — or Esc at any
 * time. [Finish] also persists the deferred pieces: the psychology patch
 * (emotion-after / confidence deltas) and the picked screenshots (uploaded
 * sequentially — failures are toasted, never blocking).
 */

/** Rotate through the hourly slots — labels come from dict.trades.reflect. */
function rotatePlaceholder(placeholders: readonly string[]): string {
  const slot = Math.floor(Date.now() / 3_600_000);
  return placeholders[slot % placeholders.length] ?? placeholders[0]!;
}

function normalizeDecimalInput(raw: string): string {
  return raw.replace(",", ".").replace(/\s/g, "");
}

export interface ReflectProps {
  tradeId: string;
}

export function Reflect({ tradeId }: ReflectProps) {
  const { dict } = useI18n();
  const T = dict.trades.reflect;
  const review = useReview(tradeId);
  const { data: tagsData } = useTags();
  const { data: instrumentsData } = useInstruments();
  const resolveMistake = useResolveMistake();
  const updatePsychology = useUpdatePsychology();
  const updateReview = useUpdateReview();
  const createTag = useCreateTag();
  const addScreenshot = useAddScreenshot();

  const data: ReviewResponse | undefined = review.data;
  const trade: Trade | null = data?.trade ?? null;
  const instrument: Instrument | undefined = instrumentsData?.instruments.find(
    (item) => item.id === trade?.instrumentId,
  );
  const digits = instrument?.digits ?? 5;
  const pricePlaceholder = digits > 2 ? "1.08xxx" : "98xx.xx";

  // ── Local field state — hydrated from the review payload when it arrives.
  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null);
  const [mfePrice, setMfePrice] = React.useState("");
  const [maePrice, setMaePrice] = React.useState("");
  const [lesson, setLesson] = React.useState("");
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [newTagName, setNewTagName] = React.useState("");
  const [emotion, setEmotion] = React.useState<Emotion | null>(null);
  const [confidence, setConfidence] = React.useState<number | null>(null);
  const [screenshots, setScreenshots] = React.useState<DraftScreenshot[]>([]);
  const [savedNote, setSavedNote] = React.useState<"idle" | "saving" | "saved">("idle");
  const [finishing, setFinishing] = React.useState(false);

  // Adjust-state-on-props pattern (react.dev/learn/you-might-not-need-an-effect):
  // seed the fields once per trade, during render, not from an effect.
  if (data !== undefined && hydratedFor !== data.trade.id) {
    setHydratedFor(data.trade.id);
    setMfePrice(data.trade.mfePrice ?? "");
    setMaePrice(data.trade.maePrice ?? "");
    setLesson(data.trade.lessons ?? "");
    setSelectedTagIds(data.tagIds);
    setEmotion(data.trade.emotionAfter);
    setConfidence(data.trade.confidence ?? null);
  }

  const tags: Tag[] = tagsData?.tags ?? [];
  const mistakes = data?.detectedMistakes ?? [];
  const lessonPlaceholders: readonly string[] = [T.lessonPh1, T.lessonPh2, T.lessonPh3];

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
    if (finishing) return;
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
    // Psychology deltas — the schema requires at least one field, and a
    // deselect is a local undo (never a null PATCH).
    const psychologyInput: PsychologyUpdateInput = {};
    if (emotion !== null && emotion !== (data?.trade.emotionAfter ?? null)) {
      psychologyInput.emotionAfter = emotion;
    }
    if (confidence !== null && confidence !== (data?.trade.confidence ?? null)) {
      psychologyInput.confidence = confidence;
    }
    const hasPsychology = Object.keys(psychologyInput).length > 0;
    const hasReviewFields = Object.keys(fields).length > 0;
    const pickedShots = [...screenshots];
    if (!hasReviewFields && !hasPsychology && pickedShots.length === 0) {
      closeJudgmentFlow();
      return;
    }
    setFinishing(true);
    setSavedNote("saving");

    const finishFlow = async () => {
      // The review patch keeps its strict semantics: failure keeps the flow
      // open so the trader can retry (decorations below stay non-blocking).
      if (hasReviewFields) {
        try {
          await updateReview.mutateAsync({ tradeId, input: fields });
        } catch {
          setSavedNote("idle");
          setFinishing(false);
          return;
        }
      }
      if (hasPsychology) {
        try {
          await updatePsychology.mutateAsync({ tradeId, input: psychologyInput });
        } catch (error) {
          toast.error(apiErrorMessage(error, dict.trades.errors.psychologySave));
        }
      }
      if (pickedShots.length > 0) {
        const { uploaded, failed } = await uploadDraftsSequentially(
          tradeId,
          pickedShots,
          addScreenshot.mutateAsync,
        );
        if (failed.length > 0) {
          toast.error(dict.trades.errors.screenshotUpload, {
            description: `${failed.length} / ${pickedShots.length}`,
          });
        }
        // Drop the uploaded drafts from the picker (retry-safe); keep the
        // failures so the trader can remove or re-pick them.
        const uploadedIds = new Set(uploaded.map((shot) => shot.id));
        if (uploadedIds.size > 0) {
          for (const shot of uploaded) URL.revokeObjectURL(shot.url);
          setScreenshots((previous) => previous.filter((shot) => !uploadedIds.has(shot.id)));
        }
      }
      setSavedNote("saved");
      setFinishing(false);
      closeJudgmentFlow();
    };
    void finishFlow();
  };

  return (
    <div className="space-y-5" data-testid="reflect">
      <p className="text-sm text-muted-foreground">
        {T.intro}
      </p>

      {/* Detected mistakes — confirm/dismiss in 1 tap (spec §6) */}
      {mistakes.length > 0 ? (
        <section className="space-y-2" aria-labelledby="reflect-mistakes">
          <h3 id="reflect-mistakes" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {T.mistakes}
          </h3>
          <ul className="space-y-2">
            {mistakes.map((mistake) => (
              <li
                key={mistake.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                data-testid={`mistake-${mistake.id}`}
              >
                <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                  {mistake.detectedBy === "AUTO" ? (
                    <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                  ) : (
                    <CircleSmall className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  {mistake.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {mistake.userConfirmed === true ? (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      {T.confirmed}
                    </span>
                  ) : mistake.userConfirmed === false ? (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      {T.dismissed}
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
                        {T.confirm}
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
                        {T.dismiss}
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
            {T.emotionAfter}
          </h3>
          <span className="text-[11px] text-muted-foreground">{dict.trades.shared.optionalSingleTap}</span>
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
                {dict.trades.emotions[option]}
              </button>
            );
          })}
        </div>
      </section>

      {/* Confidence — optional 1–5 self-rating (post-trade psychology) */}
      <section className="space-y-2" aria-labelledby="reflect-confidence">
        <div className="flex items-baseline justify-between">
          <h3 id="reflect-confidence" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {T.confidence}
          </h3>
          <span className="text-[11px] text-muted-foreground">{dict.trades.shared.optionalSingleTap}</span>
        </div>
        <ConfidencePicker value={confidence} onChange={setConfidence} />
      </section>

      {/* MFE / MAE — user-observed prices; R is recomputed server-side */}
      <section className="space-y-2" aria-labelledby="reflect-excursion">
        <h3 id="reflect-excursion" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {T.excursion}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reflect-mfe">{T.mfeLabel}</Label>
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
            <Label htmlFor="reflect-mae">{T.maeLabel}</Label>
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
          {dict.trades.form.tags}
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
              placeholder={T.newTagPlaceholder}
              aria-label={T.newTagAria}
              className="h-7 w-28 rounded-full border border-dashed border-border bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label={T.createTagAria}
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
          {T.lessonHeading}
        </h3>
        <Textarea
          id="reflect-lesson-field"
          aria-labelledby="reflect-lesson"
          value={lesson}
          onChange={(event) => setLesson(event.target.value)}
          placeholder={rotatePlaceholder(lessonPlaceholders)}
          rows={3}
          className="resize-none text-sm"
        />
      </section>

      {/* Screenshots — picked here, uploaded on [Finish] alongside the
          psychology patch (failures toasted, never blocking). */}
      <section className="space-y-2" aria-labelledby="reflect-screenshots">
        <h3 id="reflect-screenshots" className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {dict.trades.detail.screenshotsWord}
        </h3>
        <ScreenshotPicker screenshots={screenshots} onChange={setScreenshots} />
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] text-muted-foreground" data-testid="reflect-save-state">
          {savedNote === "saving" ? dict.common.saving : savedNote === "saved" ? T.savedState : T.escToSkip}
        </p>
        <Button
          type="button"
          onClick={finish}
          className="h-11 px-6"
          disabled={finishing || updateReview.isPending}
          data-testid="reflect-finish"
        >
          <Check className="size-4" aria-hidden="true" />
          {dict.trades.shared.finish}
        </Button>
      </div>
    </div>
  );
}

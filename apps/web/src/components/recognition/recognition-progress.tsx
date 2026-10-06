"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrRecognitionStatus } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { stageFromElapsed } from "@/components/recognition/recognition-model";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognitionProgress — the staged processing screen (PROMPT 3 §15/§55).
 *
 * The PIPELINE is server-side (the mock settles the job time-based; a real
 * orchestrator will emit the same states). This view only maps status +
 * elapsed wall-clock onto the display timeline — no setTimeout-driven fake
 * processing. aria-live announces step changes for screen readers.
 * "Cancel analysis" performs a real DELETE (the contract's cancellation
 * path) — it never merely hides a loader.
 */

const STAGE_KEYS: Array<keyof RecognitionDict["progress"]["steps"]> = [
  "uploading",
  "preprocessing",
  "ocr",
  "classification",
  "extraction",
  "normalization",
  "done",
];

export function RecognitionProgress({
  dict,
  status,
  createdAt,
  onCancel,
  cancelling = false,
}: {
  dict: RecognitionDict;
  status: OcrRecognitionStatus;
  createdAt: string;
  onCancel: () => void;
  cancelling?: boolean;
}) {
  const [now, setNow] = React.useState(() => Date.now());

  // UI-state clock ONLY (elapsed display); the job itself advances server-side.
  React.useEffect(() => {
    if (status !== "PROCESSING" && status !== "QUEUED") return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [status]);

  const elapsedMs = status === "QUEUED" || status === "PROCESSING" ? Math.max(0, now - new Date(createdAt).getTime()) : 0;
  const currentStage = stageFromElapsed(elapsedMs);
  const currentKey = currentStage === "done" ? "done" : currentStage;
  const currentIndex = STAGE_KEYS.indexOf(currentKey);

  return (
    <div className="flex flex-col gap-6" data-testid="recognition-progress" data-stage={currentStage}>
      <header className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold">{dict.progress.title}</h2>
        <p className="text-sm text-muted-foreground">{dict.progress.subtitle}</p>
      </header>

      <ol
        className="flex flex-col border-t border-border"
        aria-live="polite"
        aria-label={dict.progress.title}
      >
        {STAGE_KEYS.map((key, index) => {
          const label = dict.progress.steps[key];
          const done = index < currentIndex || status === "REVIEW_REQUIRED" || status === "CONFIRMED";
          const active = index === currentIndex && (status === "PROCESSING" || status === "QUEUED");
          return (
            <li
              key={key}
              className={cn(
                "flex items-center gap-3 border-b border-border/60 py-3",
                !done && !active && "opacity-60",
              )}
              data-testid={`recognition-stage-${key}`}
              data-state={done ? "done" : active ? "active" : "pending"}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="size-4 text-profit" strokeWidth={2} aria-hidden="true" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-accent" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <span className="size-1.5 rounded-full bg-border" aria-hidden="true" />
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active ? "font-medium text-foreground" : done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {done ? dict.progress.done : active ? `${(elapsedMs / 1000).toFixed(1)}${dict.result.seconds}` : ""}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-live="off">
          {dict.progress.elapsed} {(elapsedMs / 1000).toFixed(1)}{dict.result.seconds}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={cancelling}
          data-testid="recognition-cancel"
        >
          <X className="size-3.5" aria-hidden="true" />
          {cancelling ? "…" : dict.progress.cancel}
        </Button>
      </div>
    </div>
  );
}

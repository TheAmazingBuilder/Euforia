"use client";

import * as React from "react";

import { CircleCheck, CircleDashed, LoaderCircle, ScanText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { RecognitionJob } from "@/lib/recognition/contract";
import { PROCESSING_STEPS, stepStateForStage } from "@/lib/recognition/contract";
import { formatBytes } from "./ocr-format";

/**
 * Recognition processing screen (Prompt 3 §15): staged progress derived
 * from the job's server state — never a fake local setTimeout. The cancel
 * action goes through the service layer (cancelRecognitionJob), so the
 * backend (today the mock engine, tomorrow NestJS) owns the transition
 * (§55 — not merely hiding the loader).
 */

export function RecognitionProcessing({
  job,
  onCancel,
  cancelling,
}: {
  job: RecognitionJob;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const stepStates = stepStateForStage(job.stage, job.status);

  return (
    <div className="mx-auto max-w-xl space-y-6" data-testid="ocr-processing">
      <Card>
        <CardContent className="space-y-6 px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
              <ScanText className="size-5 text-accent" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Analyzing screenshot…</h2>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {job.screenshot.name} · {formatBytes(job.screenshot.sizeBytes)}
              </p>
            </div>
          </div>

          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress}
            aria-label="Recognition progress"
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(4, job.progress)}%` }}
              data-testid="ocr-progress-bar"
            />
          </div>

          <ol className="space-y-1" aria-label="Recognition steps">
            {PROCESSING_STEPS.map((step, index) => {
              const state = stepStates[index];
              return (
                <li
                  key={step.id}
                  aria-current={state === "current" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                    state === "current" && "bg-accent/10 text-accent",
                    state === "done" && "text-muted-foreground",
                    state === "pending" && "text-muted-foreground/60",
                  )}
                  data-testid={`ocr-step-${step.id}`}
                  data-state={state}
                >
                  {state === "done" ? (
                    <CircleCheck className="size-4 shrink-0 text-profit" aria-hidden />
                  ) : state === "current" ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <CircleDashed className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className={cn(state === "current" && "font-medium")}>
                    {step.label}
                  </span>
                  {state === "done" ? (
                    <span className="sr-only"> (done)</span>
                  ) : state === "current" ? (
                    <span className="sr-only"> (in progress)</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Recognition usually takes a few seconds. You can keep this tab open.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={cancelling}
          data-testid="ocr-cancel"
        >
          {cancelling ? "Cancelling…" : "Cancel Analysis"}
        </Button>
      </div>
    </div>
  );
}

export function RecognitionProcessingSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-4" aria-hidden>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

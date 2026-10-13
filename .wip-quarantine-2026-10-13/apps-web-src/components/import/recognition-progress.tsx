"use client";

/**
 * RecognitionProgress — the processing screen (spec §15). The step
 * checklist is driven ENTIRELY by the job store (stage + progress emitted
 * by the service): no component-level timers, and the architecture is ready
 * to receive real backend progress events (spec §15). Cancellation goes
 * through the service (spec §55).
 */

import * as React from "react";
import { Check, Circle, CircleDot, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RECOGNITION_STAGES } from "@/lib/recognition/types";
import type { RecognitionJob } from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";

/** Stages shown as user-facing steps — COMPLETED is the terminal state. */
const STEP_STAGES = RECOGNITION_STAGES.filter(
  (stage): stage is Exclude<(typeof RECOGNITION_STAGES)[number], "COMPLETED"> =>
    stage !== "COMPLETED",
);

export function RecognitionProgress({
  job,
  onCancel,
  cancelling,
}: {
  job: RecognitionJob;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.progress;

  if (job.status === "CANCELLED") {
    return (
      <Card data-testid="import-cancelled">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <XCircle className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{V.cancelledTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{V.cancelledBody}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentStageIndex =
    job.stage && job.stage !== "COMPLETED" ? STEP_STAGES.indexOf(job.stage) : -1;

  return (
    <Card data-testid="import-progress">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
          {V.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{V.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          role="progressbar"
          aria-label={V.progressAria}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={job.progress}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          data-testid="import-progress-bar"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
          />
        </div>
        <p className="text-right font-mono text-xs tabular-nums text-muted-foreground">
          {job.progress}
          {dict.recognition.shared.percentSuffix}
        </p>

        <ol
          className="space-y-2"
          aria-label={V.stepsTitle}
          data-testid="import-progress-steps"
        >
          {STEP_STAGES.map((stage, index) => {
            const done = currentStageIndex > index || job.status === "COMPLETED";
            const active = currentStageIndex === index && job.status === "PROCESSING";
            const label = V.steps[stage as keyof typeof V.steps];
            return (
              <li
                key={stage}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  active && "bg-accent/10 font-medium",
                  done && "text-muted-foreground",
                )}
                data-testid={`import-progress-step-${stage.toLowerCase()}`}
                data-state={done ? "done" : active ? "active" : "pending"}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <Check className="size-4 text-profit" aria-hidden />
                ) : active ? (
                  <CircleDot className="size-4 animate-pulse text-accent" aria-hidden />
                ) : (
                  <Circle className="size-4 text-muted-foreground/50" aria-hidden />
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {index + 1}
                </span>
                {label}
              </li>
            );
          })}
        </ol>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={cancelling || job.status !== "PROCESSING"}
            data-testid="import-cancel"
            aria-label={V.cancelAria}
          >
            {cancelling ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <XCircle aria-hidden />
            )}
            {V.cancel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

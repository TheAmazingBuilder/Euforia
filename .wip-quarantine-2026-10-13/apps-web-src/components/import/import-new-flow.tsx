"use client";

/**
 * ImportNewFlow — the creation wizard (spec §4 steps 1-5): upload →
 * configure → start. Once the job exists the flow hands over to the job
 * workspace via `onJobCreated` (URL becomes /import?job=<id> so the
 * context survives a refresh — spec §44).
 */

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  recognitionErrorCode,
  recognitionService,
} from "@/lib/recognition/use-recognition";
import type {
  RecognitionMode,
  RecognitionPlatform,
} from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";
import { useScreenshotUpload } from "@/lib/recognition/use-recognition";
import { ScreenshotUploader } from "./screenshot-uploader";
import { RecognitionSettings } from "./recognition-settings";
import { recognitionErrorMessage } from "./import-shared";

export function ImportNewFlow({
  onJobCreated,
  onCancel,
}: {
  onJobCreated: (jobId: string) => void;
  onCancel: () => void;
}) {
  const { dict } = useI18n();
  const { state: upload, select, clear } = useScreenshotUpload();
  const [step, setStep] = React.useState<"upload" | "settings">("upload");
  const [platform, setPlatform] = React.useState<RecognitionPlatform>("AUTO");
  const [mode, setMode] = React.useState<RecognitionMode>("AUTOMATIC");
  const [starting, setStarting] = React.useState(false);
  const [startErrorCode, setStartErrorCode] = React.useState<string | null>(null);

  const screenshot = upload.kind === "ready" ? upload.screenshot : null;

  const start = async () => {
    if (!screenshot) return;
    setStarting(true);
    setStartErrorCode(null);
    try {
      const job = await recognitionService.createRecognitionJob({
        screenshot,
        platform,
        mode,
      });
      onJobCreated(job.id);
    } catch (error) {
      setStartErrorCode(recognitionErrorCode(error));
      setStarting(false);
    }
  };

  if (step === "upload") {
    return (
      <div className="space-y-4" data-testid="import-new-upload">
        <ScreenshotUploader state={upload} onSelect={select} onClear={clear} />
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {dict.recognition.settings.back}
          </Button>
          <Button
            type="button"
            onClick={() => setStep("settings")}
            disabled={screenshot === null || upload.kind === "uploading"}
            data-testid="import-continue-settings"
          >
            {dict.recognition.settings.title}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="import-new-settings">
      {startErrorCode && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss"
          data-testid="import-start-error"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {recognitionErrorMessage(startErrorCode, dict.recognition)}
        </p>
      )}
      <RecognitionSettings
        platform={platform}
        mode={mode}
        onPlatformChange={setPlatform}
        onModeChange={setMode}
        onStart={start}
        onBack={() => setStep("upload")}
        starting={starting}
        startDisabled={screenshot === null}
        fileMeta={screenshot ? screenshot.file : null}
      />
    </div>
  );
}

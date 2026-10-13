/**
 * Recognition hooks — the layer between UI components and the service
 * (spec §68: Component → Hook → Service). The job store is a module-level
 * external store consumed through `useSyncExternalStore` (house pattern):
 * every pipeline event re-renders subscribers without prop drilling.
 *
 * `useMounted` gates store-backed rendering behind client mount so SSR
 * never disagrees with the browser (hydration-safe; no setState-in-effect).
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { recognitionService } from "./provider";
import { RecognitionServiceError } from "./service";
import type { RecognitionServiceErrorCode } from "./service";
import type { RecognitionJob, UploadedScreenshot } from "./types";

const EMPTY_SUBSCRIBE = () => () => {};
const mountSubscribe = EMPTY_SUBSCRIBE;

/** True once the component tree is running in the browser. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    mountSubscribe,
    () => true,
    () => false,
  );
}

/** Snapshot of every recognition job (history + live pipeline events). */
export function useRecognitionJobs(): RecognitionJob[] {
  return useSyncExternalStore(
    recognitionService.subscribeJobs,
    recognitionService.getJobsSnapshot,
    recognitionService.getJobsSnapshot,
  );
}

/** One job by id (null when unknown) — re-renders on pipeline events. */
export function useRecognitionJob(id: string | null): RecognitionJob | null {
  const jobs = useRecognitionJobs();
  if (id === null) return null;
  return jobs.find((job) => job.id === id) ?? null;
}

/** Maps any thrown value onto a STABLE error category (spec §32). */
export function recognitionErrorCode(error: unknown): RecognitionServiceErrorCode {
  if (error instanceof RecognitionServiceError) return error.code;
  return "SERVER_ERROR";
}

// ── Screenshot upload state machine (spec §11) ───────────────────────────────

export type ScreenshotUploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | {
      kind: "ready";
      screenshot: UploadedScreenshot;
      /** Decoded client-side; null when the browser could not decode. */
      dimensions: { width: number; height: number } | null;
    }
  | { kind: "error"; code: RecognitionServiceErrorCode };

async function readImageDimensions(
  previewUrl: string,
): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof window === "undefined") return null;
    const image = new Image();
    image.src = previewUrl;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return null;
  }
}

/**
 * Upload lifecycle: idle → uploading → ready | error. Validation (format,
 * size) is enforced by the service; the browser-side dimensions read is a
 * preview-only concern (spec §13).
 */
export function useScreenshotUpload() {
  const [state, setState] = useState<ScreenshotUploadState>({ kind: "idle" });

  const select = useCallback(async (file: File) => {
    setState({ kind: "uploading" });
    try {
      const screenshot = await recognitionService.uploadScreenshot(file);
      const dimensions = await readImageDimensions(screenshot.previewUrl);
      setState({ kind: "ready", screenshot, dimensions });
    } catch (error) {
      setState({ kind: "error", code: recognitionErrorCode(error) });
    }
  }, []);

  const clear = useCallback(() => {
    setState({ kind: "idle" });
  }, []);

  return { state, select, clear };
}

export { recognitionService };

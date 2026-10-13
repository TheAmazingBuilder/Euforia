/**
 * RecognitionService — the API abstraction of the OCR feature (spec §39/§41).
 *
 *   UI → hooks → RecognitionService → (Mock today | NestJS API later)
 *
 * The browser NEVER talks to FastAPI and never will (spec §3/§68); when the
 * NestJS OCR orchestrator ships, `ApiRecognitionService` implements this
 * exact interface on top of the shared api client and the factory below is
 * the single swap point. Until that contract exists (spec §69: do not
 * invent backend endpoints), the mock implementation backs the feature.
 */

import type {
  ConfirmImportResponse,
  RecognitionJob,
  RecognitionMode,
  RecognitionPlatform,
  TradeDraft,
  UploadedScreenshot,
} from "./types";

/** Error carrying a STABLE user-facing category (spec §32) — never raw internals. */
export class RecognitionServiceError extends Error {
  readonly code: RecognitionServiceErrorCode;

  constructor(code: RecognitionServiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RecognitionServiceError";
    this.code = code;
  }
}

export type RecognitionServiceErrorCode =
  | "UPLOAD_FAILED"
  | "UNSUPPORTED_FORMAT"
  | "RECOGNITION_FAILED"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "IMPORT_FAILED";

export type CreateRecognitionJobInput = {
  screenshot: UploadedScreenshot;
  platform: RecognitionPlatform;
  mode: RecognitionMode;
};

export interface RecognitionService {
  /** History snapshot — stable reference between mutations (external store). */
  getJobsSnapshot(): RecognitionJob[];
  getJob(id: string): RecognitionJob | null;
  /** Subscribe to job-store mutations (useSyncExternalStore compatible). */
  subscribeJobs(listener: () => void): () => void;

  /** Validates + registers a screenshot (format/size rules, spec §11). */
  uploadScreenshot(file: File): Promise<UploadedScreenshot>;

  /** Creates the recognition job and starts the pipeline. */
  createRecognitionJob(input: CreateRecognitionJobInput): Promise<RecognitionJob>;

  /** Cancels a PENDING/PROCESSING job (spec §55) — not just a loader hide. */
  cancelRecognition(jobId: string): Promise<void>;

  /** Re-runs a FAILED/CANCELLED job through the service layer (spec §56). */
  retryRecognition(jobId: string): Promise<RecognitionJob>;

  /** Removes an unimported job from the history (review abandoned). */
  discardRecognition(jobId: string): Promise<void>;

  /** Persists the reviewed draft as a journal trade (spec §23/§28). */
  confirmImport(jobId: string, draft: TradeDraft): Promise<ConfirmImportResponse>;
}
